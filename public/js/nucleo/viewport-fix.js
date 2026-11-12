'use strict';
/* iOS (PWA instalada): a veces arranca con el área visible más corta que la pantalla y deja un hueco bajo la barra inferior.
   Se fuerza un reajuste al abrir, al volver a la app y al girar. */
(function () {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;
  const de = document.documentElement;
  const ajusta = () => {
    // Un cambio mínimo de altura obliga a iOS a recalcular el área visible real
    de.style.height = 'calc(100% + 1px)';
    requestAnimationFrame(() => requestAnimationFrame(() => { de.style.height = ''; window.dispatchEvent(new Event('resize')); }));
  };
  const reintenta = () => { [0, 150, 600, 1500].forEach(t => setTimeout(ajusta, t)); };
  reintenta();
  addEventListener('pageshow', reintenta);
  addEventListener('orientationchange', () => setTimeout(ajusta, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reintenta(); });
})();
