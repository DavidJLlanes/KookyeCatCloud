'use strict';
// Importar · reconoce el origen de un archivo y lo convierte en un «paquete» que se puede revisar antes de importar:
//   { fuente, nombre, notas: [{ ruta: [carpetas], titulo, md, creado?, modificado? }], tablas: [...], adj, avisos }
// Orígenes: Evernote (.enex), Notion (ZIP de «Markdown y CSV»), Google Docs (.docx, .html o ZIP), Apple Notes y cualquier carpeta de
// Markdown/HTML/texto (ZIP o archivo suelto) y CSV con columnas. No se escribe nada: eso lo hace ejecuta-notas.js / ejecuta-tablas.js.
const path = require('path');
const { descomprimeZip } = require('../descomprime');
const { HttpError } = require('../store');
const { Adjuntos } = require('./adjuntos');
const carpeta = require('./carpeta');
const docx = require('./docx');
const enex = require('./enex');
const csv = require('./csv');

const MB = 1024 * 1024;
const NOMBRES = Object.assign(Object.create(null), { notion: 'Notion', evernote: 'Evernote', docs: 'Google Docs', apple: 'Apple Notes', csv: 'CSV', carpeta: 'Markdown, HTML o texto' });
const error = (m) => new HttpError(400, m);
const base = (n) => path.basename(String(n), path.extname(String(n)));

function abreZip(buf, prof = 0) {
  const f = descomprimeZip(buf, { maxArchivos: 20000, maxArchivo: 60 * MB, maxTotal: 300 * MB, error, ignora: (n) => /(^|\/)(__MACOSX\/|\.DS_Store$)/.test(n) });
  if (prof < 2) for (const k of Object.keys(f)) if (/\.zip$/i.test(k)) {   // Notion trae un ZIP dentro de otro cuando el volcado es grande
    const dentro = abreZip(f[k], prof + 1); delete f[k];
    for (const [n, b] of Object.entries(dentro)) f[(path.posix.dirname(k) === '.' ? '' : path.posix.dirname(k) + '/') + n] = b;
  }
  return f;
}

function detectaZip(f) {
  const nombres = Object.keys(f);
  if (nombres.some(n => /\.enex$/i.test(n))) return 'evernote';
  const md = nombres.filter(n => /\.(md|csv)$/i.test(n));
  if (md.length && md.filter(n => /\s[0-9a-f]{32}(\.|\/)/i.test(n)).length / md.length > 0.3) return 'notion';
  if (nombres.some(n => /\.docx$/i.test(n))) return 'docs';
  const html = nombres.find(n => /\.html?$/i.test(n));
  if (html && /docs-internal-guid|class="doc-content"|<meta[^<>]+Google Docs/i.test(f[html].subarray(0, 20000).toString('utf8'))) return 'docs';
  return 'carpeta';
}

/** Analiza un archivo subido. `pedida` es la elección del usuario (o '' para detectarla). */
function analiza(buf, nombreArchivo, pedida) {
  const ext = path.extname(nombreArchivo).toLowerCase();
  const adj = new Adjuntos(), avisos = [], aviso = (m) => avisos.push(m);
  const p = { fuente: '', nombre: nombreArchivo, notas: [], tablas: [], adj, avisos };
  const notaDocx = (nombre, b, ruta) => {
    const d = docx.lee(b, { imagen: (n, bb) => { const id = adj.add(n, bb); return id ? `![](${id})` : ''; } });
    // Un documento que empieza por un título de nivel 1 lo usa como nombre de la nota (y no lo repite en el cuerpo)
    const h1 = /^# (.+)\n*/.exec(d.md);
    p.notas.push(h1 ? { ruta, titulo: h1[1].trim().slice(0, 120), md: d.md.slice(h1[0].length) } : { ruta, titulo: d.titulo || base(nombre), md: d.md });
  };
  const notasEnex = (b, ruta) => {
    const r = enex.lee(b, { adjunto: (n, bb) => adj.add(n, bb) });
    r.avisos.forEach(aviso);
    for (const n of r.notas) p.notas.push({ ...n, ruta });
  };

  if (ext === '.enex') { p.fuente = 'evernote'; notasEnex(buf, []); }
  else if (ext === '.docx') { p.fuente = 'docs'; notaDocx(nombreArchivo, buf, []); }
  else if (ext === '.csv' || ext === '.tsv') {
    p.fuente = 'csv'; const t = csv.lee(buf);
    if (!t.cabecera.length || !t.filas.length) throw error('El CSV está vacío o no tiene filas debajo de la cabecera');
    p.tablas.push({ nombre: base(nombreArchivo), ruta: [], ...t });
    if (t.truncado) aviso('El CSV tiene más de 20.000 filas: solo se leen las primeras');
  } else if (['.md', '.markdown', '.txt', '.html', '.htm'].includes(ext)) {
    p.fuente = /\.html?$/i.test(ext) && /docs-internal-guid|<meta[^<>]+Google Docs/i.test(buf.subarray(0, 20000).toString('utf8')) ? 'docs' : 'carpeta';
    const r = carpeta.lee({ [path.basename(nombreArchivo)]: buf }, { notion: false, adj, aviso }); p.notas.push(...r.notas);
  } else if (ext === '.zip') {
    const f = abreZip(buf);
    p.fuente = detectaZip(f);
    const resto = {};
    for (const [n, b] of Object.entries(f)) {
      const carp = path.posix.dirname(n) === '.' ? [] : path.posix.dirname(n).split('/');
      if (/\.enex$/i.test(n)) { const nb = Object.keys(f).filter(x => /\.enex$/i.test(x)).length > 1 || carp.length ? [...carp, base(n)] : []; notasEnex(b, nb.length ? nb : []); }
      else if (/\.docx$/i.test(n)) { try { notaDocx(n, b, carp); } catch (e) { aviso(`«${n}»: ${e.message}`); } }
      else resto[n] = b;
    }
    if (Object.keys(resto).length && p.fuente !== 'evernote') { const r = carpeta.lee(resto, { notion: p.fuente === 'notion', adj, aviso }); p.notas.push(...r.notas); p.tablas.push(...r.tablas); }
  } else throw error(`Formato no admitido (${ext || 'sin extensión'}). Sube un .zip, .enex, .docx, .csv, .md, .html o .txt`);

  if (pedida && NOMBRES[pedida] && pedida !== 'csv' && p.fuente !== 'csv' && p.fuente !== 'evernote' && p.fuente !== 'notion') p.fuente = pedida;
  if (!p.notas.length && !p.tablas.length) throw error('No se ha encontrado nada que importar en ese archivo');
  if (adj.rechazados) aviso(`${adj.rechazados} adjunto(s) no se importan: se superó el límite de peso`);
  return p;
}

// Lo que se enseña al usuario antes de confirmar
function resumen(p, citados) {
  const carpetas = new Set();
  for (const n of p.notas) for (let i = 1; i <= n.ruta.length; i++) carpetas.add(n.ruta.slice(0, i).join('/'));
  let bytes = 0; for (const id of citados) { const a = p.adj.get(id); if (a) bytes += a.buf.length; }
  return {
    fuente: p.fuente, fuenteNombre: NOMBRES[p.fuente], nombre: p.nombre, notas: p.notas.length, carpetas: carpetas.size, adjuntos: citados.size, bytesAdjuntos: bytes,
    arbol: p.notas.slice(0, 300).map(n => ({ ruta: n.ruta.join(' / '), titulo: n.titulo, caracteres: n.md.length })),
    tablas: p.tablas.map((t, i) => ({ i, nombre: t.nombre, columnas: t.cabecera.length, filas: t.total })),
    avisos: p.avisos.slice(0, 20),
  };
}

module.exports = { analiza, resumen, NOMBRES };
