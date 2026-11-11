'use strict';
/* notes/eventos.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, NB } = C;
  const atEnd = (...a) => C.atEnd(...a);
  const atStart = (...a) => C.atStart(...a);
  const blockOf = (...a) => C.blockOf(...a);
  const caretOffset = (...a) => C.caretOffset(...a);
  const celdaActual = (...a) => C.celdaActual(...a);
  const change = (...a) => C.change(...a);
  const closeMention = (...a) => C.closeMention(...a);
  const closeSlash = (...a) => C.closeSlash(...a);
  const contentOf = (...a) => C.contentOf(...a);
  const decorate = (...a) => C.decorate(...a);
  const focusBlock = (...a) => C.focusBlock(...a);
  const handleMentionKey = (...a) => C.handleMentionKey(...a);
  const handleSlashKey = (...a) => C.handleSlashKey(...a);
  const hideBar = (...a) => C.hideBar(...a);
  const insertAfter = (...a) => C.insertAfter(...a);
  const isList = (...a) => C.isList(...a);
  const linkSelection = (...a) => C.linkSelection(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const openMention = (...a) => C.openMention(...a);
  const openSlash = (...a) => C.openSlash(...a);
  const parseMd = (...a) => C.parseMd(...a);
  const readBlock = (...a) => C.readBlock(...a);
  const renumber = (...a) => C.renumber(...a);
  const setType = (...a) => C.setType(...a);
  const splitAtCaret = (...a) => C.splitAtCaret(...a);
  const tablaDe = (...a) => C.tablaDe(...a);
  const tablaOp = (...a) => C.tablaOp(...a);
  const tablaTecla = (...a) => C.tablaTecla(...a);
  const toggleTag = (...a) => C.toggleTag(...a);
  const undoRedo = (...a) => C.undoRedo(...a);

  /* ---------- Eventos del editor ---------- */
  function onKeydown(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c); if (!w) return;
    const t = w.dataset.t;

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); return; }
      if (k === 'y') { e.preventDefault(); undoRedo(1); return; }
      if (k === 'b' || k === 'i') { e.preventDefault(); document.execCommand(k === 'b' ? 'bold' : 'italic'); change(); return; }
      if (k === 'k') { e.preventDefault(); linkSelection(); return; }
      if (k === 'e') { e.preventDefault(); toggleTag('code'); return; }
      if (k === 'd' && e.shiftKey) { e.preventDefault(); const cp = makeBlock(readBlock(w)); w.after(cp); change(true); return; }
    }

    if (t === 'table') { tablaTecla(e, w); return; }
    if (EST.mention && handleMentionKey(e)) return;
    if (EST.slash && handleSlashKey(e)) return;

    if (e.key === 'Enter' && !e.isComposing) {
      if (t === 'image') { e.preventDefault(); const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true); return; }
      if (t === 'code') {
        if (e.shiftKey || e.ctrlKey) { e.preventDefault(); const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true); }
        return;   // Enter normal: salto de línea dentro del código
      }
      if (e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); change(); return; }
      e.preventDefault();
      if (t === 'divider') { const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true); return; }
      const vacio = !c.textContent.replace(/\u200b/g, '').trim() && !c.querySelector('a');
      if (vacio && t !== 'p') {
        if (isList(t) && +w.dataset.i > 0) { w.dataset.i = +w.dataset.i - 1; decorate(w); renumber(); change(true); return; }
        setType(w, 'p'); focusBlock(w); change(true); return;
      }
      const resto = atEnd(c) ? '' : splitAtCaret(c);
      // Las listas continúan; citas, avisos y títulos abren un párrafo nuevo (Shift+Enter = salto dentro del bloque)
      const n = insertAfter(w, { t: isList(t) ? t : 'p', text: resto, i: +w.dataset.i });
      focusBlock(n); change(true); return;
    }

    if (e.key === 'Backspace' && atStart(c) && !e.isComposing) {
      if (t === 'image') return;
      if (t !== 'p') {
        if (isList(t) && +w.dataset.i > 0) { w.dataset.i = +w.dataset.i - 1; decorate(w); renumber(); change(true); e.preventDefault(); return; }
        e.preventDefault(); setType(w, 'p'); focusBlock(w); change(true); return;
      }
      const prev = w.previousElementSibling;
      if (!prev) return;
      e.preventDefault();
      if (prev.dataset.t === 'divider') { prev.remove(); focusBlock(w); change(true); return; }
      if (prev.dataset.t === 'table' || prev.dataset.t === 'image') { focusBlock(prev, true); return; }
      const pc = contentOf(prev);
      const len = pc.textContent.length;
      if (prev.dataset.t === 'code') { pc.textContent += c.textContent; } else pc.innerHTML += c.innerHTML;
      w.remove(); focusBlock(prev, true);
      // Coloca el cursor donde acababa el bloque anterior
      const r = document.createRange(); const walker = document.createTreeWalker(pc, NodeFilter.SHOW_TEXT); let rest = len, nd;
      while ((nd = walker.nextNode())) { if (nd.length >= rest) { r.setStart(nd, rest); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } rest -= nd.length; }
      change(true); return;
    }
    if (e.key === 'Delete' && atEnd(c) && !e.isComposing) {
      const nx = w.nextElementSibling;
      if (nx && !['divider', 'code', 'table', 'image'].includes(nx.dataset.t) && !['code', 'image'].includes(t)) { e.preventDefault(); c.innerHTML += contentOf(nx).innerHTML; nx.remove(); change(true); }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (t === 'code') { document.execCommand('insertText', false, '  '); return; }
      if (isList(t)) {
        const lvl = +w.dataset.i + (e.shiftKey ? -1 : 1);
        if (lvl >= 0 && lvl <= 3) { w.dataset.i = lvl; decorate(w); renumber(); change(true); }
      }
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const prev = w.previousElementSibling; if (!prev) return;
      const r = getSelection().getRangeAt(0).getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (r.height && r.top - cr.top < 8) { e.preventDefault(); focusBlock(prev, true); }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      const nx = w.nextElementSibling; if (!nx) return;
      const r = getSelection().getRangeAt(0).getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (r.height && cr.bottom - r.bottom < 8) { e.preventDefault(); focusBlock(nx); }
    }
    if (e.key === 'Escape') { hideBar(); }
  }

  const SHORT = [
    [/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'], [/^[-*+]\s$/, 'ul'], [/^1[.)]\s$/, 'ol'],
    [/^\[\]\s$|^\[ \]\s$/, 'todo'], [/^>\s$/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider'],
  ];
  function onInput(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c); if (!w) return;
    if (w.dataset.t === 'table') { change(); return; }
    const txt = c.textContent.replace(/\u00a0/g, ' ');
    // Atajos de Markdown al principio de un bloque de texto
    if (w.dataset.t === 'p' && !(e.inputType || '').startsWith('delete')) {
      for (const [re, t] of SHORT) {
        if (re.test(txt)) {
          if (t === 'divider') { setType(w, 'divider'); const n = w.nextElementSibling && w.nextElementSibling.dataset.t === 'p' && !w.nextElementSibling.textContent ? w.nextElementSibling : insertAfter(w, { t: 'p', text: '' }); focusBlock(n); }
          else { c.textContent = ''; setType(w, t); focusBlock(w); }
          change(true); return;
        }
      }
    }
    // Menú "/"
    const m = /(?:^|\s)\/([\wáéíóúñ ]{0,20})$/i.exec(txt.slice(0, caretOffset(c)));
    if (m && !['code', 'image'].includes(w.dataset.t)) openSlash(w, m[1]); else closeSlash();
    // Menciones "@": notas, prompts y archivos
    const men = /(?:^|\s)@([^\s@]{0,30})$/.exec(txt.slice(0, caretOffset(c)));
    if (men && !['code', 'image'].includes(w.dataset.t)) openMention(w, men[1]); else closeMention();
    change();
  }

  function onPaste(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c);
    const imgs = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
    if (imgs.length && NB.subeImagenes) { e.preventDefault(); NB.subeImagenes(imgs, w); return; }
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (w.dataset.t === 'table') { document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' ')); return; }
    if (w.dataset.t === 'code' || (!/\n/.test(text) && !/^(#{1,3} |[-*] |\d+\. |> |```)/.test(text))) {
      // Texto simple: se inserta tal cual, sin formato externo
      document.execCommand('insertText', false, text); return;
    }
    const blocks = parseMd(text);
    const vacio = !c.textContent.trim();
    let ref = w;
    blocks.forEach((b, k) => { if (k === 0 && vacio) { const n = makeBlock(b); w.replaceWith(n); ref = n; } else { ref = (ref.after(makeBlock(b)), ref.nextElementSibling); } });
    focusBlock(ref, true); change(true);
  }

  function onClick(e) {
    const ref = e.target.closest && e.target.closest('a.nb-ref');
    if (ref) {
      e.preventDefault();
      const v = ref.dataset.kcc; const q = v.indexOf(':'); const k = v.slice(0, q); let id = v.slice(q + 1);
      if (k === 'file') { try { id = decodeURIComponent(id); } catch {} }
      K.open(k, id); return;
    }
    const tool = e.target.closest && e.target.closest('.nb-tbl-tools button');
    if (tool) { e.preventDefault(); const w2 = blockOf(tool); tablaOp(w2, tool.dataset.act, celdaActual() || (tablaDe(w2) && tablaDe(w2).rows[0].cells[0])); return; }
    const delImg = e.target.closest && e.target.closest('.nb-img-del');
    if (delImg) { e.preventDefault(); const w2 = blockOf(delImg); w2.remove(); if (!EST.host.querySelector('.nb-block')) EST.host.appendChild(makeBlock({ t: 'p', text: '' })); change(true); return; }
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) { window.open(a.href, '_blank', 'noopener'); return; }
    const plus = e.target.closest && e.target.closest('.nb-plus');
    if (plus) {
      const w = blockOf(plus);
      const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true);
      c_open_slash(n);
      return;
    }
    // Clic en el hueco bajo el último bloque: añade/foca un párrafo
    if (e.target === EST.host) {
      const last = EST.host.lastElementChild;
      if (last && (last.dataset.t !== 'p' || last.textContent.trim())) { const n = insertAfter(last, { t: 'p', text: '' }); focusBlock(n); change(true); }
      else if (last) focusBlock(last, true);
    }
  }
  function c_open_slash(w) { openSlash(w, ''); }


  Object.assign(C, { onKeydown, SHORT, onInput, onPaste, onClick, c_open_slash });
})();
