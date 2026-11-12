'use strict';
// Constantes y utilidades puras del módulo.
const path = require('path');
const crypto = require('crypto');
const store = require('../nucleo/store');
const { HttpError, cleanStr } = store;

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

const MAX_VINCULOS = 20;

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

const PLANTILLAS = Object.assign(Object.create(null), {
  ninguna: () => ({}),
  vacio: (n) => ({ 'README.md': `# ${n}\n\nDescribe aquí tu proyecto.\n` }),
  web: (n) => ({
    'index.html': `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${n.replace(/[<>&]/g, '')}</title>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <h1>${n.replace(/[<>&]/g, '')}</h1>\n  <p>Edita los archivos y mira la vista web.</p>\n  <script src="js/script.js"></script>\n</body>\n</html>\n`,
    'css/style.css': `body {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-content: center;\n  text-align: center;\n  background: linear-gradient(135deg, #6366f1, #ec4899);\n  color: #fff;\n}\n`,
    'js/script.js': `// Se ejecuta en un navegador normal (la vista previa no ejecuta scripts)\nconsole.log('Hola desde el proyecto');\n`,
    'README.md': `# ${n}\n\nProyecto web de ejemplo.\n`,
  }),
});

module.exports = { EXT_LANG, EXT_BIN, MIME, IMAGENES, MAX_VINCULOS, MAX_PROYECTOS, MAX_ARCHIVOS, MAX_BYTES, MAX_ARCHIVO, MAX_VERSIONES, MAX_TEXTO, MAX_ETQ, RE_ID, RE_HASH, BASURA, ext, lenguajeDe, hashDe, esTexto, lineasDe, limpiaEtiquetas, normRuta, hijosDe, padres, firma, recuenta, carpetasDe, resumenProyectos, PLANTILLAS };
