'use strict';
/* Barras de formato de texto · en táctil el menú nativo (copiar, cortar, pegar…) sale pegado a la selección y tapa lo que se
   formatea, así que la barra no flota junto al texto: se acopla abajo, justo encima del teclado (como en Google Docs), con
   botones grandes y desplazable. En ratón sigue flotando sobre la selección. Lo usan las notas y los documentos. */
(function () {
  if (!window.K) return;
  const tactil = () => { try { return matchMedia('(pointer:coarse)').matches; } catch { return false; } };

  /** Coloca `bar` para la selección actual. `rect` = rectángulo de la selección. Devuelve true si quedó acoplada. */
  K.colocaBarra = (bar, rect) => {
    if (!bar) return false;
    if (tactil()) {
      bar.classList.add('k-dock');
      const vv = window.visualViewport;
      const abajo = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;   // altura del teclado
      bar.style.left = '0'; bar.style.top = 'auto'; bar.style.bottom = abajo + 'px';
      return true;
    }
    bar.classList.remove('k-dock'); bar.style.bottom = 'auto';
    const r = rect;
    bar.style.left = Math.max(8, Math.min(r.left + r.width / 2 - bar.offsetWidth / 2, innerWidth - bar.offsetWidth - 8)) + 'px';
    bar.style.top = Math.max(8, r.top - bar.offsetHeight - 8) + 'px';
    return false;
  };

  /** Acopla una barra al borde inferior (encima del teclado) y la mantiene ahí aunque el teclado suba o baje. */
  K.acoplaBarra = (bar) => {
    bar.classList.add('k-dock');
    const vv = window.visualViewport;
    bar.style.left = '0'; bar.style.top = 'auto'; bar.style.bottom = (vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0) + 'px';
  };
  K.esTactil = tactil;

  // El teclado al abrirse o cerrarse mueve la ventana visual: la barra acoplada sube o baja con ella
  const vv = window.visualViewport;
  if (vv) {
    const sigue = () => { document.querySelectorAll('.k-dock').forEach(b => { b.style.bottom = Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px'; }); };
    vv.addEventListener('resize', sigue); vv.addEventListener('scroll', sigue);
  }
})();
