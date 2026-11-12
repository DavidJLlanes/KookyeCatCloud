'use strict';
// Documentos · saneado del HTML del editor. Lista blanca de etiquetas, atributos y estilos: nunca llega al disco ni al navegador
// nada que ejecute código (script, on*, javascript:, iframes, estilos con url()…). Lo desconocido se desenvuelve y deja su texto.
const { FUENTES, CLASES } = require('./constantes');
const { tokens, atributos: leeAtributos } = require('../nucleo/html-tokens');

const ETIQUETAS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'a', 'br', 'hr', 'blockquote', 'pre', 'code', 'span', 'mark', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
const VACIAS = new Set(['br', 'hr']);
const SE_TIRA_CON_CONTENIDO = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'head', 'title', 'textarea', 'select', 'button', 'form', 'canvas', 'audio', 'video']);
const MAX_PROF = 40;

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// style="…" → solo las propiedades permitidas y con valores acotados
function estilo(txt) {
  const out = [];
  for (const par of String(txt || '').split(';')) {
    const i = par.indexOf(':'); if (i < 0) continue;
    const k = par.slice(0, i).trim().toLowerCase(), v = par.slice(i + 1).trim().replace(/(?<!\s)\s*!important$/i, '');
    if (k === 'text-align' && /^(left|center|right|justify)$/i.test(v)) out.push(`text-align:${v.toLowerCase()}`);
    else if ((k === 'color' || k === 'background-color' || k === 'background') && COLOR.test(v) && !/^(url|expression)/i.test(v)) out.push(`${k === 'background' ? 'background-color' : k}:${v}`);
    else if (k === 'font-size') { const m = /^(\d{1,3}(?:\.\d+)?)(px|pt)$/i.exec(v); if (m && +m[1] >= 6 && +m[1] <= 120) out.push(`font-size:${m[1]}${m[2].toLowerCase()}`); }
    else if (k === 'font-family') { const f = FUENTES.find(x => v.toLowerCase().includes(x.toLowerCase())); if (f) out.push(`font-family:'${f}'`); }
    else if (k === 'line-height' && /^\d(\.\d+)?$/.test(v) && +v >= 1 && +v <= 3) out.push(`line-height:${v}`);
    else if ((k === 'margin-left' || k === 'padding-left') && /^\d{1,3}(px)?$/.test(v) && parseInt(v, 10) <= 240) out.push(`margin-left:${parseInt(v, 10)}px`);
    else if (k === 'font-weight' && /^(bold|bolder|[6-9]00)$/i.test(v)) out.push('font-weight:700');
    else if (k === 'font-style' && /^italic$/i.test(v)) out.push('font-style:italic');
    else if (k === 'text-decoration' || k === 'text-decoration-line') { const t = v.toLowerCase().split(/\s+/).filter(x => x === 'underline' || x === 'line-through'); if (t.length) out.push(`text-decoration:${[...new Set(t)].join(' ')}`); }
  }
  return [...new Set(out)].join(';');
}

function atributos(tag, crudo) {
  const a = leeAtributos(crudo);
  const out = [];
  const st = a.style !== undefined ? estilo(a.style.replace(/&quot;/g, '"').replace(/&#39;/g, "'")) : '';
  if (st) out.push(`style="${esc(st)}"`);
  if (a.class !== undefined) { const c = a.class.split(/\s+/).filter(x => CLASES.includes(x)); if (c.length) out.push(`class="${c.join(' ')}"`); }
  if (tag === 'div' && a['data-n'] && /^[2-4]$/.test(a['data-n'])) out.push(`data-n="${a['data-n']}"`);
  if (tag === 'a') {
    const href = String(a.href || '').replace(/&amp;/g, '&').trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(href) && href.length <= 2000) out.push(`href="${esc(href)}"`, 'target="_blank"', 'rel="noopener noreferrer"');
  }
  if ((tag === 'td' || tag === 'th')) for (const k of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(a[k] || '') && +a[k] > 1) out.push(`${k}="${a[k]}"`);
  if (tag === 'ol' && /^\d{1,5}$/.test(a.start || '')) out.push(`start="${a.start}"`);
  return out.length ? ' ' + out.join(' ') : '';
}

/** HTML cualquiera → HTML seguro y equilibrado (todas las etiquetas cerradas) */
function sanea(html, max = 1500000) {
  const src = String(html || '').slice(0, max * 2);
  const pila = []; let out = ''; let tirando = null;
  for (const tk of tokens(src)) {
    if (tk.t === 'texto' || tk.t === 'cdata') { if (!tirando) out += tk.v.replace(/</g, '&lt;').replace(/>/g, '&gt;'); continue; }
    const nombre = tk.n;
    if (tirando) { if (tk.t === 'cierra' && nombre === tirando) tirando = null; continue; }
    if (SE_TIRA_CON_CONTENIDO.has(nombre)) { if (tk.t === 'abre' && !tk.auto) tirando = nombre; continue; }
    if (!ETIQUETAS.has(nombre)) continue;
    if (tk.t === 'cierra') {
      const i = pila.lastIndexOf(nombre); if (i < 0) continue;
      while (pila.length > i) out += `</${pila.pop()}>`;
    } else if (VACIAS.has(nombre)) out += `<${nombre}>`;
    else if (pila.length < MAX_PROF) { out += `<${nombre}${atributos(nombre, tk.attrs)}>`; pila.push(nombre); }
    if (out.length > max) break;
  }
  while (pila.length) out += `</${pila.pop()}>`;
  return out.slice(0, max);
}

/** Texto plano del HTML (para contar palabras, buscar y extractos) */
function aTexto(html) {
  return String(html || '').replace(/<(br|hr)\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-3]|li|tr|blockquote|pre)>/gi, '\n').replace(/<[^<>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/(?<![ \t])[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const cuentaPalabras = (texto) => (String(texto).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

module.exports = { sanea, aTexto, cuentaPalabras, estilo };
