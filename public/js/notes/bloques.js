'use strict';
/* notes/bloques.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { CALLOUTS, EST, plano } = C;
  const change = (...a) => C.change(...a);
  const construyeTabla = (...a) => C.construyeTabla(...a);
  const inlineHtml = (...a) => C.inlineHtml(...a);
  const pintaImagen = (...a) => C.pintaImagen(...a);
  const pintaTools = (...a) => C.pintaTools(...a);

  const NB = window.NB = {};
  Object.assign(EST, { host: null, store: null, hist: [], histPos: -1, histTimer: null, pushTimer: null, aplicando: false });
  Object.assign(EST, { slash: null, bar: null, slashBlock: null });

  const isList = (t) => t === 'ul' || t === 'ol' || t === 'todo';

  function makeBlock(b) {
    const w = document.createElement('div');
    w.className = 'nb-block'; w.dataset.t = b.t; w.dataset.i = b.i || 0;
    if (b.kind) w.dataset.k = b.kind;
    if (b.done) w.classList.add('is-done');
    if (b.lang !== undefined) w.dataset.lang = b.lang;
    const grip = document.createElement('span'); grip.className = 'nb-grip'; grip.draggable = true; grip.title = 'Arrastra para mover';
    grip.appendChild(icon('i-grip'));
    const add = document.createElement('span'); add.className = 'nb-plus'; add.title = 'Añadir bloque debajo'; add.appendChild(icon('i-plus'));
    const mk = document.createElement('div'); mk.className = 'nb-mk'; mk.contentEditable = 'false';
    const c = document.createElement('div'); c.className = 'nb-c';
    c.contentEditable = (b.t === 'code' && plano) ? 'plaintext-only' : 'true';
    c.spellcheck = b.t !== 'code';
    if (b.t === 'image') w.dataset.src = b.src || '';
    if (b.t === 'table') { c.contentEditable = 'false'; c.appendChild(construyeTabla(b.rows)); }
    else if (b.t === 'code') c.textContent = b.text;
    else if (b.t !== 'divider') c.innerHTML = inlineHtml(b.text || '');
    if (b.t === 'divider') { c.contentEditable = 'false'; c.appendChild(document.createElement('hr')); }
    if (C.RICOS[b.t]) { c.contentEditable = 'false'; c.textContent = ''; C.RICOS[b.t].pinta(w, c, b); }
    w.append(grip, add, mk, c);
    decorate(w);
    return w;
  }

  // Marcador visual del bloque (viñeta, número, casilla, icono del aviso) y placeholder
  function decorate(w) {
    const t = w.dataset.t, mk = w.querySelector('.nb-mk'), c = w.querySelector('.nb-c');
    mk.textContent = '';
    if (t === 'ul') mk.textContent = ['•', '◦', '▪', '·'][+w.dataset.i % 4];
    else if (t === 'todo') {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nb-chk' + (w.classList.contains('is-done') ? ' on' : '');
      b.appendChild(icon('i-check'));
      b.addEventListener('click', (e) => { e.preventDefault(); w.classList.toggle('is-done'); b.classList.toggle('on'); change(true); });
      mk.appendChild(b);
    } else if (t === 'callout') { const k = CALLOUTS[w.dataset.k || 'NOTE']; mk.textContent = k[0]; w.style.setProperty('--c', k[2]); }
    else if (t === 'image') pintaImagen(w, mk);
    else if (t === 'table') pintaTools(mk);
    if (C.ricoDecora) C.ricoDecora(w);
    c.dataset.ph = { image: 'Pie de foto (opcional)', p: 'Escribe “/” para ver los comandos', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', ul: 'Elemento de lista', ol: 'Elemento de lista', todo: 'Tarea', quote: 'Cita', callout: 'Escribe un aviso', code: 'Código' }[t] || '';
  }


  Object.assign(C, { NB, isList, makeBlock, decorate });
})();
