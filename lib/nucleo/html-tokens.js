'use strict';
// Lector de HTML en tiempo lineal (sin expresiones regulares que vuelvan atrás). Lo usan el saneado de Documentos y el conversor
// HTML → Markdown de los importadores. Las expresiones regulares de antes tardaban minutos con entradas como «<a "<a "<a "…»
// o muchos «<!--» sin cerrar (denegación de servicio): aquí cada carácter se mira un número acotado de veces.
//   tokens(html) → [{ t: 'texto', v } | { t: 'abre', n, attrs, auto } | { t: 'cierra', n } | { t: 'cdata', v }]
// Comentarios, <!DOCTYPE> y <?xml?> se descartan; un «<» que no abre una etiqueta válida queda como texto.

const LETRA = /[a-zA-Z]/;

function tokens(html, { maxTokens = 2000000 } = {}) {
  const s = String(html || ''), n = s.length, out = [];
  let i = 0, texto = 0;   // `texto`: inicio del texto pendiente de emitir
  const emiteTexto = (hasta) => { if (hasta > texto) out.push({ t: 'texto', v: s.slice(texto, hasta) }); };
  while (i < n && out.length < maxTokens) {
    const j = s.indexOf('<', i);
    if (j < 0) break;
    // Comentario, CDATA, declaración o instrucción: hasta su cierre, o hasta el final si no lo tiene
    if (s.startsWith('<!--', j)) { emiteTexto(j); const f = s.indexOf('-->', j + 4); i = texto = f < 0 ? n : f + 3; continue; }
    if (s.startsWith('<![CDATA[', j)) { emiteTexto(j); const f = s.indexOf(']]>', j + 9); out.push({ t: 'cdata', v: s.slice(j + 9, f < 0 ? n : f) }); i = texto = f < 0 ? n : f + 3; continue; }
    if (s[j + 1] === '!' || s[j + 1] === '?') { emiteTexto(j); const f = s.indexOf('>', j + 2); i = texto = f < 0 ? n : f + 1; continue; }
    const cierra = s[j + 1] === '/';
    let k = j + (cierra ? 2 : 1);
    if (!LETRA.test(s[k] || '')) { i = j + 1; continue; }   // «<» suelto: es texto
    const ini = k; while (k < n && /[\w:-]/.test(s[k])) k++;
    const nombre = s.slice(ini, k).toLowerCase();
    // Atributos: comillas emparejadas; un «<» fuera de comillas indica que esto no era una etiqueta
    const aIni = k; let ok = false, eof = false;
    while (k < n) {
      const c = s[k];
      if (c === '>') { ok = true; break; }
      if (c === '<') break;
      if (c === '"' || c === "'") { const f = s.indexOf(c, k + 1); if (f < 0) { eof = true; break; } k = f + 1; continue; }
      k++;
    }
    if (k >= n) eof = true;
    if (eof) break;                          // sin cierre hasta el final: lo que queda es texto
    if (!ok) { i = j + 1; continue; }         // no era una etiqueta: «<» como texto, y se sigue desde ahí
    emiteTexto(j);
    const attrs = s.slice(aIni, k);
    out.push(cierra ? { t: 'cierra', n: nombre } : { t: 'abre', n: nombre, attrs, auto: /\/\s*$/.test(attrs) });
    i = texto = k + 1;
  }
  emiteTexto(n);
  return out;
}

/** Atributos «a="1" b='2' c=3 d» → { a, b, c, d } (claves en minúsculas, sin decodificar). Lineal. */
function atributos(txt) {
  const a = Object.create(null), s = String(txt || ''), n = s.length; let i = 0;
  while (i < n) {
    while (i < n && /[\s/]/.test(s[i])) i++;
    const ini = i; while (i < n && !/[\s=/>]/.test(s[i])) i++;
    const k = s.slice(ini, i).toLowerCase(); if (!k) { i++; continue; }
    while (i < n && /\s/.test(s[i])) i++;
    let v = '';
    if (s[i] === '=') {
      i++; while (i < n && /\s/.test(s[i])) i++;
      if (s[i] === '"' || s[i] === "'") { const q = s[i], f = s.indexOf(q, i + 1); v = s.slice(i + 1, f < 0 ? n : f); i = f < 0 ? n : f + 1; }
      else { const vi = i; while (i < n && !/[\s>]/.test(s[i])) i++; v = s.slice(vi, i); }
    }
    if (!(k in a)) a[k] = v;
  }
  return a;
}

/** Sustituye cada <tag …>contenido</tag> por fn(entero, apertura, contenido). Lineal: sin cierre, lo que queda se deja igual. */
function bloques(s, tag, fn) {
  const ab = new RegExp('<' + tag + '(?=[\\s>/])', 'gi'), ci = new RegExp('</' + tag + '\\s*>', 'gi');
  let out = '', i = 0;
  for (;;) {
    ab.lastIndex = i; const m = ab.exec(s); if (!m) break;
    const fa = s.indexOf('>', m.index); if (fa < 0) break;
    ci.lastIndex = fa + 1; const c = ci.exec(s); if (!c) break;
    out += s.slice(i, m.index) + fn(s.slice(m.index, c.index + c[0].length), s.slice(m.index, fa + 1), s.slice(fa + 1, c.index));
    i = c.index + c[0].length;
  }
  return out + s.slice(i);
}

/** Sustituye cada etiqueta suelta (<img …>, <br>, </span>…) cuyo nombre cumpla `nombres` por fn(etiqueta). Lineal. */
function etiquetas(s, nombres, fn) {
  let out = '', i = 0, k = 0;
  for (;;) {
    const j = s.indexOf('<', k); if (j < 0) break;
    let a = j + 1; if (s[a] === '/') a++;
    let b = a; while (b < s.length && /[\w-]/.test(s[b])) b++;
    const n = s.slice(a, b).toLowerCase();
    if (!n || !nombres.test(n)) { k = j + 1; continue; }
    const f = s.indexOf('>', b); if (f < 0) break;
    out += s.slice(i, j) + fn(s.slice(j, f + 1)); i = k = f + 1;
  }
  return out + s.slice(i);
}

/** «  texto  » → ['  ', 'texto', '  '] sin expresiones regulares (la de antes era cuadrática con muchos espacios) */
function recorta(s) {
  const t = String(s); const fin = t.trimEnd(); const ini = fin.length - fin.trimStart().length;
  return [t.slice(0, ini), fin.slice(ini), t.slice(fin.length)];
}

module.exports = { tokens, atributos, bloques, etiquetas, recorta };
