'use strict';

// Código: proyectos con carpetas y archivos, subida de archivos y de ZIP (con descompresión), versiones y vista previa aislada.
// Almacenamiento (todo bajo <raíz>/.kcc/codigo/):
//   <id>/proyecto.json   metadatos, árbol de archivos (ruta → [hash, tamaño, líneas]) y versiones (fotos del árbol)
//   <id>/objetos/<hash>  contenido de cada archivo, direccionado por su SHA-256 (las versiones comparten objetos)
//   stats.json           contadores de uso (vistas previas, copias, ZIP, restauraciones)
// Los fragmentos antiguos (<id>.json) se convierten solos en proyectos de un archivo.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { unzipSync } = require('fflate');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const EXT_LANG = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', md: 'markdown', markdown: 'markdown', py: 'python', php: 'php', sql: 'sql', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', svg: 'xml', java: 'java', cs: 'csharp', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', go: 'go', rs: 'rust', rb: 'ruby', kt: 'kotlin',
  swift: 'swift', ini: 'ini', env: 'ini', conf: 'nginx', txt: 'plaintext',
};
const EXT_BIN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'pdf', 'zip', 'gz', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mov']);
const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg', wav: 'audio/wav', txt: 'text/plain; charset=utf-8',
};
const IMAGENES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'svg']);
const MAX_PROYECTOS = 100, MAX_ARCHIVOS = 1000, MAX_BYTES = 50 * 1024 * 1024, MAX_ARCHIVO = 10 * 1024 * 1024, MAX_VERSIONES = 50, MAX_TEXTO = 2 * 1024 * 1024, MAX_ETQ = 8;
const RE_ID = /^[a-f0-9]{16}$/, RE_HASH = /^[a-f0-9]{64}$/;
const BASURA = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

const ext = (ruta) => (path.posix.extname(ruta).slice(1) || '').toLowerCase();
const lenguajeDe = (ruta) => EXT_LANG[ext(ruta)] || '';
const hashDe = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const esTexto = (ruta, buf) => !EXT_BIN.has(ext(ruta)) && !buf.subarray(0, 8000).includes(0);
const lineasDe = (buf) => { let n = 1; for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++; return buf.length ? n : 0; };
const limpiaEtiquetas = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(t => cleanStr(t, 24).trim().toLowerCase()).filter(Boolean))].slice(0, MAX_ETQ);

function normRuta(r, permiteVacia = false) {
  const partes = String(r ?? '').replace(/\\/g, '/').split('/').filter(x => x && x !== '.');
  if (!partes.length) { if (permiteVacia) return ''; throw new HttpError(400, 'Ruta no válida'); }
  if (partes.length > 12) throw new HttpError(400, 'Ruta demasiado profunda');
  for (const p of partes) if (p === '..' || p === '__proto__' || p.length > 100 || /[\u0000-\u001f<>:"|?*]/.test(p)) throw new HttpError(400, 'Ruta no válida');
  const ruta = partes.join('/');
  if (ruta.length > 240) throw new HttpError(400, 'Ruta demasiado larga');
  return ruta;
}
const hijosDe = (mapa, carpeta) => Object.keys(mapa).filter(r => r.startsWith(carpeta + '/'));
const padres = (ruta) => { const p = ruta.split('/'); p.pop(); const out = []; for (let i = 1; i <= p.length; i++) out.push(p.slice(0, i).join('/')); return out; };

// Fotos del árbol: iguales si tienen los mismos archivos (hash) y las mismas carpetas
const firma = (archivos, carpetas) => JSON.stringify([Object.keys(archivos).sort().map(r => [r, archivos[r][0]]), [...carpetas].sort()]);
function recuenta(p) {
  const o = {};
  for (const a of Object.values(p.archivos)) o[a[0]] = a[1];
  for (const v of p.versiones) for (const a of Object.values(v.archivos)) o[a[0]] = a[1];
  p.objetos = o;
  return Object.values(o).reduce((n, t) => n + t, 0);
}
const carpetasDe = (p) => { const s = new Set(p.carpetas); for (const r of Object.keys(p.archivos)) for (const c of padres(r)) s.add(c); return [...s].sort(); };

function resumenProyectos(proyectos, stats) {
  const langs = new Set(); let archivos = 0, lineas = 0, max = 0, versiones = 0, web = 0;
  for (const p of proyectos) {
    const exts = new Set();
    for (const [r, a] of Object.entries(p.archivos)) { archivos++; lineas += a[2] || 0; max = Math.max(max, a[2] || 0); const l = lenguajeDe(r); if (l && l !== 'plaintext') langs.add(l); exts.add(ext(r)); }
    versiones += p.versiones.length;
    if ((exts.has('html') || exts.has('htm')) && exts.has('css') && (exts.has('js') || exts.has('mjs'))) web = 1;
  }
  return {
    cod_snips: proyectos.length, cod_archivos: archivos, cod_versiones: versiones, cod_lineas: lineas, cod_langs: langs.size,
    cod_fav: proyectos.filter(p => p.favorito).length, cod_max: max, cod_web: web,
    cod_prev: (stats && stats.previews) || 0, cod_copias: (stats && stats.copias) || 0, cod_zips: (stats && stats.zips) || 0, cod_restaura: (stats && stats.restauraciones) || 0,
  };
}

const PLANTILLAS = {
  ninguna: () => ({}),
  vacio: (n) => ({ 'README.md': `# ${n}\n\nDescribe aquí tu proyecto.\n` }),
  web: (n) => ({
    'index.html': `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${n.replace(/[<>&]/g, '')}</title>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <h1>${n.replace(/[<>&]/g, '')}</h1>\n  <p>Edita los archivos y mira la vista web.</p>\n  <script src="js/script.js"></script>\n</body>\n</html>\n`,
    'css/style.css': `body {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-content: center;\n  text-align: center;\n  background: linear-gradient(135deg, #6366f1, #ec4899);\n  color: #fff;\n}\n`,
    'js/script.js': `// Se ejecuta en un navegador normal (la vista previa no ejecuta scripts)\nconsole.log('Hola desde el proyecto');\n`,
    'README.md': `# ${n}\n\nProyecto web de ejemplo.\n`,
  }),
};

function createCodigo({ express, multer, userRoot, sendError, registrarActividad, alCambiar, ZipArchive }) {
  const router = express.Router();
  const vistaRouter = express.Router();
  const json = express.json({ limit: '3mb' });
  // Las subidas se leen en memoria: se exige Content-Length y se corta antes de leer nada si pasa del tope
  const topeCuerpo = (req, res, next) => {
    const n = Number(req.headers['content-length']);
    if (!Number.isFinite(n) || n <= 0) return sendError(res, new HttpError(411, 'Falta el tamaño de la subida'));
    if (n > MAX_BYTES + 2 * 1024 * 1024) return sendError(res, new HttpError(413, 'La subida supera los 50 MB'));
    next();
  };
  const envuelve = (mw) => (req, res, next) => mw(req, res, (e) => (e ? sendError(res, new HttpError(400, e.code === 'LIMIT_FILE_SIZE' ? 'Archivo demasiado grande' : 'Subida no válida')) : next()));
  const subidaBase = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_ARCHIVOS, fields: 20, parts: MAX_ARCHIVOS + 25 } });
  const subida = { array: (c, n) => envuelve(subidaBase.array(c, n)), single: (c) => envuelve(subidaBase.single(c)) };
  const claveVista = crypto.randomBytes(32);
  const raiz = (user) => kccDir(userRoot(user), 'codigo');
  const dirP = (user, id) => path.join(raiz(user), id);
  const fichero = (user, id) => path.join(dirP(user, id), 'proyecto.json');
  const objeto = (user, id, h) => path.join(dirP(user, id), 'objetos', h);
  const statsFile = (user) => path.join(raiz(user), 'stats.json');
  const validId = (id) => RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };

  /* ---------- Migración de los fragmentos antiguos ---------- */
  const migrando = new Map();
  async function migra(user) {
    let nombres = []; try { nombres = (await fsp.readdir(raiz(user))).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch { return; }
    for (const f of nombres) {
      const s = await readJson(path.join(raiz(user), f), null); const id = f.slice(0, 16);
      if (!s || typeof s.codigo !== 'string') continue;
      const extL = Object.entries(EXT_LANG).find(([, l]) => l === s.lenguaje); const e = (extL && extL[0]) || 'txt';
      const base = (cleanStr(s.titulo, 80).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'fragmento');
      const ruta = /\.\w{1,6}$/.test(base) ? base : `${base}.${e}`;
      const buf = Buffer.from(String(s.codigo), 'utf8'); const h = hashDe(buf);
      await fsp.mkdir(path.join(dirP(user, id), 'objetos'), { recursive: true });
      await fsp.writeFile(objeto(user, id, h), buf);
      const a = [h, buf.length, lineasDe(buf)];
      const p = { id, nombre: cleanStr(s.titulo, 120).trim() || 'Sin título', descripcion: 'Importado desde un fragmento', etiquetas: limpiaEtiquetas(s.etiquetas), favorito: !!s.favorito, createdAt: s.createdAt || Date.now(), updatedAt: s.updatedAt || Date.now(),
        archivos: { [ruta]: a }, carpetas: [], versiones: [{ id: newId(), n: 1, mensaje: 'Importado desde un fragmento', fecha: s.updatedAt || Date.now(), carpetas: [], archivos: { [ruta]: a } }], siguienteV: 2, objetos: {} };
      recuenta(p);
      await writeJson(fichero(user, id), p);
      await fsp.unlink(path.join(raiz(user), f)).catch(() => {});
    }
  }
  const asegura = (user) => {
    const k = user.username; if (migrando.has(k)) return migrando.get(k);
    const pr = migra(user).catch(() => {}).finally(() => migrando.delete(k)); migrando.set(k, pr); return pr;
  };

  async function lista(user) {
    await asegura(user);
    let nombres = []; try { nombres = (await fsp.readdir(raiz(user))).filter(f => validId(f)); } catch { return []; }
    const out = [];
    for (const id of nombres) { const p = await readJson(fichero(user, id), null); if (p && p.archivos && Array.isArray(p.versiones)) out.push(p); }
    return out;
  }
  async function leer(user, id) {
    if (!validId(id)) throw new HttpError(404, 'No existe'); await asegura(user);
    const p = await readJson(fichero(user, id), null); if (!p || !p.archivos) throw new HttpError(404, 'No existe'); return p;
  }
  const mutar = (user, id, fn) => {
    if (!validId(id)) throw new HttpError(404, 'No existe');
    return updateJson(fichero(user, id), () => null, async (p) => { if (!p || !p.archivos) throw new HttpError(404, 'No existe'); const r = await fn(p); p.updatedAt = Date.now(); return r === undefined ? p : r; });
  };
  const tamTrabajo = (p) => Object.values(p.archivos).reduce((n, a) => n + a[1], 0);
  const ficha = (p) => {
    const langs = {}; for (const r of Object.keys(p.archivos)) { const l = lenguajeDe(r); if (l && l !== 'plaintext') langs[l] = (langs[l] || 0) + 1; }
    return { id: p.id, nombre: p.nombre, descripcion: p.descripcion || '', etiquetas: p.etiquetas || [], favorito: !!p.favorito, nArchivos: Object.keys(p.archivos).length, tam: tamTrabajo(p), nVersiones: p.versiones.length, almacen: Object.values(p.objetos || {}).reduce((n, t) => n + t, 0),
      langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]), actualizado: p.updatedAt };
  };
  const detalle = (p) => ({ ...ficha(p), archivos: Object.fromEntries(Object.entries(p.archivos).map(([r, a]) => [r, { t: a[1], l: a[2], texto: a[2] > 0 || a[1] === 0 }])), carpetas: carpetasDe(p), createdAt: p.createdAt,
    versiones: p.versiones.map(v => ({ id: v.id, n: v.n, mensaje: v.mensaje, fecha: v.fecha, nArchivos: Object.keys(v.archivos).length, tam: Object.values(v.archivos).reduce((n, a) => n + a[1], 0) })).reverse(), limites: { archivos: MAX_ARCHIVOS, bytes: MAX_BYTES, versiones: MAX_VERSIONES } });

  /* ---------- Objetos ---------- */
  async function guardaObjeto(user, p, buf) {
    const h = hashDe(buf);
    if (!p.objetos[h]) { if (Object.values(p.objetos).reduce((n, t) => n + t, 0) + buf.length > MAX_BYTES) throw new HttpError(400, 'El proyecto supera el límite de 50 MB'); }
    await fsp.mkdir(path.join(dirP(user, p.id), 'objetos'), { recursive: true });
    try { await fsp.writeFile(objeto(user, p.id, h), buf, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    p.objetos[h] = buf.length;
    return h;
  }
  async function barre(user, p) {
    let nombres = []; try { nombres = await fsp.readdir(path.join(dirP(user, p.id), 'objetos')); } catch { return; }
    for (const n of nombres) if (RE_HASH.test(n) && !p.objetos[n]) await fsp.unlink(objeto(user, p.id, n)).catch(() => {});
  }
  async function ponArchivo(user, p, ruta, buf) {
    if (buf.length > MAX_ARCHIVO) throw new HttpError(400, `«${ruta}» supera los 10 MB`);
    if (hijosDe(p.archivos, ruta).length) throw new HttpError(400, `«${ruta}» es una carpeta`);
    for (const c of padres(ruta)) { if (p.archivos[c]) throw new HttpError(400, `«${c}» es un archivo, no una carpeta`); }
    if (!p.archivos[ruta] && Object.keys(p.archivos).length >= MAX_ARCHIVOS) throw new HttpError(400, 'Máximo 1000 archivos por proyecto');
    const h = await guardaObjeto(user, p, buf);
    p.archivos[ruta] = [h, buf.length, esTexto(ruta, buf) ? lineasDe(buf) : 0];
  }
  const manifiesto = (p, vid) => {
    if (!vid) return { archivos: p.archivos, carpetas: carpetasDe(p) };
    const v = p.versiones.find(x => x.id === vid); if (!v) throw new HttpError(404, 'No existe esa versión');
    return { archivos: v.archivos, carpetas: v.carpetas || [], v };
  };
  const instantanea = (p, mensaje) => {
    if (p.versiones.length >= MAX_VERSIONES) throw new HttpError(400, `Máximo ${MAX_VERSIONES} versiones: elimina alguna`);
    const v = { id: newId(), n: p.siguienteV || p.versiones.length + 1, mensaje: cleanStr(mensaje, 200).trim() || `Versión ${p.siguienteV}`, fecha: Date.now(), carpetas: carpetasDe(p).filter(c => p.carpetas.includes(c)), archivos: JSON.parse(JSON.stringify(p.archivos)) };
    p.siguienteV = v.n + 1; p.versiones.push(v); return v;
  };
  const igualQueUltima = (p) => { const u = p.versiones[p.versiones.length - 1]; return !!u && firma(u.archivos, u.carpetas || []) === firma(p.archivos, p.carpetas); };

  const sirve = (res, buf, ruta, descarga) => {
    const e = ext(ruta); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    const tipo = IMAGENES.has(e) ? MIME[e] : esTexto(ruta, buf) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    res.setHeader('Content-Type', tipo);
    if (descarga || tipo === 'application/octet-stream') res.setHeader('Content-Disposition', `attachment; filename="${path.posix.basename(ruta).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"`);
    res.send(buf);
  };

  /* ---------- Proyectos ---------- */
  router.get('/', async (req, res) => {
    try { res.json({ items: (await lista(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(ficha), limites: { archivos: MAX_ARCHIVOS, bytes: MAX_BYTES, versiones: MAX_VERSIONES } }); } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      if ((await lista(req.user)).length >= MAX_PROYECTOS) throw new HttpError(400, 'Has llegado al máximo de proyectos');
      const b = req.body || {}; const nombre = cleanStr(b.nombre, 120).trim() || 'Proyecto nuevo';
      const p = { id: newId(), nombre, descripcion: cleanStr(b.descripcion, 300).trim(), etiquetas: limpiaEtiquetas(b.etiquetas), favorito: false, createdAt: Date.now(), updatedAt: Date.now(), archivos: {}, carpetas: [], versiones: [], siguienteV: 1, objetos: {} };
      const plan = (PLANTILLAS[b.plantilla] || PLANTILLAS.vacio)(nombre);
      await fsp.mkdir(path.join(dirP(req.user, p.id), 'objetos'), { recursive: true });
      for (const [r, c] of Object.entries(plan)) await ponArchivo(req.user, p, r, Buffer.from(c, 'utf8'));
      recuenta(p);
      await writeJson(fichero(req.user, p.id), p);
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'crear', nombre });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.post('/accion', json, async (req, res) => {
    try {
      const tipo = req.body && req.body.tipo; const clave = tipo === 'preview' ? 'previews' : tipo === 'copia' ? 'copias' : null;
      if (!clave) throw new HttpError(400, 'Acción no válida');
      await fsp.mkdir(raiz(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (x) => { x[clave] = (x[clave] || 0) + 1; });
      cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json(detalle(await leer(req.user, req.params.id))); } catch (e) { sendError(res, e); } });

  router.put('/:id', json, async (req, res) => {
    try {
      const b = req.body || {};
      const p = await mutar(req.user, req.params.id, (x) => {
        if (b.nombre !== undefined) x.nombre = cleanStr(b.nombre, 120).trim() || x.nombre;
        if (b.descripcion !== undefined) x.descripcion = cleanStr(b.descripcion, 300).trim();
        if (b.etiquetas !== undefined) x.etiquetas = limpiaEtiquetas(b.etiquetas);
        if (b.favorito !== undefined) x.favorito = !!b.favorito;
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id);
      await fsp.rm(dirP(req.user, p.id), { recursive: true, force: true });
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'borrar', nombre: p.nombre });
      cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Archivos y carpetas ---------- */
  router.get('/:id/texto', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const { archivos } = manifiesto(p, String(req.query.v || '')); const ruta = normRuta(req.query.ruta); const a = archivos[ruta];
      if (!a) throw new HttpError(404, 'No existe el archivo');
      const buf = await fsp.readFile(objeto(req.user, p.id, a[0]));
      if (!esTexto(ruta, buf) || buf.length > MAX_TEXTO) return res.json({ binario: true, tam: buf.length, imagen: IMAGENES.has(ext(ruta)) });
      res.json({ binario: false, contenido: buf.toString('utf8'), tam: buf.length });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/archivo', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const { archivos } = manifiesto(p, String(req.query.v || '')); const ruta = normRuta(req.query.ruta); const a = archivos[ruta];
      if (!a) throw new HttpError(404, 'No existe el archivo');
      sirve(res, await fsp.readFile(objeto(req.user, p.id, a[0])), ruta, req.query.descargar === '1');
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
      let total = 0, contados = 0, entradas;
      try {
        entradas = unzipSync(new Uint8Array(req.file.buffer), { filter: (f) => {
          if (f.name.endsWith('/') || BASURA.test(f.name)) return false;
          if (++contados > MAX_ARCHIVOS) throw new HttpError(400, 'El ZIP tiene demasiados archivos (máximo 1000)');
          if (f.originalSize > MAX_ARCHIVO) throw new HttpError(400, `«${f.name}» supera los 10 MB`);
          total += f.originalSize; if (total > MAX_BYTES) throw new HttpError(400, 'El contenido del ZIP supera los 50 MB');
          return true;
        } });
      } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'El ZIP no es válido o está dañado'); }
      let nombres = Object.keys(entradas); if (!nombres.length) throw new HttpError(400, 'El ZIP está vacío');
      const limpias = nombres.map(nm => normRuta(nm));
      let quita = 0;
      if (sinRaiz && limpias.every(r => r.includes('/')) && new Set(limpias.map(r => r.split('/')[0])).size === 1) quita = limpias[0].split('/')[0].length + 1;
      const p = await mutar(req.user, req.params.id, async (x) => {
        for (let i = 0; i < nombres.length; i++) {
          const rel = limpias[i].slice(quita); if (!rel) continue; const ruta = normRuta((destino ? destino + '/' : '') + rel); const buf = Buffer.from(entradas[nombres[i]]);
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
      for (const [r, a] of Object.entries(m.archivos)) zip.file(objeto(req.user, p.id, a[0]), { name: r });
      for (const c of m.carpetas) if (!Object.keys(m.archivos).some(r => r.startsWith(c + '/'))) zip.append('', { name: c + '/' });
      await zip.finalize();
    } catch (e) { if (!res.headersSent) sendError(res, e); else res.destroy(); }
  });

  /* ---------- Versiones ---------- */
  router.post('/:id/versiones', json, async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, (x) => {
        if (!Object.keys(x.archivos).length) throw new HttpError(400, 'El proyecto está vacío');
        if (igualQueUltima(x)) throw new HttpError(400, 'No hay cambios desde la última versión');
        instantanea(x, req.body && req.body.mensaje); recuenta(x);
      });
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'version', nombre: p.nombre });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/versiones/:vid', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const v = p.versiones.find(x => x.id === req.params.vid); if (!v) throw new HttpError(404, 'No existe esa versión');
      res.json({ id: v.id, n: v.n, mensaje: v.mensaje, fecha: v.fecha, archivos: Object.fromEntries(Object.entries(v.archivos).map(([r, a]) => [r, { h: a[0], t: a[1], l: a[2] }])), carpetas: v.carpetas || [],
        actual: Object.fromEntries(Object.entries(p.archivos).map(([r, a]) => [r, { h: a[0], t: a[1], l: a[2] }])) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/versiones/:vid/restaurar', json, async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, (x) => {
        const v = x.versiones.find(y => y.id === req.params.vid); if (!v) throw new HttpError(404, 'No existe esa versión');
        if (!igualQueUltima(x) && Object.keys(x.archivos).length) instantanea(x, `Antes de restaurar la v${v.n}`);
        x.archivos = JSON.parse(JSON.stringify(v.archivos)); x.carpetas = [...(v.carpetas || [])]; recuenta(x);
      });
      await fsp.mkdir(raiz(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (s) => { s.restauraciones = (s.restauraciones || 0) + 1; });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/versiones/:vid', async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, async (x) => {
        const i = x.versiones.findIndex(y => y.id === req.params.vid); if (i < 0) throw new HttpError(404, 'No existe esa versión');
        x.versiones.splice(i, 1); recuenta(x); await barre(req.user, x);
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Vista web aislada (sin scripts) ---------- */
  const firmaToken = (datos) => crypto.createHmac('sha256', claveVista).update(datos).digest('base64url');
  router.post('/:id/vista', json, async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const vid = String((req.body && req.body.v) || ''); manifiesto(p, vid);
      const datos = Buffer.from(JSON.stringify({ u: req.user.username, r: req.user.role, id: p.id, v: vid, e: Date.now() + 60 * 60 * 1000 })).toString('base64url');
      res.json({ token: `${datos}.${firmaToken(datos)}` });
    } catch (e) { sendError(res, e); }
  });

  vistaRouter.get('/:token/*', async (req, res) => {
    const falla = (c, m) => { res.status(c).type('text/plain; charset=utf-8').send(m); };
    try {
      const [datos, f] = String(req.params.token).split('.'); if (!datos || !f) return falla(403, 'Enlace no válido');
      const esperado = Buffer.from(firmaToken(datos)); const dado = Buffer.from(f);
      if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) return falla(403, 'Enlace no válido');
      const t = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')); if (!t || t.e < Date.now() || !validId(t.id)) return falla(403, 'El enlace ha caducado');
      const user = { username: t.u, role: t.r };
      const p = await leer(user, t.id); const { archivos } = manifiesto(p, t.v || '');
      let ruta; try { ruta = normRuta(decodeURIComponent(req.params[0] || '') || 'index.html'); } catch { return falla(400, 'Ruta no válida'); }
      if (!archivos[ruta] && archivos[ruta + '/index.html']) ruta += '/index.html';
      const a = archivos[ruta]; if (!a) return falla(404, 'No existe ese archivo en el proyecto');
      const buf = await fsp.readFile(objeto(user, t.id, a[0])); const e = ext(ruta);
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self'; sandbox");
      res.setHeader('Content-Type', MIME[e] || (esTexto(ruta, buf) ? 'text/plain; charset=utf-8' : 'application/octet-stream'));
      res.send(buf);
    } catch (e) { falla(e && e.status ? e.status : 500, 'No se pudo mostrar el archivo'); }
  });

  return {
    router, vistaRouter,
    core: { resumen: async (user) => resumenProyectos(await lista(user), await readJson(statsFile(user), {})) },
  };
}

module.exports = createCodigo;
module.exports.resumenProyectos = resumenProyectos;
