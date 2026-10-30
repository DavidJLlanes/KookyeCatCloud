'use strict';
// Fotos: EXIF de una foto (panel de detalles), fechas y coordenadas de una carpeta, mapa de fotos con
// GPS e índice de todas las fotos (línea de tiempo y álbumes inteligentes). Comparten una caché de EXIF
// en disco (thumbsDir/exif-cache.json). Fábrica como el resto: createFotos({...}) → { router }; el
// router se monta en /api (rutas /exif, /photometa, /photomap y /photoindex).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MAP_LIMIT = Number(process.env.MAP_LIMIT || 5000);
const PHOTOS_INDEX_LIMIT = Number(process.env.PHOTOS_INDEX_LIMIT || 50000);

function createFotos({ express, auth, userRoot, userPath, isHidden, sharp, thumbsDir, IMAGE_TYPES, HEIC_TYPES, sendError }) {
  const router = express.Router();

  /* ---------------- EXIF de las fotos ----------------
     Dos usos: el panel de detalles de una foto, y las fechas de captura con las
     que se agrupan por meses. Lo segundo se cachea, porque leer el EXIF de una
     carpeta con miles de fotos en cada listado sería insufrible. */
  const EXIF_CACHE = path.join(thumbsDir, 'exif-cache.json');
  let exifCache = null;
  let exifCacheSucio = false;

  function cargarExifCache() {
    if (exifCache) return exifCache;
    try { exifCache = JSON.parse(fs.readFileSync(EXIF_CACHE, 'utf8')); }
    catch { exifCache = {}; }
    return exifCache;
  }
  // Se guarda en diferido: un listado de 500 fotos no debe escribir 500 veces
  setInterval(() => {
    if (!exifCacheSucio || !exifCache) return;
    exifCacheSucio = false;
    const tmp = `${EXIF_CACHE}.tmp`;
    fs.writeFile(tmp, JSON.stringify(exifCache), err => {
      if (!err) fs.rename(tmp, EXIF_CACHE, () => {});
    });
  }, 5000).unref();

  const claveExif = (file, stat) => crypto.createHash('sha1')
    .update(`${file}|${stat.size}|${stat.mtimeMs}`).digest('hex');

  // Los grados vienen a veces como [g, m, s] y a veces ya en decimal
  function aDecimal(valor, ref) {
    let d = valor;
    if (Array.isArray(valor)) d = valor[0] + (valor[1] || 0) / 60 + (valor[2] || 0) / 3600;
    if (typeof d !== 'number' || !isFinite(d)) return null;
    if (ref === 'S' || ref === 'W') d = -d;
    return Math.round(d * 1e6) / 1e6;
  }

  const EXIF_OPCIONES = {
      tiff: true, exif: true, gps: true, ifd0: true,
      pick: ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'CreateDate', 'ModifyDate',
             'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'FocalLengthIn35mmFormat',
             'Orientation', 'ExifImageWidth', 'ExifImageHeight', 'Flash', 'WhiteBalance',
             'Software', 'latitude', 'longitude', 'GPSLatitude', 'GPSLatitudeRef',
             'GPSLongitude', 'GPSLongitudeRef', 'GPSAltitude'],
  };

  // exifr no lee el EXIF de algunos HEIC/HEIF (devuelve solo { errors }). En ese caso se extrae el bloque
  // con sharp (que sí entiende el contenedor) y se le pasa a exifr ya como TIFF.
  async function exifDeHeic(file) {
    if (!sharp) return null;
    const exifr = require('exifr');
    const m = await sharp(file).metadata();
    if (!m.exif || m.exif.length < 12) return null;
    const buf = m.exif;
    const off = buf.readUInt32BE(0);                 // cabecera HEIF: desplazamiento hasta el TIFF
    let tiff = buf.subarray(4 + (off < buf.length - 4 ? off : 0));
    if (tiff.subarray(0, 4).toString('latin1') === 'Exif') tiff = tiff.subarray(6);
    const datos = await exifr.parse(tiff, EXIF_OPCIONES).catch(() => null);
    return datos && !datos.errors ? datos : null;
  }

  // Devuelve null si la foto no tiene EXIF y lanza si no se ha podido leer (para no darlo por vacío)
  async function leerExif(file) {
    const exifr = require('exifr');
    let datos = await exifr.parse(file, EXIF_OPCIONES).catch(() => undefined);
    const vacio = !datos || datos.errors;
    if (vacio && HEIC_TYPES[path.extname(file).toLowerCase()]) {
      try { datos = await exifDeHeic(file) || datos; } catch { /* se queda con lo de exifr */ }
    }
    if (datos && datos.errors) {
      if (HEIC_TYPES[path.extname(file).toLowerCase()]) throw new Error('EXIF ilegible');   // se reintentará
      return null;
    }
    if (!datos) return null;

    const lat = datos.latitude !== undefined
      ? datos.latitude : aDecimal(datos.GPSLatitude, datos.GPSLatitudeRef);
    const lon = datos.longitude !== undefined
      ? datos.longitude : aDecimal(datos.GPSLongitude, datos.GPSLongitudeRef);
    // Algunas cámaras escriben 0,0 cuando no hay posición: no es una coordenada real
    const sinPos = lat === 0 && lon === 0;
    const fecha = datos.DateTimeOriginal || datos.CreateDate || datos.ModifyDate || null;

    return {
      tomada: fecha ? new Date(fecha).getTime() : null,
      camara: [datos.Make, datos.Model].filter(Boolean).join(' ').trim() || null,
      objetivo: datos.LensModel || null,
      exposicion: datos.ExposureTime || null,
      diafragma: datos.FNumber || null,
      iso: datos.ISO || null,
      focal: datos.FocalLength || null,
      focal35: datos.FocalLengthIn35mmFormat || null,
      ancho: datos.ExifImageWidth || null,
      alto: datos.ExifImageHeight || null,
      software: datos.Software || null,
      lat: !sinPos && typeof lat === 'number' && isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lon: !sinPos && typeof lon === 'number' && isFinite(lon) && Math.abs(lon) <= 180 ? lon : null,
      altitud: typeof datos.GPSAltitude === 'number' ? Math.round(datos.GPSAltitude) : null,
    };
  }

  // Versión cacheada y reducida: solo lo que hace falta para agrupar y para el mapa
  async function exifResumido(file, stat) {
    const cache = cargarExifCache();
    const clave = claveExif(file, stat);
    // Las entradas anteriores a la versión 2 ("g") se vuelven a leer una vez: algunas se guardaron vacías por un fallo de lectura
    if (cache[clave] && 'c' in cache[clave] && cache[clave].g === 2) return cache[clave];
    let r = { t: null, lat: null, lon: null, c: null, g: 2 };
    try {
      const e = await leerExif(file);
      if (e) r = { t: e.tomada, lat: e.lat, lon: e.lon, c: e.camara ? e.camara.slice(0, 60) : null, g: 2 };
    } catch {
      return { t: null, lat: null, lon: null, c: null };   // fallo de lectura: no se guarda, se reintenta la próxima vez
    }
    cache[clave] = r;
    exifCacheSucio = true;
    return r;
  }

  // EXIF completo de una foto, para el panel de detalles
  router.get('/exif', auth, async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      if (!IMAGE_TYPES[path.extname(file).toLowerCase()] && !HEIC_TYPES[path.extname(file).toLowerCase()]) {
        return res.status(415).json({ error: 'Solo las imágenes tienen EXIF' });
      }
      const stat = await fsp.stat(file);
      const datos = await leerExif(file);
      res.json({
        ...(datos || {}),
        nombre: path.basename(file),
        tamano: stat.size,
        modificada: stat.mtimeMs,
        hayExif: !!datos,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Fechas de captura y coordenadas de las fotos de una carpeta, para agrupar
  router.get('/photometa', auth, async (req, res) => {
    try {
      const rel = req.query.path || '';
      const dir = userPath(req, rel);
      const entradas = (await fsp.readdir(dir, { withFileTypes: true }))
        .filter(e => !isHidden(e.name) && e.isFile() &&
          (IMAGE_TYPES[path.extname(e.name).toLowerCase()] || HEIC_TYPES[path.extname(e.name).toLowerCase()]));

      const salida = {};
      // De cuatro en cuatro: leer 500 EXIF a la vez satura el disco
      for (let i = 0; i < entradas.length; i += 4) {
        const grupo = entradas.slice(i, i + 4);
        await Promise.all(grupo.map(async e => {
          const full = path.join(dir, e.name);
          try {
            const stat = await fsp.stat(full);
            const r = await exifResumido(full, stat);
            salida[e.name] = { t: r.t || stat.mtimeMs, exif: !!r.t, lat: r.lat, lon: r.lon };
          } catch { /* archivo desaparecido */ }
        }));
      }
      res.json({ path: rel, fotos: salida });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Todas las fotos con coordenadas, recorriendo el árbol entero
  router.get('/photomap', auth, async (req, res) => {
    try {
      const raiz = userRoot(req.user);
      const fotos = [];
      let conFecha = 0, total = 0, cortado = false, conExif = 0;

      async function recorrer(dir, rel) {
        if (fotos.length >= MAP_LIMIT) { cortado = true; return; }
        let entradas;
        try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
          if (fotos.length >= MAP_LIMIT) { cortado = true; return; }
          if (isHidden(e.name)) continue;
          const full = path.join(dir, e.name);
          const hijoRel = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { await recorrer(full, hijoRel); continue; }

          const ext = path.extname(e.name).toLowerCase();
          if (!IMAGE_TYPES[ext] && !HEIC_TYPES[ext]) continue;
          total++;
          try {
            const stat = await fsp.stat(full);
            const meta = await exifResumido(full, stat);
            if (meta.t || meta.c) conExif++;          // la foto conserva metadatos (aunque no tenga GPS)
            if (meta.lat === null || meta.lon === null) continue;
            if (meta.t) conFecha++;
            fotos.push({ rel: hijoRel, nombre: e.name, lat: meta.lat, lon: meta.lon,
                         t: meta.t || stat.mtimeMs, size: stat.size });
          } catch { /* archivo desaparecido */ }
        }
      }

      await recorrer(raiz, '');
      fotos.sort((a, b) => b.t - a.t);
      res.json({ fotos, total, conCoordenadas: fotos.length, conFecha, conExif, cortado, limite: MAP_LIMIT });
    } catch (err) {
      sendError(res, err);
    }
  });

  /* Índice de todas las fotos (fecha de captura, cámara y coordenadas): alimenta la línea de tiempo y
     los álbumes inteligentes. Se apoya en la misma caché de EXIF que el mapa, así que solo la primera
     vez es lenta. Se recorre de cuatro en cuatro por carpeta para no saturar el disco. */
  router.get('/photoindex', auth, async (req, res) => {
    try {
      const raiz = userRoot(req.user);
      const fotos = [];
      let cortado = false;

      async function recorrer(dir, rel) {
        if (cortado) return;
        let entradas;
        try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        const archivos = [];
        for (const e of entradas) {
          if (isHidden(e.name)) continue;
          if (e.isDirectory()) continue;
          const ext = path.extname(e.name).toLowerCase();
          if (IMAGE_TYPES[ext] || HEIC_TYPES[ext]) archivos.push(e.name);
        }
        for (let i = 0; i < archivos.length; i += 4) {
          if (fotos.length >= PHOTOS_INDEX_LIMIT) { cortado = true; return; }
          await Promise.all(archivos.slice(i, i + 4).map(async nombre => {
            const full = path.join(dir, nombre);
            try {
              const stat = await fsp.stat(full);
              const m = await exifResumido(full, stat);
              fotos.push({ rel: rel ? `${rel}/${nombre}` : nombre, name: nombre, t: m.t || stat.mtimeMs, exif: !!m.t,
                           lat: m.lat, lon: m.lon, c: m.c || null, size: stat.size });
            } catch { /* archivo desaparecido */ }
          }));
        }
        for (const e of entradas) {
          if (cortado) return;
          if (isHidden(e.name) || !e.isDirectory()) continue;
          await recorrer(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
        }
      }

      await recorrer(raiz, '');
      fotos.sort((a, b) => b.t - a.t);
      res.json({ fotos, total: fotos.length, cortado, limite: PHOTOS_INDEX_LIMIT });
    } catch (err) {
      sendError(res, err);
    }
  });

  return { router, core: {} };
}

module.exports = createFotos;
