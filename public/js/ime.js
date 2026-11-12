'use strict';
/* Teclados de composición (japonés, chino, coreano…): el Intro que confirma una palabra no debe ejecutar la acción del campo
   (enviar, buscar, renombrar…). Un único filtro en la fase de captura frena esos Intro antes de que lleguen a cualquier
   manejador; no cancela la acción por defecto, así que el teclado sigue confirmando el texto. keyCode 229 cubre el orden
   de eventos de Safari. Guía: modern-web-guidance «ime-safe-enter-submit». */
window.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.stopImmediatePropagation();
}, true);
