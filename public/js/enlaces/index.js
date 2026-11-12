'use strict';
/* Enlaces · registro de la vista y avisos entre módulos. */
(function () {
  if (!window.K || !K.enlaces || !document.getElementById('view-enlaces')) return;
  const E = K.enlaces;
  const abre = () => E.carga().then(E.pinta).catch(K.fail);
  K.registerView('enlaces', { open() { abre(); }, close() {} });
})();
