'use strict';
/* arcade/sonido.js: parte del módulo (se carga con el resto de arcade/ en index.html). Comparte el espacio K._arcade. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._arcade = K._arcade || {});
  const { EST, G } = C;

  /* ---------- Sonido (compartido: mismos ajustes que el Tetris) ---------- */
  const AU = { musica: true, efectos: true, vol: 0.6 };
  try { Object.assign(AU, JSON.parse(localStorage.getItem('kcc-tt-audio') || '{}')); } catch { /* sin almacenamiento */ }
  const guardaAudio = () => { try { localStorage.setItem('kcc-tt-audio', JSON.stringify(AU)); } catch { /* da igual */ } };
  const PISTAS = ['calma', 'chip', 'trance'];
  Object.assign(EST, { ac: null, mus: null, pistaAct: -1, volAct: 0 });
  function audioInit() {
    try {
      if (!EST.ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) EST.ac = new C(); }
      if (EST.ac && EST.ac.state === 'suspended') EST.ac.resume();
      if (!EST.mus) { EST.mus = new Audio(); EST.mus.loop = true; EST.mus.preload = 'auto'; EST.mus.volume = 0; }
      if (!EST.mus.src) { EST.mus.src = `${BASE}/audio/${PISTAS[0]}.mp3`; EST.pistaAct = 0; }
      if (AU.musica && EST.mus.paused) EST.mus.play().catch(() => {});
    } catch { /* el navegador no deja sonar */ }
  }
  function tono(f, dur, tipo = 'square', vol = 0.05, hasta = 0, retardo = 0) {
    if (!EST.ac || !AU.efectos || EST.ac.state !== 'running') return;
    const t0 = EST.ac.currentTime + retardo, o = EST.ac.createOscillator(), gn = EST.ac.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t0); if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t0 + dur);
    const v = vol * (0.4 + AU.vol);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(v, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(EST.ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(que, a) {
    if (que === 'mueve') tono(420, 0.05, 'triangle', 0.03, 300);
    else if (que === 'fusion') tono(330 + Math.min(a || 1, 12) * 55, 0.09, 'square', 0.04, 0);
    else if (que === 'poder') tono(260, 0.3, 'sawtooth', 0.05, 1300);
    else if (que === 'aviso') tono(880, 0.09, 'square', 0.04);
    else if (que === 'rebote') tono(300, 0.04, 'square', 0.03, 220);
    else if (que === 'pala') tono(200, 0.06, 'triangle', 0.06, 340);
    else if (que === 'ladrillo') tono(500 + (a || 0) * 60, 0.07, 'square', 0.045, 0);
    else if (que === 'perder') [330, 262, 196].forEach((f, i) => tono(f, 0.16, 'triangle', 0.07, 0, i * 0.12));
    else if (que === 'nivel') [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.12, 'square', 0.05, 0, i * 0.07));
    else if (que === 'fin') [440, 370, 311, 262].forEach((f, i) => tono(f, 0.2, 'triangle', 0.08, 0, i * 0.17));
  }
  // Una sola pista a la vez en todos los juegos; sigue al nivel de la partida activa
  Object.assign(EST, { activo: null });
  function musicaTick() {
    if (!EST.mus) return;
    const J = EST.activo; const g = J && J.g;
    const quiere = !!(AU.musica && g && g.estado === 'juego' && J.abierta);
    const pista = g ? J.cfg.pista(g) : 0;
    const objetivo = quiere ? AU.vol * 0.55 : 0;
    if (quiere && pista !== EST.pistaAct) {
      if (EST.volAct > 0.02) EST.volAct = Math.max(0, EST.volAct - 0.12);
      if (EST.volAct <= 0.02) { EST.pistaAct = pista; EST.mus.src = `${BASE}/audio/${PISTAS[pista]}.mp3`; EST.mus.currentTime = 0; }
    }
    EST.volAct += Math.max(-0.1, Math.min(0.04, objetivo - EST.volAct));
    EST.mus.volume = Math.max(0, Math.min(1, EST.volAct));
    if (quiere && EST.mus.paused) EST.mus.play().catch(() => {});
    else if (!quiere && EST.volAct <= 0.005 && !EST.mus.paused) EST.mus.pause();
  }
  setInterval(musicaTick, 100);

  const skin = () => { const s = G.puesto('skin'); return s && s.colores ? s : { colores: ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'], estilo: 'normal' }; };
  const fondoCols = () => { const f = G.puesto('fondo'); return f && f.colores ? f : { colores: ['#070b16', '#0d1424'] }; };
  const luz = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };


  Object.assign(C, { AU, guardaAudio, PISTAS, audioInit, tono, sfx, musicaTick, skin, fondoCols, luz });
})();
