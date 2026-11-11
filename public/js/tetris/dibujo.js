'use strict';
/* tetris/dibujo.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { COLS, EST, G, HID, R, ROT, ROWS, TIPOS } = C;
  const celdas = (...a) => C.celdas(...a);
  const choca = (...a) => C.choca(...a);
  const muestraFin = (...a) => C.muestraFin(...a);
  const paraRepeticiones = (...a) => C.paraRepeticiones(...a);
  const sfx = (...a) => C.sfx(...a);
  const tiene = (...a) => C.tiene(...a);

  /* ---------- Fin de la partida ---------- */
  async function fin(motivo) {
    if (!EST.g || EST.g.estado === 'fin') return;
    EST.g.estado = 'fin'; EST.g.limpiando = null; paraRepeticiones(); sfx('fin', motivo);
    const res = { score: EST.g.score, lines: EST.g.lines, level: EST.g.level, tetrises: EST.g.tetrises, maxCombo: EST.g.maxCombo, powerups: EST.g.poderes, duration: Math.round(EST.g.jugado), ended: motivo };
    EST.g.resultado = res; EST.g.tablero = EST.g.board.map(f => f.slice());
    muestraFin(null);
    if (res.duration < 5) { muestraFin({ corta: true }); return; }
    try {
      const f = new Date();
      const d = await K.post('/api/game/tetris', { ...res, day: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`, bonusMonedas: tiene('monedas') });
      G.set(d); EST.g.enviado = true;
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
    const W = COLS * EST.celda, H = (ROWS - HID) * EST.celda;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fondo = G.puesto('fondo') || { colores: ['#070b16', '#0d1424'] };
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, fondo.colores[0]); gr.addColorStop(1, fondo.colores[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fondo.estilo === 'rejilla' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.045)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * EST.celda + .5, 0); ctx.lineTo(x * EST.celda + .5, H); }
    for (let y = 1; y < ROWS - HID; y++) { ctx.moveTo(0, y * EST.celda + .5); ctx.lineTo(W, y * EST.celda + .5); }
    ctx.stroke();
    if (!EST.g) return;
    for (let y = HID; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const v = EST.g.board[y][x]; if (v) bloque(ctx, x * EST.celda, (y - HID) * EST.celda, EST.celda, v); }
    if (EST.g.limpiando) {
      const a = Math.min(1, 0.35 + (0.16 - EST.g.limpiando.t) / 0.16 * 0.65);
      ctx.fillStyle = `rgba(255,255,255,${a})`; EST.g.limpiando.filas.forEach(y => { if (y >= HID) ctx.fillRect(0, (y - HID) * EST.celda, W, EST.celda); });
    }
    if (EST.g.cur && EST.g.estado !== 'fin') {
      // Sombra de dónde caería
      let d = 0; while (!choca(EST.g.cur, 0, d + 1)) d++;
      const cod = TIPOS.indexOf(EST.g.cur.t) + 1;
      celdas({ ...EST.g.cur, y: EST.g.cur.y + d }).forEach(([x, y]) => { if (y >= HID) { ctx.strokeStyle = colorDe(cod); ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.strokeRect(x * EST.celda + 2, (y - HID) * EST.celda + 2, EST.celda - 4, EST.celda - 4); ctx.globalAlpha = 1; } });
      celdas(EST.g.cur).forEach(([x, y]) => { if (y >= HID) bloque(ctx, x * EST.celda, (y - HID) * EST.celda, EST.celda, cod); });
    }
    if (EST.g.congelar > 0) { ctx.fillStyle = 'rgba(125,211,252,.16)'; ctx.fillRect(0, 0, W, H); }
    if (EST.g.doble > 0) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); }
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


  Object.assign(C, { fin, colorDe, estiloSkin, sombrea, bloque, dibuja, mini });
})();
