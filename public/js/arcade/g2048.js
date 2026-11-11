'use strict';
/* arcade/g2048.js: parte del módulo (se carga con el resto de arcade/ en index.html). Comparte el espacio K._arcade. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._arcade = K._arcade || {});
  const { G } = C;
  const clamp = (...a) => C.clamp(...a);
  const fabrica = (...a) => C.fabrica(...a);
  const luz = (...a) => C.luz(...a);
  const mmss = (...a) => C.mmss(...a);
  const rnd = (...a) => C.rnd(...a);
  const sfx = (...a) => C.sfx(...a);
  const skin = (...a) => C.skin(...a);

  /* =====================================================================
     2048
  ===================================================================== */
  const N = 4;
  const POS = (d, i, k) => d === 0 ? [i, k] : d === 1 ? [i, N - 1 - k] : d === 2 ? [k, i] : [N - 1 - k, i];
  const huecos = (g) => { const ocu = new Set(g.tiles.map(t => t.r * N + t.c)); const l = []; for (let i = 0; i < N * N; i++) if (!ocu.has(i)) l.push([Math.floor(i / N), i % N]); return l; };
  function nuevaFicha(J, v) {
    const g = J.g, h = huecos(g); if (!h.length) return null;
    const [r, c] = h[rnd(h.length)]; const t = { id: ++g.ids, v: v || (Math.random() < (J.tiene('suerte') ? 0.2 : 0.1) ? 4 : 2), r, c, pr: r, pc: c, t0: performance.now(), pop: true };
    g.tiles.push(t); g.maxTile = Math.max(g.maxTile, t.v); return t;
  }
  const hayMovimientos = (g) => {
    if (g.tiles.length < N * N) return true;
    const m = {}; g.tiles.forEach(t => { m[t.r * N + t.c] = t.v; });
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = m[r * N + c]; if ((c + 1 < N && m[r * N + c + 1] === v) || (r + 1 < N && m[(r + 1) * N + c] === v)) return true; }
    return false;
  };
  function mueve2048(J, d) {
    const g = J.g; if (!J.enJuego()) return;
    const antes = { tiles: g.tiles.map(t => ({ ...t })), score: g.score, maxTile: g.maxTile };
    const mapa = {}; g.tiles.forEach(t => { mapa[t.r * N + t.c] = t; });
    const salida = []; let movido = false, ganado = 0, fus = 0; const ahora = performance.now();
    for (let i = 0; i < N; i++) {
      const fila = []; for (let k = 0; k < N; k++) { const [r, c] = POS(d, i, k); const t = mapa[r * N + c]; if (t) fila.push(t); }
      const out = [];
      for (const t of fila) {
        const ult = out[out.length - 1];
        if (ult && ult.v === t.v && !ult.m) {
          ult.v *= 2; ult.m = true; fus++; ganado += ult.v;
          g.fant.push({ v: t.v, r0: t.r, c0: t.c, t0: ahora, to: null, ref: ult });
        } else out.push(t);
      }
      out.forEach((t, k) => { const [r, c] = POS(d, i, k); t.pr = t.r; t.pc = t.c; if (t.r !== r || t.c !== c) movido = true; t.r = r; t.c = c; t.t0 = ahora; t.mg = !!t.m; t.pop = t.mg; salida.push(t); });
    }
    if (fus) movido = true;
    if (!movido) { salida.forEach(t => { t.m = false; }); return; }
    g.tiles = salida; g.tiles.forEach(t => { if (t.m) { t.m = false; g.maxTile = Math.max(g.maxTile, t.v); } });
    g.fant.forEach(f => { if (!f.to) f.to = [f.ref.r, f.ref.c]; });
    g.undo = antes;
    let pts = ganado * (J.tiene('puntos') ? 1.25 : 1) * (g.x2 > 0 ? 2 : 1); pts = Math.round(pts);
    g.score += pts; g.fusiones += fus; g.movs++;
    if (g.x2 > 0) g.x2--;
    if (g.sinSpawn > 0) g.sinSpawn--; else nuevaFicha(J);
    if (fus) { sfx('fusion', Math.log2(g.maxTile)); J.ganaEnergia(fus); } else sfx('mueve');
    if (g.maxTile >= 2048 && !g.ganado) { g.ganado = true; J.aviso('¡2048!'); sfx('nivel'); }
    if (!hayMovimientos(g)) {
      if (J.tiene('aire') && !g.aire) {
        g.aire = true; const bajos = [...g.tiles].sort((a, b) => a.v - b.v).slice(0, 6); g.tiles = g.tiles.filter(t => !bajos.includes(t)); J.aviso('Segundo aire'); sfx('poder');
      } else J.fin('fin');
    }
  }
  const J2048 = fabrica({
    id: 'g2048', vista: 'g2048', titulo: '2048', W: 360, H: 360, maxAncho: 440,
    intro: 'Desliza para unir fichas iguales. Cada fusión carga energía para tus potenciadores; cuantos más niveles tengas en la app, más desbloqueas.',
    controles: 'Táctil: desliza el dedo sobre el tablero. Teclado: flechas o WASD. Teclas 1-9 para los potenciadores, P para pausa.',
    poderes: [
      { id: 'deshacer', nombre: 'Deshacer', icono: 'cycle', nivel: 2, coste: 1, txt: 'Devuelve el último movimiento', usa: (J) => { const g = J.g; if (!g.undo) { J.aviso('Nada que deshacer'); return false; } g.tiles = g.undo.tiles; g.score = g.undo.score; g.fant = []; g.undo = null; } },
      { id: 'limpiar', nombre: 'Limpiar', icono: 'bomb', nivel: 4, coste: 2, txt: 'Elimina todas las fichas de 2 y 4', usa: (J) => { const g = J.g; const n = g.tiles.length; g.tiles = g.tiles.filter(t => t.v > 4); if (g.tiles.length === n) { J.aviso('No hay fichas pequeñas'); return false; } g.tiles.forEach(t => { t.pr = t.r; t.pc = t.c; }); } },
      { id: 'doble', nombre: 'Puntos x2', icono: 'star', nivel: 8, coste: 2, txt: 'Doble puntuación durante 10 movimientos', usa: (J) => { J.g.x2 = 10; } },
      { id: 'mezclar', nombre: 'Mezclar', icono: 'vortex', nivel: 11, coste: 2, txt: 'Reordena las fichas al azar', usa: (J) => { const g = J.g; const cel = []; for (let i = 0; i < N * N; i++) cel.push(i); cel.sort(() => Math.random() - 0.5); g.tiles.forEach((t, i) => { t.pr = t.r; t.pc = t.c; t.r = Math.floor(cel[i] / N); t.c = cel[i] % N; t.t0 = performance.now(); }); g.undo = null; } },
      { id: 'congelar', nombre: 'Pausa de fichas', icono: 'snow', nivel: 15, coste: 2, txt: 'Los próximos 5 movimientos no aparecen fichas nuevas', usa: (J) => { J.g.sinSpawn = 5; } },
      { id: 'subir', nombre: 'Subir', icono: 'rocket', nivel: 20, coste: 3, txt: 'Duplica el valor de las fichas más pequeñas', usa: (J) => { const g = J.g; if (!g.tiles.length) return false; const mn = Math.min(...g.tiles.map(t => t.v)); g.tiles.forEach(t => { if (t.v === mn) { t.v *= 2; t.pop = true; t.t0 = performance.now(); g.maxTile = Math.max(g.maxTile, t.v); } }); g.undo = null; } },
    ],
    pasivos: [
      { id: 'inicio', nombre: 'Buen comienzo', icono: 'sunrise', nivel: 5, txt: 'Empiezas con una ficha de 8' },
      { id: 'cargador', nombre: 'Cargador rápido', icono: 'cog', nivel: 9, txt: 'Energía cada 7 fusiones en vez de 10' },
      { id: 'suerte', nombre: 'Golpe de suerte', icono: 'gem', nivel: 13, txt: 'Más fichas de 4 al aparecer' },
      { id: 'aire', nombre: 'Segundo aire', icono: 'heart', nivel: 18, txt: 'Una vez por partida, si te bloqueas se quitan las 6 fichas más pequeñas' },
      { id: 'puntos', nombre: 'Maestro de fusiones', icono: 'fireray', nivel: 24, txt: 'Las fusiones puntúan un 25 % más' },
      { id: 'monedas', nombre: 'Lluvia de monedas', icono: 'purse', nivel: 35, txt: '+50 % de monedas al terminar' },
    ],
    hud: [
      { nombre: 'Puntos', valor: g => g.score.toLocaleString('es') },
      { nombre: 'Récord', valor: g => Math.max(g.score, (G.state && G.state.arcade ? G.state.arcade.g2048.mejor : 0)).toLocaleString('es') },
      { nombre: 'Movs', valor: g => String(g.movs) },
      { nombre: 'Ficha', valor: g => String(g.maxTile) },
    ],
    umbral: (J) => J.tiene('cargador') ? 7 : 10,
    chips: (J, box) => { const g = J.g; const t = g.x2 > 0 ? `x2 · ${g.x2}` : g.sinSpawn > 0 ? `Sin fichas · ${g.sinSpawn}` : ''; if (box.textContent !== t) box.textContent = t; },
    pista: (g) => g.maxTile < 128 ? 0 : g.maxTile < 1024 ? 1 : 2,
    nueva: (J) => {
      Object.assign(J.g, { tiles: [], fant: [], ids: 0, score: 0, movs: 0, fusiones: 0, maxTile: 0, undo: null, x2: 0, sinSpawn: 0, aire: false, ganado: false });
      nuevaFicha(J); nuevaFicha(J); if (J.tiene('inicio')) { const h = huecos(J.g); if (h.length) { const [r, c] = h[rnd(h.length)]; J.g.tiles.push({ id: ++J.g.ids, v: 8, r, c, pr: r, pc: c, t0: performance.now(), pop: true }); J.g.maxTile = 8; } }
    },
    actualiza: () => {},
    resultado: (J) => ({ score: J.g.score, moves: J.g.movs, maxTile: J.g.maxTile, merges: J.g.fusiones, powerups: J.g.poderes }),
    tituloFin: (r) => r.maxTile >= 2048 ? '¡2048!' : r.ended === 'abandono' ? 'Partida terminada' : 'Sin movimientos',
    resumenFin: (r) => `Ficha ${r.maxTile} · ${r.moves} movimientos · ${r.merges} fusiones`,
    statsTarjeta: (r) => [[r.maxTile, 'FICHA MÁX.'], [r.moves, 'MOVIMIENTOS'], [r.merges, 'FUSIONES'], [mmss(r.duration), 'TIEMPO']],
    botones: [['◀', '', (J) => mueve2048(J, 0), 'Izquierda'], ['▲', '', (J) => mueve2048(J, 2), 'Arriba'], ['▼', '', (J) => mueve2048(J, 3), 'Abajo'], ['▶', '', (J) => mueve2048(J, 1), 'Derecha']],
    tecla: (J, e) => { const d = { ArrowLeft: 0, a: 0, A: 0, ArrowRight: 1, d: 1, D: 1, ArrowUp: 2, w: 2, W: 2, ArrowDown: 3, s: 3, S: 3 }[e.key]; if (d === undefined) return false; mueve2048(J, d); return true; },
    entrada: (J, area) => {
      let gs = null;
      area.addEventListener('pointerdown', (e) => { if (gs || !J.enJuego() || (e.pointerType === 'mouse' && e.button !== 0)) return; try { area.setPointerCapture(e.pointerId); } catch { /* ya no está */ } gs = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.preventDefault(); });
      area.addEventListener('pointermove', (e) => {
        if (!gs || gs.hecho || e.pointerId !== gs.id) return; const dx = e.clientX - gs.x, dy = e.clientY - gs.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
        mueve2048(J, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3)); gs.hecho = true; /* un gesto = un movimiento, como en el original */
      });
      const suelta = (e) => { if (gs && e.pointerId === gs.id) gs = null; };
      area.addEventListener('pointerup', suelta); area.addEventListener('pointercancel', suelta);
    },
    dibuja: (J, x) => {
      const g = J.g; const W = 360, pad = 10, cel = (W - pad * 2) / N, gap = 7;
      const sk = skin(); const ahora = performance.now();
      x.fillStyle = 'rgba(255,255,255,.06)'; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { x.beginPath(); x.roundRect(pad + c * cel + gap / 2, pad + r * cel + gap / 2, cel - gap, cel - gap, 10); x.fill(); }
      if (!g) return;
      const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
      const ficha = (px, py, v, escala) => {
        const col = sk.colores[(Math.max(1, Math.log2(v)) - 1) % 7 | 0]; const s = (cel - gap) * escala, ox = px + (cel - s) / 2, oy = py + (cel - s) / 2;
        x.save(); if (v >= 2048) { x.shadowColor = '#facc15'; x.shadowBlur = 22; }
        x.fillStyle = col; x.beginPath(); x.roundRect(ox, oy, s, s, 10 * escala); x.fill(); x.restore();
        if (sk.estilo === 'brillo') { const gr = x.createLinearGradient(ox, oy, ox, oy + s); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(0,0,0,.15)'); x.fillStyle = gr; x.beginPath(); x.roundRect(ox, oy, s, s, 10 * escala); x.fill(); }
        x.fillStyle = luz(col) > 150 ? '#14182b' : '#fff'; x.font = `800 ${Math.round((v >= 1024 ? 24 : v >= 128 ? 30 : 36) * escala)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), ox + s / 2, oy + s / 2 + 2);
      };
      g.fant = g.fant.filter(f => ahora - f.t0 < 130);
      g.fant.forEach(f => { const t = ease((ahora - f.t0) / 120); const r = f.r0 + (f.to[0] - f.r0) * t, c = f.c0 + (f.to[1] - f.c0) * t; ficha(pad + c * cel, pad + r * cel, f.v, 1); });
      g.tiles.forEach(t => {
        const a = ease((ahora - t.t0) / 110); const r = t.pr + (t.r - t.pr) * a, c = t.pc + (t.c - t.pc) * a;
        let esc = 1; if (t.pop) { const p = clamp((ahora - t.t0) / 180, 0, 1); esc = t.mg ? 1 + 0.18 * Math.sin(p * Math.PI) : 0.3 + 0.7 * ease(p); }
        ficha(pad + c * cel, pad + r * cel, t.v, esc);
      });
      x.textBaseline = 'alphabetic';
    },
  });


  Object.assign(C, { N, POS, huecos, nuevaFicha, hayMovimientos, mueve2048, J2048 });
})();
