'use strict';
/* Conecta los sonidos con la interfaz sin tocar cada módulo: clics, avisos, ventanas y logros. Los módulos que quieran un
   sonido propio llaman a K.sonidos.reproduce('ok' | 'aviso' | 'error' | 'borrar' | 'logro'). */
(function () {
  if (!window.K || !K.sonidos || !K.sonidos.reproduce) return;
  const S = K.sonidos;
  const SIN_SONIDO = '#view-games, [data-sin-sonido]';       // los juegos tienen su propio audio

  // Clics: solo los que merecen un «toque» (nada en cada botón pequeño, para no cansar)
  document.addEventListener('click', (ev) => {
    const t = ev.target && ev.target.closest ? ev.target : null; if (!t || t.closest(SIN_SONIDO)) return;
    if (t.closest('.btn.danger, button.danger')) return S.reproduce('borrar');
    if (t.closest('.tabs .tab, .mobilenav button')) return S.reproduce('tab');
    if (t.closest('input[type=checkbox], .k-switch')) return S.reproduce('tic');
    if (t.closest('.btn.primary, button.primary')) return S.reproduce('toque');
  }, true);

  // Avisos (toasts): K.fail marca el siguiente como error
  let marca = '';
  const toastOriginal = window.showToast;
  if (typeof toastOriginal === 'function') {
    window.showToast = function (msg) { const r = toastOriginal.apply(this, arguments); S.reproduce(marca || 'aviso'); marca = ''; return r; };
  }
  const failOriginal = K.fail;
  K.fail = function (e) { marca = 'error'; try { return failOriginal(e); } finally { marca = ''; } };

  // Ventanas
  const modalOriginal = K.modal;
  K.modal = function () { if (!document.querySelector(SIN_SONIDO.split(',')[0] + ':not([hidden])')) S.reproduce('abrir'); return modalOriginal.apply(this, arguments); };

  // Logros y subidas de nivel
  if (K.game && typeof K.game.avisos === 'function') {
    const avisosOriginal = K.game.avisos;
    K.game.avisos = function (nuevos) { if (nuevos && nuevos.length) S.reproduce('logro'); return avisosOriginal.apply(this, arguments); };
  }
})();
