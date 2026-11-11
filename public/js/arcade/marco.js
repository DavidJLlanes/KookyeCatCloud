'use strict';
/* arcade/marco.js: parte del módulo (se carga con el resto de arcade/ en index.html). Comparte el espacio K._arcade. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._arcade = K._arcade || {});
  const { AU, EST, G } = C;
  const audioInit = (...a) => C.audioInit(...a);
  const clamp = (...a) => C.clamp(...a);
  const fondoCols = (...a) => C.fondoCols(...a);
  const guardaAudio = (...a) => C.guardaAudio(...a);
  const hoyLocal = (...a) => C.hoyLocal(...a);
  const nivelJugador = (...a) => C.nivelJugador(...a);
  const sfx = (...a) => C.sfx(...a);

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
        J.abierta = true; EST.activo = J; document.body.classList.add('tt-inmersivo');
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


  Object.assign(C, { fabrica });
})();
