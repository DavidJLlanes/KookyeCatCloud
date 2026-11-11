'use strict';
/* notes/montaje.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, NB } = C;
  const closeMention = (...a) => C.closeMention(...a);
  const closeSlash = (...a) => C.closeSlash(...a);
  const hideBar = (...a) => C.hideBar(...a);
  const onClick = (...a) => C.onClick(...a);
  const onDragEnd = (...a) => C.onDragEnd(...a);
  const onDragOver = (...a) => C.onDragOver(...a);
  const onDragStart = (...a) => C.onDragStart(...a);
  const onDrop = (...a) => C.onDrop(...a);
  const onInput = (...a) => C.onInput(...a);
  const onKeydown = (...a) => C.onKeydown(...a);
  const onPaste = (...a) => C.onPaste(...a);
  const showBar = (...a) => C.showBar(...a);

  /* ---------- Montaje ---------- */
  function mount() {
    const old = $('note-body'); if (!old || $('nb')) return;
    EST.store = old; EST.store.hidden = true;
    EST.host = document.createElement('div'); EST.host.id = 'nb'; EST.host.className = 'nb'; EST.host.setAttribute('role', 'textbox'); EST.host.setAttribute('aria-multiline', 'true');
    old.after(EST.host);
    C.ricosMonta(EST.host);
    EST.host.addEventListener('keydown', onKeydown);
    EST.host.addEventListener('input', onInput);
    EST.host.addEventListener('paste', onPaste);
    EST.host.addEventListener('click', onClick);
    EST.host.addEventListener('dragstart', onDragStart);
    EST.host.addEventListener('dragover', onDragOver);
    EST.host.addEventListener('drop', onDrop);
    EST.host.addEventListener('dragend', onDragEnd);
    EST.host.addEventListener('blur', () => setTimeout(() => { if (!EST.host.contains(document.activeElement) && !(EST.slash && EST.slash.contains(document.activeElement))) { closeSlash(); closeMention(); } }, 120), true);
    document.addEventListener('selectionchange', () => { if (EST.host && EST.host.contains(getSelection().anchorNode)) showBar(); else hideBar(); });
    // Antes de que app.js envíe el guardado de emergencia, el textarea debe tener lo último
    window.addEventListener('pagehide', NB.flush, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) NB.flush(); }, true);
    window.addEventListener('beforeunload', NB.flush, true);
  }

  /* ============ Propiedades de la nota (icono, color, etiquetas, fecha, fijada) ============ */

  Object.assign(C, { mount });
})();
