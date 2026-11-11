'use strict';
/* tetris/pantallas.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});
  const { AU, EST, G, PASIVOS, PODERES, R, S, cache } = C;
  const ajusta = (...a) => C.ajusta(...a);
  const audioInit = (...a) => C.audioInit(...a);
  const bucle = (...a) => C.bucle(...a);
  const build = (...a) => C.build(...a);
  const fin = (...a) => C.fin(...a);
  const guardaAudio = (...a) => C.guardaAudio(...a);
  const musicaTick = (...a) => C.musicaTick(...a);
  const nivelJugador = (...a) => C.nivelJugador(...a);
  const nueva = (...a) => C.nueva(...a);
  const paraRepeticiones = (...a) => C.paraRepeticiones(...a);
  const pausa = (...a) => C.pausa(...a);
  const sigue = (...a) => C.sigue(...a);

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
    const b = el('button', 'btn', 'Terminar partida'); b.type = 'button'; b.addEventListener('click', () => { R.ov.hidden = true; EST.g.estado = 'juego'; fin('abandono'); });
    c.append(a, b);
  }
  function muestraFin(d) {
    const r = EST.g.resultado; const c = ovBase(EST.g.resultado.ended === 'top' ? 'Sin sitio' : EST.g.resultado.ended === 'abandono' ? 'Partida terminada' : '¡Tiempo!');
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
      sh.addEventListener('click', () => G.tarjeta('tetris', { resultado: r, record: d.record, tablero: EST.g.tablero }));
      c.appendChild(sh);
    }
  }
  function empieza() { audioInit(); nueva(); R.ov.hidden = true; EST.ultimo = performance.now(); Object.keys(cache).forEach(k => delete cache[k]); R.cv.focus && R.cv.blur(); }

  K.registerView('tetris', {
    async open() {
      if (!S.built) build();
      S.abierta = true;
      document.body.classList.add('tt-inmersivo');
      setTimeout(ajusta, 0);
      if (!G.state) await G.load();
      if (!EST.g || EST.g.estado === 'fin') { EST.g = null; muestraInicio(); } else if (EST.g.estado === 'juego') pausa();
      if (!EST.raf) { EST.ultimo = performance.now(); EST.raf = requestAnimationFrame(bucle); }
      if (!EST.tickMus) EST.tickMus = setInterval(musicaTick, 100);
      setTimeout(ajusta, 80);
    },
    close() {
      S.abierta = false; document.body.classList.remove('tt-inmersivo'); paraRepeticiones();
      if (EST.g && EST.g.estado === 'juego') pausa();
      cancelAnimationFrame(EST.raf); EST.raf = 0;
      clearInterval(EST.tickMus); EST.tickMus = 0; if (EST.mus) { EST.mus.pause(); EST.volAct = 0; }
    },
  });

  Object.assign(C, { ovBase, listaPoderes, muestraInicio, muestraPausa, muestraFin, empieza });
})();
