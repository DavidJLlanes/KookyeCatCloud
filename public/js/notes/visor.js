'use strict';
/* notes/visor.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes.
   Abre las imágenes de una nota en el visor de la propia app (KZoom.lightbox), con todas las de la nota para pasar de una a otra. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;

  function abreImagen(img) {
    const todas = [...(EST.host || document).querySelectorAll('.nb-img:not(.rota) img')];
    const i = Math.max(0, todas.indexOf(img));
    const items = todas.map(x => ({ src: x.src, caption: '' }));
    if (window.KZoom && items.length) KZoom.lightbox({ items, index: i, title: 'Imagen' });
    else window.open(img.src, '_blank', 'noopener');
  }

  Object.assign(C, { abreImagen });
})();
