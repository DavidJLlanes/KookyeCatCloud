'use strict';
/* Bases · registro de la vista. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases;
  K.registerView('bases', { open() { if (B.S.base) B.recarga(); else B.cargaLista(); }, close() {} });
})();
