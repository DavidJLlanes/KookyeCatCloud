'use strict';
/* notes/modelo.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, NB } = C;
  const blockMd = (...a) => C.blockMd(...a);
  const closeMention = (...a) => C.closeMention(...a);
  const closeSlash = (...a) => C.closeSlash(...a);
  const hideBar = (...a) => C.hideBar(...a);
  const inlineMd = (...a) => C.inlineMd(...a);
  const isList = (...a) => C.isList(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const parseMd = (...a) => C.parseMd(...a);

  function renumber() {
    const counters = [0, 0, 0, 0];
    let prev = null;
    EST.host.querySelectorAll('.nb-block').forEach(w => {
      const t = w.dataset.t, lvl = +w.dataset.i;
      if (t !== 'ol') { if (!(isList(t) && prev && isList(prev))) counters.fill(0); else if (t !== 'ol') { for (let k = lvl; k < 4; k++) counters[k] = 0; } prev = t; return; }
      for (let k = lvl + 1; k < 4; k++) counters[k] = 0;
      counters[lvl]++;
      w.querySelector('.nb-mk').textContent = counters[lvl] + '.';
      prev = t;
    });
  }

  function readBlock(w) {
    const t = w.dataset.t, c = w.querySelector('.nb-c');
    const b = { t, i: +w.dataset.i || 0 };
    if (t === 'table') {
      b.rows = [...w.querySelectorAll('tr')].map(tr => [...tr.children].map(td => inlineMd(td).replace(/\|/g, '\\|').replace(/^(<br>)+|(<br>)+$/g, '')));
      return b;
    }
    if (t === 'image') { b.src = w.dataset.src || ''; b.text = inlineMd(c).replace(/^(<br>)+|(<br>)+$/g, ''); return b; }
    if (t === 'divider') return b;
    if (t === 'code') { b.text = c.textContent.replace(/\u200b/g, ''); b.lang = w.dataset.lang || ''; return b; }
    b.text = inlineMd(c).replace(/^(<br>)+|(<br>)+$/g, '');
    if (t === 'todo') b.done = w.classList.contains('is-done');
    if (t === 'callout') b.kind = w.dataset.k || 'NOTE';
    return b;
  }

  function serialize() {
    const blocks = [...EST.host.querySelectorAll('.nb-block')].map(readBlock);
    let out = '', ol = [0, 0, 0, 0], prev = null;
    blocks.forEach((b, k) => {
      let n = 0;
      if (b.t === 'ol') { for (let j = b.i + 1; j < 4; j++) ol[j] = 0; ol[b.i]++; n = ol[b.i]; } else if (!isList(b.t)) ol = [0, 0, 0, 0];
      const md = blockMd(b, n);
      if (k) out += (isList(b.t) && b.t === prev) ? '\n' : '\n\n';
      out += md; prev = b.t;
    });
    return out.replace(/\n+$/, '');
  }

  // Empuja el Markdown al textarea oculto: de ahí lo recoge el autoguardado de app.js
  function syncStore() {
    if (EST.aplicando || !EST.store) return;
    // Un editor sin ningún bloque (todavía sin cargar o ya limpiado) nunca debe machacar el texto que hay: el editor
    // siempre deja al menos un párrafo, así que vaciar una nota a propósito sí se guarda
    if (!EST.host.querySelector('.nb-block') && EST.store.value.trim()) return;
    EST.store.value = serialize();
    EST.store.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function change(structural) {
    clearTimeout(EST.pushTimer);
    EST.pushTimer = setTimeout(syncStore, structural ? 0 : 140);
    clearTimeout(EST.histTimer);
    EST.histTimer = setTimeout(snapshot, structural ? 80 : 700);
    renumber();
  }
  function snapshot() {
    const md = serialize();
    if (EST.hist[EST.histPos] === md) return;
    EST.hist = EST.hist.slice(0, EST.histPos + 1); EST.hist.push(md); if (EST.hist.length > 80) EST.hist.shift(); EST.histPos = EST.hist.length - 1;
  }
  function undoRedo(dir) {
    clearTimeout(EST.histTimer); snapshot();
    const np = EST.histPos + dir;
    if (np < 0 || np >= EST.hist.length) return;
    EST.histPos = np; render(parseMd(EST.hist[EST.histPos]), true); syncStore();
  }

  function render(blocks, keepFocusEnd) {
    EST.aplicando = true;
    EST.host.textContent = '';
    blocks.forEach(b => EST.host.appendChild(makeBlock(b)));
    renumber();
    EST.aplicando = false;
    if (keepFocusEnd) { const l = EST.host.querySelector('.nb-block:last-child .nb-c'); if (l) l.focus(); }
  }

  /* ---------- API pública ---------- */
  NB.load = function (md) {
    if (!EST.host) return;
    clearTimeout(EST.pushTimer); clearTimeout(EST.histTimer);
    render(parseMd(md));
    EST.hist = [serialize()]; EST.histPos = 0;
    closeSlash(); closeMention(); hideBar();
  };
  NB.flush = function () { clearTimeout(EST.pushTimer); if (EST.host && EST.store && !$('editor-cuerpo').hidden) syncStore(); };
  NB.clear = function () { if (EST.host) EST.host.textContent = ''; };


  Object.assign(C, { renumber, readBlock, serialize, syncStore, change, snapshot, undoRedo, render });
})();
