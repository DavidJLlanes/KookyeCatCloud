'use strict';
/* Código: fragmentos con colores por lenguaje, números de línea, editor cómodo en móvil y vista previa (HTML, Markdown, JSON, SVG).
   Cada fragmento es su propio JSON en el servidor. El coloreado usa highlight.js (public/vendor/highlightjs). */
(function () {
  const root = document.getElementById('view-codigo');
  if (!root || !window.K) return;
  const S = { items: [], langs: {}, q: '', lang: '', etq: '', fav: false, ficha: null, built: false, vista: 'editar', guardado: true, timer: null, usoPrev: new Set() };
  const PREVIEW = new Set(['html', 'markdown', 'json', 'xml']);
  const BARRA = [['⇥', '\t', 'Tabulador'], ['{', '{', ''], ['}', '}', ''], ['(', '(', ''], [')', ')', ''], ['[', '[', ''], [']', ']', ''], ['<', '<', ''], ['>', '>', ''], ['/', '/', ''], [';', ';', ''], ['=', '=', ''], ['"', '"', ''], ["'", "'", ''], ['`', '`', ''], ['$', '$', ''], ['#', '#', '']];
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (label) b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nLineas = (c) => (c ? c.split('\n').length : 1);
  function colorea(codigo, lang) {
    try {
      if (window.hljs && lang && lang !== 'plaintext' && hljs.getLanguage(lang === 'nginx' ? 'nginx' : lang)) return hljs.highlight(codigo, { language: lang, ignoreIllegals: true }).value;
    } catch { /* sin coloreado */ }
    return esc(codigo);
  }
  const accion = (tipo) => { K.post('/api/codigo/accion', { tipo }).then(() => logros()).catch(() => {}); };

  /* ---------- Lista ---------- */
  async function carga() {
    try { const d = await K.get('/api/codigo'); S.items = d.items; S.langs = d.lenguajes; S.built = true; pinta(); } catch (e) { K.fail(e); }
  }
  function pinta() {
    if (!S.built) return; root.textContent = '';
    const page = el('section', 'cd-page'); root.appendChild(page);
    if (S.ficha) pintaEditor(page); else pintaLista(page);
  }
  function pintaLista(page) {
    const head = el('header', 'cd-head'); const t = el('div'); t.append(el('h1', null, 'Código'), el('p', 'k-muted', 'Tus fragmentos con colores, números de línea y vista previa'));
    head.append(t, btn('Nuevo fragmento', 'i-plus', nuevo, 'btn primary')); page.appendChild(head);
    const bar = el('div', 'cd-bar');
    const s = el('label', 'search cd-search'); s.appendChild(icon('i-search')); const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar por título, etiqueta o código…'; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar');
    inp.addEventListener('input', K.debounce(() => { S.q = inp.value; pintaTarjetas(); }, 150)); s.appendChild(inp); bar.appendChild(s);
    const ls = el('select'); ls.setAttribute('aria-label', 'Lenguaje'); const o0 = el('option', null, 'Todos los lenguajes'); o0.value = ''; ls.appendChild(o0);
    [...new Set(S.items.map(i => i.lenguaje))].sort().forEach(l => { const o = el('option', null, S.langs[l] || l); o.value = l; ls.appendChild(o); }); ls.value = S.lang; ls.addEventListener('change', () => { S.lang = ls.value; pintaTarjetas(); }); bar.appendChild(ls);
    const es = el('select'); es.setAttribute('aria-label', 'Etiqueta'); const e0 = el('option', null, 'Todas las etiquetas'); e0.value = ''; es.appendChild(e0);
    [...new Set(S.items.flatMap(i => i.etiquetas))].sort().forEach(l => { const o = el('option', null, '#' + l); o.value = l; es.appendChild(o); }); es.value = S.etq; es.addEventListener('change', () => { S.etq = es.value; pintaTarjetas(); }); bar.appendChild(es);
    const fv = el('button', 'btn cd-favbtn' + (S.fav ? ' on' : ''), '★ Favoritos'); fv.type = 'button'; fv.addEventListener('click', () => { S.fav = !S.fav; fv.classList.toggle('on', S.fav); pintaTarjetas(); }); bar.appendChild(fv);
    page.appendChild(bar);
    const g = el('div', 'cd-grid'); g.id = 'cd-grid'; page.appendChild(g); pintaTarjetas();
  }
  function pintaTarjetas() {
    const g = root.querySelector('#cd-grid'); if (!g) return; g.textContent = '';
    const q = S.q.toLocaleLowerCase('es');
    const l = S.items.filter(i => (!S.lang || i.lenguaje === S.lang) && (!S.etq || i.etiquetas.includes(S.etq)) && (!S.fav || i.favorito) && (!q || (i.titulo + ' ' + i.etiquetas.join(' ') + ' ' + i.inicio).toLocaleLowerCase('es').includes(q)));
    if (!l.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', '</>'), el('p', 'k-muted', S.items.length ? 'Ningún fragmento coincide con los filtros.' : 'Aún no tienes fragmentos. Crea el primero y pega tu código.')); if (!S.items.length) e.appendChild(btn('Nuevo fragmento', 'i-plus', nuevo, 'btn primary')); g.appendChild(e); return; }
    l.forEach(i => {
      const c = el('article', 'cd-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
      const h = el('header'); h.append(el('strong', null, (i.favorito ? '★ ' : '') + i.titulo), el('span', 'cd-lang', S.langs[i.lenguaje] || i.lenguaje)); c.appendChild(h);
      const pre = el('pre', 'cd-mini hljs'); const co = el('code'); co.innerHTML = colorea(i.inicio, i.lenguaje); pre.appendChild(co); c.appendChild(pre);
      const f = el('footer'); f.appendChild(el('small', 'k-muted', `${i.lineas} línea${i.lineas === 1 ? '' : 's'}`)); i.etiquetas.slice(0, 3).forEach(t => f.appendChild(el('span', 'cd-tag', '#' + t))); c.appendChild(f);
      const go = () => abre(i.id); c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); g.appendChild(c);
    });
  }
  async function nuevo() {
    try { const s = await K.post('/api/codigo', { titulo: 'Nuevo fragmento', lenguaje: 'html', codigo: '' }); S.items.unshift({ id: s.id, titulo: s.titulo, lenguaje: s.lenguaje, etiquetas: [], favorito: false, lineas: 1, inicio: '', actualizado: s.updatedAt }); S.ficha = s; S.vista = 'editar'; S.guardado = true; pinta(); logros(); } catch (e) { K.fail(e); }
  }
  async function abre(id) { try { S.ficha = await K.get('/api/codigo/' + id); S.vista = 'editar'; S.guardado = true; pinta(); } catch (e) { K.fail(e); } }
  async function cierra() { await guardaYa(); S.ficha = null; clearTimeout(S.timer); await carga(); }

  /* ---------- Guardado ---------- */
  function marca(ok) { S.guardado = ok; const e = root.querySelector('#cd-estado'); if (e) e.textContent = ok ? 'Guardado' : 'Guardando…'; }
  function programa() { marca(false); clearTimeout(S.timer); S.timer = setTimeout(guardaYa, 800); }
  async function guardaYa() {
    clearTimeout(S.timer); if (!S.ficha || S.guardado) return; const f = S.ficha;
    try { const s = await K.put('/api/codigo/' + f.id, { titulo: f.titulo, lenguaje: f.lenguaje, codigo: f.codigo, etiquetas: f.etiquetas, favorito: f.favorito }); f.updatedAt = s.updatedAt; marca(true); logros(); } catch (e) { K.fail(e); }
  }

  /* ---------- Editor ---------- */
  function pintaEditor(page) {
    const f = S.ficha;
    const head = el('header', 'cd-edhead');
    const back = btn('Código', null, cierra, 'btn sm'); back.prepend(el('span', null, '← '));
    const tit = el('input', 'cd-titulo'); tit.value = f.titulo; tit.maxLength = 120; tit.placeholder = 'Título'; tit.setAttribute('aria-label', 'Título'); tit.addEventListener('input', () => { f.titulo = tit.value; programa(); });
    const estado = el('small', 'k-muted cd-estado', 'Guardado'); estado.id = 'cd-estado';
    head.append(back, tit, estado); page.appendChild(head);
    const opts = el('div', 'cd-opts');
    const ls = el('select'); ls.setAttribute('aria-label', 'Lenguaje'); Object.entries(S.langs).forEach(([k, n]) => { const o = el('option', null, n); o.value = k; ls.appendChild(o); }); ls.value = f.lenguaje;
    ls.addEventListener('change', () => { f.lenguaje = ls.value; programa(); repintaCodigo(); actualizaPreview(); montaTabs(); });
    const det = btn('Detectar', null, () => { try { const r = hljs.highlightAuto(f.codigo, Object.keys(S.langs).filter(k => k !== 'plaintext' && hljs.getLanguage(k))); if (r.language && S.langs[r.language]) { f.lenguaje = r.language; ls.value = r.language; programa(); repintaCodigo(); actualizaPreview(); montaTabs(); K.toast('Lenguaje: ' + S.langs[r.language]); } else K.toast('No se pudo detectar'); } catch { K.toast('No se pudo detectar'); } }, 'btn sm');
    det.title = 'Detectar el lenguaje automáticamente';
    const fav = el('button', 'btn sm cd-favbtn' + (f.favorito ? ' on' : ''), '★'); fav.type = 'button'; fav.title = 'Favorito'; fav.setAttribute('aria-label', 'Favorito'); fav.addEventListener('click', () => { f.favorito = !f.favorito; fav.classList.toggle('on', f.favorito); programa(); });
    const etq = el('input', 'cd-etq'); etq.placeholder = 'etiquetas, separadas por comas'; etq.value = (f.etiquetas || []).join(', '); etq.setAttribute('aria-label', 'Etiquetas'); etq.addEventListener('input', () => { f.etiquetas = etq.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 8); programa(); });
    const copia = btn('Copiar', 'i-copy', async () => { try { await navigator.clipboard.writeText(f.codigo); K.toast('Código copiado'); accion('copia'); } catch { K.toast('No se pudo copiar'); } }, 'btn sm');
    const desc = btn('Descargar', 'i-download', descarga, 'btn sm');
    const del = btn('', 'i-trash', elimina, 'btn sm'); del.title = 'Eliminar'; del.setAttribute('aria-label', 'Eliminar fragmento');
    opts.append(ls, det, fav, etq, copia, desc, del); page.appendChild(opts);
    const tabs = el('div', 'cd-tabs'); tabs.id = 'cd-tabs'; page.appendChild(tabs);
    const cuerpo = el('div', 'cd-body'); cuerpo.id = 'cd-body'; page.appendChild(cuerpo);
    const ed = el('div', 'cd-editor');
    const gut = el('div', 'cd-gutter'); gut.setAttribute('aria-hidden', 'true');
    const wrap = el('div', 'cd-wrap');
    const pre = el('pre', 'cd-hl hljs'); pre.setAttribute('aria-hidden', 'true'); const co = el('code'); pre.appendChild(co);
    const ta = el('textarea', 'cd-ta'); ta.spellcheck = false; ta.autocapitalize = 'off'; ta.setAttribute('autocorrect', 'off'); ta.setAttribute('autocomplete', 'off'); ta.setAttribute('aria-label', 'Código'); ta.value = f.codigo; ta.wrap = 'off'; ta.placeholder = 'Pega o escribe tu código…';
    wrap.append(pre, ta); ed.append(gut, wrap);
    const sim = el('div', 'cd-sym'); BARRA.forEach(([l, t, tt]) => { const b = el('button', null, l); b.type = 'button'; b.tabIndex = -1; if (tt) b.title = tt; b.addEventListener('pointerdown', (e) => { e.preventDefault(); inserta(ta, t); }); sim.appendChild(b); });
    const izq = el('div', 'cd-izq'); izq.append(ed, sim);
    const prev = el('div', 'cd-prev'); prev.id = 'cd-prev';
    cuerpo.append(izq, prev);
    S.ed = { ta, pre, co, gut }; S.panel = { izq, prev };
    const sync = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; };
    ta.addEventListener('scroll', sync);
    ta.addEventListener('input', () => { f.codigo = ta.value; repintaCodigo(true); programa(); previewDebounce(); });
    ta.addEventListener('keydown', (e) => teclas(e, ta, f));
    repintaCodigo(); montaTabs(); actualizaPreview();
  }
  const previewDebounce = K.debounce(() => actualizaPreview(), 350);
  function repintaCodigo(rapido) {
    const { ta, co, gut } = S.ed || {}; if (!ta) return; const f = S.ficha; const c = f.codigo;
    co.innerHTML = colorea(c, f.lenguaje) + '\n';
    const n = nLineas(c); let t = ''; for (let i = 1; i <= n; i++) t += i + '\n'; gut.textContent = t;
    gut.style.minWidth = (String(n).length + 1.4) + 'ch';
    S.ed.pre.scrollTop = ta.scrollTop; S.ed.pre.scrollLeft = ta.scrollLeft;
  }
  // Inserta texto respetando el historial de deshacer cuando el navegador lo permite
  function inserta(ta, texto) {
    ta.focus();
    let ok = false; try { ok = document.execCommand('insertText', false, texto); } catch { ok = false; }
    if (!ok) { const a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(texto, a, b, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  const PARES = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  function teclas(e, ta, f) {
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardaYa(); return; }
    const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (a !== b && v.slice(a, b).includes('\n')) {
        const ini = v.lastIndexOf('\n', a - 1) + 1; let fin = v.indexOf('\n', b); if (fin < 0) fin = v.length;
        const bloque = v.slice(ini, fin); const nuevo = e.shiftKey ? bloque.replace(/^( {1,2}|\t)/gm, '') : bloque.replace(/^/gm, '  ');
        ta.setSelectionRange(ini, fin); inserta(ta, nuevo); ta.setSelectionRange(ini, ini + nuevo.length);
      } else if (e.shiftKey) {
        const ini = v.lastIndexOf('\n', a - 1) + 1; const m = /^( {1,2}|\t)/.exec(v.slice(ini)); if (m) { ta.setSelectionRange(ini, ini + m[0].length); inserta(ta, ''); ta.setSelectionRange(Math.max(ini, a - m[0].length), Math.max(ini, a - m[0].length)); }
      } else inserta(ta, '  ');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ini = v.lastIndexOf('\n', a - 1) + 1; const sangria = /^[ \t]*/.exec(v.slice(ini, a))[0];
      const antes = v.slice(0, a).trimEnd().slice(-1); const despues = v[b];
      if (/[{[(]/.test(antes) && PARES[antes] === despues) { inserta(ta, '\n' + sangria + '  \n' + sangria); const p = a + 1 + sangria.length + 2; ta.setSelectionRange(p, p); }
      else inserta(ta, '\n' + sangria + (/[{[(:>]$/.test(v.slice(ini, a).trimEnd()) && f.lenguaje !== 'markdown' ? '  ' : ''));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) { if (e.key === 'Backspace' && a === b && PARES[v[a - 1]] && PARES[v[a - 1]] === v[a]) { e.preventDefault(); ta.setSelectionRange(a - 1, a + 1); inserta(ta, ''); } return; }
    if (PARES[e.key] && a !== b && !(e.key === "'" || e.key === '"' || e.key === '`') ) { e.preventDefault(); const sel = v.slice(a, b); inserta(ta, e.key + sel + PARES[e.key]); ta.setSelectionRange(a + 1, a + 1 + sel.length); return; }
    if (')]}"\'`'.includes(e.key) && v[a] === e.key && a === b) { e.preventDefault(); ta.setSelectionRange(a + 1, a + 1); return; }
    if (PARES[e.key] && a === b && (!v[a] || /[\s)\]}>,;]/.test(v[a]))) {
      if ((e.key === '"' || e.key === "'" || e.key === '`') && (v[a] === e.key || /\w/.test(v[a - 1] || ''))) { if (v[a] === e.key) { e.preventDefault(); ta.setSelectionRange(a + 1, a + 1); } return; }
      e.preventDefault(); inserta(ta, e.key + PARES[e.key]); ta.setSelectionRange(a + 1, a + 1);
    }
  }
  async function elimina() {
    const f = S.ficha; if (!await K.confirm(`Se eliminará «${f.titulo}».`, { ok: 'Eliminar', danger: true })) return;
    try { await K.del('/api/codigo/' + f.id); clearTimeout(S.timer); S.guardado = true; S.ficha = null; await carga(); logros(); } catch (e) { K.fail(e); }
  }
  async function descarga() {
    const f = S.ficha; await guardaYa();
    try { const r = await fetch(`${BASE}/api/codigo/${f.id}/export`, { credentials: 'same-origin' }); if (!r.ok) throw new Error('No se pudo descargar');
      const ext = (r.headers.get('content-disposition') || '').match(/filename="fragmento\.(\w+)"/); const url = URL.createObjectURL(await r.blob());
      const a = el('a'); a.href = url; a.download = (f.titulo.replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '-') || 'fragmento') + '.' + (ext ? ext[1] : 'txt'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { K.fail(e); }
  }

  /* ---------- Vista previa ---------- */
  const previsualizable = () => { const f = S.ficha; return f && (f.lenguaje === 'html' || f.lenguaje === 'markdown' || f.lenguaje === 'json' || (f.lenguaje === 'xml' && /<svg[\s>]/i.test(f.codigo))); };
  function montaTabs() {
    const t = root.querySelector('#cd-tabs'); if (!t) return; t.textContent = '';
    const body = root.querySelector('#cd-body'); const ok = PREVIEW.has(S.ficha.lenguaje);
    body.classList.toggle('con-prev', ok); t.hidden = !ok;
    if (!ok) { S.vista = 'editar'; }
    [['editar', 'Editar'], ['prev', 'Vista previa']].forEach(([k, n]) => { const b = el('button', S.vista === k ? 'is-active' : '', n); b.type = 'button'; b.addEventListener('click', () => { S.vista = k; if (k === 'prev') { actualizaPreview(true); } aplicaVista(); montaTabs(); }); t.appendChild(b); });
    aplicaVista();
  }
  function aplicaVista() { const body = root.querySelector('#cd-body'); if (body) body.dataset.vista = S.vista; }
  function actualizaPreview(abierta) {
    const p = root.querySelector('#cd-prev'); if (!p || !S.ficha) return; const f = S.ficha; p.textContent = '';
    if (!PREVIEW.has(f.lenguaje)) return;
    if (!previsualizable()) { p.appendChild(el('p', 'k-muted cd-nota', f.lenguaje === 'xml' ? 'La vista previa del XML funciona con SVG (<svg>…).' : 'Sin contenido para previsualizar.')); return; }
    if (!S.usoPrev.has(f.id) && (abierta || window.innerWidth >= 900) && f.codigo.trim()) { S.usoPrev.add(f.id); accion('preview'); }
    if (f.lenguaje === 'html') {
      const fr = el('iframe', 'cd-frame'); fr.setAttribute('sandbox', ''); fr.title = 'Vista previa'; fr.srcdoc = f.codigo; p.appendChild(fr);
      p.appendChild(el('small', 'k-faint cd-nota', 'Vista previa aislada: se ven HTML y CSS; los scripts no se ejecutan.'));
    } else if (f.lenguaje === 'xml') {
      const img = el('img', 'cd-svg'); img.alt = 'Vista previa SVG'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.codigo); p.appendChild(img);
    } else if (f.lenguaje === 'json') {
      try { const o = JSON.parse(f.codigo); const pre = el('pre', 'cd-json hljs'); const co = el('code'); co.innerHTML = colorea(JSON.stringify(o, null, 2), 'json'); pre.appendChild(co); p.append(el('p', 'cd-ok', '✔ JSON válido'), pre); }
      catch (e) { p.appendChild(el('p', 'cd-err', '✖ ' + e.message)); }
    } else {
      const d = el('div', 'cd-md'); d.innerHTML = markdown(f.codigo); p.appendChild(d);
    }
  }
  // Markdown básico y seguro: todo se escapa antes de dar formato
  function markdown(src) {
    const lines = src.replace(/\r/g, '').split('\n'); let out = '', lista = null, en = false, buf = [], lang = '';
    const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`);
    const cierra = () => { if (lista) { out += `</${lista}>`; lista = null; } };
    for (const ln of lines) {
      const f = /^```(\w*)/.exec(ln);
      if (f) { if (!en) { cierra(); en = true; buf = []; lang = f[1]; } else { out += `<pre class="hljs"><code>${colorea(buf.join('\n'), lang)}</code></pre>`; en = false; } continue; }
      if (en) { buf.push(ln); continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) { cierra(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = /^\s*[-*+]\s+(.*)$/.exec(ln))) { if (lista !== 'ul') { cierra(); out += '<ul>'; lista = 'ul'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { if (lista !== 'ol') { cierra(); out += '<ol>'; lista = 'ol'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^>\s?(.*)$/.exec(ln))) { cierra(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
      else if (/^---+$/.test(ln.trim())) { cierra(); out += '<hr>'; }
      else if (!ln.trim()) cierra();
      else { cierra(); out += `<p>${inl(ln)}</p>`; }
    }
    if (en) out += `<pre class="hljs"><code>${esc(buf.join('\n'))}</code></pre>`;
    cierra(); return out;
  }

  window.addEventListener('beforeunload', () => { if (S.ficha && !S.guardado) { try { navigator.sendBeacon && 0; } catch { /* nada */ } } });
  K.registerView('codigo', { open() { if (S.ficha) pinta(); else carga(); }, close() { guardaYa(); } });
})();
