'use strict';
// Importar · .docx (Word, y «Descargar → Microsoft Word» de Google Docs) → Markdown del editor de notas. Un .docx es un ZIP con XML:
// se lee el texto de los párrafos con negrita, cursiva, tachado y enlaces; títulos, listas (con y sin numerar), tablas e imágenes.
const { descomprimeZip } = require('../descomprime');
const { analiza } = require('./html-md');
const { recorta } = require('../html-tokens');
const { HttpError } = require('../store');

const MB = 1024 * 1024;
const hijos = (n, t) => (n.h || []).filter(x => x.t === t);
const uno = (n, t) => (n.h || []).find(x => x.t === t);
const val = (n) => (n && n.a ? n.a['w:val'] : undefined);

function lee(buffer, { imagen }) {
  const f = descomprimeZip(buffer, { maxArchivos: 3000, maxArchivo: 20 * MB, maxTotal: 80 * MB, error: (m) => new HttpError(400, m) });
  if (!f['word/document.xml']) throw new HttpError(400, 'El archivo no parece un documento de Word (.docx)');
  const xml = (nombre) => (f[nombre] ? analiza(f[nombre].toString('utf8')) : null);
  const doc = xml('word/document.xml'), rels = xml('word/_rels/document.xml.rels'), num = xml('word/numbering.xml'), est = xml('word/styles.xml');

  const rel = {}; if (rels) for (const r of hijos(rels.h[0] || rels, 'relationship')) rel[r.a.id] = r.a;
  if (rels && !Object.keys(rel).length) { const buscar = (n) => { for (const h of n.h || []) { if (h.t === 'relationship') rel[h.a.id] = h.a; else buscar(h); } }; buscar(rels); }
  const estilos = {};   // id → nombre en minúsculas («heading 1»)
  const recorre = (n, fn) => { for (const h of n.h || []) { if (h.t) { fn(h); recorre(h, fn); } } };
  if (est) recorre(est, (n) => { if (n.t === 'w:style') { const nm = uno(n, 'w:name'); estilos[n.a['w:styleid']] = String(val(nm) || '').toLowerCase(); } });
  // numId → tipo de cada nivel (true = con viñeta)
  const absViñ = {}, numAbs = {};
  if (num) recorre(num, (n) => {
    if (n.t === 'w:abstractnum') absViñ[n.a['w:abstractnumid']] = Object.fromEntries(hijos(n, 'w:lvl').map(l => [l.a['w:ilvl'], val(uno(l, 'w:numfmt')) === 'bullet']));
    if (n.t === 'w:num') numAbs[n.a['w:numid']] = val(uno(n, 'w:abstractnumid'));
  });

  let titulo = '';
  function runs(p) {
    let out = '';
    const run = (r, enlace) => {
      const pr = uno(r, 'w:rpr') || { h: [] };
      const fmt = (t) => { const x = uno(pr, t); return !!x && val(x) !== '0' && val(x) !== 'false'; };
      let t = '';
      for (const c of r.h) {
        if (c.t === 'w:t') t += c.h.map(x => x.x || '').join('');
        else if (c.t === 'w:tab') t += ' ';
        else if (c.t === 'w:br') t += '\n';
        else if (c.t === 'w:drawing' || c.t === 'w:pict') {
          let emb = null; recorre(c, (x) => { if (!emb && (x.t === 'a:blip') && x.a['r:embed']) emb = x.a['r:embed']; if (!emb && x.t === 'v:imagedata' && x.a['r:id']) emb = x.a['r:id']; });
          const dest = emb && rel[emb] && rel[emb].target;
          const nombre = dest && ('word/' + String(dest).replace(/^\/?(word\/)?/, ''));
          if (nombre && f[nombre]) { const md = imagen(nombre.split('/').pop(), f[nombre]); if (md) t += `\n\n${md}\n\n`; }
        }
      }
      if (!t) return '';
      const espacios = recorta(t);
      if (!espacios[1]) return t;
      let m = espacios[1];
      if (fmt('w:b')) m = `**${m}**`; if (fmt('w:i')) m = `*${m}*`; if (fmt('w:strike')) m = `~~${m}~~`;
      if (enlace && m.trim()) m = `[${m.replace(/[[\]]/g, '')}](${enlace})`;
      return espacios[0] + m + espacios[2];
    };
    const camina = (n, enlace) => {
      for (const c of n.h || []) {
        if (c.t === 'w:r') out += run(c, enlace);
        else if (c.t === 'w:hyperlink') { const r = rel[c.a['r:id']]; const h = r && /^(https?:|mailto:)/i.test(r.target || '') ? r.target : c.a['w:anchor'] ? '' : ''; camina(c, h); }
        else if (c.t === 'w:ins' || c.t === 'w:smarttag' || c.t === 'w:sdtcontent' || c.t === 'w:sdt') camina(c, enlace);
      }
    };
    camina(p, '');
    return out.replace(/\*\*\s*\*\*|~~\s*~~/g, '').replace(/\*\*(\s+)\*\*/g, '$1');
  }

  function parrafo(p) {
    const pr = uno(p, 'w:ppr') || { h: [] };
    const estilo = (estilos[val(uno(pr, 'w:pstyle'))] || String(val(uno(pr, 'w:pstyle')) || '').toLowerCase());
    const tx = runs(p).replace(/(?<![ \t])[ \t]+$/g, '');
    const np = uno(pr, 'w:numpr');
    const hm = /(?:heading|t[ií]tulo)\s*(\d)/.exec(estilo);
    if (hm && tx.trim()) { const n = +hm[1]; return { tipo: 'p', md: n <= 3 ? '#'.repeat(n) + ' ' + tx.replace(/\*\*/g, '').replace(/\n/g, ' ').trim() : `**${tx.replace(/\*\*/g, '').trim()}**` }; }
    if (/^(title|t[ií]tulo)$/.test(estilo) && tx.trim()) { const t = tx.replace(/[*~]/g, '').trim(); if (!titulo) { titulo = t; return null; } return { tipo: 'p', md: '# ' + t }; }
    if (/^subtitle|subt[ií]tulo$/.test(estilo) && tx.trim()) return { tipo: 'p', md: '## ' + tx.replace(/\*\*/g, '').trim() };
    if (np || /list/.test(estilo)) {
      const il = Number(val(uno(np || { h: [] }, 'w:ilvl')) || 0), id = val(uno(np || { h: [] }, 'w:numid'));
      const viñeta = !np || (absViñ[numAbs[id]] || {})[il] !== false;
      if (id === '0') return { tipo: 'p', md: tx };
      return tx.trim() ? { tipo: 'li', il: Math.min(il, 3), viñeta, md: tx.replace(/\n/g, ' ') } : null;
    }
    return tx.trim() || /!\[/.test(tx) ? { tipo: 'p', md: tx.trim() } : null;
  }

  function tabla(t) {
    const filas = hijos(t, 'w:tr').map(tr => hijos(tr, 'w:tc').map(tc => hijos(tc, 'w:p').map(p => runs(p).trim()).filter(Boolean).join('<br>').replace(/\|/g, '/')));
    if (!filas.length) return '';
    const ancho = Math.max(...filas.map(r => r.length)); filas.forEach(r => { while (r.length < ancho) r.push(''); });
    const l = filas.slice(0, 500).map(r => '| ' + r.join(' | ') + ' |'); l.splice(1, 0, '| ' + Array(ancho).fill('---').join(' | ') + ' |');
    return l.join('\n');
  }

  const cuerpo = (() => { let b = null; recorre(doc, (n) => { if (!b && n.t === 'w:body') b = n; }); return b || doc; })();
  const bloques = [];
  const camina = (n) => {
    for (const c of n.h || []) {
      if (c.t === 'w:p') { const r = parrafo(c); if (r) bloques.push(r); }
      else if (c.t === 'w:tbl') { const t = tabla(c); if (t) bloques.push({ tipo: 'p', md: t }); }
      else if (c.t === 'w:sdt' || c.t === 'w:sdtcontent') camina(c);
    }
  };
  camina(cuerpo);

  const out = []; const ord = {};
  bloques.forEach((b, i) => {
    if (b.tipo === 'li') {
      const prev = bloques[i - 1];
      if (!prev || prev.tipo !== 'li') { for (const k of Object.keys(ord)) delete ord[k]; }
      for (const k of Object.keys(ord)) if (+k > b.il) delete ord[k];
      ord[b.il] = (ord[b.il] || 0) + 1;
      const linea = '  '.repeat(b.il) + (b.viñeta ? '- ' : `${ord[b.il]}. `) + b.md;
      if (prev && prev.tipo === 'li') out[out.length - 1] += '\n' + linea; else out.push(linea);
    } else out.push(b.md);
  });
  return { titulo, md: out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() };
}

module.exports = { lee };
