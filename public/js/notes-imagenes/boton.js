'use strict';
/* Imágenes de notas · botón «Insertar imagen» en la barra del editor (antes solo se llegaba escribiendo /imagen). */
(function () {
  const b = document.getElementById('btn-note-image');
  if (!b || !window.NB || !NB.imagenes) return;
  let bloque = null;
  // El bloque se anota al pulsar (pointerdown), antes de que el botón le quite el foco al texto
  b.addEventListener('pointerdown', () => { bloque = NB.imagenes.bloqueActual(); });
  b.addEventListener('click', () => { if (NB.elegirImagen) NB.elegirImagen(bloque && bloque.isConnected ? bloque : NB.imagenes.bloqueActual()); bloque = null; });
})();
