'use strict';
const { tokens, atributos: leeAtributos, recorta } = require('../html-tokens');
// Importar · HTML → Markdown del editor de notas (títulos hasta nivel 3, listas con sangría de 2, tareas «- [ ]», tablas con barras,
// avisos «> [!NOTE]», desplegables «:::toggle»). Es un conversor tolerante y sin dependencias: lo usan Evernote (ENML), Google Docs,
// Notion (HTML), Apple Notes y cualquier .html. Nunca ejecuta ni conserva scripts, estilos ni atributos.
const VACIAS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'en-media', 'en-todo', 'col', 'source', 'wbr']);
const IGNORADAS = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'svg', 'object', 'button', 'select', 'textarea']);
const NOMBRADAS = Object.assign(Object.create(null), { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', copy: '©', reg: '®', euro: '€', iquest: '¿', iexcl: '¡', middot: '·', bull: '•', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', times: '×', trade: '™',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', agrave: 'à', egrave: 'è', ccedil: 'ç', ouml: 'ö', auml: 'ä' });

const decodifica = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; } catch { return ''; } }
  return Object.prototype.hasOwnProperty.call(NOMBRADAS, e) ? NOMBRADAS[e] : m;
});

const atributos = (txt) => { const a = leeAtributos(txt); for (const k of Object.keys(a)) a[k] = decodifica(a[k]); return a; };

// Árbol de nodos { t: etiqueta, a: atributos, h: hijos } y textos { x }. Cierra solos li, p, td, th, tr (HTML poco cuidado).
// Usa el lector lineal de lib/html-tokens.js (las expresiones regulares de antes se podían colgar con HTML malicioso).
// El contenido de los <style> va en `raiz.estilos` para sacar las clases de Google Docs.
function analiza(html) {
  const raiz = { t: '#', a: {}, h: [] }; const pila = [raiz];
  const cierra = (t) => { for (let i = pila.length - 1; i > 0; i--) if (pila[i].t === t) { pila.length = i; return; } };
  let ignorando = null, css = null; raiz.estilos = [];
  for (const tk of tokens(html)) {
    // <style> se recoge esté donde esté (también dentro de <head>, que se ignora)
    if (tk.t === 'abre' && tk.n === 'style' && !tk.auto) { css = { v: '' }; raiz.estilos.push(css); }
    else if (tk.t === 'cierra' && tk.n === 'style') css = null;
    else if (css && (tk.t === 'texto' || tk.t === 'cdata')) css.v += tk.v;
    if (ignorando) {
      if (tk.t === 'cierra' && tk.n === ignorando.t) { ignorando = null; cierra(tk.n); }
      continue;
    }
    if (tk.t === 'cdata') { pila[pila.length - 1].h.push({ x: tk.v }); continue; }
    if (tk.t === 'texto') { pila[pila.length - 1].h.push({ x: decodifica(tk.v) }); continue; }
    const t = tk.n;
    if (tk.t === 'cierra') { cierra(t); continue; }
    const top = pila[pila.length - 1];
    if (t === 'li' && top.t === 'li') pila.pop();
    else if ((t === 'td' || t === 'th') && (top.t === 'td' || top.t === 'th')) pila.pop();
    else if (t === 'tr' && (top.t === 'td' || top.t === 'th')) { pila.pop(); if (pila[pila.length - 1].t === 'tr') pila.pop(); }
    else if (t === 'tr' && top.t === 'tr') pila.pop();
    else if (t === 'p' && top.t === 'p') pila.pop();
    const n = { t, a: atributos(tk.attrs), h: [] };
    pila[pila.length - 1].h.push(n);
    if (!VACIAS.has(t) && !tk.auto) { pila.push(n); if (IGNORADAS.has(t)) ignorando = n; }
    if (pila.length > 400) pila.length = 400;
  }
  return raiz;
}

const BLOQUE = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'blockquote', 'pre', 'hr', 'aside', 'details', 'figure', 'section', 'article', 'header', 'footer', 'nav', 'center', 'dl', 'dt', 'dd', 'body', 'html', 'main', 'en-note']);
const esBloque = (n) => !!n.t && BLOQUE.has(n.t);

const SEGURO = /^(https?:|mailto:|tel:)/i;

function convierte(html, opc = {}) {
  const resImg = opc.resuelveImagen || (() => null), resEnl = opc.resuelveEnlace || ((h) => (SEGURO.test(h) ? h : null));
  const mediaHash = opc.media || (() => null);   // en-media → ruta
  const crudo = String(html || '');
  const clases = {};   // .c1 { font-weight:700 } → { c1: 'font-weight:700' } (Google Docs no pone el estilo en cada <span>)
  const arbol = analiza(crudo);
  for (const { v: css } of arbol.estilos) for (const r of css.matchAll(/\.([\w-]{1,100})\s*\{([^{}]*)\}/g)) clases[r[1]] = (clases[r[1]] || '') + r[2].toLowerCase() + ';';

  const estilo = (n) => String((n.a && n.a.style) || '').toLowerCase() + String((n.a && n.a.class) || '').split(/\s+/).map(c => clases[c] || '').join('').replace(/\s+/g, ' ');
  const textoDe = (n) => (n.x !== undefined ? n.x : (n.h || []).map(textoDe).join(''));
  function envuelve(marca, s) { const [a, m, z] = recorta(s); return m ? `${a}${marca}${m}${marca}${z}` : s; }

  function inline(nodos, ctx = {}) {
    let out = '';
    for (const n of nodos) {
      if (n.x !== undefined) { out += ctx.pre ? n.x : n.x.replace(/\s+/g, ' '); continue; }
      const t = n.t;
      if (IGNORADAS.has(t)) continue;
      if (t === 'br') { out += '\n'; continue; }
      if (t === 'img' || t === 'en-media') { const r = t === 'img' ? resImg(n.a.src || '', n.a.alt || '') : mediaHash(n.a.hash, n.a.type, n.a.alt || ''); out += r ? `\n\n${r}\n\n` : ''; continue; }
      if (t === 'input' && /checkbox/i.test(n.a.type || '')) { out += ('checked' in n.a) ? '[x] ' : '[ ] '; continue; }
      if (t === 'en-todo') { out += n.a.checked === 'true' ? '[x] ' : '[ ] '; continue; }
      const dentro = inline(n.h, ctx);
      const st = estilo(n);
      let s = dentro;
      if (t === 'strong' || t === 'b' || /font-weight:\s*(bold|[6-9]00)/.test(st)) s = envuelve('**', s);
      if (t === 'em' || t === 'i' || /font-style:\s*italic/.test(st)) s = envuelve('*', s);
      if (t === 's' || t === 'strike' || t === 'del' || /line-through/.test(st)) s = envuelve('~~', s);
      if (t === 'code' && !ctx.pre) s = s.trim() ? '`' + s.trim().replace(/`/g, "'") + '`' : s;
      if (t === 'a') { const h = resEnl(n.a.href || ''); const tx = s.trim(); s = h && tx ? `[${tx.replace(/[[\]]/g, '')}](${h.replace(/[\s()]/g, encodeURIComponent)})` : s; }
      out += s;
    }
    return out;
  }

  const limpiaLinea = (s) => s.replace(/(?<![ \t])[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/^[ \t]+/, '').replace(/(?<![ \t])[ \t]+$/, '');

  // Agrupa hijos consecutivos «en línea» en un párrafo y deja los bloques como están
  function bloques(nodos, ctx) {
    const out = []; let buf = [];
    const vacia = () => { if (buf.length) { const t = limpiaLinea(inline(buf, ctx)); if (t.trim()) out.push(t); buf = []; } };
    for (const n of nodos) {
      if (n.x !== undefined || !esBloque(n)) buf.push(n); else { vacia(); const b = bloque(n, ctx); if (b) out.push(b); }
    }
    vacia(); return out;
  }
  const unidos = (arr) => arr.filter(s => s && s.trim()).join('\n\n');
  const sangra = (s, pref) => s.split('\n').map(l => (l ? pref + l : l)).join('\n');

  function lista(n, ctx, nivel) {
    const ord = n.t === 'ol'; let k = Number(n.a.start) || 1; const lineas = [];
    for (const li of n.h) {
      if (li.t !== 'li') { if (li.t === 'ul' || li.t === 'ol') lineas.push(lista(li, ctx, nivel + 1)); continue; }
      const sub = li.h.filter(x => x.t === 'ul' || x.t === 'ol'), resto = li.h.filter(x => x.t !== 'ul' && x.t !== 'ol');
      let tx = bloques(resto, ctx).join('\n').replace(/\n{2,}/g, '\n');
      let marca = ord ? `${k++}. ` : '- ';
      const tarea = /^\[( |x)\] /.exec(tx);
      if (tarea) { tx = tx.slice(4).replace(/^\s+/, ''); marca = `- [${tarea[1]}] `; }
      const [primera, ...otras] = tx.split('\n');
      lineas.push('  '.repeat(Math.min(nivel, 3)) + marca + (primera || '') + (otras.length ? '\n' + otras.map(l => '  '.repeat(Math.min(nivel, 3)) + '  ' + l).join('\n') : ''));
      for (const s of sub) lineas.push(lista(s, ctx, nivel + 1));
    }
    return lineas.join('\n');
  }

  function tabla(n, ctx) {
    const filas = [];
    const recoge = (x) => { for (const h of x.h || []) { if (h.t === 'tr') filas.push(h.h.filter(c => c.t === 'td' || c.t === 'th')); else if (h.t && ['thead', 'tbody', 'tfoot'].includes(h.t)) recoge(h); } };
    recoge(n);
    if (!filas.length) return '';
    const ancho = Math.max(...filas.map(f => f.length)); if (!ancho) return '';
    const celda = (c) => unidos(bloques(c.h, ctx)).replace(/\n+/g, '<br>').replace(/\|/g, '/').trim();
    const txt = filas.slice(0, 500).map(f => { const c = f.map(celda); while (c.length < ancho) c.push(''); return '| ' + c.join(' | ') + ' |'; });
    txt.splice(1, 0, '| ' + Array(ancho).fill('---').join(' | ') + ' |');
    return txt.join('\n');
  }

  function bloque(n, ctx) {
    const t = n.t;
    if (/^h[1-6]$/.test(t)) { const tx = limpiaLinea(inline(n.h, ctx)).replace(/(?<!\s)\s*\n\s*/g, ' ').trim(); if (!tx) return ''; const nv = Number(t[1]); return nv <= 3 ? '#'.repeat(nv) + ' ' + tx : `**${tx.replace(/\*\*/g, '')}**`; }
    if (t === 'ul' || t === 'ol') return lista(n, ctx, 0);
    if (t === 'li') return lista({ t: 'ul', a: {}, h: [n] }, ctx, 0);
    if (t === 'table') return tabla(n, ctx);
    if (t === 'hr') return '---';
    if (t === 'pre') { const tx = textoDe(n).replace(/(?<!\n)\n+$/, ''); const c = n.h.find(x => x.t === 'code'); const l = /language-([\w+-]+)/.exec((c && c.a.class) || n.a.class || ''); return '```' + (l ? l[1] : '') + '\n' + tx.replace(/```/g, "'''") + '\n```'; }
    if (t === 'blockquote' || t === 'aside') {
      const cuerpo = unidos(bloques(n.h, ctx)).split('\n').map(l => l.replace(/^\s+/, ''));
      if (!cuerpo.join('').trim()) return '';
      if (t === 'aside') { cuerpo[0] = '[!NOTE] ' + cuerpo[0]; }
      return cuerpo.map(l => '> ' + l).join('\n').replace(/\n> \n(> \n)+/g, '\n> \n');
    }
    if (t === 'details') {
      const resumen = n.h.find(x => x.t === 'summary'); const titulo = limpiaLinea(resumen ? inline(resumen.h, ctx) : 'Desplegable').replace(/\s+/g, ' ').trim() || 'Desplegable';
      const cuerpo = unidos(bloques(n.h.filter(x => x !== resumen), ctx));
      return `:::toggle ${titulo}\n${cuerpo}\n:::`;
    }
    if (t === 'figure') { const partes = bloques(n.h.filter(x => x.t !== 'figcaption'), ctx); const cap = n.h.find(x => x.t === 'figcaption'); if (cap) partes.push('*' + limpiaLinea(inline(cap.h, ctx)).trim() + '*'); return unidos(partes); }
    // p, div, section… : mezcla de bloques y texto en línea
    const partes = bloques(n.h, ctx);
    return t === 'p' ? partes.join('\n') : unidos(partes);
  }

  const md = unidos(bloques(arbol.h, {}));
  return md.replace(/(?<![ \t])[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/ /g, ' ').trim();
}

module.exports = { convierte, decodifica, analiza };
