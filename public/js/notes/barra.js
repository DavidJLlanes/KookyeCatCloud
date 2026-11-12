'use strict';
/* notes/barra.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { CALLOUTS, EST, NB } = C;
  const blockOf = (...a) => C.blockOf(...a);
  const change = (...a) => C.change(...a);
  const contentOf = (...a) => C.contentOf(...a);
  const esc = (...a) => C.esc(...a);
  const focusBlock = (...a) => C.focusBlock(...a);
  const inlineHtml = (...a) => C.inlineHtml(...a);
  const insertAfter = (...a) => C.insertAfter(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const parseMd = (...a) => C.parseMd(...a);
  const refArchivo = (...a) => C.refArchivo(...a);
  const rutaDeSrc = (...a) => C.rutaDeSrc(...a);
  const setType = (...a) => C.setType(...a);

  /* ---------- Barra flotante de formato ---------- */
  function showBar() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !EST.host.contains(sel.anchorNode)) { hideBar(); return; }
    const w = blockOf(sel.anchorNode); if (!w || w.dataset.t === 'code') { hideBar(); return; }
    if (!EST.bar) {
      EST.bar = document.createElement('div'); EST.bar.className = 'k-pop nb-bar'; EST.bar.style.padding = '4px';
      const defs = [['B', 'Negrita (Ctrl+B)', () => { document.execCommand('bold'); }], ['I', 'Cursiva (Ctrl+I)', () => { document.execCommand('italic'); }],
        ['S', 'Tachado', () => { document.execCommand('strikeThrough'); }], ['</>', 'Código (Ctrl+E)', () => toggleTag('code')],
        ['▮', 'Resaltar', () => toggleTag('mark')], ['🔗', 'Enlace (Ctrl+K)', () => linkSelection()],
        ['H1', 'Título 1', () => setType(blockOf(getSelection().anchorNode), blockOf(getSelection().anchorNode).dataset.t === 'h1' ? 'p' : 'h1')],
        ['H2', 'Título 2', () => setType(blockOf(getSelection().anchorNode), blockOf(getSelection().anchorNode).dataset.t === 'h2' ? 'p' : 'h2')],
        ['H3', 'Título 3', () => setType(blockOf(getSelection().anchorNode), blockOf(getSelection().anchorNode).dataset.t === 'h3' ? 'p' : 'h3')],
        ['•', 'Lista con viñetas', () => setType(blockOf(getSelection().anchorNode), 'ul')], ['☑', 'Lista de tareas', () => setType(blockOf(getSelection().anchorNode), 'todo')]];
      defs.forEach(([l, t, f]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'nb-bar-btn'; b.title = t; b.textContent = l;
        if (l === 'B') b.style.fontWeight = '800'; if (l === 'I') b.style.fontStyle = 'italic'; if (l === 'S') b.style.textDecoration = 'line-through';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { f(); } catch {} change(); setTimeout(showBar, 0); });
        EST.bar.appendChild(b);
      });
      document.body.appendChild(EST.bar);
    }
    // En táctil la barra se acopla encima del teclado (el menú nativo de copiar/cortar tapaba la que flotaba junto al texto)
    K.colocaBarra(EST.bar, sel.getRangeAt(0).getBoundingClientRect());
  }
  function hideBar() { if (EST.bar) { EST.bar.remove(); EST.bar = null; } }
  function toggleTag(tag) {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    let n = r.commonAncestorContainer; if (n.nodeType === 3) n = n.parentNode;
    const ya = n.closest && n.closest(tag);
    if (ya && EST.host.contains(ya)) { const t = document.createTextNode(ya.textContent); ya.replaceWith(t); return; }
    const el2 = document.createElement(tag); try { r.surroundContents(el2); } catch { el2.appendChild(r.extractContents()); r.insertNode(el2); }
    sel.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(el2); sel.addRange(nr);
  }
  async function linkSelection() {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const saved = sel.getRangeAt(0).cloneRange();
    const url = await K.ask('Enlace', { placeholder: 'https://…', ok: 'Poner enlace', sub: 'Déjalo vacío para quitar el enlace' });
    if (url === null) return;
    const s = getSelection(); s.removeAllRanges(); s.addRange(saved);
    if (!url) document.execCommand('unlink'); else if (/^(https?:|mailto:)/i.test(url)) document.execCommand('createLink', false, url); else if (/^[\w.-]+\.\w{2,}/.test(url)) document.execCommand('createLink', false, 'https://' + url); else K.toast('Enlace no válido');
    change();
  }

  /* ---------- Arrastrar bloques ---------- */
  Object.assign(EST, { arrastrado: null });
  function onDragStart(e) {
    const g = e.target.closest && e.target.closest('.nb-grip'); if (!g) return;
    EST.arrastrado = blockOf(g); EST.arrastrado.classList.add('nb-dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'nb');
    try { e.dataTransfer.setDragImage(EST.arrastrado, 20, 14); } catch {}
  }
  function onDragOver(e) {
    if (!EST.arrastrado) { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); return; }
    e.preventDefault();
    EST.host.querySelectorAll('.nb-over').forEach(x => x.classList.remove('nb-over', 'nb-over-b'));
    const w = blockOf(e.target); if (!w || w === EST.arrastrado) return;
    const r = w.getBoundingClientRect(); w.classList.add(e.clientY > r.top + r.height / 2 ? 'nb-over-b' : 'nb-over');
  }
  function onDrop(e) {
    if (!EST.arrastrado) {
      const imgs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => /^image\//.test(f.type));
      if (imgs.length && NB.subeImagenes) { e.preventDefault(); NB.subeImagenes(imgs, blockOf(e.target) || EST.host.lastElementChild); }
      return;
    }
    e.preventDefault();
    const w = blockOf(e.target);
    if (w && w !== EST.arrastrado) { const r = w.getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) w.after(EST.arrastrado); else w.before(EST.arrastrado); change(true); }
    onDragEnd();
  }
  function onDragEnd() { if (EST.arrastrado) EST.arrastrado.classList.remove('nb-dragging'); EST.arrastrado = null; EST.host.querySelectorAll('.nb-over,.nb-over-b').forEach(x => x.classList.remove('nb-over', 'nb-over-b')); }

  // Lo que necesita notes-extra.js (imágenes, exportación, plantillas) del editor
  NB.int = {
    parseMd, inlineHtml, makeBlock, insertAfter, focusBlock, change, blockOf, contentOf, esc, rutaDeSrc, refArchivo,
    host: () => EST.host, store: () => EST.store, CALLOUTS,
  };


  Object.assign(C, { showBar, hideBar, toggleTag, linkSelection, onDragStart, onDragOver, onDrop, onDragEnd });
})();
