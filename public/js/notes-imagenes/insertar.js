'use strict';
/* Imágenes de notas · colocar bloques de imagen en el editor. */
(function () {
  if (!window.NB || !NB.imagenes) return;
  const I = NB.imagenes;
  const ed = () => NB.int;

  // Inserta bloques de imagen tras `w`; si ese bloque es un párrafo vacío, lo sustituye
  I.inserta = function (rutas, w) {
    const e = ed();
    let ref = w || e.host().lastElementChild;
    rutas.forEach((ruta, k) => {
      const b = e.makeBlock({ t: 'image', src: 'kcc:file/' + e.refArchivo(ruta), text: '' });
      const vacio = k === 0 && ref && ref.dataset.t === 'p' && !e.contentOf(ref).textContent.trim();
      if (vacio) ref.replaceWith(b); else if (ref) ref.after(b); else e.host().appendChild(b);
      ref = b;
    });
    if (!ref.nextElementSibling) e.insertAfter(ref, { t: 'p', text: '' });
    e.change(true);
  };

  // Bloque donde está el cursor (o el último): se guarda al pulsar el botón, antes de que el foco se vaya
  I.bloqueActual = function () {
    const e = ed(), h = e.host(); if (!h) return null;
    const s = window.getSelection(), n = s && s.anchorNode;
    return (n && h.contains(n) && e.blockOf(n)) || h.lastElementChild;
  };
})();
