'use strict';
/* tetris/entrada.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { AU, EST, G, PODERES, R, S } = C;
  const ajusta = (...a) => C.ajusta(...a);
  const baja = (...a) => C.baja(...a);
  const cae = (...a) => C.cae(...a);
  const enJuego = (...a) => C.enJuego(...a);
  const gira = (...a) => C.gira(...a);
  const guardaAudio = (...a) => C.guardaAudio(...a);
  const muestraPausa = (...a) => C.muestraPausa(...a);
  const mueve = (...a) => C.mueve(...a);
  const nivelJugador = (...a) => C.nivelJugador(...a);
  const reserva = (...a) => C.reserva(...a);
  const usa = (...a) => C.usa(...a);

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
    if (!S.abierta || !EST.g) return;
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (abajo && !e.repeat) pausa(); return; }
    if (EST.g.estado !== 'juego') { if (abajo && (e.code === 'Space' || e.code === 'Enter') && EST.g.estado === 'pausa') { e.preventDefault(); sigue(); } return; }
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
    const rebasa = (x, y) => { gs.ax = x; gs.ay = y; gs.col0 = EST.g.cur ? EST.g.cur.x : 0; gs.pieza = EST.g.cur ? EST.g.cur.t + ':' + EST.g.piezas : ''; gs.cae = false; };
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
      if (gs.pieza !== EST.g.cur.t + ':' + EST.g.piezas) rebasa(e.clientX, e.clientY);   // salió otra pieza: se sigue desde donde está el dedo
      if (gs.cae) return;
      const ahora = performance.now();
      gs.lx = e.clientX; gs.ly = e.clientY;
      gs.mues.push([ahora, e.clientY]); while (gs.mues.length > 1 && ahora - gs.mues[0][0] > 90) gs.mues.shift();
      const dx = e.clientX - gs.ax, dy = e.clientY - gs.ay;
      // zona muerta: un toque tembloroso no debe mover la pieza
      if (!gs.movido && Math.hypot(e.clientX - gs.x, e.clientY - gs.y) < 9) return;
      gs.movido = true;
      // columna objetivo según el dedo (con un poco de histéresis para que no baile entre dos columnas)
      const pasos = dx / EST.celda, entero = Math.trunc(pasos), resto = Math.abs(pasos - entero);
      const objetivo = gs.col0 + entero + (resto > 0.62 ? Math.sign(pasos) : 0);
      let guarda = 12;
      while (EST.g.cur.x !== objetivo && guarda-- > 0) {
        const antes = EST.g.cur.x; mueve(Math.sign(objetivo - EST.g.cur.x));
        if (EST.g.cur.x === antes) break;   // pared o bloque
      }
      // bajar con el dedo: un paso por cada ~0,8 celda, con más margen para no bajar sin querer al mover de lado
      const pasoY = EST.celda * 0.8, extra = Math.abs(dx) > EST.celda * 1.2 ? EST.celda * 0.5 : 0;
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
      if (enMovimiento && v > 0.7 && dy > EST.celda * 1.5 && Math.abs(dx) < Math.abs(dy) * 1.2) { cae(); vib(14); }
      else if (enMovimiento && v < -0.7 && dy < -EST.celda * 2 && Math.abs(dx) < Math.abs(dy)) { reserva(); vib(10); }
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
    if (!EST.g || EST.g.estado !== 'juego') return;
    EST.g.estado = 'pausa'; paraRepeticiones(); muestraPausa();
  }
  function sigue() { if (!EST.g || EST.g.estado !== 'pausa') return; EST.g.estado = 'juego'; R.ov.hidden = true; EST.ultimo = performance.now(); }

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
    window.addEventListener('blur', () => { if (EST.g && EST.g.estado === 'juego') pausa(); });
    S.built = true;
  }


  Object.assign(C, { reps, repite, paraRep, paraRepeticiones, TECLAS, accion, teclado, gestos, boton, pausa, sigue, build });
})();
