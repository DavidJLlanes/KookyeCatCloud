'use strict';
/* notes/seleccion.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, plano } = C;
  const decorate = (...a) => C.decorate(...a);
  const inlineMd = (...a) => C.inlineMd(...a);
  const isList = (...a) => C.isList(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const renumber = (...a) => C.renumber(...a);

  /* ---------- Utilidades de selección ---------- */
  const blockOf = (n) => { while (n && n !== EST.host) { if (n.nodeType === 1 && n.classList.contains('nb-block')) return n; n = n.parentNode; } return null; };
  const contentOf = (w) => w.querySelector('.nb-c');
  function caretOffset(c) {
    const sel = getSelection(); if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0).cloneRange(); const pre = r.cloneRange(); pre.selectNodeContents(c); pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }
  function atStart(c) { const s = getSelection(); return s.isCollapsed && caretOffset(c) === 0; }
  function atEnd(c) { const s = getSelection(); return s.isCollapsed && caretOffset(c) >= c.textContent.length; }
  function focusBlock(w, end) {
    if (w.dataset.t === 'table') {
      const cs = w.querySelectorAll('td,th'); const cel = end ? cs[cs.length - 1] : cs[0];
      if (cel) { cel.focus(); const r = document.createRange(); r.selectNodeContents(cel); r.collapse(!end); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      return;
    }
    if (C.RICOS[w.dataset.t]) { C.ricoFoco(w, end); return; }
    const c = contentOf(w); if (!c) return; c.focus();
    const r = document.createRange(); r.selectNodeContents(c); r.collapse(!end);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function splitAtCaret(c) {
    const s = getSelection(); const r = s.getRangeAt(0).cloneRange();
    r.setEnd(c, c.childNodes.length);
    const frag = r.extractContents();
    const tmp = document.createElement('div'); tmp.appendChild(frag);
    return inlineMd(tmp);
  }
  function setType(w, t, extra = {}) {
    const wasCode = w.dataset.t === 'code';
    w.dataset.t = t;
    delete w.dataset.k; if (t !== 'todo') w.classList.remove('is-done');
    if (extra.kind) w.dataset.k = extra.kind;
    const c = contentOf(w);
    if (t === 'code' && !wasCode) { c.textContent = c.textContent; c.contentEditable = plano ? 'plaintext-only' : 'true'; c.spellcheck = false; w.dataset.lang = ''; }
    else if (t !== 'code' && wasCode) { c.contentEditable = 'true'; c.spellcheck = true; }
    if (t === 'divider') { c.textContent = ''; c.appendChild(document.createElement('hr')); c.contentEditable = 'false'; }
    else if (c.contentEditable === 'false') c.contentEditable = 'true';
    if (!isList(t)) w.dataset.i = 0;
    decorate(w); renumber();
  }
  function insertAfter(w, b) { const n = makeBlock(b); w.after(n); return n; }


  Object.assign(C, { blockOf, contentOf, caretOffset, atStart, atEnd, focusBlock, splitAtCaret, setType, insertAfter });
})();
