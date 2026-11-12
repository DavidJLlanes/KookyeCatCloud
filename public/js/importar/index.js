'use strict';
/* Importar · registro de la vista: reparte entre los tres pasos (elegir → revisar → hecho). */
(function () {
  if (!window.K || !K.importar || !document.getElementById('view-importar')) return;
  const I = K.importar, root = document.getElementById('view-importar');
  I.pinta = () => {
    root.textContent = '';
    if (I.S.paso === 'revisar' && I.S.analisis) I.pintaRevisar(root);
    else if (I.S.paso === 'hecho' && I.S.resultado) I.pintaHecho(root);
    else I.pintaElegir(root);
  };
  K.registerView('importar', { open() { if (I.S.paso === 'hecho') I.reset(); I.pinta(); }, close() {} });
})();
