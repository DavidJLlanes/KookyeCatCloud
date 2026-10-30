'use strict';
/* Tetris de 3 minutos con potenciadores que se desbloquean al subir de nivel en la app (ver js/game.js).
   Se juega con teclado, con gestos sobre el tablero o con los botones de debajo. */
(function () {
  if (!window.K || !K.game) return;
  const G = K.game;
  const COLS = 10, ROWS = 22, HID = 2;                 // las 2 primeras filas están ocultas (por ahí aparecen las piezas)
  const TIPOS = 'IOTSZJL';
  const FORMAS = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const LADO = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  const ROT = {};
  for (const t of TIPOS) {
    ROT[t] = [FORMAS[t]];
    for (let r = 1; r < 4; r++) ROT[t].push(t === 'O' ? FORMAS[t] : ROT[t][r - 1].map(([x, y]) => [LADO[t] - 1 - y, x]));
  }
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -2]];
  const SEGUNDOS = 180;

  // Potenciadores activos (gastan energía, que se carga limpiando líneas) y pasivos (siempre activos). Se desbloquean por nivel.
  const PODERES = [
    { id: 'limpieza', nombre: 'Limpieza', icono: 'bomb', nivel: 3, coste: 2, txt: 'Elimina las 2 filas de abajo' },
    { id: 'congelar', nombre: 'Congelar', icono: 'snow', nivel: 5, coste: 1, txt: 'Detiene la caída 6 segundos' },
    { id: 'tiempo', nombre: '+15 s', icono: 'hourglass', nivel: 8, coste: 2, txt: 'Añade 15 segundos al reloj' },
    { id: 'comodin', nombre: 'Barra', icono: 'cube', nivel: 10, coste: 1, txt: 'La siguiente pieza será la barra larga' },
    { id: 'doble', nombre: 'Puntos x2', icono: 'star', nivel: 15, coste: 2, txt: 'Doble puntuación durante 10 segundos' },
    { id: 'deshacer', nombre: 'Deshacer', icono: 'cycle', nivel: 20, coste: 3, txt: 'Devuelve la última pieza colocada' },
    { id: 'rayo', nombre: 'Rayo', icono: 'lightning', nivel: 25, coste: 2, txt: 'Borra la columna más alta' },
  ];
  const PASIVOS = [
    { id: 'reloj', nombre: 'Reloj de arena', icono: 'sands', nivel: 4, txt: '+10 s al empezar' },
    { id: 'cargador', nombre: 'Cargador rápido', icono: 'cog', nivel: 7, txt: 'Energía cada 4 líneas en vez de 5' },
    { id: 'combo', nombre: 'Maestro del combo', icono: 'fireray', nivel: 11, txt: 'Los combos puntúan un 50 % más' },
    { id: 'aire', nombre: 'Segundo aire', icono: 'heart', nivel: 16, txt: 'Una vez por partida, si te quedas sin sitio se limpian 8 filas' },
    { id: 'oro', nombre: 'Reloj de oro', icono: 'gem', nivel: 22, txt: '+20 s al empezar' },
    { id: 'tetrisx', nombre: 'Golpe cuádruple', icono: 'swords', nivel: 28, txt: 'Los Tetris puntúan un 50 % más' },
    { id: 'monedas', nombre: 'Lluvia de monedas', icono: 'purse', nivel: 35, txt: '+50 % de monedas al terminar' },
  ];

  const S = { built: false, abierta: false };
  const R = {};
  let g = null;                 // partida en curso (o la última terminada)
  let raf = 0, ultimo = 0, celda = 24;
  const nivelJugador = () => (G.state ? G.state.nivel : 1);

  /* ---------- Sonido ----------
     Música: 3 pistas de dominio público (public/audio/CREDITS.txt) que cambian con el nivel de la partida.
     Efectos: sintetizados con Web Audio, sin archivos. Se recuerda lo elegido en este navegador. */
  const AU = { musica: true, efectos: true, vol: 0.6 };
  try { Object.assign(AU, JSON.parse(localStorage.getItem('kcc-tt-audio') || '{}')); } catch { /* sin almacenamiento */ }
  const guardaAudio = () => { try { localStorage.setItem('kcc-tt-audio', JSON.stringify(AU)); } catch { /* da igual */ } };
  const PISTAS = ['calma', 'chip', 'trance'];
  let ac = null, mus = null, pistaAct = -1, volAct = 0;
  function audioInit() {   // hay que llamarlo desde un gesto del usuario (tocar Jugar)
    try {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
      if (ac && ac.state === 'suspended') ac.resume();
      if (!mus) { mus = new Audio(); mus.loop = true; mus.preload = 'auto'; mus.volume = 0; }
      if (!mus.src) { mus.src = `${BASE}/audio/${PISTAS[0]}.mp3`; pistaAct = 0; }
      if (AU.musica && mus.paused) mus.play().catch(() => {});
    } catch { /* el navegador no deja sonar */ }
  }
  function tono(f, dur, tipo = 'square', vol = 0.05, hasta = 0, retardo = 0) {
    if (!ac || !AU.efectos || ac.state !== 'running') return;
    const t0 = ac.currentTime + retardo, o = ac.createOscillator(), gn = ac.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t0); if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t0 + dur);
    const v = vol * (0.4 + AU.vol);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(v, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
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
    if (!mus) return;
    const quiere = AU.musica && g && g.estado === 'juego' && S.abierta;
    const pista = !g ? 0 : g.level < 4 ? 0 : g.level < 8 ? 1 : 2;
    const objetivo = quiere ? AU.vol * 0.55 : 0;
    if (quiere && pista !== pistaAct) {
      if (volAct > 0.02) objetivo === 0 || (volAct = Math.max(0, volAct - 0.12));   // primero baja la pista anterior
      if (volAct <= 0.02) { pistaAct = pista; mus.src = `${BASE}/audio/${PISTAS[pista]}.mp3`; mus.currentTime = 0; }
    }
    volAct += Math.max(-0.1, Math.min(0.04, objetivo - volAct));
    mus.volume = Math.max(0, Math.min(1, volAct));
    if (quiere && mus.paused) mus.play().catch(() => {});
    else if (!quiere && volAct <= 0.005 && !mus.paused) mus.pause();
    mus.playbackRate = quiere && g.tiempo <= 20 ? 1.08 : 1;   // los últimos segundos suenan un poco más rápido
  }
  let tickMus = 0;
  const tiene = (id) => { const p = PASIVOS.find(x => x.id === id); return !!p && p.nivel <= nivelJugador(); };

  /* ---------- Motor ---------- */
  const tableroVacio = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const celdas = (p) => ROT[p.t][p.r].map(([x, y]) => [p.x + x, p.y + y]);
  const choca = (p, dx = 0, dy = 0) => celdas(p).some(([x, y]) => { x += dx; y += dy; return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && g.board[y][x]); });
  const pieza = (t) => ({ t, r: 0, x: 3, y: 0 });
  function siguienteTipo() {
    if (!g.bolsa.length) { const b = TIPOS.split(''); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } g.bolsa = b; }
    return g.bolsa.pop();
  }
  function rellenaCola() { while (g.cola.length < 5) g.cola.push(siguienteTipo()); }

  function nueva() {
    const bono = (tiene('reloj') ? 10 : 0) + (tiene('oro') ? 20 : 0);
    g = {
      board: tableroVacio(), bolsa: [], cola: [], cur: null, hold: null, puedeHold: true,
      score: 0, lines: 0, level: 1, combo: -1, b2b: false, tetrises: 0, maxCombo: 0, tspins: 0, poderes: 0,
      tiempo: SEGUNDOS + bono, jugado: 0, energia: 0, carga: 0, congelar: 0, doble: 0, aire: tiene('aire'),
      estado: 'juego', caida: 0, bloqueo: 0, reinicios: 0, giro: false, snap: null, limpiando: null, enviado: false, resultado: null,
    };
    rellenaCola(); aparece();
  }
  function aparece(tipo) {
    rellenaCola();
    const t = tipo || g.cola.shift();
    rellenaCola();
    g.cur = pieza(t); g.caida = 0; g.bloqueo = 0; g.reinicios = 0; g.giro = false; g.piezas = (g.piezas || 0) + 1;
    if (choca(g.cur)) {
      if (g.aire) {   // segundo aire: se vacían las 8 filas de abajo y se sigue
        g.aire = false; g.board.splice(ROWS - 8, 8); for (let i = 0; i < 8; i++) g.board.unshift(Array(COLS).fill(0));
        g.cur = pieza(t); aviso('SEGUNDO AIRE'); return;
      }
      fin('top');
    }
  }

  const apoyada = () => choca(g.cur, 0, 1);
  function tocado() {   // tras mover o girar con la pieza apoyada se reinicia (un número limitado de veces) el tiempo de bloqueo
    g.giro = false;
    if (apoyada()) { g.reinicios++; g.bloqueo = 0; }
  }
  function mueve(dx) {
    if (!enJuego()) return;
    if (!choca(g.cur, dx, 0)) { g.cur.x += dx; tocado(); sfx('mueve'); }
  }
  function gira(dir) {
    if (!enJuego()) return;
    const nr = (g.cur.r + dir + 4) % 4;
    for (const [dx, dy] of KICKS) {
      const p = { ...g.cur, r: nr, x: g.cur.x + dx, y: g.cur.y + dy };
      if (!choca(p)) {
        g.cur = p; g.giro = true; sfx('gira');
        if (apoyada()) { g.reinicios++; g.bloqueo = 0; }
        return;
      }
    }
  }
  function baja() {   // un paso hacia abajo por iniciativa del jugador
    if (!enJuego()) return false;
    if (!choca(g.cur, 0, 1)) { g.cur.y++; g.giro = false; g.score += 1; return true; }
    return false;
  }
  function cae() {
    if (!enJuego()) return;
    let n = 0; while (!choca(g.cur, 0, 1)) { g.cur.y++; n++; }
    if (n) g.giro = false;
    g.score += n * 2;
    sfx('cae');
    bloquea();
  }
  const enJuego = () => g && g.estado === 'juego' && !g.limpiando;

  function reserva() {
    if (!enJuego() || !g.puedeHold) return;
    const t = g.cur.t;
    if (g.hold) { const h = g.hold; g.hold = t; aparece(h); } else { g.hold = t; aparece(); }
    g.puedeHold = false;
  }

  function bloquea() {
    sfx('bloquea');
    // Copia para poder deshacer
    g.snap = { board: g.board.map(f => f.slice()), tipo: g.cur.t, score: g.score, lines: g.lines, level: g.level, combo: g.combo, b2b: g.b2b, tetrises: g.tetrises, maxCombo: g.maxCombo, tspins: g.tspins, carga: g.carga, energia: g.energia, hold: g.hold };
    const cs = celdas(g.cur);
    // T-spin: gira una T y al menos 3 de las 4 esquinas de su centro están ocupadas
    let tspin = false;
    if (g.cur.t === 'T' && g.giro) {
      const cx = g.cur.x + 1, cy = g.cur.y + 1;
      const ocupada = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && g.board[y][x]);
      tspin = [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([a, b]) => ocupada(cx + a, cy + b)).length >= 3;
    }
    const codigo = TIPOS.indexOf(g.cur.t) + 1;
    cs.forEach(([x, y]) => { if (y >= 0) g.board[y][x] = codigo; });
    const llenas = []; g.board.forEach((f, i) => { if (f.every(Boolean)) llenas.push(i); });
    g.puedeHold = true;
    if (!llenas.length) {
      g.combo = -1;
      if (tspin) { g.score += Math.round(400 * g.level * (g.doble > 0 ? 2 : 1)); aviso('T-SPIN'); }
      aparece(); return;
    }
    g.limpiando = { filas: llenas, t: 0.16, tspin };
    g.cur = null;
  }
  function terminaLimpieza() {
    const { filas, tspin } = g.limpiando; g.limpiando = null;
    const n = filas.length;
    g.board = g.board.filter((_, i) => !filas.includes(i)); for (let i = 0; i < n; i++) g.board.unshift(Array(COLS).fill(0));
    const dificil = n === 4 || tspin;
    let pts = (tspin ? [0, 800, 1200, 1600][n] : [0, 100, 300, 500, 800][n]) * g.level;
    if (dificil && g.b2b) pts *= 1.5;
    if (n === 4 && tiene('tetrisx')) pts *= 1.5;
    g.b2b = dificil;
    g.combo++;
    if (g.combo > 0) { let c = 50 * g.combo * g.level; if (tiene('combo')) c *= 1.5; pts += c; g.maxCombo = Math.max(g.maxCombo, g.combo); }
    if (g.board.every(f => f.every(v => !v))) { pts += 1500 * g.level; aviso('¡TABLERO LIMPIO!'); }
    if (g.doble > 0) pts *= 2;
    g.score += Math.round(pts); g.lines += n;
    if (n === 4) g.tetrises++;
    if (tspin) g.tspins++;
    g.level = 1 + Math.floor(g.lines / 8);
    // Energía: una unidad cada 5 líneas (4 con el cargador) y una extra por Tetris o T-spin
    g.carga += n; const cada = tiene('cargador') ? 4 : 5;
    while (g.carga >= cada) { g.carga -= cada; g.energia = Math.min(5, g.energia + 1); }
    if (dificil) g.energia = Math.min(5, g.energia + 1);
    aviso([, '', 'DOBLE', 'TRIPLE', 'TETRIS'][n] || '', tspin ? 'T-SPIN' : '', g.combo > 0 ? `COMBO x${g.combo}` : '');
    sfx('linea', n, tspin);
    try { if (navigator.vibrate) navigator.vibrate(n === 4 ? [20, 30, 20] : 15); } catch { /* sin vibración */ }
    aparece();
  }

  function usa(id) {
    const p = PODERES.find(x => x.id === id);
    if (!p || !enJuego() || p.nivel > nivelJugador()) return;
    if (g.energia < p.coste) { aviso(`Faltan ${p.coste - g.energia} de energía`); return; }
    if (id === 'deshacer' && !g.snap) { aviso('Nada que deshacer'); return; }
    if (id === 'limpieza') {
      const habia = g.board.slice(ROWS - 2).some(f => f.some(Boolean));
      g.board.splice(ROWS - 2, 2); g.board.unshift(Array(COLS).fill(0), Array(COLS).fill(0));
      if (habia) g.score += 150 * g.level;
    } else if (id === 'congelar') g.congelar = 6;
    else if (id === 'tiempo') g.tiempo += 15;
    else if (id === 'comodin') g.cola[0] = 'I';
    else if (id === 'doble') g.doble = 10;
    else if (id === 'rayo') {
      let col = 0, alto = 0;
      for (let x = 0; x < COLS; x++) { let h = 0; for (let y = 0; y < ROWS; y++) if (g.board[y][x]) { h = ROWS - y; break; } if (h > alto) { alto = h; col = x; } }
      if (!alto) { aviso('No hay nada que borrar'); return; }
      for (let y = 0; y < ROWS; y++) g.board[y][col] = 0;
      g.score += 100 * g.level;
    } else if (id === 'deshacer') {
      const s = g.snap; g.snap = null;
      g.board = s.board.map(f => f.slice()); g.cola.unshift(g.cur.t);
      Object.assign(g, { score: s.score, lines: s.lines, level: s.level, combo: s.combo, b2b: s.b2b, tetrises: s.tetrises, maxCombo: s.maxCombo, tspins: s.tspins, carga: s.carga });
      g.hold = s.hold; g.energia -= 0; aparece(s.tipo);
    }
    g.energia -= p.coste; g.poderes++; sfx('poder');
    aviso(p.nombre.toUpperCase());
  }

  function intervalo() { return Math.max(0.045, 0.72 * Math.pow(0.82, g.level - 1)); }
  function actualiza(dt) {
    if (g.estado !== 'juego') return;
    const antesT = Math.ceil(g.tiempo);
    g.tiempo -= dt; g.jugado += dt;
    if (g.tiempo > 0 && Math.ceil(g.tiempo) !== antesT && Math.ceil(g.tiempo) <= 10) sfx('aviso');
    if (g.congelar > 0) g.congelar -= dt;
    if (g.doble > 0) g.doble -= dt;
    if (g.tiempo <= 0) { g.tiempo = 0; fin('tiempo'); return; }
    if (g.limpiando) { g.limpiando.t -= dt; if (g.limpiando.t <= 0) terminaLimpieza(); return; }
    if (g.congelar > 0 || !g.cur) return;
    if (apoyada()) {
      g.bloqueo += dt;
      if (g.bloqueo >= 0.5 || g.reinicios > 14) bloquea();
    } else {
      g.bloqueo = 0; g.caida += dt;
      const iv = intervalo();
      while (g.caida >= iv && !choca(g.cur, 0, 1)) { g.caida -= iv; g.cur.y++; g.giro = false; }
      if (choca(g.cur, 0, 1)) g.caida = 0;
    }
  }

  /* ---------- Fin de la partida ---------- */
  async function fin(motivo) {
    if (!g || g.estado === 'fin') return;
    g.estado = 'fin'; g.limpiando = null; paraRepeticiones(); sfx('fin', motivo);
    const res = { score: g.score, lines: g.lines, level: g.level, tetrises: g.tetrises, maxCombo: g.maxCombo, powerups: g.poderes, duration: Math.round(g.jugado), ended: motivo };
    g.resultado = res; g.tablero = g.board.map(f => f.slice());
    muestraFin(null);
    if (res.duration < 5) { muestraFin({ corta: true }); return; }
    try {
      const f = new Date();
      const d = await K.post('/api/game/tetris', { ...res, day: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`, bonusMonedas: tiene('monedas') });
      G.set(d); g.enviado = true;
      muestraFin(d);
    } catch (e) { K.fail(e); muestraFin({ error: true }); }
  }

  /* ---------- Dibujo ---------- */
  function colorDe(v) {
    const sk = G.puesto('skin'); const cs = sk ? sk.colores : ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'];
    return cs[(v - 1) % 7];
  }
  function estiloSkin() { const sk = G.puesto('skin'); return sk && sk.estilo ? sk.estilo : 'normal'; }
  function sombrea(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    const k = f < 0 ? 0 : 255, a = Math.abs(f);
    r = Math.round((k - r) * a + r); gg = Math.round((k - gg) * a + gg); b = Math.round((k - b) * a + b);
    return `rgb(${r},${gg},${b})`;
  }
  function bloque(ctx, x, y, s, v, alfa) {
    const c = colorDe(v), est = estiloSkin();
    ctx.save(); ctx.globalAlpha = alfa === undefined ? 1 : alfa;
    if (est === 'brillo') { ctx.shadowColor = c; ctx.shadowBlur = s * 0.45; }
    ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.shadowBlur = 0;
    if (est === 'plano') { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); }
    else {
      ctx.fillStyle = sombrea(c, 0.38); ctx.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.14)); ctx.fillRect(x + 1, y + 1, Math.max(2, s * 0.14), s - 2);
      ctx.fillStyle = sombrea(c, -0.35); ctx.fillRect(x + 1, y + s - 1 - Math.max(2, s * 0.14), s - 2, Math.max(2, s * 0.14)); ctx.fillRect(x + s - 1 - Math.max(2, s * 0.14), y + 1, Math.max(2, s * 0.14), s - 2);
    }
    ctx.restore();
  }
  function dibuja() {
    const cv = R.cv, ctx = R.ctx; const dpr = R.dpr || 1;
    const W = COLS * celda, H = (ROWS - HID) * celda;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fondo = G.puesto('fondo') || { colores: ['#070b16', '#0d1424'] };
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, fondo.colores[0]); gr.addColorStop(1, fondo.colores[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fondo.estilo === 'rejilla' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.045)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * celda + .5, 0); ctx.lineTo(x * celda + .5, H); }
    for (let y = 1; y < ROWS - HID; y++) { ctx.moveTo(0, y * celda + .5); ctx.lineTo(W, y * celda + .5); }
    ctx.stroke();
    if (!g) return;
    for (let y = HID; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const v = g.board[y][x]; if (v) bloque(ctx, x * celda, (y - HID) * celda, celda, v); }
    if (g.limpiando) {
      const a = Math.min(1, 0.35 + (0.16 - g.limpiando.t) / 0.16 * 0.65);
      ctx.fillStyle = `rgba(255,255,255,${a})`; g.limpiando.filas.forEach(y => { if (y >= HID) ctx.fillRect(0, (y - HID) * celda, W, celda); });
    }
    if (g.cur && g.estado !== 'fin') {
      // Sombra de dónde caería
      let d = 0; while (!choca(g.cur, 0, d + 1)) d++;
      const cod = TIPOS.indexOf(g.cur.t) + 1;
      celdas({ ...g.cur, y: g.cur.y + d }).forEach(([x, y]) => { if (y >= HID) { ctx.strokeStyle = colorDe(cod); ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.strokeRect(x * celda + 2, (y - HID) * celda + 2, celda - 4, celda - 4); ctx.globalAlpha = 1; } });
      celdas(g.cur).forEach(([x, y]) => { if (y >= HID) bloque(ctx, x * celda, (y - HID) * celda, celda, cod); });
    }
    if (g.congelar > 0) { ctx.fillStyle = 'rgba(125,211,252,.16)'; ctx.fillRect(0, 0, W, H); }
    if (g.doble > 0) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); }
  }
  function mini(cv, tipo) {
    const ctx = cv.getContext('2d'); const dpr = R.dpr || 1; const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (!tipo) return;
    const s = Math.floor(Math.min(w, h) / 4.4); const cs = ROT[tipo][0];
    const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    const ox = (w - (Math.max(...xs) - Math.min(...xs) + 1) * s) / 2 - Math.min(...xs) * s, oy = (h - (Math.max(...ys) - Math.min(...ys) + 1) * s) / 2 - Math.min(...ys) * s;
    cs.forEach(([x, y]) => bloque(ctx, ox + x * s, oy + y * s, s, TIPOS.indexOf(tipo) + 1));
  }

  /* ---------- Interfaz ---------- */
  let avisoT = 0;
  function aviso(...textos) {
    const t = textos.filter(Boolean).join(' · '); if (!t || !R.aviso) return;
    R.aviso.textContent = t; R.aviso.classList.remove('on'); void R.aviso.offsetWidth; R.aviso.classList.add('on');
    clearTimeout(avisoT); avisoT = setTimeout(() => R.aviso.classList.remove('on'), 1100);
  }
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const cache = {};
  function pon(clave, el2, valor) { if (cache[clave] !== valor) { cache[clave] = valor; el2.textContent = valor; } }
  function hud() {
    if (!g) return;
    pon('s', R.pts, g.score.toLocaleString('es')); pon('t', R.tiempo, mmss(g.tiempo)); pon('l', R.lineas, String(g.lines)); pon('n', R.nivel, String(g.level));
    R.tiempo.classList.toggle('poco', g.tiempo <= 20 && g.estado === 'juego');
    mini(R.holdCv, g.hold); R.holdCv.parentElement.classList.toggle('usado', !g.puedeHold);
    R.nextCvs.forEach((c, i) => mini(c, g.cola[i]));
    const niv = nivelJugador();
    R.energia.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < g.energia));
    R.poderes.forEach(({ btn, p }) => { btn.classList.toggle('lista', g.energia >= p.coste); btn.classList.toggle('bloq', p.nivel > niv); });
    R.chipDoble.hidden = !(g.doble > 0); R.chipDoble.textContent = `x2 · ${Math.ceil(g.doble)} s`;
    R.chipHielo.hidden = !(g.congelar > 0); R.chipHielo.textContent = `❄ ${Math.ceil(g.congelar)} s`;
  }
  function bucle(t) {
    raf = requestAnimationFrame(bucle);
    const dt = Math.min(0.05, (t - ultimo) / 1000); ultimo = t;
    if (g && g.estado === 'juego') actualiza(dt);
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
    celda = Math.max(12, Math.min(48, Math.floor(Math.min(libreAncho / COLS, libreAlto / (ROWS - HID)))));
    R.cv.style.width = celda * COLS + 'px'; R.cv.style.height = celda * (ROWS - HID) + 'px';
    R.cv.width = Math.round(celda * COLS * dpr); R.cv.height = Math.round(celda * (ROWS - HID) * dpr);
    R.zona.style.setProperty('--lado', anchoLado + 'px');
    R.zona.style.setProperty('--bw', celda * COLS + 'px'); R.zona.style.setProperty('--bh', celda * (ROWS - HID) + 'px');
    Object.keys(cache).forEach(k => delete cache[k]);
  }

  /* ---------- Entrada ---------- */
  const reps = new Map();
  function repite(clave, fn, primero = 150, cada = 45) {
    if (reps.has(clave)) return;
    fn();
    const r = { t: setTimeout(() => { r.i = setInterval(fn, cada); }, primero) };
    reps.set(clave, r);
  }
  function paraRep(clave) { const r = reps.get(clave); if (!r) return; clearTimeout(r.t); clearInterval(r.i); reps.delete(clave); }
  function paraRepeticiones() { [...reps.keys()].forEach(paraRep); }

  const TECLAS = {
    ArrowLeft: ['izq'], ArrowRight: ['der'], ArrowDown: ['abj'], ArrowUp: ['gira'], KeyX: ['gira'], KeyZ: ['gira2'], Space: ['cae'], KeyC: ['hold'], ShiftLeft: ['hold'], ShiftRight: ['hold'],
  };
  function accion(a, abajo) {
    if (a === 'izq') abajo ? repite('izq', () => mueve(-1)) : paraRep('izq');
    else if (a === 'der') abajo ? repite('der', () => mueve(1)) : paraRep('der');
    else if (a === 'abj') abajo ? repite('abj', () => baja(), 0, 38) : paraRep('abj');
    else if (!abajo) return;
    else if (a === 'gira') gira(1);
    else if (a === 'gira2') gira(-1);
    else if (a === 'cae') cae();
    else if (a === 'hold') reserva();
  }
  function teclado(e, abajo) {
    if (!S.abierta || !g) return;
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (abajo && !e.repeat) pausa(); return; }
    if (g.estado !== 'juego') { if (abajo && (e.code === 'Space' || e.code === 'Enter') && g.estado === 'pausa') { e.preventDefault(); sigue(); } return; }
    const m = /^Digit([1-7])$/.exec(e.code);
    if (m && abajo && !e.repeat) { const lista = PODERES.filter(p => p.nivel <= nivelJugador()); if (lista[+m[1] - 1]) usa(lista[+m[1] - 1].id); return; }
    const t = TECLAS[e.code]; if (!t) return;
    e.preventDefault();
    if (abajo && e.repeat) return;
    accion(t[0], abajo);
  }
  addEventListener('keydown', (e) => teclado(e, true));
  addEventListener('keyup', (e) => teclado(e, false));

  /* Táctil: el dedo arrastra la pieza (posición absoluta, no por pasos acumulados, así no se pierde ni se pasa),
     arrastrar hacia abajo la baja al ritmo del dedo, un golpe rápido hacia abajo la suelta, hacia arriba la reserva
     y un toque la gira. Funciona en todo el área de juego, no solo sobre el tablero. */
  function gestos(area) {
    let gs = null;
    const vib = (n) => { try { if (navigator.vibrate) navigator.vibrate(n); } catch { /* sin vibración */ } };
    const rebasa = (x, y) => { gs.ax = x; gs.ay = y; gs.col0 = g.cur ? g.cur.x : 0; gs.pieza = g.cur ? g.cur.t + ':' + g.piezas : ''; gs.cae = false; };
    area.addEventListener('pointerdown', (e) => {
      if (gs || !enJuego() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try { area.setPointerCapture(e.pointerId); } catch { /* ya no está */ }
      const enHold = !!(R.holdCv && e.target === R.holdCv);
      gs = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), movido: false, hold: enHold, mues: [[performance.now(), e.clientY]], ejeX: false };
      rebasa(e.clientX, e.clientY);
    });
    area.addEventListener('pointermove', (e) => {
      if (!gs || e.pointerId !== gs.id || gs.hold) return;
      if (!enJuego()) return;
      if (gs.pieza !== g.cur.t + ':' + g.piezas) rebasa(e.clientX, e.clientY);   // salió otra pieza: se sigue desde donde está el dedo
      if (gs.cae) return;
      const ahora = performance.now();
      gs.lx = e.clientX; gs.ly = e.clientY;
      gs.mues.push([ahora, e.clientY]); while (gs.mues.length > 1 && ahora - gs.mues[0][0] > 90) gs.mues.shift();
      const dx = e.clientX - gs.ax, dy = e.clientY - gs.ay;
      // zona muerta: un toque tembloroso no debe mover la pieza
      if (!gs.movido && Math.hypot(e.clientX - gs.x, e.clientY - gs.y) < 9) return;
      gs.movido = true;
      // columna objetivo según el dedo (con un poco de histéresis para que no baile entre dos columnas)
      const pasos = dx / celda, entero = Math.trunc(pasos), resto = Math.abs(pasos - entero);
      const objetivo = gs.col0 + entero + (resto > 0.62 ? Math.sign(pasos) : 0);
      let guarda = 12;
      while (g.cur.x !== objetivo && guarda-- > 0) {
        const antes = g.cur.x; mueve(Math.sign(objetivo - g.cur.x));
        if (g.cur.x === antes) break;   // pared o bloque
      }
      // bajar con el dedo: un paso por cada ~0,8 celda, con más margen para no bajar sin querer al mover de lado
      const pasoY = celda * 0.8, extra = Math.abs(dx) > celda * 1.2 ? celda * 0.5 : 0;
      if (dy > pasoY + extra) { const n = Math.floor((dy - extra) / pasoY); let k = 0; for (let i = 0; i < n; i++) if (baja()) k++; gs.ay += n * pasoY; if (k) gs.bajo = true; }
      else if (dy < -pasoY * 1.5) gs.ay = Math.max(gs.ay, e.clientY + pasoY * 1.5);   // si sube, se vuelve a contar desde ahí
    });
    const suelta = (e) => {
      if (!gs || e.pointerId !== gs.id) return; const s = gs; gs = null;
      try { area.releasePointerCapture(e.pointerId); } catch { /* da igual */ }
      if (e.type === 'pointercancel' || !enJuego()) return;
      const dt = performance.now() - s.t, dx = (s.lx ?? e.clientX) - s.x, dy = (s.ly ?? e.clientY) - s.y;
      if (s.hold) { if (!s.movido && dt < 400) { reserva(); vib(10); } return; }
      if (s.cae) return;
      if (!s.movido && dt < 300) { gira(1); return; }
      // golpe rápido: velocidad en los últimos ~90 ms
      const m0 = s.mues[0], m1 = s.mues[s.mues.length - 1], v = (m1[1] - m0[1]) / Math.max(1, m1[0] - m0[0]);
      const enMovimiento = performance.now() - m1[0] < 80;   // si el dedo se paró antes de soltar, no es un golpe
      if (enMovimiento && v > 0.7 && dy > celda * 1.5 && Math.abs(dx) < Math.abs(dy) * 1.2) { cae(); vib(14); }
      else if (enMovimiento && v < -0.7 && dy < -celda * 2 && Math.abs(dx) < Math.abs(dy)) { reserva(); vib(10); }
    };
    area.addEventListener('pointerup', suelta); area.addEventListener('pointercancel', suelta);
    area.addEventListener('lostpointercapture', (e) => { if (gs && e.pointerId === gs.id) gs = null; });
    area.addEventListener('contextmenu', (e) => e.preventDefault());
    area.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  function boton(txt, cls, onDown, onUp, etiqueta) {
    const b = el('button', 'tt-btn ' + (cls || ''), txt); b.type = 'button'; if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* ya no está */ } b.classList.add('on'); onDown(e); });
    const fuera = (e) => { b.classList.remove('on'); if (onUp) onUp(e); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, fuera));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  function pausa() {
    if (!g || g.estado !== 'juego') return;
    g.estado = 'pausa'; paraRepeticiones(); muestraPausa();
  }
  function sigue() { if (!g || g.estado !== 'pausa') return; g.estado = 'juego'; R.ov.hidden = true; ultimo = performance.now(); }

  function build() {
    const v = $('view-tetris'); v.textContent = '';
    const head = el('div', 'tt-gamebar');
    const salir = el('button', 'tt-salir'); salir.type = 'button'; salir.setAttribute('aria-label', 'Salir del Tetris y volver a la aplicación');
    salir.append(el('span', 'tt-salir-icon', '←'), el('span', null, 'Volver a la app'));
    salir.addEventListener('click', () => switchTab('files'));
    head.appendChild(salir);

    const zona = el('div', 'tt-zona');
    const hudBar = el('div', 'tt-hud');
    const celdaHud = (n, ini = '0') => { const c = el('div'); const val = el('b', null, ini); c.append(el('span', null, n), val); hudBar.appendChild(c); return val; };
    const pts = celdaHud('Puntos'), tiempo = celdaHud('Tiempo', '3:00'), lineas = celdaHud('Líneas'), nivel = celdaHud('Nivel', '1');
    const bPausa = el('button', 'tt-pausa'); bPausa.type = 'button'; bPausa.textContent = 'II'; bPausa.setAttribute('aria-label', 'Pausa'); bPausa.addEventListener('click', pausa);
    hudBar.appendChild(bPausa);
    const bMudo = el('button', 'tt-pausa tt-mudo'); bMudo.type = 'button'; const pintaMudo = () => { const mudo = !AU.musica && !AU.efectos; bMudo.textContent = mudo ? '🔇' : '🔊'; bMudo.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar'); bMudo.title = mudo ? 'Activar sonido' : 'Silenciar todo el audio'; }; pintaMudo();
    bMudo.addEventListener('click', () => { const mudo = !AU.musica && !AU.efectos; AU.musica = AU.efectos = mudo; guardaAudio(); pintaMudo(); bMudo.blur(); }); hudBar.appendChild(bMudo);

    const fila = el('div', 'tt-fila');
    const izq = el('div', 'tt-lado'); const holdBox = el('div', 'tt-caja'); holdBox.appendChild(el('span', null, 'Reserva'));
    const holdCv = el('canvas', 'tt-mini'); holdBox.appendChild(holdCv);
    const energia = el('div', 'tt-energia'); energia.title = 'Energía: se carga limpiando líneas y se gasta en potenciadores';
    energia.append(el('span', null, 'Energía')); const pips = el('div'); for (let i = 0; i < 5; i++) pips.appendChild(el('i')); energia.appendChild(pips);
    const chipDoble = el('div', 'tt-chip'); chipDoble.hidden = true; const chipHielo = el('div', 'tt-chip hielo'); chipHielo.hidden = true;
    izq.append(holdBox, energia, chipDoble, chipHielo);

    const centro = el('div', 'tt-centro'); const cv = el('canvas', 'tt-cv'); const ctx = cv.getContext('2d');
    const avisoEl = el('div', 'tt-aviso'); const ov = el('div', 'tt-ov'); ov.hidden = true;
    centro.append(cv, avisoEl, ov);
    const der = el('div', 'tt-lado'); const nextBox = el('div', 'tt-caja grande'); nextBox.appendChild(el('span', null, 'Siguiente'));
    const nextCvs = [0, 1, 2].map(() => { const c = el('canvas', 'tt-mini'); nextBox.appendChild(c); return c; });
    der.appendChild(nextBox);
    fila.append(izq, centro, der);

    const panelInf = el('div', 'tt-inf');
    const barraPod = el('div', 'tt-poderes');
    const poderes = PODERES.map((p, i) => {
      const b = el('button', 'tt-poder'); b.type = 'button'; b.title = `${p.nombre}: ${p.txt} (energía ${p.coste}${p.nivel > 1 ? `, nivel ${p.nivel}` : ''}) · tecla ${i + 1}`;
      b.append(G.gi(p.icono), el('span', null, String(p.coste)));
      b.addEventListener('click', () => usa(p.id));
      barraPod.appendChild(b); return { btn: b, p };
    });
    const ctl = el('div', 'tt-ctl');
    ctl.append(
      boton('◀', '', () => accion('izq', true), () => accion('izq', false), 'Izquierda'),
      boton('▶', '', () => accion('der', true), () => accion('der', false), 'Derecha'),
      boton('⟳', 'gira', () => gira(1), null, 'Girar'),
      boton('▼', '', () => accion('abj', true), () => accion('abj', false), 'Bajar'),
      boton('⤓', 'cae', () => cae(), null, 'Caída rápida'),
      boton('⇄', 'hold', () => reserva(), null, 'Reserva'),
    );
    panelInf.append(barraPod, ctl);
    zona.append(hudBar, fila, panelInf);
    v.append(head, zona);
    Object.assign(R, { zona, cv, ctx, ov, aviso: avisoEl, pts, tiempo, lineas, nivel, holdCv, nextCvs, energia, poderes, chipDoble, chipHielo, panelInf });
    gestos(fila);
    addEventListener('resize', () => { if (S.abierta) ajusta(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pausa(); });
    window.addEventListener('blur', () => { if (g && g.estado === 'juego') pausa(); });
    S.built = true;
  }

  /* ---------- Pantallas sobre el tablero ---------- */
  function ovBase(titulo) {
    R.ov.hidden = false; R.ov.textContent = '';
    const c = el('div', 'tt-ov-c'); if (titulo) c.appendChild(el('h3', null, titulo)); R.ov.appendChild(c); return c;
  }
  function listaPoderes(c) {
    const niv = nivelJugador();
    const box = el('div', 'tt-lista');
    [...PODERES.map(p => ({ ...p, tipo: 'Activo' })), ...PASIVOS.map(p => ({ ...p, tipo: 'Pasivo' }))].sort((a, b) => a.nivel - b.nivel).forEach(p => {
      const f = el('div', 'tt-lp' + (p.nivel > niv ? ' bloq' : '')); f.append(G.gi(p.icono));
      const tx = el('div'); tx.append(el('b', null, p.nombre), el('span', 'k-faint', p.nivel > niv ? `Nivel ${p.nivel}` : p.txt)); f.appendChild(tx); box.appendChild(f);
    });
    c.appendChild(box);
  }
  function muestraInicio() {
    const c = ovBase('Tetris · 3 minutos');
    const s = G.state;
    c.appendChild(el('p', 'tt-ayuda', s ? `Nivel ${s.nivel} · ${s.rango.nombre} · Récord ${s.tetris.mejor.toLocaleString('es')}` : 'Cargando tu progreso…'));
    const jug = el('button', 'btn primary tt-jugar', 'Jugar'); jug.type = 'button'; jug.addEventListener('click', empieza); c.appendChild(jug);
    c.appendChild(el('p', 'tt-ayuda k-faint', 'Limpia líneas para cargar energía y gastarla en potenciadores. Cuantos más niveles tengas en la app, más potenciadores desbloqueas.'));
    const vol = el('label', 'tt-vol'); vol.append(el('span', null, 'Volumen')); const rng = el('input'); rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.05'; rng.value = String(AU.vol);
    rng.addEventListener('input', () => { AU.vol = +rng.value; guardaAudio(); }); vol.appendChild(rng); c.appendChild(vol);
    const det = el('details'); det.appendChild(el('summary', null, 'Controles y potenciadores'));
    const ctl = el('p', 'k-faint tt-ayuda');
    ctl.textContent = 'Táctil: arrastra para mover la pieza, toca para girar, arrastra hacia abajo para bajar, golpe rápido hacia abajo para soltar y hacia arriba para reservar (o toca la Reserva). Teclado: ← → mover, ↑ o X girar, Z girar al revés, ↓ bajar, espacio soltar, C reserva, 1-7 potenciadores, P pausa.';
    det.append(ctl); listaPoderes(det);
    const cred = el('p', 'k-faint tt-ayuda', 'Música de Kevin MacLeod (FreePD), dominio público CC0.'); det.appendChild(cred); c.appendChild(det);
  }
  function muestraPausa() {
    const c = ovBase('Pausa');
    const a = el('button', 'btn primary tt-jugar', 'Continuar'); a.type = 'button'; a.addEventListener('click', sigue);
    const b = el('button', 'btn', 'Terminar partida'); b.type = 'button'; b.addEventListener('click', () => { R.ov.hidden = true; g.estado = 'juego'; fin('abandono'); });
    c.append(a, b);
  }
  function muestraFin(d) {
    const r = g.resultado; const c = ovBase(g.resultado.ended === 'top' ? 'Sin sitio' : g.resultado.ended === 'abandono' ? 'Partida terminada' : '¡Tiempo!');
    c.appendChild(el('div', 'tt-final', r.score.toLocaleString('es')));
    c.appendChild(el('p', 'tt-ayuda', `${r.lines} líneas · nivel ${r.level} · ${r.tetrises} Tetris · combo máx. ${r.maxCombo}`));
    if (d && d.record) c.appendChild(el('p', 'tt-record', '🏆 ¡Nuevo récord!'));
    if (d && d.ganado) c.appendChild(el('p', 'tt-ayuda', `+${d.ganado.xp} XP · +${d.ganado.monedas} monedas`));
    else if (d && d.corta) c.appendChild(el('p', 'tt-ayuda k-faint', 'Partida demasiado corta para contar'));
    else if (!d) c.appendChild(el('p', 'tt-ayuda k-faint', 'Guardando…'));
    const otra = el('button', 'btn primary tt-jugar', 'Jugar otra vez'); otra.type = 'button'; otra.addEventListener('click', empieza);
    c.appendChild(otra);
    if (d && d.ganado) {
      const sh = el('button', 'btn', 'Compartir puntuación'); sh.type = 'button';
      sh.addEventListener('click', () => G.tarjeta('tetris', { resultado: r, record: d.record, tablero: g.tablero }));
      c.appendChild(sh);
    }
  }
  function empieza() { audioInit(); nueva(); R.ov.hidden = true; ultimo = performance.now(); Object.keys(cache).forEach(k => delete cache[k]); R.cv.focus && R.cv.blur(); }

  K.registerView('tetris', {
    async open() {
      if (!S.built) build();
      S.abierta = true;
      document.body.classList.add('tt-inmersivo');
      setTimeout(ajusta, 0);
      if (!G.state) await G.load();
      if (!g || g.estado === 'fin') { g = null; muestraInicio(); } else if (g.estado === 'juego') pausa();
      if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(bucle); }
      if (!tickMus) tickMus = setInterval(musicaTick, 100);
      setTimeout(ajusta, 80);
    },
    close() {
      S.abierta = false; document.body.classList.remove('tt-inmersivo'); paraRepeticiones();
      if (g && g.estado === 'juego') pausa();
      cancelAnimationFrame(raf); raf = 0;
      clearInterval(tickMus); tickMus = 0; if (mus) { mus.pause(); volAct = 0; }
    },
  });
})();
