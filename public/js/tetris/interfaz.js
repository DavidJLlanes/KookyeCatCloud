'use strict';
/* tetris/interfaz.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { COLS, EST, HID, R, ROWS } = C;
  const actualiza = (...a) => C.actualiza(...a);
  const dibuja = (...a) => C.dibuja(...a);
  const mini = (...a) => C.mini(...a);
  const nivelJugador = (...a) => C.nivelJugador(...a);

  /* ---------- Interfaz ---------- */
  Object.assign(EST, { avisoT: 0 });
  function aviso(...textos) {
    const t = textos.filter(Boolean).join(' · '); if (!t || !R.aviso) return;
    R.aviso.textContent = t; R.aviso.classList.remove('on'); void R.aviso.offsetWidth; R.aviso.classList.add('on');
    clearTimeout(EST.avisoT); EST.avisoT = setTimeout(() => R.aviso.classList.remove('on'), 1100);
  }
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const cache = {};
  function pon(clave, el2, valor) { if (cache[clave] !== valor) { cache[clave] = valor; el2.textContent = valor; } }
  function hud() {
    if (!EST.g) return;
    pon('s', R.pts, EST.g.score.toLocaleString('es')); pon('t', R.tiempo, mmss(EST.g.tiempo)); pon('l', R.lineas, String(EST.g.lines)); pon('n', R.nivel, String(EST.g.level));
    R.tiempo.classList.toggle('poco', EST.g.tiempo <= 20 && EST.g.estado === 'juego');
    mini(R.holdCv, EST.g.hold); R.holdCv.parentElement.classList.toggle('usado', !EST.g.puedeHold);
    R.nextCvs.forEach((c, i) => mini(c, EST.g.cola[i]));
    const niv = nivelJugador();
    R.energia.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < EST.g.energia));
    R.poderes.forEach(({ btn, p }) => { btn.classList.toggle('lista', EST.g.energia >= p.coste); btn.classList.toggle('bloq', p.nivel > niv); });
    R.chipDoble.hidden = !(EST.g.doble > 0); R.chipDoble.textContent = `x2 · ${Math.ceil(EST.g.doble)} s`;
    R.chipHielo.hidden = !(EST.g.congelar > 0); R.chipHielo.textContent = `❄ ${Math.ceil(EST.g.congelar)} s`;
  }
  function bucle(t) {
    EST.raf = requestAnimationFrame(bucle);
    const dt = Math.min(0.05, (t - EST.ultimo) / 1000); EST.ultimo = t;
    if (EST.g && EST.g.estado === 'juego') actualiza(dt);
    dibuja(); hud();
  }

  function ajusta() {
    if (!R.cv) return;
    const wrap = R.zona; const dpr = Math.min(3, window.devicePixelRatio || 1); R.dpr = dpr;
    const anchoLado = window.innerWidth < 420 ? 42 : window.innerWidth < 560 ? 52 : 80;
    const libreAncho = (wrap.clientWidth || 380) - anchoLado * 2 - 8;
    const arriba = R.zona.getBoundingClientRect().top;
    const hud = R.zona.querySelector('.tt-hud');
    const abajo = (R.panelInf ? R.panelInf.offsetHeight : 130) + (hud ? hud.offsetHeight : 45) + 14;
    const libreAlto = window.innerHeight - arriba - abajo;
    EST.celda = Math.max(12, Math.min(48, Math.floor(Math.min(libreAncho / COLS, libreAlto / (ROWS - HID)))));
    R.cv.style.width = EST.celda * COLS + 'px'; R.cv.style.height = EST.celda * (ROWS - HID) + 'px';
    R.cv.width = Math.round(EST.celda * COLS * dpr); R.cv.height = Math.round(EST.celda * (ROWS - HID) * dpr);
    R.zona.style.setProperty('--lado', anchoLado + 'px');
    R.zona.style.setProperty('--bw', EST.celda * COLS + 'px'); R.zona.style.setProperty('--bh', EST.celda * (ROWS - HID) + 'px');
    Object.keys(cache).forEach(k => delete cache[k]);
  }


  Object.assign(C, { aviso, mmss, cache, pon, hud, bucle, ajusta });
})();
