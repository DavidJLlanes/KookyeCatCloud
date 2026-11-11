'use strict';
/* notes/slash.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, NB } = C;
  const caretOffset = (...a) => C.caretOffset(...a);
  const change = (...a) => C.change(...a);
  const contentOf = (...a) => C.contentOf(...a);
  const esc = (...a) => C.esc(...a);
  const focusBlock = (...a) => C.focusBlock(...a);
  const insertAfter = (...a) => C.insertAfter(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const refArchivo = (...a) => C.refArchivo(...a);
  const setType = (...a) => C.setType(...a);

  /* ---------- Menú "/" ---------- */
  const SLASH = [
    ['p', 'Texto', 'Párrafo normal', 'Aa'], ['h1', 'Título 1', 'Encabezado grande', 'H1'], ['h2', 'Título 2', 'Encabezado mediano', 'H2'],
    ['h3', 'Título 3', 'Encabezado pequeño', 'H3'], ['ul', 'Lista con viñetas', 'Lista simple', '•'], ['ol', 'Lista numerada', 'Con números', '1.'],
    ['todo', 'Lista de tareas', 'Con casillas', '☑'], ['quote', 'Cita', 'Destacar un texto', '❝'], ['code', 'Código', 'Bloque de código', '</>'],
    ['callout:NOTE', 'Aviso: nota', 'Caja azul', '💡'], ['callout:TIP', 'Aviso: consejo', 'Caja verde', '✅'],
    ['callout:WARNING', 'Aviso: atención', 'Caja ámbar', '⚠️'], ['callout:IMPORTANT', 'Aviso: importante', 'Caja roja', '🔥'],
    ['divider', 'Separador', 'Línea horizontal', '—'],
    ['table', 'Tabla', 'Filas y columnas', '▦'], ['image', 'Imagen', 'Sube una o elige de tus archivos', '🖼️'],
    ['@file', 'Enlazar un archivo', 'Busca en tu nube', '📎'], ['@prompt', 'Enlazar un prompt', 'Busca en tu biblioteca de prompts', '✨'], ['@note', 'Enlazar una nota', 'Enlace a otra nota', '📝'],
    ['@date', 'Fecha de hoy', 'Inserta la fecha', '📅'], ['@event', 'Crear evento', 'Añade un evento al calendario', '🗓️'],
  ];
  function openSlash(w, q) {
    EST.slashBlock = w;
    const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const items = SLASH.filter(s => !q || norm(s[1]).includes(norm(q)) || norm(s[2]).includes(norm(q)) || s[0].toLowerCase().includes(q.toLowerCase()));
    if (q) { const nq = norm(q); items.sort((x, y) => norm(y[1]).includes(nq) - norm(x[1]).includes(nq)); }     // primero los que llevan lo escrito en el nombre
    if (!items.length) { closeSlash(); return; }
    if (!EST.slash) {
      EST.slash = document.createElement('div'); EST.slash.className = 'k-pop nb-slash'; EST.slash.style.width = '280px';
      document.body.appendChild(EST.slash);
    }
    EST.slash.dataset.q = q; EST.slash._items = items; EST.slash._hot = Math.min(EST.slash._hot || 0, items.length - 1);
    EST.slash.textContent = '';
    items.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item' + (i === EST.slash._hot ? ' is-hot' : '');
      const ic = document.createElement('span'); ic.className = 'nb-sl-ic'; ic.textContent = s[3];
      const tx = document.createElement('span'); tx.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      const a = document.createElement('b'); a.textContent = s[1]; a.style.fontWeight = '600';
      const d = document.createElement('small'); d.textContent = s[2]; d.style.cssText = 'color:var(--faint);font-size:11.5px';
      tx.append(a, d); b.append(ic, tx);
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); applySlash(s[0]); });
      EST.slash.appendChild(b);
    });
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : contentOf(w).getBoundingClientRect();
    const rect = r.height ? r : contentOf(w).getBoundingClientRect();
    let y = rect.bottom + 6; if (y + 320 > innerHeight) y = Math.max(8, rect.top - Math.min(320, EST.slash.offsetHeight) - 6);
    EST.slash.style.left = Math.min(rect.left, innerWidth - 300) + 'px'; EST.slash.style.top = y + 'px';
    EST.slash.querySelector('.is-hot') && EST.slash.querySelector('.is-hot').scrollIntoView({ block: 'nearest' });
  }
  function closeSlash() { if (EST.slash) { EST.slash.remove(); EST.slash = null; } EST.slashBlock = null; }
  function handleSlashKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const n = EST.slash._items.length;
      EST.slash._hot = (EST.slash._hot + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; openSlash(EST.slashBlock, EST.slash.dataset.q); return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySlash(EST.slash._items[EST.slash._hot][0]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
    return false;
  }
  function stripSlash(w) {
    const c = contentOf(w); const sel = getSelection(); if (!sel.rangeCount) return;
    const off = caretOffset(c); const txt = c.textContent; const i = txt.slice(0, off).lastIndexOf('/');
    if (i < 0) return;
    // Borra desde la barra hasta el cursor, sobre los nodos de texto
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let pos = 0, nd; const r = document.createRange(); let ini = false;
    while ((nd = walker.nextNode())) {
      if (!ini && pos + nd.length > i) { r.setStart(nd, i - pos); ini = true; }
      if (ini && pos + nd.length >= off) { r.setEnd(nd, off - pos); break; }
      pos += nd.length;
    }
    if (ini) { r.deleteContents(); }
    if (/\s$/.test(c.textContent) === false && c.textContent.endsWith('\u00a0')) c.textContent = c.textContent.replace(/\u00a0$/, '');
  }
  async function applySlash(code) {
    const w = EST.slashBlock; closeSlash(); if (!w) return;
    stripSlash(w);
    const c = contentOf(w);
    if (code.startsWith('@')) {
      if (code === '@date') { document.execCommand('insertText', false, new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); change(); return; }
      if (code === '@event') { K.calendar.newEvent({ date: new Date() }); return; }
      pickLink(w, code === '@prompt' ? 'prompt' : code === '@file' ? 'file' : 'note'); return;
    }
    if (C.slashRico(code, w)) return;
    if (code === 'table' || code === 'image') {
      if (code === 'image') { if (NB.elegirImagen) NB.elegirImagen(w); return; }
      const vacio = !c.textContent.trim();
      const n = makeBlock({ t: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']] });
      if (vacio) w.replaceWith(n); else w.after(n);
      const sig = n.nextElementSibling || insertAfter(n, { t: 'p', text: '' });
      focusBlock(n); change(true); return;
    }
    if (code.startsWith('callout:')) { setType(w, 'callout', { kind: code.split(':')[1] }); }
    else setType(w, code);
    if (code === 'divider') { const n = w.nextElementSibling && w.nextElementSibling.dataset.t === 'p' ? w.nextElementSibling : insertAfter(w, { t: 'p', text: '' }); focusBlock(n); }
    else focusBlock(w, true);
    change(true);
  }

  // Buscar un prompt o una nota y dejar un enlace dentro del texto
  async function pickLink(w, tipo) {
    const sel = getSelection(); const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const box = el('div'); const inp = el('input'); inp.placeholder = tipo === 'prompt' ? 'Buscar un prompt…' : 'Buscar una nota…'; box.appendChild(inp);
    const list = el('div'); list.style.marginTop = '8px'; box.appendChild(list);
    if (tipo === 'file') inp.placeholder = 'Buscar un archivo o carpeta…';
    const m = K.modal({ title: tipo === 'prompt' ? 'Enlazar un prompt' : tipo === 'file' ? 'Enlazar un archivo' : 'Enlazar una nota', content: box, actions: [{ label: 'Cancelar' }] });
    const poner = (id, title) => {
      m.close();
      setTimeout(() => {
        contentOf(w).focus();
        if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); }
        const a = `<a class="nb-ref" data-kcc="${tipo}:${esc(id)}" contenteditable="false">${esc(title)}</a>&nbsp;`;
        document.execCommand('insertHTML', false, a); change(true);
      }, 30);
    };
    const busca = async () => {
      const q = inp.value.trim();
      list.textContent = '';
      try {
        let res = [];
        if (tipo === 'prompt') { const r = await K.get('/api/prompts?' + K.qs({ q, limit: 12, sort: 'updated' })); res = r.items.map(p => [p.id, p.title, p.model || '']); }
        else if (tipo === 'file') { if (q.length >= 2) { const r = await K.get('/api/search?' + K.qs({ q })); res = r.items.slice(0, 12).map(f => [refArchivo((f.dir ? f.dir + '/' : '') + f.name), f.name, f.dir || 'Inicio']); } }
        else res = NT.items.filter(i => i.type === 'note' && i.id !== NT.abierta && (!q || i.title.toLowerCase().includes(q.toLowerCase()))).slice(0, 12).map(i => [i.id, i.title, '']);
        if (!res.length) list.appendChild(el('p', 'k-faint', tipo === 'file' && q.length < 2 ? 'Escribe al menos 2 letras' : 'Sin resultados'));
        res.forEach(([id, title, sub]) => { const b = el('button', 'btn'); b.type = 'button'; b.style.cssText = 'width:100%;justify-content:flex-start;margin-bottom:6px'; b.append(icon(tipo === 'prompt' ? 'i-sparkle' : tipo === 'file' ? 'i-doc' : 'i-note'), el('span', null, title)); if (sub) b.appendChild(el('span', 'k-faint', ' · ' + sub)); b.addEventListener('click', () => poner(id, title)); list.appendChild(b); });
      } catch (er) { K.fail(er); }
    };
    inp.addEventListener('input', K.debounce(busca, 200)); busca(); setTimeout(() => inp.focus(), 30);
  }


  Object.assign(C, { SLASH, openSlash, closeSlash, handleSlashKey, stripSlash, applySlash, pickLink });
})();
