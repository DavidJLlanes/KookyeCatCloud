'use strict';
/* Tema antes de pintar (evita un destello claro/oscuro). Ver Apariencia en app.js. */
(function () {
  var t = 'grafito';
  try {
    t = localStorage.getItem('kcc-theme');
    if (!t) { var old = localStorage.getItem('fc-tint'); t = old === 'oceano' ? 'oscuro' : 'grafito'; }
  } catch (e) { /* sin almacenamiento */ }
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'grafito';
  if (['grafito', 'oscuro', 'claro'].indexOf(t) < 0) t = 'grafito';
  document.documentElement.dataset.theme = t;
})();
