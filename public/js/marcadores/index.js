'use strict';
/* Marcadores web · registro de la vista y accesos desde el buscador global. */
(function () {
  if (!window.K || !K.marcadores || !document.getElementById('view-marcadores')) return;
  const M = K.marcadores;
  const abre = () => M.carga().then(() => { M.pinta(); M.autoIconos(); }).catch(K.fail);
  K.registerView('marcadores', { open() { abre(); }, close() {} });
  K.bus.on('marcadores', () => { if (!document.getElementById('view-marcadores').hidden) abre(); });
  M.nuevo = () => { switchTab('marcadores'); setTimeout(() => M.editor(null), 80); };
})();
