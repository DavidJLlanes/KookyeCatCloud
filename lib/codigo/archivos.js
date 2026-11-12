'use strict';
// archivos: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const store = require('../nucleo/store');
const { updateJson, HttpError } = store;
const fs = require('fs');
const fsp = fs.promises;
const { descomprimeZip } = require('../nucleo/descomprime');
const { BASURA, IMAGENES, MAX_ARCHIVO, MAX_ARCHIVOS, MAX_BYTES, MAX_TEXTO, esTexto, ext, hijosDe, normRuta, padres, recuenta } = require('./constantes');

function monta(ctx) {
  const { ZipArchive, barre, cambio, detalle, json, leer, manifiesto, mutar, objeto, objetoOk, ponArchivo, raiz, registrarActividad, router, sendError, sirve, statsFile, subida, topeCuerpo } = ctx;

  /* ---------- Archivos y carpetas ---------- */
  router.get('/:id/texto', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const { archivos } = manifiesto(p, String(req.query.v || '')); const ruta = normRuta(req.query.ruta); const a = archivos[ruta];
      if (!a) throw new HttpError(404, 'No existe el archivo');
      await objetoOk(req.user, p.id, a); const buf = await fsp.readFile(objeto(req.user, p.id, a[0]));
      if (!esTexto(ruta, buf) || buf.length > MAX_TEXTO) return res.json({ binario: true, tam: buf.length, imagen: IMAGENES.has(ext(ruta)) });
      res.json({ binario: false, contenido: buf.toString('utf8'), tam: buf.length });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/archivo', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const { archivos } = manifiesto(p, String(req.query.v || '')); const ruta = normRuta(req.query.ruta); const a = archivos[ruta];
      if (!a) throw new HttpError(404, 'No existe el archivo');
      await objetoOk(req.user, p.id, a); sirve(res, await fsp.readFile(objeto(req.user, p.id, a[0])), ruta, req.query.descargar === '1');
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id/archivo', json, async (req, res) => {
    try {
      const ruta = normRuta(req.body && req.body.ruta); const buf = Buffer.from(String((req.body && req.body.contenido) ?? ''), 'utf8');
      const p = await mutar(req.user, req.params.id, async (x) => { await ponArchivo(req.user, x, ruta, buf); recuenta(x); await barre(req.user, x); });
      cambio(req.user); res.json({ ok: true, archivo: p.archivos[ruta], actualizado: p.updatedAt });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/carpeta', json, async (req, res) => {
    try {
      const ruta = normRuta(req.body && req.body.ruta);
      const p = await mutar(req.user, req.params.id, (x) => {
        if (x.archivos[ruta] || padres(ruta).some(c => x.archivos[c])) throw new HttpError(400, 'Ya existe un archivo con ese nombre');
        if (!x.carpetas.includes(ruta)) x.carpetas.push(ruta);
      });
      res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/mover', json, async (req, res) => {
    try {
      const desde = normRuta(req.body && req.body.desde); const hacia = normRuta(req.body && req.body.hacia);
      if (hacia === desde) return res.json(detalle(await leer(req.user, req.params.id)));
      if (hacia.startsWith(desde + '/')) throw new HttpError(400, 'No puedes mover una carpeta dentro de sí misma');
      const p = await mutar(req.user, req.params.id, (x) => {
        const esArchivo = !!x.archivos[desde]; const hijos = hijosDe(x.archivos, desde); const esCarpeta = hijos.length > 0 || x.carpetas.includes(desde);
        if (!esArchivo && !esCarpeta) throw new HttpError(404, 'No existe');
        if (x.archivos[hacia] || hijosDe(x.archivos, hacia).length || x.carpetas.includes(hacia)) throw new HttpError(400, 'Ya existe algo con ese nombre');
        if (padres(hacia).some(c => x.archivos[c])) throw new HttpError(400, 'El destino está dentro de un archivo');
        if (esArchivo) { x.archivos[hacia] = x.archivos[desde]; delete x.archivos[desde]; }
        else {
          for (const r of hijos) { x.archivos[hacia + r.slice(desde.length)] = x.archivos[r]; delete x.archivos[r]; }
          x.carpetas = x.carpetas.map(c => c === desde ? hacia : c.startsWith(desde + '/') ? hacia + c.slice(desde.length) : c);
        }
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/ruta', async (req, res) => {
    try {
      const ruta = normRuta(req.query.ruta);
      const p = await mutar(req.user, req.params.id, async (x) => {
        const hijos = hijosDe(x.archivos, ruta); const eraCarpeta = hijos.length > 0 || x.carpetas.some(c => c === ruta || c.startsWith(ruta + '/'));
        if (!x.archivos[ruta] && !eraCarpeta) throw new HttpError(404, 'No existe');
        delete x.archivos[ruta]; for (const r of hijos) delete x.archivos[r];
        x.carpetas = x.carpetas.filter(c => c !== ruta && !c.startsWith(ruta + '/'));
        recuenta(x); await barre(req.user, x);
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  // Subida de archivos sueltos o de una carpeta (campo "rutas": JSON con la ruta relativa de cada archivo, en orden)
  router.post('/:id/subir', topeCuerpo, subida.array('f', MAX_ARCHIVOS), async (req, res) => {
    try {
      const base = normRuta(req.body && req.body.base, true); let rutas = []; try { rutas = JSON.parse(req.body.rutas || '[]'); } catch { rutas = []; }
      const ficheros = req.files || []; if (!ficheros.length) throw new HttpError(400, 'No has elegido archivos');
      const p = await mutar(req.user, req.params.id, async (x) => {
        for (let i = 0; i < ficheros.length; i++) {
          const rel = normRuta(rutas[i] || Buffer.from(ficheros[i].originalname, 'latin1').toString('utf8')); const ruta = normRuta((base ? base + '/' : '') + rel);
          if (BASURA.test(ruta)) continue;
          await ponArchivo(req.user, x, ruta, ficheros[i].buffer);
        }
        recuenta(x); await barre(req.user, x);
      });
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'subir', nombre: p.nombre, archivos: ficheros.length });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  // ZIP: descomprime dentro del proyecto (o lo guarda tal cual si descomprimir=0)
  router.post('/:id/zip', topeCuerpo, subida.single('z'), async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, 'No has elegido un ZIP');
      const destino = normRuta(req.body && req.body.destino, true); const descomprimir = String(req.body && req.body.descomprimir) !== '0'; const sinRaiz = String(req.body && req.body.sinRaiz) !== '0';
      let n = 0;
      if (!descomprimir) {
        const ruta = normRuta((destino ? destino + '/' : '') + Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
        const p = await mutar(req.user, req.params.id, async (x) => { await ponArchivo(req.user, x, ruta, req.file.buffer); recuenta(x); await barre(req.user, x); });
        cambio(req.user); return res.json({ ...detalle(p), anadidos: 1 });
      }
      const entradas = descomprimeZip(req.file.buffer, { maxArchivos: MAX_ARCHIVOS, maxArchivo: MAX_ARCHIVO, maxTotal: MAX_BYTES, ignora: (nm) => BASURA.test(nm), error: (m) => new HttpError(400, m) });
      let nombres = Object.keys(entradas); if (!nombres.length) throw new HttpError(400, 'El ZIP está vacío');
      const limpias = nombres.map(nm => normRuta(nm));
      let quita = 0;
      if (sinRaiz && limpias.every(r => r.includes('/')) && new Set(limpias.map(r => r.split('/')[0])).size === 1) quita = limpias[0].split('/')[0].length + 1;
      const p = await mutar(req.user, req.params.id, async (x) => {
        for (let i = 0; i < nombres.length; i++) {
          const rel = limpias[i].slice(quita); if (!rel) continue; const ruta = normRuta((destino ? destino + '/' : '') + rel); const buf = entradas[nombres[i]];
          if (buf.length > MAX_ARCHIVO) throw new HttpError(400, `«${rel}» supera los 10 MB`);
          await ponArchivo(req.user, x, ruta, buf); n++;
        }
        recuenta(x); await barre(req.user, x);
      });
      await fsp.mkdir(raiz(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (s) => { s.zips = (s.zips || 0) + 1; });
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'zip', nombre: p.nombre, archivos: n });
      cambio(req.user); res.json({ ...detalle(p), anadidos: n });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/zip', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const m = manifiesto(p, String(req.query.v || ''));
      const nombre = (p.nombre.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '').trim().replace(/\s+/g, '-') || 'proyecto') + (m.v ? `-v${m.v.n}` : '') + '.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="proyecto.zip"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
      const zip = new ZipArchive({ zlib: { level: 9 } });
      zip.on('warning', () => {}); zip.on('error', () => res.destroy()); zip.pipe(res);
      for (const [r, a] of Object.entries(m.archivos)) { await objetoOk(req.user, p.id, a); zip.file(objeto(req.user, p.id, a[0]), { name: r }); }
      for (const c of m.carpetas) if (!Object.keys(m.archivos).some(r => r.startsWith(c + '/'))) zip.append('', { name: c + '/' });
      await zip.finalize();
    } catch (e) { if (!res.headersSent) sendError(res, e); else res.destroy(); }
  });


  return {  };
}

module.exports = monta;
