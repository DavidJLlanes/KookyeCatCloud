'use strict';
/* El gesto o botón «atrás» del móvil cierra el diálogo abierto en vez de sacar de la app (lo que un <dialog> nativo da gratis;
   guía modern-web-guidance «platform-controls-dismiss-dialog»). Mientras haya algún diálogo abierto existe UNA entrada propia
   en el historial (misma dirección, estado {kccModal}); con varios diálogos anidados, cada «atrás» cierra el de arriba y se
   repone la entrada si quedan más. Al cerrar el último por otra vía (Esc, botones, clic fuera) la entrada se quita sola.
   Si el navegador no deja añadir entradas (sin gesto del usuario), todo sigue como antes: «atrás» simplemente sale. */
(function () {
  if (!window.K) return;
  let propia = false;          // hay una entrada nuestra en el historial
  let ignorar = false;         // el próximo popstate lo provocamos nosotros al quitarla
  let espera = 0;

  const marca = () => { try { history.pushState({ kccModal: 1 }, ''); propia = true; } catch { propia = false; } };

  K.atrasAbre = () => { clearTimeout(espera); if (!propia) marca(); };

  K.atrasCierra = () => {
    if (K.modalSuperior()) return;                  // aún quedan diálogos abiertos: la entrada sigue haciendo falta
    clearTimeout(espera);
    // Pequeña espera: un diálogo que se cierra y se sustituye al instante por otro reutiliza la misma entrada
    espera = setTimeout(() => {
      if (K.modalSuperior() || !propia) return;
      propia = false;
      if (history.state && history.state.kccModal) { ignorar = true; history.back(); }
    }, 60);
  };

  window.addEventListener('popstate', async () => {
    if (ignorar) { ignorar = false; return; }
    propia = false;                                 // «atrás» ya se llevó nuestra entrada
    const arriba = K.modalSuperior();
    if (!arriba) return;
    if (arriba.dismiss) await (arriba.intentaCerrar || arriba.close)();   // respeta «¿descartar los cambios?»
    if (K.modalSuperior() && !propia) marca();      // sigue abierto (cambios sin guardar o no descartable): se repone la entrada
  });
})();
