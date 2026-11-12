'use strict';
// Markdown de la app → bloques e «inline» para el PDF. Sin dependencias: solo el dialecto que usa la app
// (títulos, listas con tareas, citas y avisos [!NOTE], tablas, código, imágenes de la nube, separadores).
// Una línea con solo «\f» fuerza salto de página (así se separan varias notas en un mismo PDF).

// Se compara sin espacios: la versión con «\s*» entre cada parte era cuadrática con líneas largas de espacios
const RE_TABLA_SEP = { test: (l) => /^\|?:?-{2,}:?(\|:?-{2,}:?)*\|?$/.test(String(l).replace(/\s+/g, '')) };
const celdas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

function bloques(md) {
  const L = String(md).replace(/\r\n?/g, '\n').replace(/&nbsp;/g, ' ').split('\n');
  const out = [];
  let i = 0, par = [], ol = [0, 0, 0, 0];
  const cierraPar = () => { if (par.length) { out.push({ t: 'p', text: par.join('\n') }); par = []; } };
  while (i < L.length) {
    const l = L[i];
    let m;
    if (l === '\f') { cierraPar(); out.push({ t: 'pb' }); i++; continue; }
    if (/^```/.test(l)) {
      cierraPar(); const c = []; i++;
      while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]);
      i++; out.push({ t: 'code', lines: c }); continue;
    }
    if (/^\s*$/.test(l)) { cierraPar(); i++; continue; }
    if ((m = /^(#{1,6})\s+([\s\S]*)$/.exec(l))) { cierraPar(); out.push({ t: 'h', n: m[1].length, text: m[2] }); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { cierraPar(); out.push({ t: 'hr' }); i++; continue; }
    if (/^\|/.test(l) && i + 1 < L.length && RE_TABLA_SEP.test(L[i + 1]) && L[i + 1].includes('-')) {
      cierraPar(); const cab = celdas(l); i += 2; const filas = [];
      while (i < L.length && /^\|/.test(L[i])) filas.push(celdas(L[i++]));
      out.push({ t: 'table', cab, filas }); continue;
    }
    if (/^>/.test(l)) {
      cierraPar(); const c = [];
      while (i < L.length && /^>/.test(L[i])) c.push(L[i++].replace(/^>\s?/, ''));
      const ca = /^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*([\s\S]*)$/.exec(c[0] || '');
      if (ca) out.push({ t: 'callout', kind: ca[1], text: [ca[2], ...c.slice(1)].join('\n').trim() });
      else out.push({ t: 'quote', text: c.join('\n') });
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+\.)\s+([\s\S]*)$/.exec(l))) {
      cierraPar();
      const nivel = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      const ord = /\d/.test(m[2]);
      let texto = m[3], caja = null;
      const c = /^\[( |x|X)\]\s+([\s\S]*)$/.exec(texto);
      if (c) { caja = c[1] !== ' '; texto = c[2]; }
      let num = 0;
      if (ord) { for (let k = nivel + 1; k < 4; k++) ol[k] = 0; num = ++ol[nivel]; } else ol = [0, 0, 0, 0];
      out.push({ t: 'li', nivel, ord, num, caja, text: texto });
      i++; continue;
    }
    ol = [0, 0, 0, 0];
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l))) { cierraPar(); out.push({ t: 'img', alt: m[1], ref: m[2] }); i++; continue; }
    par.push(l); i++;
  }
  cierraPar();
  return out;
}

// Texto con formato → tramos [{ t, b, i, s, code, link }]
function inline(s, e = {}) {
  const out = []; let i = 0, buf = '';
  const flush = () => { if (buf) { out.push({ t: buf, ...e }); buf = ''; } };
  while (i < s.length) {
    const r = s.slice(i); let m;
    if (r[0] === '\\' && /[\\`*_{}[\]()#+\-.!|~=>]/.test(r[1] || '')) { buf += r[1]; i += 2; continue; }
    if ((m = /^`([^`]+)`/.exec(r))) { flush(); out.push({ t: m[1], ...e, code: true }); i += m[0].length; continue; }
    if ((m = /^(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/.exec(r))) { flush(); out.push(...inline(m[2], { ...e, b: true })); i += m[0].length; continue; }
    if ((m = /^~~([\s\S]+?)~~/.exec(r))) { flush(); out.push(...inline(m[1], { ...e, s: true })); i += m[0].length; continue; }
    if ((m = /^==([\s\S]+?)==/.exec(r))) { flush(); out.push(...inline(m[1], { ...e, b: true })); i += m[0].length; continue; }
    if ((m = /^(\*|_)(?=\S)([^\n]+?)(?<=\S)\1(?!\w)/.exec(r)) && (i === 0 || !/[\w*]/.test(s[i - 1]))) { flush(); out.push(...inline(m[2], { ...e, i: true })); i += m[0].length; continue; }
    if ((m = /^!\[([^\]]*)\]\([^)\s]*\)/.exec(r))) { buf += m[1]; i += m[0].length; continue; }
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(r))) {
      flush(); out.push(...inline(m[1], { ...e, link: /^https?:\/\//i.test(m[2]) ? m[2] : e.link })); i += m[0].length; continue;
    }
    buf += s[i]; i++;
  }
  flush();
  return out;
}

module.exports = { bloques, inline };
