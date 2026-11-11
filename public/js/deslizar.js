'use strict';
/* Deslizar para eliminar: K.deslizar(elemento, { alBorrar, etiqueta }).
   En pantallas táctiles, arrastrar la fila hacia la izquierda más allá del umbral y soltar llama a `alBorrar()`
   (que pide confirmación y manda a la papelera, como el botón de siempre). El ratón no lo usa. */
(function () {
  if (!window.K) return;
  const UMBRAL = 96;            // píxeles que hay que arrastrar para que cuente
  const INICIO = 10;            // píxeles antes de decidir si el gesto es horizontal o vertical
  const SALTA = 'input,select,textarea,a,[contenteditable],.bs-asa,[data-no-deslizar]';

  K.deslizar = function (nodo, { alBorrar, etiqueta = 'Eliminar' } = {}) {
    if (!nodo || typeof alBorrar !== 'function') return;
    nodo.classList.add('sw-fila'); nodo.style.touchAction = 'pan-y'; nodo.dataset.swEtiqueta = etiqueta;
    let x0 = 0, y0 = 0, dx = 0, modo = '', id = null;

    const pon = (v) => {
      dx = Math.max(-Math.min(window.innerWidth * 0.6, 220), Math.min(0, v));
      nodo.style.transform = dx ? `translateX(${dx}px)` : '';
      nodo.style.opacity = dx ? String(1 - Math.min(0.5, Math.abs(dx) / 400)) : '';
      nodo.classList.toggle('sw-listo', -dx >= UMBRAL);
    };
    const suelta = () => {
      nodo.style.transition = 'transform .18s, opacity .18s'; pon(0);
      setTimeout(() => { nodo.style.transition = ''; }, 220);
    };
    nodo.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || (e.isPrimary === false) || (e.target.closest && e.target.closest(SALTA))) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; modo = ''; id = e.pointerId;
    });
    nodo.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const ax = e.clientX - x0, ay = e.clientY - y0;
      if (!modo) {
        if (Math.abs(ax) < INICIO && Math.abs(ay) < INICIO) return;
        modo = Math.abs(ax) > Math.abs(ay) * 1.4 && ax < 0 ? 'h' : 'v';
        if (modo === 'h') { try { nodo.setPointerCapture(e.pointerId); } catch { /* ya capturado */ } }
      }
      if (modo === 'h') pon(ax + INICIO);
    });
    const fin = async (e, cancela) => {
      if (e.pointerId !== id) return; id = null;
      if (modo !== 'h') return;
      const hecho = !cancela && -dx >= UMBRAL;
      // El toque que cierra un gesto no debe abrir la fila
      const traga = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; nodo.addEventListener('click', traga, { capture: true, once: true }); setTimeout(() => nodo.removeEventListener('click', traga, true), 350);
      suelta();
      if (hecho) { try { await alBorrar(); } catch (err) { if (K.fail) K.fail(err); } }
    };
    nodo.addEventListener('pointerup', (e) => fin(e, false));
    nodo.addEventListener('pointercancel', (e) => fin(e, true));
  };
})();
