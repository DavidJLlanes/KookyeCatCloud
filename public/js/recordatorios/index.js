'use strict';
/* Recordatorios · registro de la vista, accesos desde otras secciones y arranque de los avisos al iniciar sesión. */
(function () {
  if (!window.K || !K.recordatorios || !document.getElementById('view-recordatorios')) return;
  const R = K.recordatorios;
  K.registerView('recordatorios', { open() { R.carga().then(() => R.pinta()).catch(K.fail); }, close() {} });
  K.bus.on('recordatorios', () => { R.carga().then(() => { if (!document.getElementById('view-recordatorios').hidden) R.pinta(); }).catch(() => {}); });
  R.nuevo = () => { switchTab('recordatorios'); setTimeout(() => R.editor(null), 80); };
  K.openers.marcador = () => switchTab('marcadores');       // abre la sección donde vive el marcador
  const preloadPrevio = K.preload;
  K.preload = function () { if (preloadPrevio) preloadPrevio.apply(this, arguments); R.arranca(); };
})();
