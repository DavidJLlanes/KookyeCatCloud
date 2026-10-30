'use strict';
/* 2048 y Breakout: mismo diseño, controles táctiles, música, energía y potenciadores que el Tetris.
   Los potenciadores se desbloquean con el nivel de la cuenta y los resultados cuentan para XP, monedas y logros. */
(function () {
  if (!window.K || !K.game) return;
  const G = K.game;
  const nivelJugador = () => (G.state ? G.state.nivel : 1);
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hoyLocal = () => { const f = new Date(); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };

  /* ---------- Sonido (compartido: mismos ajustes que el Tetris) ---------- */
  const AU = { musica: true, efectos: true, vol: 0.6 };
  try { Object.assign(AU, JSON.parse(localStorage.getItem('kcc-tt-audio') || '{}')); } catch { /* sin almacenamiento */ }
  const guardaAudio = () => { try { localStorage.setItem('kcc-tt-audio', JSON.stringify(AU)); } catch { /* da igual */ } };
  const PISTAS = ['calma', 'chip', 'trance'];
  let ac = null, mus = null, pistaAct = -1, volAct = 0;
  function audioInit() {
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
  let activo = null;
  function musicaTick() {
    if (!mus) return;
    const J = activo; const g = J && J.g;
    const quiere = !!(AU.musica && g && g.estado === 'juego' && J.abierta);
    const pista = g ? J.cfg.pista(g) : 0;
    const objetivo = quiere ? AU.vol * 0.55 : 0;
    if (quiere && pista !== pistaAct) {
      if (volAct > 0.02) volAct = Math.max(0, volAct - 0.12);
      if (volAct <= 0.02) { pistaAct = pista; mus.src = `${BASE}/audio/${PISTAS[pista]}.mp3`; mus.currentTime = 0; }
    }
    volAct += Math.max(-0.1, Math.min(0.04, objetivo - volAct));
    mus.volume = Math.max(0, Math.min(1, volAct));
    if (quiere && mus.paused) mus.play().catch(() => {});
    else if (!quiere && volAct <= 0.005 && !mus.paused) mus.pause();
  }
  setInterval(musicaTick, 100);

  const skin = () => { const s = G.puesto('skin'); return s && s.colores ? s : { colores: ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'], estilo: 'normal' }; };
  const fondoCols = () => { const f = G.puesto('fondo'); return f && f.colores ? f : { colores: ['#070b16', '#0d1424'] }; };
  const luz = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };

  /* ---------- Marco común de los juegos ---------- */
  function fabrica(cfg) {
    const J = { cfg, g: null, abierta: false, built: false, R: {}, cache: {}, esc: 1 };
    const R = J.R;
    let raf = 0, ultimo = 0, avisoT = 0;
    const tiene = (id) => { const p = cfg.pasivos.find(x => x.id === id); return !!p && p.nivel <= nivelJugador(); };
    J.tiene = tiene;
    J.enJuego = () => J.g && J.g.estado === 'juego';
    J.aviso = (...t) => {
      const txt = t.filter(Boolean).join(' · '); if (!txt || !R.aviso) return;
      R.aviso.textContent = txt; R.aviso.classList.remove('on'); void R.aviso.offsetWidth; R.aviso.classList.add('on');
      clearTimeout(avisoT); avisoT = setTimeout(() => R.aviso.classList.remove('on'), 1100);
    };
    J.sfx = sfx;
    J.ganaEnergia = (n) => {
      const g = J.g; g.cont += n; const um = cfg.umbral(J);
      while (g.cont >= um) { g.cont -= um; if (g.energia < 5) { g.energia++; sfx('aviso'); } }
    };
    function usa(id) {
      const g = J.g; if (!J.enJuego()) return;
      const p = cfg.poderes.find(x => x.id === id); if (!p || p.nivel > nivelJugador()) return;
      if (g.energia < p.coste) { J.aviso('Falta energía'); return; }
      if (p.usa(J) === false) return;
      g.energia -= p.coste; g.poderes++; sfx('poder'); J.aviso(p.nombre);
    }
    J.usa = usa;
    const pon = (k, nodo, v) => { if (J.cache[k] !== v) { J.cache[k] = v; nodo.textContent = v; } };
    function hud() {
      const g = J.g; if (!g) return;
      cfg.hud.forEach((h, i) => pon('h' + i, R.hud[i], h.valor(g, J)));
      R.pips.forEach((p, i) => p.classList.toggle('on', i < g.energia));
      const niv = nivelJugador();
      R.poderes.forEach(({ btn, p }) => { btn.classList.toggle('lista', g.energia >= p.coste); btn.classList.toggle('bloq', p.nivel > niv); });
      if (cfg.chips) cfg.chips(J, R.chips);
    }
    function ajusta() {
      if (!R.cv) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const zonaW = R.zona.clientWidth || 360;
      const top = R.zona.getBoundingClientRect().top;
      const hudH = R.zona.querySelector('.tt-hud').offsetHeight + R.pips[0].parentElement.parentElement.offsetHeight;
      const libreAlto = window.innerHeight - top - R.panelInf.offsetHeight - hudH - 22;
      let w = Math.min(zonaW - 4, cfg.maxAncho || 460);
      let h = w * cfg.H / cfg.W;
      if (h > libreAlto) { h = Math.max(200, libreAlto); w = h * cfg.W / cfg.H; }
      w = Math.floor(w); h = Math.floor(h);
      R.cv.style.width = w + 'px'; R.cv.style.height = h + 'px';
      R.cv.width = Math.round(w * dpr); R.cv.height = Math.round(h * dpr);
      J.esc = w / cfg.W; J.dpr = dpr;
      R.zona.style.setProperty('--lado', '0px'); R.zona.style.setProperty('--bw', w + 'px'); R.zona.style.setProperty('--bh', h + 'px');
      R.zona.style.setProperty('--ancho', w + 'px');
      dibuja();
    }
    J.ajusta = ajusta;
    function dibuja() {
      if (!R.ctx) return;
      const x = R.ctx; x.setTransform(J.dpr * J.esc, 0, 0, J.dpr * J.esc, 0, 0);
      const f = fondoCols(); const gr = x.createLinearGradient(0, 0, 0, cfg.H); gr.addColorStop(0, f.colores[0]); gr.addColorStop(1, f.colores[1]);
      x.fillStyle = gr; x.fillRect(0, 0, cfg.W, cfg.H);
      if (f.estilo === 'rejilla') { x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1; for (let i = 0; i <= cfg.W; i += 30) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, cfg.H); x.stroke(); } for (let i = 0; i <= cfg.H; i += 30) { x.beginPath(); x.moveTo(0, i); x.lineTo(cfg.W, i); x.stroke(); } }
      cfg.dibuja(J, x);
    }
    function bucle(t) {
      raf = requestAnimationFrame(bucle);
      const dt = clamp((t - ultimo) / 1000, 0, 0.05); ultimo = t;
      const g = J.g;
      if (g && g.estado === 'juego') { g.jugado += dt; cfg.actualiza(J, dt); }
      dibuja(); hud();
    }
    /* ---- Fin ---- */
    async function fin(motivo) {
      const g = J.g; if (!g || g.estado === 'fin') return;
      g.estado = 'fin'; sfx(motivo === 'abandono' ? 'aviso' : 'fin');
      const res = cfg.resultado(J, motivo); res.duration = Math.round(g.jugado); res.ended = motivo; g.resultado = res;
      try { g.foto = document.createElement('canvas'); g.foto.width = R.cv.width; g.foto.height = R.cv.height; g.foto.getContext('2d').drawImage(R.cv, 0, 0); } catch { g.foto = null; }
      muestraFin(null);
      if (res.duration < 5) { muestraFin({ corta: true }); return; }
      try {
        const d = await K.post(`/api/game/arcade/${cfg.id}`, { ...res, day: hoyLocal(), bonusMonedas: tiene('monedas') });
        G.set(d); muestraFin(d);
      } catch (e) { K.fail(e); muestraFin({ error: true }); }
    }
    J.fin = fin;
    /* ---- Pantallas ---- */
    function ovBase(titulo) {
      R.ov.hidden = false; R.ov.textContent = '';
      const c = el('div', 'tt-ov-c'); if (titulo) c.appendChild(el('h3', null, titulo)); R.ov.appendChild(c); return c;
    }
    function listaPoderes(c) {
      const niv = nivelJugador(); const box = el('div', 'tt-lista');
      [...cfg.poderes.map(p => ({ ...p, tipo: 'Activo' })), ...cfg.pasivos.map(p => ({ ...p, tipo: 'Pasivo' }))].sort((a, b) => a.nivel - b.nivel).forEach(p => {
        const f = el('div', 'tt-lp' + (p.nivel > niv ? ' bloq' : '')); f.append(G.gi(p.icono));
        const tx = el('div'); tx.append(el('b', null, p.nombre), el('span', 'k-faint', p.nivel > niv ? `Nivel ${p.nivel}` : p.txt)); f.appendChild(tx); box.appendChild(f);
      });
      c.appendChild(box);
    }
    function muestraInicio() {
      const c = ovBase(cfg.titulo); const s = G.state; const rec = s && s.arcade && s.arcade[cfg.id] ? s.arcade[cfg.id].mejor : 0;
      c.appendChild(el('p', 'tt-ayuda', s ? `Nivel ${s.nivel} · ${s.rango.nombre} · Récord ${rec.toLocaleString('es')}` : 'Cargando tu progreso…'));
      const jug = el('button', 'btn primary tt-jugar', 'Jugar'); jug.type = 'button'; jug.addEventListener('click', empieza); c.appendChild(jug);
      c.appendChild(el('p', 'tt-ayuda k-faint', cfg.intro));
      const vol = el('label', 'tt-vol'); vol.append(el('span', null, 'Volumen')); const rng = el('input'); rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.05'; rng.value = String(AU.vol);
      rng.addEventListener('input', () => { AU.vol = +rng.value; guardaAudio(); }); vol.appendChild(rng); c.appendChild(vol);
      const det = el('details'); det.appendChild(el('summary', null, 'Controles y potenciadores'));
      const ctl = el('p', 'k-faint tt-ayuda'); ctl.textContent = cfg.controles; det.append(ctl); listaPoderes(det); c.appendChild(det);
    }
    function muestraPausa() {
      const c = ovBase('Pausa');
      const a = el('button', 'btn primary tt-jugar', 'Continuar'); a.type = 'button'; a.addEventListener('click', sigue);
      const b = el('button', 'btn', 'Terminar partida'); b.type = 'button'; b.addEventListener('click', () => { R.ov.hidden = true; J.g.estado = 'juego'; fin('abandono'); });
      c.append(a, b);
    }
    function muestraFin(d) {
      const r = J.g.resultado; const c = ovBase(cfg.tituloFin(r));
      c.appendChild(el('div', 'tt-final', r.score.toLocaleString('es')));
      c.appendChild(el('p', 'tt-ayuda', cfg.resumenFin(r)));
      if (d && d.record) c.appendChild(el('p', 'tt-record', '🏆 ¡Nuevo récord!'));
      if (d && d.ganado) c.appendChild(el('p', 'tt-ayuda', `+${d.ganado.xp} XP · +${d.ganado.monedas} monedas`));
      else if (d && d.corta) c.appendChild(el('p', 'tt-ayuda k-faint', 'Partida demasiado corta para contar'));
      else if (d && d.error) c.appendChild(el('p', 'tt-ayuda k-faint', 'No se pudo guardar el resultado'));
      else if (!d) c.appendChild(el('p', 'tt-ayuda k-faint', 'Guardando…'));
      const otra = el('button', 'btn primary tt-jugar', 'Jugar otra vez'); otra.type = 'button'; otra.addEventListener('click', empieza); c.appendChild(otra);
      if (d && d.ganado) { const sh = el('button', 'btn', 'Compartir puntuación'); sh.type = 'button'; sh.addEventListener('click', () => tarjeta(r, d.record)); c.appendChild(sh); }
    }
    async function tarjeta(r, record) {
      try {
        const L = await G.lienzo(`KOOKYECATCLOUD · ${cfg.titulo.toUpperCase()}`); const { cv, x, rr, FUENTE, W, H, rango, usuario } = L; const s = G.state;
        x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `700 46px ${FUENTE}`; x.fillText(usuario, W / 2, 180);
        x.fillStyle = '#9fb0d6'; x.font = `500 30px ${FUENTE}`; x.fillText(`Nivel ${s.nivel} · ${rango.nombre}`, W / 2, 226);
        x.fillStyle = '#fff'; x.font = `900 150px ${FUENTE}`; x.fillText(r.score.toLocaleString('es'), W / 2, 400);
        x.fillStyle = record ? '#facc15' : '#9fb0d6'; x.font = `700 36px ${FUENTE}`; x.fillText(record ? '🏆 NUEVO RÉCORD' : `Récord personal ${((s.arcade[cfg.id] || {}).mejor || 0).toLocaleString('es')}`, W / 2, 462);
        const foto = J.g && J.g.foto;
        if (foto) {
          const ah = 560, aw = Math.min(700, ah * foto.width / foto.height), px = (W - aw) / 2, py = 500;
          x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 40; rr(x, px, py, aw, ah, 24); x.fillStyle = '#0b1020'; x.fill(); x.restore();
          x.save(); rr(x, px, py, aw, ah, 24); x.clip(); x.drawImage(foto, px, py, aw, ah); x.restore();
        }
        const st = cfg.statsTarjeta(r); const bw = 230, sep = 18, tot = st.length * bw + (st.length - 1) * sep; let bx = (W - tot) / 2;
        st.forEach(([v, e]) => { x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, bx, 1110, bw, 120, 22); x.fill(); x.fillStyle = '#fff'; x.font = `800 40px ${FUENTE}`; x.textAlign = 'center'; x.fillText(String(v), bx + bw / 2, 1170); x.fillStyle = '#9fb0d6'; x.font = `600 20px ${FUENTE}`; x.fillText(e, bx + bw / 2, 1207); bx += bw + sep; });
        x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.textAlign = 'center'; x.fillText('KookyeCatCloud', W / 2, H - 50);
        await G.muestraTarjeta(cv, `${cfg.id}-${r.score}.png`, 'Tu puntuación');
      } catch (e) { K.fail(e); }
    }
    function pausa() { if (!J.g || J.g.estado !== 'juego') return; J.g.estado = 'pausa'; if (J.alPausar) J.alPausar(); muestraPausa(); }
    function sigue() { if (!J.g || J.g.estado !== 'pausa') return; J.g.estado = 'juego'; R.ov.hidden = true; ultimo = performance.now(); }
    J.pausa = pausa;
    function empieza() { audioInit(); J.g = { estado: 'juego', jugado: 0, energia: 0, cont: 0, poderes: 0 }; cfg.nueva(J); R.ov.hidden = true; ultimo = performance.now(); J.cache = {}; ajusta(); }
    /* ---- Construcción ---- */
    function boton(txt, cls, onDown, etiqueta) {
      const b = el('button', 'tt-btn ' + cls); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', etiqueta);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); onDown(); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('on')));
      return b;
    }
    function build() {
      const v = $('view-' + cfg.vista); v.textContent = '';
      const head = el('div', 'tt-gamebar');
      const salir = el('button', 'tt-salir'); salir.type = 'button'; salir.setAttribute('aria-label', `Salir de ${cfg.titulo} y volver a la aplicación`);
      salir.append(el('span', 'tt-salir-icon', '←'), el('span', null, 'Volver a la app')); salir.addEventListener('click', () => switchTab('files')); head.appendChild(salir);
      const zona = el('div', 'tt-zona ar-zona');
      const hudBar = el('div', 'tt-hud'); const celdas = cfg.hud.map(h => { const c = el('div'); const val = el('b', null, h.ini || '0'); c.append(el('span', null, h.nombre), val); hudBar.appendChild(c); return val; });
      const bPausa = el('button', 'tt-pausa'); bPausa.type = 'button'; bPausa.textContent = 'II'; bPausa.setAttribute('aria-label', 'Pausa'); bPausa.addEventListener('click', pausa); hudBar.appendChild(bPausa);
      const bMudo = el('button', 'tt-pausa tt-mudo'); bMudo.type = 'button'; const pintaMudo = () => { const mudo = !AU.musica && !AU.efectos; bMudo.textContent = mudo ? '🔇' : '🔊'; bMudo.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar'); bMudo.title = mudo ? 'Activar sonido' : 'Silenciar todo el audio'; }; pintaMudo();
      bMudo.addEventListener('click', () => { const mudo = !AU.musica && !AU.efectos; AU.musica = AU.efectos = mudo; guardaAudio(); pintaMudo(); bMudo.blur(); }); hudBar.appendChild(bMudo);
      const en = el('div', 'ar-energia'); en.title = 'Energía: se carga jugando y se gasta en potenciadores'; en.appendChild(el('span', null, 'Energía'));
      const pipsBox = el('div'); const pips = [0, 1, 2, 3, 4].map(() => { const i = el('i'); pipsBox.appendChild(i); return i; }); en.appendChild(pipsBox);
      const chips = el('div', 'ar-chips'); en.appendChild(chips);
      const centro = el('div', 'tt-centro ar-centro'); const cv = el('canvas', 'tt-cv'); const ctx = cv.getContext('2d');
      const avisoEl = el('div', 'tt-aviso'); const ov = el('div', 'tt-ov'); ov.hidden = true; centro.append(cv, avisoEl, ov);
      const inf = el('div', 'tt-inf');
      const barra = el('div', 'tt-poderes');
      const poderes = cfg.poderes.map((p, i) => {
        const b = el('button', 'tt-poder'); b.type = 'button'; b.title = `${p.nombre}: ${p.txt} (energía ${p.coste}${p.nivel > 1 ? `, nivel ${p.nivel}` : ''}) · tecla ${i + 1}`;
        b.append(G.gi(p.icono), el('span', null, String(p.coste))); b.addEventListener('click', () => usa(p.id)); barra.appendChild(b); return { btn: b, p };
      });
      inf.appendChild(barra);
      if (cfg.botones) { const ctl = el('div', 'tt-ctl ar-ctl'); cfg.botones.forEach(([t, cls, fn, et]) => ctl.appendChild(boton(t, cls, () => J.enJuego() && fn(J), et))); inf.appendChild(ctl); }
      zona.append(hudBar, en, centro, inf); v.append(head, zona);
      Object.assign(R, { zona, cv, ctx, ov, aviso: avisoEl, hud: celdas, pips, chips, poderes, panelInf: inf, centro });
      cfg.entrada(J, centro);
      addEventListener('resize', () => { if (J.abierta) ajusta(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && J.abierta) pausa(); });
      addEventListener('blur', () => { if (J.abierta) pausa(); });
      addEventListener('keydown', (e) => {
        if (!J.abierta || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (J.g && J.g.estado === 'juego') pausa(); else if (J.g && J.g.estado === 'pausa') sigue(); return; }
        const m = /^[1-9]$/.test(e.key) ? +e.key : 0;
        if (m && J.enJuego()) { const lista = cfg.poderes.filter(p => p.nivel <= nivelJugador()); if (lista[m - 1]) { e.preventDefault(); usa(lista[m - 1].id); } return; }
        if (cfg.tecla && cfg.tecla(J, e)) e.preventDefault();
      });
      J.built = true;
    }
    K.registerView(cfg.vista.replace('view-', ''), {
      async open() {
        if (!J.built) build();
        J.abierta = true; activo = J; document.body.classList.add('tt-inmersivo');
        setTimeout(ajusta, 0);
        if (!G.state) await G.load();
        if (!J.g || J.g.estado === 'fin') { J.g = null; muestraInicio(); } else if (J.g.estado === 'juego') pausa();
        if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(bucle); }
        setTimeout(ajusta, 80);
      },
      close() {
        J.abierta = false; document.body.classList.remove('tt-inmersivo'); if (J.alPausar) J.alPausar();
        if (J.g && J.g.estado === 'juego') pausa();
        cancelAnimationFrame(raf); raf = 0;
      },
    });
    return J;
  }

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
})();
