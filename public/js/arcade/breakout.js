'use strict';
/* arcade/breakout.js: parte del módulo (se carga con el resto de arcade/ en index.html). Comparte el espacio K._arcade. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._arcade = K._arcade || {});
  const { J2048 } = C;
  const clamp = (...a) => C.clamp(...a);
  const fabrica = (...a) => C.fabrica(...a);
  const mmss = (...a) => C.mmss(...a);
  const rnd = (...a) => C.rnd(...a);
  const sfx = (...a) => C.sfx(...a);
  const skin = (...a) => C.skin(...a);

  /* =====================================================================
     Breakout
  ===================================================================== */
  const BW = 360, BH = 480, PY = BH - 40, PH = 10, BRAD = 6, COLS = 9, LW = 36, LH = 16, LG = 2, BX0 = 9, BY0 = 56;
  function crearLadrillos(lv) {
    const filas = Math.min(9, 4 + Math.ceil(lv / 2)), pat = (lv - 1) % 5, l = [];
    for (let r = 0; r < filas; r++) for (let c = 0; c < COLS; c++) {
      const ok = pat === 0 ? true : pat === 1 ? (r + c) % 2 === 0 : pat === 2 ? (c >= r % 5 && c < COLS - (r % 5)) : pat === 3 ? r % 2 === 0 || c === 0 || c === COLS - 1 : (c % 3) !== 1;
      if (!ok) continue;
      l.push({ x: BX0 + c * (LW + LG), y: BY0 + r * (LH + LG), r, hp: lv >= 3 && r < Math.min(3, Math.floor(lv / 3)) ? 2 : 1, vivo: true });
    }
    return l;
  }
  const velBase = (g) => Math.min(470, 270 + (g.nivel - 1) * 20);
  const anchoPala = (J) => 64 * (J.tiene('pala') ? 1.15 : 1) * (J.g.tAncha > 0 ? 1.6 : 1);
  function pegaBola(J) { const g = J.g; g.bolas = [{ x: g.px, y: PY - BRAD - 1, vx: 0, vy: 0, pegada: true }]; g.espera = true; }
  function lanza(J) {
    const g = J.g; if (!g.espera || !J.enJuego()) return;
    const a = (-90 + (Math.random() * 40 - 20)) * Math.PI / 180, v = velBase(g);
    g.bolas.forEach(b => { if (b.pegada) { b.pegada = false; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; } });
    g.espera = false; sfx('pala');
  }
  function ladrilloRoto(J, lad, ix) {
    const g = J.g; lad.hp--; if (lad.hp > 0) { sfx('rebote'); return; }
    lad.vivo = false; g.ladrillos++; g.vivos--; g.combo++;
    const mult = Math.min(2, 1 + Math.floor(g.combo / (J.tiene('combo') ? 3 : 5)) * 0.25);
    const pts = Math.round((10 + 5 * (8 - Math.min(8, lad.r))) * mult * (g.tX2 > 0 ? 2 : 1)); g.score += pts;
    sfx('ladrillo', Math.min(8, g.combo));
    J.ganaEnergia(1);
    for (let i = 0; i < 6; i++) g.part.push({ x: lad.x + LW / 2, y: lad.y + LH / 2, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.7) * 120, t: 0.5, c: ix });
    if (Math.random() < 0.1) g.caps.push({ x: lad.x + LW / 2, y: lad.y, tipo: ['ancha', 'lenta', 'multi'][rnd(3)] });
  }
  function nivelCompleto(J) {
    const g = J.g;
    if (g.vidas === g.vidasNivel) { g.perfectos++; g.racha++; g.mejorRacha = Math.max(g.mejorRacha, g.racha); J.aviso('¡Nivel perfecto!'); } else { g.racha = 0; J.aviso('¡Nivel superado!'); }
    sfx('nivel'); g.nivel++; g.ladr = crearLadrillos(g.nivel); g.vivos = g.ladr.length; g.vidasNivel = g.vidas; g.caps = []; g.combo = 0;
    g.red = J.tiene('red'); pegaBola(J);
  }
  function pierdeVida(J) {
    const g = J.g; g.vidas--; g.combo = 0; sfx('perder');
    if (g.vidas <= 0) { J.fin('fin'); return; }
    g.tFuego = 0; g.tLenta = 0; pegaBola(J);
  }
  function aplicaCapsula(J, tipo) {
    const g = J.g; sfx('poder');
    if (tipo === 'ancha') g.tAncha = 12; else if (tipo === 'lenta') g.tLenta = 8; else multibola(J);
    J.aviso({ ancha: 'Pala ancha', lenta: 'Bola lenta', multi: 'Multibola' }[tipo]);
  }
  function multibola(J) {
    const g = J.g; const nuevas = [];
    g.bolas.forEach(b => { if (b.pegada || g.bolas.length + nuevas.length >= 6) return; const v = Math.hypot(b.vx, b.vy) || velBase(g), a = Math.atan2(b.vy, b.vx); [-0.45, 0.45].forEach(d => { if (g.bolas.length + nuevas.length < 6) nuevas.push({ x: b.x, y: b.y, vx: Math.cos(a + d) * v, vy: Math.sin(a + d) * v, pegada: false }); }); });
    g.bolas.push(...nuevas); return nuevas.length > 0;
  }
  const JBreak = fabrica({
    id: 'breakout', vista: 'breakout', titulo: 'Breakout', W: BW, H: BH, maxAncho: 400,
    intro: 'Rebota la bola con la pala y rompe todos los ladrillos. Tienes 3 vidas; cada ladrillo carga energía para tus potenciadores y algunos sueltan cápsulas.',
    controles: 'Táctil: arrastra el dedo para mover la pala y toca para lanzar. Teclado o ratón: flechas o mover el ratón, espacio o clic para lanzar. Teclas 1-9 para los potenciadores, P para pausa.',
    poderes: [
      { id: 'lenta', nombre: 'Bola lenta', icono: 'hourglass', nivel: 3, coste: 1, txt: 'Reduce la velocidad de la bola 8 segundos', usa: (J) => { J.g.tLenta = 8; } },
      { id: 'ancha', nombre: 'Pala ancha', icono: 'cube', nivel: 5, coste: 1, txt: 'Pala un 60 % más ancha 12 segundos', usa: (J) => { J.g.tAncha = 12; } },
      { id: 'multi', nombre: 'Multibola', icono: 'vortex', nivel: 8, coste: 2, txt: 'Divide la bola en tres', usa: (J) => { if (!multibola(J)) { J.aviso('Lanza la bola primero'); return false; } } },
      { id: 'fuego', nombre: 'Bola de fuego', icono: 'flame', nivel: 12, coste: 2, txt: 'Atraviesa ladrillos durante 6 segundos', usa: (J) => { J.g.tFuego = 6; } },
      { id: 'red', nombre: 'Red', icono: 'shield', nivel: 16, coste: 2, txt: 'Una red bajo la pala salva una bola', usa: (J) => { if (J.g.red) { J.aviso('Ya hay red'); return false; } J.g.red = true; } },
      { id: 'doble', nombre: 'Puntos x2', icono: 'star', nivel: 20, coste: 2, txt: 'Doble puntuación durante 10 segundos', usa: (J) => { J.g.tX2 = 10; } },
      { id: 'vida', nombre: 'Vida extra', icono: 'heart', nivel: 25, coste: 3, txt: 'Suma una vida (máximo 5)', usa: (J) => { if (J.g.vidas >= 5) { J.aviso('Vidas al máximo'); return false; } J.g.vidas++; } },
    ],
    pasivos: [
      { id: 'pala', nombre: 'Pala grande', icono: 'anvil', nivel: 4, txt: 'La pala es un 15 % más ancha' },
      { id: 'cargador', nombre: 'Cargador rápido', icono: 'cog', nivel: 7, txt: 'Energía cada 8 ladrillos en vez de 12' },
      { id: 'vida', nombre: 'Vida de reserva', icono: 'heart', nivel: 10, txt: 'Empiezas con 4 vidas' },
      { id: 'combo', nombre: 'Maestro del combo', icono: 'fireray', nivel: 14, txt: 'El multiplicador de combo sube más rápido' },
      { id: 'red', nombre: 'Red de seguridad', icono: 'shield', nivel: 18, txt: 'Cada nivel empieza con una red bajo la pala' },
      { id: 'monedas', nombre: 'Lluvia de monedas', icono: 'purse', nivel: 35, txt: '+50 % de monedas al terminar' },
    ],
    hud: [
      { nombre: 'Puntos', valor: g => g.score.toLocaleString('es') },
      { nombre: 'Nivel', valor: g => String(g.nivel), ini: '1' },
      { nombre: 'Vidas', valor: g => '♥'.repeat(Math.max(0, g.vidas)) },
      { nombre: 'Ladrillos', valor: g => String(g.ladrillos) },
    ],
    umbral: (J) => J.tiene('cargador') ? 8 : 12,
    chips: (J, box) => { const g = J.g; const t = [g.tAncha > 0 && 'Ancha', g.tLenta > 0 && 'Lenta', g.tFuego > 0 && 'Fuego', g.tX2 > 0 && 'x2', g.red && 'Red', g.combo >= 5 && `Combo ${g.combo}`].filter(Boolean).join(' · '); if (box.textContent !== t) box.textContent = t; },
    pista: (g) => g.nivel < 3 ? 0 : g.nivel < 6 ? 1 : 2,
    nueva: (J) => {
      const g = J.g;
      Object.assign(g, { nivel: 1, score: 0, vidas: J.tiene('vida') ? 4 : 3, ladrillos: 0, perfectos: 0, racha: 0, mejorRacha: 0, combo: 0, px: BW / 2, tAncha: 0, tLenta: 0, tFuego: 0, tX2: 0, red: J.tiene('red'), caps: [], part: [], izq: false, der: false });
      g.ladr = crearLadrillos(1); g.vivos = g.ladr.length; g.vidasNivel = g.vidas; pegaBola(J);
      J.alPausar = () => { g.izq = false; g.der = false; };
    },
    actualiza: (J, dt) => {
      const g = J.g;
      ['tAncha', 'tLenta', 'tFuego', 'tX2'].forEach(k => { if (g[k] > 0) g[k] = Math.max(0, g[k] - dt); });
      const pw = anchoPala(J);
      if (g.izq || g.der) g.px = clamp(g.px + ((g.der ? 1 : 0) - (g.izq ? 1 : 0)) * 430 * dt, pw / 2, BW - pw / 2); else g.px = clamp(g.px, pw / 2, BW - pw / 2);
      g.part = g.part.filter(p => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; return p.t > 0; });
      g.caps = g.caps.filter(c => { c.y += 95 * dt; if (c.y + 8 >= PY && c.y - 8 <= PY + PH && Math.abs(c.x - g.px) <= pw / 2 + 8) { aplicaCapsula(J, c.tipo); return false; } return c.y < BH + 10; });
      if (g.espera) { g.bolas.forEach(b => { b.x = g.px; b.y = PY - BRAD - 1; }); return; }
      const vm = g.tLenta > 0 ? 0.7 : 1;
      for (const b of [...g.bolas]) {
        const pasos = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * vm * dt / 3));
        for (let i = 0; i < pasos && !b.fuera; i++) {
          b.x += b.vx * vm * dt / pasos; b.y += b.vy * vm * dt / pasos;
          if (b.x < BRAD) { b.x = BRAD; b.vx = Math.abs(b.vx); sfx('rebote'); } else if (b.x > BW - BRAD) { b.x = BW - BRAD; b.vx = -Math.abs(b.vx); sfx('rebote'); }
          if (b.y < BRAD) { b.y = BRAD; b.vy = Math.abs(b.vy); sfx('rebote'); }
          if (b.vy > 0 && b.y + BRAD >= PY && b.y - BRAD <= PY + PH && Math.abs(b.x - g.px) <= pw / 2 + BRAD) {
            const off = clamp((b.x - g.px) / (pw / 2), -1, 1), a = off * 62 * Math.PI / 180, v = Math.min(480, Math.hypot(b.vx, b.vy) + 3);
            b.vx = Math.sin(a) * v; b.vy = -Math.cos(a) * v; b.y = PY - BRAD; g.combo = 0; sfx('pala');
          }
          if (b.y > BH + BRAD) {
            if (g.red) { g.red = false; b.vy = -Math.abs(b.vy); b.y = BH - 8; sfx('pala'); J.aviso('Red usada'); } else b.fuera = true;
            continue;
          }
          for (const l of g.ladr) {
            if (!l.vivo) continue;
            const cx = clamp(b.x, l.x, l.x + LW), cy = clamp(b.y, l.y, l.y + LH), dx = b.x - cx, dy = b.y - cy;
            if (dx * dx + dy * dy > BRAD * BRAD) continue;
            if (g.tFuego > 0) { l.hp = 1; ladrilloRoto(J, l, l.r); }
            else {
              if (Math.abs(dx) > Math.abs(dy) || (dx === 0 && dy === 0 && Math.abs(b.vx) > Math.abs(b.vy))) { b.vx = dx >= 0 ? Math.abs(b.vx) : -Math.abs(b.vx); b.x += dx >= 0 ? 1 : -1; } else { b.vy = dy >= 0 ? Math.abs(b.vy) : -Math.abs(b.vy); b.y += dy >= 0 ? 1 : -1; }
              ladrilloRoto(J, l, l.r); break;
            }
          }
          if (g.vivos <= 0) break;
        }
        if (g.vivos <= 0) break;
      }
      if (g.vivos <= 0) { nivelCompleto(J); return; }
      g.bolas = g.bolas.filter(b => !b.fuera);
      if (!g.bolas.length) pierdeVida(J);
    },
    resultado: (J) => ({ score: J.g.score, bricks: J.g.ladrillos, level: J.g.nivel, perfect: J.g.perfectos, perfectRun: J.g.mejorRacha, powerups: J.g.poderes }),
    tituloFin: (r) => r.ended === 'abandono' ? 'Partida terminada' : 'Sin vidas',
    resumenFin: (r) => `Nivel ${r.level} · ${r.bricks} ladrillos · ${r.perfect} niveles perfectos`,
    statsTarjeta: (r) => [[r.level, 'NIVEL'], [r.bricks, 'LADRILLOS'], [r.perfect, 'PERFECTOS'], [mmss(r.duration), 'TIEMPO']],
    tecla: (J, e) => {
      const g = J.g; if (!g) return false;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { g.izq = true; return true; }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { g.der = true; return true; }
      if (e.key === ' ' || e.key === 'ArrowUp') { lanza(J); return true; }
      return false;
    },
    entrada: (J, area) => {
      const alX = (e) => { const r = J.R.cv.getBoundingClientRect(); return (e.clientX - r.left) / J.esc; };
      area.addEventListener('pointerdown', (e) => { if (!J.enJuego()) return; e.preventDefault(); try { area.setPointerCapture(e.pointerId); } catch { /* ya no está */ } J.g.px = alX(e); lanza(J); });
      area.addEventListener('pointermove', (e) => { if (!J.enJuego()) return; if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch' || e.pointerType === 'pen') { J.g.px = alX(e); } });
      addEventListener('keyup', (e) => { const g = J.g; if (!g) return; if (['ArrowLeft', 'a', 'A'].includes(e.key)) g.izq = false; if (['ArrowRight', 'd', 'D'].includes(e.key)) g.der = false; });
    },
    dibuja: (J, x) => {
      const g = J.g; const sk = skin();
      if (!g) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(BW / 2 - 32, PY, 64, PH); return; }
      g.ladr.forEach(l => {
        if (!l.vivo) return; const col = sk.colores[l.r % 7];
        x.fillStyle = col; x.beginPath(); x.roundRect(l.x, l.y, LW, LH, 4); x.fill();
        if (sk.estilo === 'brillo') { x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(l.x + 2, l.y + 2, LW - 4, 4); }
        if (l.hp > 1) { x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath(); x.roundRect(l.x + 1, l.y + 1, LW - 2, LH - 2, 3); x.stroke(); }
      });
      g.part.forEach(p => { x.globalAlpha = Math.max(0, p.t * 2); x.fillStyle = sk.colores[p.c % 7]; x.fillRect(p.x - 2, p.y - 2, 4, 4); }); x.globalAlpha = 1;
      g.caps.forEach(c => { x.fillStyle = { ancha: '#22d3ee', lenta: '#a855f7', multi: '#facc15' }[c.tipo]; x.beginPath(); x.roundRect(c.x - 10, c.y - 6, 20, 12, 6); x.fill(); x.fillStyle = '#06101f'; x.font = '800 9px system-ui'; x.textAlign = 'center'; x.fillText({ ancha: '↔', lenta: '◔', multi: '3' }[c.tipo], c.x, c.y + 3.5); });
      if (g.red) { x.fillStyle = 'rgba(34,211,238,.55)'; x.fillRect(0, BH - 5, BW, 3); }
      const pw = anchoPala(J); const gr = x.createLinearGradient(0, PY, 0, PY + PH); gr.addColorStop(0, '#e2e8f0'); gr.addColorStop(1, '#64748b');
      x.fillStyle = g.tAncha > 0 ? '#22d3ee' : gr; x.beginPath(); x.roundRect(g.px - pw / 2, PY, pw, PH, 5); x.fill();
      g.bolas.forEach(b => { x.save(); if (g.tFuego > 0) { x.shadowColor = '#f97316'; x.shadowBlur = 14; x.fillStyle = '#fb923c'; } else { x.shadowColor = '#fff'; x.shadowBlur = 8; x.fillStyle = '#fff'; } x.beginPath(); x.arc(b.x, b.y, BRAD, 0, Math.PI * 2); x.fill(); x.restore(); });
      if (g.espera && g.estado === 'juego') { x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '600 14px system-ui'; x.textAlign = 'center'; x.fillText('Toca para lanzar', BW / 2, PY - 40); }
    },
  });
  K.arcade = { g2048: J2048, breakout: JBreak };

  Object.assign(C, { BW, BH, PY, PH, BRAD, COLS, LW, LH, LG, BX0, BY0, crearLadrillos, velBase, anchoPala, pegaBola, lanza, ladrilloRoto, nivelCompleto, pierdeVida, aplicaCapsula, multibola, JBreak });
})();
