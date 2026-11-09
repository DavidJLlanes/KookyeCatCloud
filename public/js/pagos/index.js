'use strict';
/* Pagos · registro de la vista, filtros por valor y enlaces desde el calendario y el buscador. */
(function () {
  if (!window.K || !K.pagos || !document.getElementById('view-pagos')) return;
  const P = K.pagos;
  const abre = () => P.carga().then(P.pinta).catch(K.fail);
  K.registerView('pagos', { open() { abre(); }, close() {} });
  K.bus.on('pagos', () => { if (!document.getElementById('view-pagos').hidden) abre(); });
  // Pulsar una compañía o una categoría en cualquier parte filtra la lista
  K.filtros.pagos = (prop, valor) => { switchTab('pagos'); P.S.estado = 'todos'; P.S.q = ''; P.S.valor = { prop, valor }; abre(); };
  // Los vencimientos del calendario («Pago: …») abren el pago
  K.srcIcon.pago = 'i-wallet'; K.srcName.pago = 'Pago';
  K.openers.pago = (id) => { switchTab('pagos'); P.carga().then(() => { P.pinta(); const p = P.S.pagos.find(x => x.id === id); if (p) P.editor(p); }).catch(K.fail); };
  P.nuevo = () => { switchTab('pagos'); setTimeout(() => P.editor(null), 80); };
})();
