'use strict';
/* notes/menciones.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;
  const caretOffset = (...a) => C.caretOffset(...a);
  const change = (...a) => C.change(...a);
  const contentOf = (...a) => C.contentOf(...a);
  const esc = (...a) => C.esc(...a);
  const refArchivo = (...a) => C.refArchivo(...a);

  /* ---------- Menciones "@" ---------- */
  // Escribe @ y un nombre: sugiere notas, prompts y archivos y deja un enlace en el texto
  Object.assign(EST, { mention: null, mentionBlock: null, mencionTok: 0 });
  const buscaMencion = K.debounce(async (w, q) => {
    const tok = ++EST.mencionTok;
    const items = [];
    const ql = q.toLowerCase();
    NT.items.filter(i => i.type === 'note' && i.id !== NT.abierta && (!q || i.title.toLowerCase().includes(ql))).slice(0, 4)
      .forEach(i => items.push({ tipo: 'note', id: i.id, titulo: i.title, sub: 'Nota', ic: 'i-note' }));
    try {
      const [pr, fi] = await Promise.all([
        K.get('/api/prompts?' + K.qs({ q, limit: 4, sort: 'updated' })).catch(() => ({ items: [] })),
        q.length >= 2 ? K.get('/api/search?' + K.qs({ q })).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      pr.items.forEach(p => items.push({ tipo: 'prompt', id: p.id, titulo: p.title, sub: 'Prompt', ic: 'i-sparkle' }));
      fi.items.slice(0, 5).forEach(f => items.push({ tipo: 'file', id: refArchivo((f.dir ? f.dir + '/' : '') + f.name), titulo: f.name, sub: f.dir || 'Inicio', ic: f.isDir ? 'i-folder' : 'i-doc' }));
    } catch { /* sin red */ }
    if (tok !== EST.mencionTok || !EST.mention || EST.mentionBlock !== w) return;
    EST.mention._items = items; EST.mention._hot = 0; pintaMencion(w);
  }, 180);
  function openMention(w, q) {
    EST.mentionBlock = w;
    if (!EST.mention) { EST.mention = document.createElement('div'); EST.mention.className = 'k-pop nb-slash'; EST.mention.style.width = '300px'; EST.mention._items = []; EST.mention._hot = 0; document.body.appendChild(EST.mention); }
    EST.mention.dataset.q = q;
    pintaMencion(w);
    buscaMencion(w, q);
  }
  function pintaMencion(w) {
    if (!EST.mention) return;
    EST.mention.textContent = '';
    const items = EST.mention._items;
    if (!items.length) { const h = document.createElement('div'); h.className = 'head'; h.textContent = 'Menciona una nota, un prompt o un archivo…'; EST.mention.appendChild(h); }
    items.forEach((it, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item' + (i === EST.mention._hot ? ' is-hot' : '');
      b.appendChild(icon(it.ic));
      const tx = document.createElement('span'); tx.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      const a = document.createElement('b'); a.textContent = it.titulo; a.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const d = document.createElement('small'); d.textContent = it.sub; d.style.cssText = 'color:var(--faint);font-size:11.5px';
      tx.append(a, d); b.appendChild(tx);
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); aplicaMencion(it); });
      EST.mention.appendChild(b);
    });
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : contentOf(w).getBoundingClientRect();
    const rect = r.height ? r : contentOf(w).getBoundingClientRect();
    let y = rect.bottom + 6; if (y + 300 > innerHeight) y = Math.max(8, rect.top - Math.min(300, EST.mention.offsetHeight) - 6);
    EST.mention.style.left = Math.min(rect.left, innerWidth - 320) + 'px'; EST.mention.style.top = y + 'px';
  }
  function closeMention() { if (EST.mention) { EST.mention.remove(); EST.mention = null; } EST.mentionBlock = null; }
  function handleMentionKey(e) {
    const n = EST.mention._items.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); EST.mention._hot = (EST.mention._hot + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; pintaMencion(EST.mentionBlock); return true; }
    if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); aplicaMencion(EST.mention._items[EST.mention._hot]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); closeMention(); return true; }
    return false;
  }
  function aplicaMencion(it) {
    const w = EST.mentionBlock; closeMention(); if (!w) return;
    // Se borra el "@texto" ya escrito y se pone el enlace
    const c = contentOf(w); const off = caretOffset(c); const txt = c.textContent; const i = txt.slice(0, off).lastIndexOf('@');
    if (i >= 0) {
      const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let pos = 0, nd; const r = document.createRange(); let ini = false;
      while ((nd = walker.nextNode())) {
        if (!ini && pos + nd.length > i) { r.setStart(nd, i - pos); ini = true; }
        if (ini && pos + nd.length >= off) { r.setEnd(nd, off - pos); break; }
        pos += nd.length;
      }
      if (ini) { getSelection().removeAllRanges(); getSelection().addRange(r); r.deleteContents(); }
    }
    document.execCommand('insertHTML', false, `<a class="nb-ref" data-kcc="${it.tipo}:${esc(it.id)}" contenteditable="false">${esc(it.titulo)}</a>&nbsp;`);
    change(true);
  }


  Object.assign(C, { buscaMencion, openMention, pintaMencion, closeMention, handleMentionKey, aplicaMencion });
})();
