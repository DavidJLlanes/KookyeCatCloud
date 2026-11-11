'use strict';
/* codigo/estado.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});

  const root = document.getElementById('view-codigo');
  if (!root || !window.K) return;
  const S = { items: [], lim: null, q: '', fav: false, p: null, tab: 'archivos', ruta: null, texto: '', bin: null, abiertas: new Set(), ver: null,
    guardado: true, timer: null, movil: 'arbol', usoPrev: new Set(), built: false, ed: null, vistaPrev: false, token: null };
  const MAXB = 50 * 1024 * 1024;
  const EXT_LANG = { html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', markdown: 'markdown', py: 'python', php: 'php', sql: 'sql', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', java: 'java', cs: 'csharp', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', go: 'go', rs: 'rust', rb: 'ruby', kt: 'kotlin', swift: 'swift', ini: 'ini', conf: 'nginx' };
  const BARRA = [['⇥', '\t', 'Tabulador'], ['{', '{', ''], ['}', '}', ''], ['(', '(', ''], [')', ')', ''], ['[', '[', ''], [']', ']', ''], ['<', '<', ''], ['>', '>', ''], ['/', '/', ''], [';', ';', ''], ['=', '=', ''], ['"', '"', ''], ["'", "'", ''], ['`', '`', ''], ['$', '$', ''], ['#', '#', '']];
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (label) b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ext = (r) => (r.includes('.') ? r.split('.').pop().toLowerCase() : '');
  const langDe = (r) => EXT_LANG[ext(r)] || '';
  const nombreDe = (r) => r.split('/').pop();
  const carpetaDe = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');
  const tam = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const fecha = (t) => new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  const url = (s) => `/api/codigo/${S.p.id}${s}`;
  const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const accion = (tipo) => { K.post('/api/codigo/accion', { tipo }).then(() => logros()).catch(() => {}); };
  function colorea(codigo, lang) {
    try { if (window.hljs && lang && codigo.length < 200000 && hljs.getLanguage(lang)) return hljs.highlight(codigo, { language: lang, ignoreIllegals: true }).value; } catch { /* sin coloreado */ }
    return esc(codigo);
  }
  const pide = (title, valor, ok, sub) => new Promise((res) => {
    const i = el('input'); i.value = valor || ''; i.maxLength = 240; i.style.width = '100%'; i.setAttribute('aria-label', title); let fin = false;
    const h = K.modal({ title, sub, content: i, actions: [{ label: 'Cancelar' }, { label: ok || 'Aceptar', primary: true, onClick: () => { fin = true; res(i.value.trim()); } }], onClose: () => { if (!fin) res(null); } });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fin = true; res(i.value.trim()); h.close(); } });
    setTimeout(() => { i.focus(); i.select(); }, 60);
  });
  async function bajar(ruta, nombre) {
    await K.guardarUrl(ruta, { nombre });
  }


  Object.assign(C, { root, S, MAXB, EXT_LANG, BARRA, btn, logros, esc, ext, langDe, nombreDe, carpetaDe, tam, fecha, url, q, accion, colorea, pide, bajar });
})();
