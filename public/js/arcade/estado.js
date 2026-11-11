'use strict';
/* arcade/estado.js: parte del módulo (se carga con el resto de arcade/ en index.html). Comparte el espacio K._arcade. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._arcade = K._arcade || {});

  if (!window.K || !K.game) return; const EST = {};
  const G = K.game;
  const nivelJugador = () => (G.state ? G.state.nivel : 1);
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hoyLocal = () => { const f = new Date(); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };


  Object.assign(C, { EST, G, nivelJugador, rnd, clamp, mmss, hoyLocal });
})();
