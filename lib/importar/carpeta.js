'use strict';
// Importar · una carpeta (o un ZIP) de Markdown, HTML y texto: lo que exportan Notion («Markdown y CSV»), Apple Notes (con Atajos,
// «Exportar como Markdown» o programas de terceros), Google Docs («Página web .html»), Obsidian y cualquier carpeta de .md.
// Conserva la estructura de carpetas, enlaza las imágenes y archivos adjuntos que estén al lado y limpia lo propio de Notion
// (identificadores de 32 caracteres en los nombres, <aside>, <details>, tablas HTML).
const path = require('path');
const { convierte, decodifica } = require('./html-md');
const csv = require('./csv');

const NOTA = /\.(md|markdown|txt|html?)$/i;
const ID_NOTION = /\s[0-9a-f]{32}(?=\.[^./]+$|$)/i;
const SOLO_BASURA = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._)/;
const ADJUNTO_OK = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif|pdf|txt|md|csv|docx?|xlsx?|pptx?|odt|ods|zip|mp3|m4a|wav|ogg|flac|mp4|mov|webm)$/i;

const decodUri = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const utf8 = (b) => { let x = b; if (x.length >= 3 && x[0] === 0xef && x[1] === 0xbb && x[2] === 0xbf) x = x.subarray(3); return x.toString('utf8'); };
const limpiaNombre = (s, notion) => (notion ? s.replace(ID_NOTION, '') : s).trim();

function normaliza(archivos) {
  const out = new Map();
  for (const [ruta, buf] of Object.entries(archivos)) {
    const r = String(ruta).replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
    if (!r || SOLO_BASURA.test(r) || r.split('/').some(s => s === '..')) continue;
    out.set(r, buf);
  }
  // Si todo cuelga de una sola carpeta (la que crea el exportador), se quita
  const tops = new Set([...out.keys()].map(k => (k.includes('/') ? k.split('/')[0] : null)));
  if (tops.size === 1 && !tops.has(null)) { const t = [...tops][0] + '/'; const n = new Map(); for (const [k, v] of out) n.set(k.slice(t.length), v); return n; }
  return out;
}

/** archivos: { ruta: Buffer }. Devuelve { notas, tablas }; las imágenes citadas pasan a `adj`. */
function lee(archivos, { notion = false, adj, aviso }) {
  const todos = normaliza(archivos);
  const indice = new Map(); for (const k of todos.keys()) indice.set(k.toLowerCase(), k);
  const buscar = (ruta) => { const k = indice.get(String(ruta).toLowerCase()); return k ? { ruta: k, buf: todos.get(k) } : null; };
  const unirRel = (dir, ref) => path.posix.normalize(dir ? dir + '/' + ref : ref).replace(/^\.\//, '');
  const notas = [], tablas = []; let sinImagen = 0, ignorados = 0, enlacesPlanos = 0;

  const resuelve = (dir, ref) => {
    const limpio = decodUri(String(ref).split('#')[0].split('?')[0]);
    if (!limpio || /^[a-z][a-z0-9+.-]*:/i.test(limpio) || limpio.startsWith('/')) return null;
    const r = unirRel(dir, limpio);
    return r.startsWith('..') ? null : buscar(r);
  };
  const imagen = (dir, src, alt) => {
    if (/^https?:\/\//i.test(src)) return `[${alt || 'Imagen'}](${src.replace(/[\s()]/g, encodeURIComponent)})`;
    if (/^data:/i.test(src)) return '';
    const f = resuelve(dir, src);
    if (!f || !ADJUNTO_OK.test(f.ruta)) { sinImagen++; return `*(imagen no incluida${alt ? ': ' + alt : ''})*`; }
    const id = adj.add(path.posix.basename(f.ruta), f.buf);
    return id ? `![${alt || ''}](${id})` : `*(imagen no importada: demasiado peso${alt ? ': ' + alt : ''})*`;
  };

  // Markdown con trozos de HTML (Notion): aside → aviso, details → desplegable, table/img → conversión
  const htmlEnMd = (md, dir) => md
    .replace(/<aside[^>]*>\s*([\s\S]*?)\s*<\/aside>/gi, (_, c) => { const l = c.trim().split('\n').map(x => x.trim()); l[0] = '[!NOTE] ' + (l[0] || ''); return l.map(x => '> ' + x).join('\n'); })
    .replace(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>/gi, (_, t, c) => `:::toggle ${t.replace(/<[^>]+>/g, '').trim() || 'Desplegable'}\n${c.trim()}\n:::`)
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => '\n' + convierte(t, { resuelveImagen: (s, a) => imagen(dir, s, a) }) + '\n')
    .replace(/<img\b[^>]*>/gi, (t) => { const s = /src\s*=\s*"([^"]*)"/i.exec(t), a = /alt\s*=\s*"([^"]*)"/i.exec(t); return s ? '\n\n' + imagen(dir, decodifica(s[1]), a ? decodifica(a[1]) : '') + '\n\n' : ''; })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(?:span|div|center|u|mark)[^>]*>/gi, '');

  function procesaMd(texto, dir) {
    let md = htmlEnMd(texto.replace(/\r\n?/g, '\n'), dir);
    md = md.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => '\n\n' + imagen(dir, src, alt) + '\n\n');
    md = md.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, t, ref) => {
      if (/^(https?:|mailto:|tel:)/i.test(ref) || ref.startsWith('#')) return m;
      const f = resuelve(dir, ref);
      if (f && !NOTA.test(f.ruta) && ADJUNTO_OK.test(f.ruta)) { const id = adj.add(path.posix.basename(f.ruta), f.buf); if (id) return `[${t || path.posix.basename(f.ruta)}](${id})`; }
      enlacesPlanos++; return t;   // enlace a otra página exportada: se deja el texto (los vínculos entre páginas no se conservan)
    });
    return md.replace(/^#{4,6}\s+(.*)$/gm, '**$1**').replace(/\n{3,}/g, '\n\n').trim();
  }

  for (const [ruta, buf] of todos) {
    const dirOrig = path.posix.dirname(ruta) === '.' ? '' : path.posix.dirname(ruta);
    const ext = path.posix.extname(ruta).toLowerCase();
    const segs = (dirOrig ? dirOrig.split('/') : []).map(s => limpiaNombre(s, notion)).filter(Boolean);
    const base = limpiaNombre(path.posix.basename(ruta, path.posix.extname(ruta)), notion);
    if (NOTA.test(ruta)) {
      let titulo = base, cuerpo;
      if (/\.html?$/i.test(ruta)) {
        const html = utf8(buf);
        const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
        if (t && decodifica(t[1]).trim() && !/^untitled/i.test(decodifica(t[1]).trim())) titulo = decodifica(t[1]).replace(/\s+/g, ' ').trim().slice(0, 120);
        cuerpo = convierte(html, { resuelveImagen: (s, a) => imagen(dirOrig, s, a) });
        cuerpo = cuerpo.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g, (m, tx, ref) => (/^(https?:|mailto:|tel:)/i.test(ref) ? m : tx));
      } else cuerpo = procesaMd(utf8(buf), dirOrig);
      // El primer título del texto no se repite dentro de la nota. En Notion manda el del texto (el nombre del archivo pierde las barras).
      const lineas = cuerpo.split('\n'); const i = lineas.findIndex(l => l.trim());
      if (i >= 0) {
        const plano = (x) => x.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim().toLowerCase();
        const h = /^#\s+(.*)$/.exec(lineas[i]);
        if (h && notion && plano(h[1])) { titulo = plano(h[1]) === titulo.toLowerCase() ? titulo : h[1].replace(/[*_`]/g, '').trim().slice(0, 120); lineas.splice(i, 1); }
        else if (plano(lineas[i]) === plano(titulo)) lineas.splice(i, 1);
      }
      notas.push({ ruta: segs, titulo: titulo || 'Nota sin título', md: lineas.join('\n').trim() });
    } else if (ext === '.csv' && notion) {
      if (/_all\.csv$/i.test(ruta) && todos.has(ruta.replace(/_all\.csv$/i, '.csv'))) continue;   // Notion repite cada base como «_all»
      try { const t = csv.lee(buf); if (t.cabecera.length && t.filas.length) tablas.push({ nombre: base, ruta: segs, ...t }); } catch { ignorados++; }
    }
  }
  if (sinImagen) aviso(`${sinImagen} imagen(es) citadas no venían en el archivo`);
  if (enlacesPlanos) aviso(`${enlacesPlanos} enlace(s) entre páginas se han dejado como texto`);
  if (ignorados) aviso(`${ignorados} archivo(s) no se pudieron leer`);
  return { notas, tablas };
}

module.exports = { lee };
