'use strict';
/* app/navegacion/tandas.js: pinta listas largas por tandas. Script global: comparte el ámbito con el resto de app/.
   Una carpeta con miles de archivos construía todos los nodos en una sola tarea (unos 5 s con 5.000 y la interfaz congelada).
   Ahora las primeras filas salen al instante y el resto se construye en trozos de ~40 ms cediendo el hilo entre uno y otro
   (guía modern-web-guidance «break-up-long-tasks»), de modo que se puede tocar, hacer scroll y cambiar de carpeta mientras tanto.
   Cada llamada a render() anula la tanda anterior. */
let tandaActual = 0;
const TANDA_PRIMERAS = 80, TANDA_MS = 40;

const cedeElHilo = () => (window.scheduler && typeof scheduler.yield === 'function')
  ? scheduler.yield()
  : new Promise(resolve => setTimeout(resolve, 0));

// `trabajos` es una lista de funciones que se ejecutan en orden (cada una añade su trozo al DOM).
function pintaEnTandas(trabajos) {
  const id = ++tandaActual;
  let i = 0;
  const hasta = Math.min(TANDA_PRIMERAS, trabajos.length);
  for (; i < hasta; i++) trabajos[i]();
  if (i >= trabajos.length) return Promise.resolve();
  return (async () => {
    while (i < trabajos.length) {
      await cedeElHilo();
      if (id !== tandaActual) return;                   // otra vista, otra carpeta o una búsqueda nueva
      const limite = performance.now() + TANDA_MS;
      while (i < trabajos.length && performance.now() < limite) trabajos[i++]();
    }
  })();
}
// Anula lo pendiente (por ejemplo al vaciar la lista)
function anulaTandas() { tandaActual++; }

// Solo las primeras filas se animan al aparecer: el resto está fuera de la pantalla y miles de animaciones a la vez pesan mucho
const TANDA_CON_ENTRADA = 24;
function sinEntradaSiLejos(nodo, i) { if (i >= TANDA_CON_ENTRADA) nodo.classList.add('sin-entrada'); return nodo; }
