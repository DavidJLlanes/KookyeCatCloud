'use strict';
/* tetris/motor.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { COLS, EST, KICKS, PODERES, ROT, ROWS, SEGUNDOS, TIPOS } = C;
  const aviso = (...a) => C.aviso(...a);
  const fin = (...a) => C.fin(...a);
  const nivelJugador = (...a) => C.nivelJugador(...a);
  const sfx = (...a) => C.sfx(...a);
  const tiene = (...a) => C.tiene(...a);

  /* ---------- Motor ---------- */
  const tableroVacio = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const celdas = (p) => ROT[p.t][p.r].map(([x, y]) => [p.x + x, p.y + y]);
  const choca = (p, dx = 0, dy = 0) => celdas(p).some(([x, y]) => { x += dx; y += dy; return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && EST.g.board[y][x]); });
  const pieza = (t) => ({ t, r: 0, x: 3, y: 0 });
  function siguienteTipo() {
    if (!EST.g.bolsa.length) { const b = TIPOS.split(''); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } EST.g.bolsa = b; }
    return EST.g.bolsa.pop();
  }
  function rellenaCola() { while (EST.g.cola.length < 5) EST.g.cola.push(siguienteTipo()); }

  function nueva() {
    const bono = (tiene('reloj') ? 10 : 0) + (tiene('oro') ? 20 : 0);
    EST.g = {
      board: tableroVacio(), bolsa: [], cola: [], cur: null, hold: null, puedeHold: true,
      score: 0, lines: 0, level: 1, combo: -1, b2b: false, tetrises: 0, maxCombo: 0, tspins: 0, poderes: 0,
      tiempo: SEGUNDOS + bono, jugado: 0, energia: 0, carga: 0, congelar: 0, doble: 0, aire: tiene('aire'),
      estado: 'juego', caida: 0, bloqueo: 0, reinicios: 0, giro: false, snap: null, limpiando: null, enviado: false, resultado: null,
    };
    rellenaCola(); aparece();
  }
  function aparece(tipo) {
    rellenaCola();
    const t = tipo || EST.g.cola.shift();
    rellenaCola();
    EST.g.cur = pieza(t); EST.g.caida = 0; EST.g.bloqueo = 0; EST.g.reinicios = 0; EST.g.giro = false; EST.g.piezas = (EST.g.piezas || 0) + 1;
    if (choca(EST.g.cur)) {
      if (EST.g.aire) {   // segundo aire: se vacían las 8 filas de abajo y se sigue
        EST.g.aire = false; EST.g.board.splice(ROWS - 8, 8); for (let i = 0; i < 8; i++) EST.g.board.unshift(Array(COLS).fill(0));
        EST.g.cur = pieza(t); aviso('SEGUNDO AIRE'); return;
      }
      fin('top');
    }
  }

  const apoyada = () => choca(EST.g.cur, 0, 1);
  function tocado() {   // tras mover o girar con la pieza apoyada se reinicia (un número limitado de veces) el tiempo de bloqueo
    EST.g.giro = false;
    if (apoyada()) { EST.g.reinicios++; EST.g.bloqueo = 0; }
  }
  function mueve(dx) {
    if (!enJuego()) return;
    if (!choca(EST.g.cur, dx, 0)) { EST.g.cur.x += dx; tocado(); sfx('mueve'); }
  }
  function gira(dir) {
    if (!enJuego()) return;
    const nr = (EST.g.cur.r + dir + 4) % 4;
    for (const [dx, dy] of KICKS) {
      const p = { ...EST.g.cur, r: nr, x: EST.g.cur.x + dx, y: EST.g.cur.y + dy };
      if (!choca(p)) {
        EST.g.cur = p; EST.g.giro = true; sfx('gira');
        if (apoyada()) { EST.g.reinicios++; EST.g.bloqueo = 0; }
        return;
      }
    }
  }
  function baja() {   // un paso hacia abajo por iniciativa del jugador
    if (!enJuego()) return false;
    if (!choca(EST.g.cur, 0, 1)) { EST.g.cur.y++; EST.g.giro = false; EST.g.score += 1; return true; }
    return false;
  }
  function cae() {
    if (!enJuego()) return;
    let n = 0; while (!choca(EST.g.cur, 0, 1)) { EST.g.cur.y++; n++; }
    if (n) EST.g.giro = false;
    EST.g.score += n * 2;
    sfx('cae');
    bloquea();
  }
  const enJuego = () => EST.g && EST.g.estado === 'juego' && !EST.g.limpiando;

  function reserva() {
    if (!enJuego() || !EST.g.puedeHold) return;
    const t = EST.g.cur.t;
    if (EST.g.hold) { const h = EST.g.hold; EST.g.hold = t; aparece(h); } else { EST.g.hold = t; aparece(); }
    EST.g.puedeHold = false;
  }

  function bloquea() {
    sfx('bloquea');
    // Copia para poder deshacer
    EST.g.snap = { board: EST.g.board.map(f => f.slice()), tipo: EST.g.cur.t, score: EST.g.score, lines: EST.g.lines, level: EST.g.level, combo: EST.g.combo, b2b: EST.g.b2b, tetrises: EST.g.tetrises, maxCombo: EST.g.maxCombo, tspins: EST.g.tspins, carga: EST.g.carga, energia: EST.g.energia, hold: EST.g.hold };
    const cs = celdas(EST.g.cur);
    // T-spin: gira una T y al menos 3 de las 4 esquinas de su centro están ocupadas
    let tspin = false;
    if (EST.g.cur.t === 'T' && EST.g.giro) {
      const cx = EST.g.cur.x + 1, cy = EST.g.cur.y + 1;
      const ocupada = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && EST.g.board[y][x]);
      tspin = [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([a, b]) => ocupada(cx + a, cy + b)).length >= 3;
    }
    const codigo = TIPOS.indexOf(EST.g.cur.t) + 1;
    cs.forEach(([x, y]) => { if (y >= 0) EST.g.board[y][x] = codigo; });
    const llenas = []; EST.g.board.forEach((f, i) => { if (f.every(Boolean)) llenas.push(i); });
    EST.g.puedeHold = true;
    if (!llenas.length) {
      EST.g.combo = -1;
      if (tspin) { EST.g.score += Math.round(400 * EST.g.level * (EST.g.doble > 0 ? 2 : 1)); aviso('T-SPIN'); }
      aparece(); return;
    }
    EST.g.limpiando = { filas: llenas, t: 0.16, tspin };
    EST.g.cur = null;
  }
  function terminaLimpieza() {
    const { filas, tspin } = EST.g.limpiando; EST.g.limpiando = null;
    const n = filas.length;
    EST.g.board = EST.g.board.filter((_, i) => !filas.includes(i)); for (let i = 0; i < n; i++) EST.g.board.unshift(Array(COLS).fill(0));
    const dificil = n === 4 || tspin;
    let pts = (tspin ? [0, 800, 1200, 1600][n] : [0, 100, 300, 500, 800][n]) * EST.g.level;
    if (dificil && EST.g.b2b) pts *= 1.5;
    if (n === 4 && tiene('tetrisx')) pts *= 1.5;
    EST.g.b2b = dificil;
    EST.g.combo++;
    if (EST.g.combo > 0) { let c = 50 * EST.g.combo * EST.g.level; if (tiene('combo')) c *= 1.5; pts += c; EST.g.maxCombo = Math.max(EST.g.maxCombo, EST.g.combo); }
    if (EST.g.board.every(f => f.every(v => !v))) { pts += 1500 * EST.g.level; aviso('¡TABLERO LIMPIO!'); }
    if (EST.g.doble > 0) pts *= 2;
    EST.g.score += Math.round(pts); EST.g.lines += n;
    if (n === 4) EST.g.tetrises++;
    if (tspin) EST.g.tspins++;
    EST.g.level = 1 + Math.floor(EST.g.lines / 8);
    // Energía: una unidad cada 5 líneas (4 con el cargador) y una extra por Tetris o T-spin
    EST.g.carga += n; const cada = tiene('cargador') ? 4 : 5;
    while (EST.g.carga >= cada) { EST.g.carga -= cada; EST.g.energia = Math.min(5, EST.g.energia + 1); }
    if (dificil) EST.g.energia = Math.min(5, EST.g.energia + 1);
    aviso([, '', 'DOBLE', 'TRIPLE', 'TETRIS'][n] || '', tspin ? 'T-SPIN' : '', EST.g.combo > 0 ? `COMBO x${EST.g.combo}` : '');
    sfx('linea', n, tspin);
    try { if (navigator.vibrate) navigator.vibrate(n === 4 ? [20, 30, 20] : 15); } catch { /* sin vibración */ }
    aparece();
  }

  function usa(id) {
    const p = PODERES.find(x => x.id === id);
    if (!p || !enJuego() || p.nivel > nivelJugador()) return;
    if (EST.g.energia < p.coste) { aviso(`Faltan ${p.coste - EST.g.energia} de energía`); return; }
    if (id === 'deshacer' && !EST.g.snap) { aviso('Nada que deshacer'); return; }
    if (id === 'limpieza') {
      const habia = EST.g.board.slice(ROWS - 2).some(f => f.some(Boolean));
      EST.g.board.splice(ROWS - 2, 2); EST.g.board.unshift(Array(COLS).fill(0), Array(COLS).fill(0));
      if (habia) EST.g.score += 150 * EST.g.level;
    } else if (id === 'congelar') EST.g.congelar = 6;
    else if (id === 'tiempo') EST.g.tiempo += 15;
    else if (id === 'comodin') EST.g.cola[0] = 'I';
    else if (id === 'doble') EST.g.doble = 10;
    else if (id === 'rayo') {
      let col = 0, alto = 0;
      for (let x = 0; x < COLS; x++) { let h = 0; for (let y = 0; y < ROWS; y++) if (EST.g.board[y][x]) { h = ROWS - y; break; } if (h > alto) { alto = h; col = x; } }
      if (!alto) { aviso('No hay nada que borrar'); return; }
      for (let y = 0; y < ROWS; y++) EST.g.board[y][col] = 0;
      EST.g.score += 100 * EST.g.level;
    } else if (id === 'deshacer') {
      const s = EST.g.snap; EST.g.snap = null;
      EST.g.board = s.board.map(f => f.slice()); EST.g.cola.unshift(EST.g.cur.t);
      Object.assign(EST.g, { score: s.score, lines: s.lines, level: s.level, combo: s.combo, b2b: s.b2b, tetrises: s.tetrises, maxCombo: s.maxCombo, tspins: s.tspins, carga: s.carga });
      EST.g.hold = s.hold; EST.g.energia -= 0; aparece(s.tipo);
    }
    EST.g.energia -= p.coste; EST.g.poderes++; sfx('poder');
    aviso(p.nombre.toUpperCase());
  }

  function intervalo() { return Math.max(0.045, 0.72 * Math.pow(0.82, EST.g.level - 1)); }
  function actualiza(dt) {
    if (EST.g.estado !== 'juego') return;
    const antesT = Math.ceil(EST.g.tiempo);
    EST.g.tiempo -= dt; EST.g.jugado += dt;
    if (EST.g.tiempo > 0 && Math.ceil(EST.g.tiempo) !== antesT && Math.ceil(EST.g.tiempo) <= 10) sfx('aviso');
    if (EST.g.congelar > 0) EST.g.congelar -= dt;
    if (EST.g.doble > 0) EST.g.doble -= dt;
    if (EST.g.tiempo <= 0) { EST.g.tiempo = 0; fin('tiempo'); return; }
    if (EST.g.limpiando) { EST.g.limpiando.t -= dt; if (EST.g.limpiando.t <= 0) terminaLimpieza(); return; }
    if (EST.g.congelar > 0 || !EST.g.cur) return;
    if (apoyada()) {
      EST.g.bloqueo += dt;
      if (EST.g.bloqueo >= 0.5 || EST.g.reinicios > 14) bloquea();
    } else {
      EST.g.bloqueo = 0; EST.g.caida += dt;
      const iv = intervalo();
      while (EST.g.caida >= iv && !choca(EST.g.cur, 0, 1)) { EST.g.caida -= iv; EST.g.cur.y++; EST.g.giro = false; }
      if (choca(EST.g.cur, 0, 1)) EST.g.caida = 0;
    }
  }


  Object.assign(C, { tableroVacio, celdas, choca, pieza, siguienteTipo, rellenaCola, nueva, aparece, apoyada, tocado, mueve, gira, baja, cae, enJuego, reserva, bloquea, terminaLimpieza, usa, intervalo, actualiza });
})();
