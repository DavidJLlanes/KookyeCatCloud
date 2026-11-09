'use strict';
/* Avisos push · arranque: carga la tarjeta al abrir Cuenta y abre la sección a la que apunta un aviso. */
(function () {
  if (!window.K || !K.push) return;
  // La tarjeta se refresca cada vez que se entra en Cuenta
  const original = window.switchTab;
  if (typeof original === 'function') {
    window.switchTab = function (tab) { const r = original.apply(this, arguments); if (tab === 'cuenta' && K.push.tarjeta) K.push.tarjeta(); return r; };
  }
  K.push.abreDesdeAviso();
})();
