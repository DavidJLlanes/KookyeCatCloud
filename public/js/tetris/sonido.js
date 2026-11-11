'use strict';
/* tetris/sonido.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { EST, PASIVOS, S } = C;
  const nivelJugador = (...a) => C.nivelJugador(...a);

  /* ---------- Sonido ----------
     Música: 3 pistas de dominio público (public/audio/CREDITS.txt) que cambian con el nivel de la partida.
     Efectos: sintetizados con Web Audio, sin archivos. Se recuerda lo elegido en este navegador. */
  const AU = { musica: true, efectos: true, vol: 0.6 };
  try { Object.assign(AU, JSON.parse(localStorage.getItem('kcc-tt-audio') || '{}')); } catch { /* sin almacenamiento */ }
  const guardaAudio = () => { try { localStorage.setItem('kcc-tt-audio', JSON.stringify(AU)); } catch { /* da igual */ } };
  const PISTAS = ['calma', 'chip', 'trance'];
  Object.assign(EST, { ac: null, mus: null, pistaAct: -1, volAct: 0 });
  function audioInit() {   // hay que llamarlo desde un gesto del usuario (tocar Jugar)
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
  function sfx(que, a, b) {
    if (que === 'mueve') tono(1500, 0.025, 'square', 0.012);
    else if (que === 'gira') tono(520, 0.05, 'square', 0.02, 820);
    else if (que === 'cae') tono(170, 0.14, 'triangle', 0.09, 55);
    else if (que === 'bloquea') tono(240, 0.05, 'triangle', 0.05, 160);
    else if (que === 'linea') {
      const notas = a === 4 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047].slice(0, Math.max(2, a + 1));
      notas.forEach((f, i) => tono(f, 0.12, a === 4 ? 'sawtooth' : 'square', 0.05, 0, i * 0.065));
      if (b) tono(300, 0.3, 'sawtooth', 0.04, 1200);
    }
    else if (que === 'poder') tono(260, 0.3, 'sawtooth', 0.05, 1300);
    else if (que === 'aviso') tono(880, 0.09, 'square', 0.04);
    else if (que === 'fin') [440, 370, 311, 262].forEach((f, i) => tono(f, a === 'top' ? 0.28 : 0.2, 'triangle', 0.08, 0, i * 0.17));
  }
  // La música sigue a la partida: suena al jugar, se apaga en pausa y cambia de pista al subir de nivel
  function musicaTick() {
    if (!EST.mus) return;
    const quiere = AU.musica && EST.g && EST.g.estado === 'juego' && S.abierta;
    const pista = !EST.g ? 0 : EST.g.level < 4 ? 0 : EST.g.level < 8 ? 1 : 2;
    const objetivo = quiere ? AU.vol * 0.55 : 0;
    if (quiere && pista !== EST.pistaAct) {
      if (EST.volAct > 0.02) objetivo === 0 || (EST.volAct = Math.max(0, EST.volAct - 0.12));   // primero baja la pista anterior
      if (EST.volAct <= 0.02) { EST.pistaAct = pista; EST.mus.src = `${BASE}/audio/${PISTAS[pista]}.mp3`; EST.mus.currentTime = 0; }
    }
    EST.volAct += Math.max(-0.1, Math.min(0.04, objetivo - EST.volAct));
    EST.mus.volume = Math.max(0, Math.min(1, EST.volAct));
    if (quiere && EST.mus.paused) EST.mus.play().catch(() => {});
    else if (!quiere && EST.volAct <= 0.005 && !EST.mus.paused) EST.mus.pause();
    EST.mus.playbackRate = quiere && EST.g.tiempo <= 20 ? 1.08 : 1;   // los últimos segundos suenan un poco más rápido
  }
  Object.assign(EST, { tickMus: 0 });
  const tiene = (id) => { const p = PASIVOS.find(x => x.id === id); return !!p && p.nivel <= nivelJugador(); };


  Object.assign(C, { AU, guardaAudio, PISTAS, audioInit, tono, sfx, musicaTick, tiene });
})();
