'use strict';
/* Gamificación: pestaña "Logros" (perfil, retos semanales, logros, tienda de cosméticos), medición del tiempo de uso,
   avisos de logros y la tarjeta para compartir como imagen. El Tetris (js/tetris.js) usa también este módulo.
   Todo se calcula en el servidor (lib/game.js); aquí solo se pinta lo que devuelve. */
(function () {
  if (!window.K) return;
  const G = K.game = { state: null };
  const SPRITE = () => `${BASE}/vendor/gameicons/gameicons.svg`;
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const logueado = () => typeof state !== 'undefined' && !!state.user;
  const NS = 'http://www.w3.org/2000/svg';
  const TRAMO_COLOR = ['#b45309', '#94a3b8', '#eab308', '#22d3ee', '#a855f7'];   // bronce, plata, oro, platino, diamante

  // Icono del sprite de game-icons.net (se pinta con el color del texto)
  G.gi = (nombre, cls) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'gi' + (cls ? ' ' + cls : '')); svg.setAttribute('viewBox', '0 0 512 512'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use'); use.setAttribute('href', `${SPRITE()}#gi-${nombre}`);
    svg.appendChild(use); return svg;
  };
  // Para dibujar en un canvas: se lee el sprite una vez y se guardan los trazados
  let _trazados = null;
  G.trazados = async () => {
    if (_trazados) return _trazados;
    const txt = await (await fetch(SPRITE(), { credentials: 'same-origin' })).text();
    const mapa = {};
    for (const m of txt.matchAll(/<symbol id="gi-([\w-]+)"[^>]*>(.*?)<\/symbol>/g)) mapa[m[1]] = [...m[2].matchAll(/ d="([^"]+)"/g)].map(x => x[1]);
    return (_trazados = mapa);
  };

  /* ---------- Estado y avisos ---------- */
  const cola = []; let mostrando = false;
  function aviso(txt) {
    cola.push(txt);
    if (mostrando) return;
    mostrando = true;
    const sig = () => { const t = cola.shift(); if (!t) { mostrando = false; return; } K.toast(t); setTimeout(sig, 2700); };
    sig();
  }
  G.avisos = (nuevos) => {
    // Muchos logros de golpe (primera vez con contenido ya guardado) se resumen en un solo aviso
    const logros = (nuevos || []).filter(n => n.tipo === 'logro');
    if (logros.length > 3) {
      aviso(`🏆 ${logros.length} logros desbloqueados · +${logros.reduce((a, n) => a + n.xp, 0)} XP`);
      nuevos = nuevos.filter(n => n.tipo !== 'logro');
    }
    (nuevos || []).forEach(n => {
      if (n.tipo === 'logro') aviso(`🏆 ${n.nombre} · ${n.tramo} · +${n.xp} XP`);
      else if (n.tipo === 'nivel') aviso(`⬆️ ¡Nivel ${n.nivel}! Ahora eres ${n.rango}`);
      else if (n.tipo === 'reto') aviso(`✅ Reto cumplido: ${n.nombre} · +${n.xp} XP · +${n.monedas} monedas`);
      else if (n.tipo === 'semana') aviso(`🎉 ¡Semana completa! +${n.xp} XP · +${n.monedas} monedas`);
      else if (n.tipo === 'escudo') aviso('🛡️ Un escudo ha salvado tu racha');
      else if (n.tipo === 'diario') aviso(`🔥 ${n.nombre} · +${n.xp} XP`);
    });
  };
  G.set = (d) => {
    if (!d) return;
    G.state = d;
    if (d.nuevos && d.nuevos.length) G.avisos(d.nuevos);
    K.bus.emit('game', d);
    if (S.built && S.abierta) pinta();
  };
  G.load = async () => {
    try { G.set(await K.get('/api/game?' + K.qs({ day: hoy() }))); } catch (e) { /* sin sesión todavía */ }
    return G.state;
  };

  /* ---------- Tiempo de uso ---------- */
  // Cuenta solo el tiempo con la pestaña visible y actividad reciente, y avisa al servidor cada minuto
  let acum = 0, ultimaAct = Date.now(), primeraVez = true, enviando = false;
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove', 'scroll'].forEach(e => addEventListener(e, () => { ultimaAct = Date.now(); }, { passive: true, capture: true }));
  async function ping() {
    if (enviando) return;
    enviando = true;
    const seg = acum; acum = 0;
    try {
      const f = new Date();
      G.set(await K.post('/api/game/ping', { seconds: seg, day: hoy(), hour: f.getHours(), dow: f.getDay() }));
    } catch (e) { acum += seg; }   // si falla, se reintenta con el siguiente aviso
    enviando = false;
  }
  setInterval(() => {
    if (!logueado()) { primeraVez = true; return; }
    if (document.visibilityState === 'visible' && Date.now() - ultimaAct < 120000) acum += 15;
    if (primeraVez) { primeraVez = false; ping(); return; }
    if (acum >= 60) ping();
  }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && acum >= 30 && logueado()) ping(); });

  /* ---------- Utilidades ---------- */
  const horas = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  const num = (n) => Number(n).toLocaleString('es');
  const cosm = (id) => (G.state ? G.state.cosmeticos.find(c => c.id === id) : null);
  G.puesto = (tipo) => cosm(G.state && G.state.equipado[tipo]);
  const gradiente = (c) => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;

  /* ---------- Vista ---------- */
  const S = { built: false, abierta: false, tab: 'resumen', grupo: 'todos' };
  const R = {};
  try { S.tab = sessionStorage.getItem('kcc-game-tab') || 'resumen'; } catch { /* sin almacenamiento */ }

  function build() {
    const v = $('view-logros'); v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); t.append(el('h2', null, 'Logros'), el('p', 'sub', 'Sube de nivel usando la app y jugando: Tetris, 2048 y Breakout'));
    const jugar = el('button', 'btn'); jugar.type = 'button'; jugar.append(G.gi('gamepad', 'gi-sm'), el('span', 'lbl', 'Jugar al Tetris'));
    jugar.addEventListener('click', () => switchTab('tetris'));
    const j2 = el('button', 'btn'); j2.type = 'button'; j2.append(G.gi('cube', 'gi-sm'), el('span', 'lbl', '2048')); j2.addEventListener('click', () => switchTab('g2048'));
    const j3 = el('button', 'btn'); j3.type = 'button'; j3.append(G.gi('gamepad', 'gi-sm'), el('span', 'lbl', 'Breakout')); j3.addEventListener('click', () => switchTab('breakout'));
    head.append(t, el('span', 'grow'), jugar, j2, j3);
    const perfil = el('section', 'gm-perfil');
    const tabs = el('div', 'gm-tabs');
    [['resumen', 'Resumen'], ['logros', 'Logros'], ['tienda', 'Tienda']].forEach(([id, n]) => {
      const b = el('button', null, n); b.type = 'button'; b.dataset.tab = id;
      b.addEventListener('click', () => { S.tab = id; try { sessionStorage.setItem('kcc-game-tab', id); } catch { /* da igual */ } pinta(); });
      tabs.appendChild(b);
    });
    const cuerpo = el('div', 'gm-cuerpo');
    const pie = el('p', 'gm-creditos k-faint');
    pie.append('Iconos de ');
    const a = el('a', null, 'game-icons.net'); a.href = 'https://game-icons.net'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    pie.append(a, ' hechos por Lorc, Delapouite y Carl Olsen, con licencia CC BY 3.0.');
    v.append(head, perfil, tabs, cuerpo, pie);
    Object.assign(R, { perfil, tabs, cuerpo });
    S.built = true;
  }

  function marcoEstilo(nodo) {
    const m = G.puesto('marco');
    if (m && m.id !== 'marco-ninguno') { nodo.style.setProperty('--mc', gradiente(m.colores)); nodo.classList.add('con-marco'); }
  }

  function pintaPerfil() {
    const s = G.state, p = R.perfil; p.textContent = '';
    p.style.setProperty('--rango', s.rango.color);
    const ins = el('div', 'gm-insignia'); marcoEstilo(ins); ins.appendChild(G.gi(s.rango.icono));
    const col = el('div', 'gm-datos');
    const tit = G.puesto('titulo');
    const nombre = el('div', 'gm-nombre'); nombre.append(el('b', null, (typeof state !== 'undefined' && state.user && state.user.username) || ''), el('span', 'gm-titulo', tit ? tit.nombre : ''));
    const rango = el('div', 'gm-rango'); rango.append(el('span', null, `Nivel ${s.nivel}`), el('span', 'k-faint', ` · ${s.rango.nombre}`));
    const barra = el('div', 'gm-barra'); const rel = el('i'); rel.style.width = (s.maxNivel ? 100 : Math.round(s.xpNivel / s.xpSiguiente * 100)) + '%'; barra.appendChild(rel);
    const xp = el('div', 'gm-xp k-faint', s.maxNivel ? `${num(s.xp)} XP · nivel máximo` : `${num(s.xpNivel)} / ${num(s.xpSiguiente)} XP para el nivel ${s.nivel + 1}`);
    col.append(nombre, rango, barra, xp);
    const fichas = el('div', 'gm-fichas');
    const ficha = (ic, txt, tit2) => { const f = el('span', 'gm-ficha'); f.title = tit2 || ''; f.append(G.gi(ic, 'gi-sm'), el('b', null, txt)); return f; };
    fichas.append(
      ficha('flame', `${s.racha} día${s.racha === 1 ? '' : 's'}`, `Racha actual. Mejor: ${s.mejorRacha}`),
      ficha('shield', String(s.escudos), 'Escudos: salvan la racha si te saltas un día. Ganas uno cada 7 días seguidos (máximo 2)'),
      ficha('coins', num(s.monedas), 'Monedas'),
      ficha('trophy', `${s.logros.hechos}/${s.logros.total}`, 'Logros conseguidos'),
    );
    const acc = el('div', 'gm-acc');
    const comp = el('button', 'btn sm'); comp.type = 'button'; comp.append(icon('i-share'), el('span', null, 'Compartir'));
    comp.addEventListener('click', () => G.tarjeta('perfil'));
    acc.appendChild(comp);
    p.append(ins, col, fichas, acc);
  }

  const cuando = (t) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

  function pintaResumen(c) {
    const s = G.state;
    // Retos de la semana
    const sec = el('section', 'gm-sec');
    const h = el('h3'); h.append(G.gi('scroll', 'gi-sm'), el('span', null, 'Retos de la semana'));
    const sub = el('span', 'k-faint gm-h-sub', s.semana.bonus ? 'Semana completa' : `Completa los 3: +${s.semana.premioBonus.xp} XP y +${s.semana.premioBonus.monedas} monedas`);
    h.appendChild(sub); sec.appendChild(h);
    const lista = el('div', 'gm-retos');
    s.semana.retos.forEach(r => {
      const t = el('div', 'gm-reto' + (r.hecho ? ' hecho' : ''));
      const ic = el('div', 'gm-reto-ic'); ic.appendChild(G.gi(r.icono));
      const cu = el('div', 'gm-reto-cu'); cu.appendChild(el('b', null, r.texto));
      const barra = el('div', 'gm-barra peq'); const rel = el('i'); rel.style.width = Math.round(r.progreso / r.objetivo * 100) + '%'; barra.appendChild(rel);
      cu.append(barra, el('span', 'k-faint', r.hecho ? 'Cumplido' : `${num(r.progreso)} / ${num(r.objetivo)} · +${r.premio.xp} XP · +${r.premio.monedas} monedas`));
      t.append(ic, cu); lista.appendChild(t);
    });
    sec.appendChild(lista); c.appendChild(sec);

    // Actividad de los últimos 14 días
    const act = el('section', 'gm-sec');
    const h2 = el('h3'); h2.append(G.gi('hourglass', 'gi-sm'), el('span', null, 'Tu actividad')); h2.appendChild(el('span', 'k-faint gm-h-sub', `${horas(s.segundos)} en total · ${s.dias} días`));
    act.appendChild(h2);
    const barras = el('div', 'gm-dias');
    const max = Math.max(900, ...Object.values(s.diario));
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const seg = s.diario[k] || 0;
      const b = el('div', 'gm-dia'); const col = el('i'); col.style.height = Math.max(seg ? 8 : 3, Math.round(seg / max * 100)) + '%';
      b.title = `${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}: ${seg ? horas(seg) : 'sin actividad'}`;
      b.append(col, el('span', null, d.toLocaleDateString('es', { weekday: 'narrow' }))); barras.appendChild(b);
    }
    act.appendChild(barras); c.appendChild(act);

    // Contenido
    const con = el('section', 'gm-sec');
    const h3 = el('h3'); h3.append(G.gi('archive', 'gi-sm'), el('span', null, 'Lo que has guardado')); con.appendChild(h3);
    const grid = el('div', 'gm-rec');
    [['archivos', 'files', 'Archivos'], ['fotos', 'photos', 'Fotos'], ['notas', 'notes', 'Notas'], ['prompts', 'prompts', 'Prompts'], ['contactos', 'contacts', 'Contactos'], ['eventos', 'calendar', 'Eventos'], ['etiquetas', 'labels', 'Etiquetas'], ['enlaces', 'share', 'Enlaces'], ['juegos', 'gamepad', 'Juegos']].forEach(([k, ic, n]) => {
      const t = el('div', 'gm-rec-i'); t.append(G.gi(ic), el('b', null, num(s.recuentos[k])), el('span', 'k-faint', n)); grid.appendChild(t);
    });
    con.appendChild(grid); c.appendChild(con);

    // Rangos
    const rg = el('section', 'gm-sec');
    const h4 = el('h3'); h4.append(G.gi('crown', 'gi-sm'), el('span', null, 'Rangos')); rg.appendChild(h4);
    const esc = el('div', 'gm-rangos');
    s.rangos.forEach((r, i) => {
      const sig = s.rangos[i + 1]; const actual = s.nivel >= r.desde && (!sig || s.nivel < sig.desde);
      const t = el('div', 'gm-rango-i' + (s.nivel >= r.desde ? ' ok' : '') + (actual ? ' actual' : '')); t.style.setProperty('--c', r.color);
      t.append(G.gi(r.icono), el('b', null, r.nombre), el('span', 'k-faint', `Nivel ${r.desde}`)); esc.appendChild(t);
    });
    rg.appendChild(esc); c.appendChild(rg);
  }

  function pintaLogros(c) {
    const s = G.state;
    const f = el('div', 'gm-filtros');
    ['todos', 'Contenido', 'Uso', 'Tetris', '2048', 'Breakout', 'Arcade', 'Juegos', 'Especiales'].forEach(g => {
      const b = el('button', 'gm-filtro' + (S.grupo === g ? ' on' : ''), g === 'todos' ? 'Todos' : g); b.type = 'button';
      b.addEventListener('click', () => { S.grupo = g; pinta(); }); f.appendChild(b);
    });
    c.appendChild(f);
    const grid = el('div', 'gm-logros');
    if (S.grupo !== 'Especiales') {
      s.logros.familias.filter(x => S.grupo === 'todos' || x.grupo === S.grupo).forEach(x => {
        const sig = x.umbrales[x.tramos];     // próximo umbral (si lo hay)
        const t = el('article', 'gm-logro' + (x.tramos ? '' : ' bloq') + (x.tramos >= x.umbrales.length ? ' max' : ''));
        if (x.tramos) t.style.setProperty('--c', TRAMO_COLOR[x.tramos - 1]);
        const ic = el('div', 'gm-logro-ic'); ic.appendChild(G.gi(x.icono));
        const cu = el('div', 'gm-logro-cu');
        cu.appendChild(el('b', null, x.nombre));
        const pips = el('div', 'gm-pips');
        x.umbrales.forEach((u, i) => { const p = el('span', i < x.tramos ? 'on' : ''); p.style.setProperty('--p', TRAMO_COLOR[i]); p.title = `${['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante'][i]}: ${x.texto.replace('{n}', num(u))}${x.cuando[i] ? ' · ' + cuando(x.cuando[i]) : ''}`; pips.appendChild(p); });
        cu.appendChild(pips);
        if (sig !== undefined) {
          const barra = el('div', 'gm-barra peq'); const rel = el('i'); const desde = x.tramos ? x.umbrales[x.tramos - 1] : 0;
          rel.style.width = Math.max(2, Math.min(100, Math.round((x.valor - desde) / (sig - desde) * 100))) + '%'; barra.appendChild(rel);
          cu.append(barra, el('span', 'k-faint', `${x.texto.replace('{n}', num(sig))} · ${num(x.valor)} / ${num(sig)}`));
        } else cu.appendChild(el('span', 'k-faint', 'Completado · ' + x.texto.replace('{n}', num(x.umbrales[x.umbrales.length - 1]))));
        t.append(ic, cu); grid.appendChild(t);
      });
    }
    if (S.grupo === 'todos' || S.grupo === 'Especiales') {
      s.logros.especiales.forEach(x => {
        const t = el('article', 'gm-logro esp' + (x.cuando ? '' : ' bloq')); if (x.cuando) t.style.setProperty('--c', '#f59e0b');
        const ic = el('div', 'gm-logro-ic'); ic.appendChild(G.gi(x.cuando || !x.secreto ? x.icono : 'crystal'));
        const cu = el('div', 'gm-logro-cu');
        cu.append(el('b', null, x.cuando || !x.secreto ? x.nombre : '???'), el('span', 'k-faint', x.cuando ? `${x.texto} · ${cuando(x.cuando)}` : x.texto));
        t.append(ic, cu); grid.appendChild(t);
      });
    }
    c.appendChild(grid);
  }

  const TIPOS = [['skin', 'Colores de piezas, fichas y ladrillos'], ['fondo', 'Fondos del tablero'], ['marco', 'Marcos de perfil y tarjetas'], ['titulo', 'Títulos']];
  function vistaPrevia(it) {
    const p = el('div', 'gm-prev ' + it.tipo);
    if (it.tipo === 'skin') it.colores.forEach(col => { const q = el('i'); q.style.background = col; p.appendChild(q); });
    else if (it.tipo === 'fondo') p.style.background = gradiente(it.colores);
    else if (it.tipo === 'marco') { const q = el('i'); if (it.id !== 'marco-ninguno') q.style.setProperty('--mc', gradiente(it.colores)); p.appendChild(q); }
    else p.textContent = it.nombre;
    return p;
  }
  function pintaTienda(c) {
    const s = G.state;
    const cab = el('p', 'gm-monedas'); cab.append(G.gi('coins', 'gi-sm'), el('b', null, num(s.monedas)), el('span', 'k-faint', ' monedas · se ganan jugando (Tetris, 2048, Breakout) y con los retos semanales'));
    c.appendChild(cab);
    TIPOS.forEach(([tipo, nombre]) => {
      const sec = el('section', 'gm-sec'); sec.appendChild(el('h3', null, nombre));
      const grid = el('div', 'gm-tienda');
      s.cosmeticos.filter(x => x.tipo === tipo).forEach(it => {
        const t = el('article', 'gm-item' + (it.puesto ? ' puesto' : '') + (!it.propio && !it.disponible ? ' bloq' : ''));
        t.append(vistaPrevia(it), el('b', null, it.tipo === 'titulo' ? '' : it.nombre));
        if (it.tipo === 'titulo') t.lastChild.remove();
        const b = el('button', 'btn sm'); b.type = 'button';
        if (it.puesto) { b.textContent = 'Puesto'; b.disabled = true; }
        else if (it.propio) { b.textContent = 'Poner'; b.addEventListener('click', () => accion(() => K.post('/api/game/equip', { id: it.id }))); }
        else if (!it.disponible) { b.disabled = true; b.textContent = it.nivel ? `Nivel ${it.nivel}` : 'Con un logro'; }
        else if (it.precio > 0) {
          b.className = 'btn sm primary'; b.append(G.gi('coins', 'gi-sm'), document.createTextNode(` ${num(it.precio)}`)); b.disabled = s.monedas < it.precio;
          b.addEventListener('click', () => accion(() => K.post('/api/game/buy', { id: it.id }), `Conseguido: ${it.nombre}`));
        } else { b.textContent = 'Con un logro'; b.disabled = true; }
        t.appendChild(b);
        if (it.tipo === 'titulo' && !it.propio) t.title = it.nivel ? `Se consigue al llegar al nivel ${it.nivel}` : 'Se consigue con el logro correspondiente';
        grid.appendChild(t);
      });
      sec.appendChild(grid); c.appendChild(sec);
    });
  }
  async function accion(fn, ok) {
    try { const d = await fn(); G.set(d); if (ok) K.toast(ok); } catch (e) { K.fail(e); }
  }

  function pinta() {
    if (!S.built || !G.state) return;
    pintaPerfil();
    R.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    const c = el('div'); R.cuerpo.textContent = '';
    if (S.tab === 'logros') pintaLogros(c); else if (S.tab === 'tienda') pintaTienda(c); else pintaResumen(c);
    R.cuerpo.appendChild(c);
  }

  K.registerView('logros', {
    async open() { if (!S.built) build(); S.abierta = true; if (G.state) pinta(); await G.load(); pinta(); },
    close() { S.abierta = false; },
  });
  // Al arrancar la sesión se cargan los datos para que el Tetris y los avisos estén listos
  setTimeout(() => { if (logueado()) G.load(); }, 3000);

  /* ---------- Tarjeta para compartir (PNG) ---------- */
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  function icono(ctx, trazados, nombre, cx, cy, tam, color) {
    const ds = trazados[nombre]; if (!ds) return;
    ctx.save(); ctx.translate(cx - tam / 2, cy - tam / 2); ctx.scale(tam / 512, tam / 512); ctx.fillStyle = color;
    ds.forEach(d => ctx.fill(new Path2D(d))); ctx.restore();
  }
  const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  G.dibujaTarjeta = async (tipo, extra = {}) => {
    const s = G.state; if (!s) throw new Error('Aún no hay datos');
    const tr = await G.trazados();
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const rango = s.rango; const marco = G.puesto('marco'); const skin = G.puesto('skin') || { colores: ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'] };
    // Fondo
    const fondo = x.createLinearGradient(0, 0, W, H); fondo.addColorStop(0, '#0a0f24'); fondo.addColorStop(1, '#060814'); x.fillStyle = fondo; x.fillRect(0, 0, W, H);
    const brillo = x.createRadialGradient(W / 2, 430, 20, W / 2, 430, 760); brillo.addColorStop(0, rango.color + '55'); brillo.addColorStop(1, 'transparent'); x.fillStyle = brillo; x.fillRect(0, 0, W, H);
    // Bloques decorativos
    let semilla = 7; const az = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
      const bx = Math.floor(az() * 18) * 60, by = Math.floor(az() * 23) * 60; x.globalAlpha = 0.05 + az() * 0.07; x.fillStyle = skin.colores[Math.floor(az() * 7)];
      rr(x, bx + 4, by + 4, 52, 52, 10); x.fill();
    }
    x.globalAlpha = 1;
    // Marco
    if (marco && marco.id !== 'marco-ninguno') {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, marco.colores[0]); g.addColorStop(1, marco.colores[1]);
      x.lineWidth = 16; x.strokeStyle = g; rr(x, 18, 18, W - 36, H - 36, 46); x.stroke();
    } else { x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.12)'; rr(x, 24, 24, W - 48, H - 48, 42); x.stroke(); }
    x.textAlign = 'center'; x.fillStyle = '#9fb0d6'; x.font = `600 34px ${FUENTE}`; x.fillText('KOOKYECATCLOUD', W / 2, 106);
    const usuario = (typeof state !== 'undefined' && state.user && state.user.username) || '';

    if (tipo === 'tetris') {
      const r = extra.resultado || {};
      x.fillStyle = '#fff'; x.font = `700 46px ${FUENTE}`; x.fillText(usuario, W / 2, 180);
      x.fillStyle = '#9fb0d6'; x.font = `500 32px ${FUENTE}`; x.fillText(`Tetris · partida de 3 minutos`, W / 2, 226);
      if (extra.record) { x.fillStyle = '#facc15'; rr(x, W / 2 - 170, 262, 340, 62, 31); x.fill(); x.fillStyle = '#1a1300'; x.font = `800 30px ${FUENTE}`; x.fillText('¡NUEVO RÉCORD!', W / 2, 304); }
      x.fillStyle = '#fff'; x.font = `800 190px ${FUENTE}`; x.fillText(num(r.score || 0), W / 2, 540);
      x.fillStyle = rango.color; x.font = `700 38px ${FUENTE}`; x.fillText('PUNTOS', W / 2, 594);
      // Tablero final (si se conoce)
      if (extra.tablero) {
        const cel = 22, bw = cel * 10, bh = cel * 20, bx0 = 90, by0 = 650;
        x.fillStyle = 'rgba(255,255,255,.05)'; rr(x, bx0 - 10, by0 - 10, bw + 20, bh + 20, 16); x.fill();
        extra.tablero.slice(2).forEach((fila, j) => fila.forEach((v, i) => { if (v) { x.fillStyle = skin.colores[(v - 1) % 7]; rr(x, bx0 + i * cel + 1, by0 + j * cel + 1, cel - 2, cel - 2, 4); x.fill(); } }));
      }
      const stats = [['Líneas', r.lines], ['Nivel', r.level], ['Tetris', r.tetrises], ['Combo máx.', r.maxCombo], ['Potenciadores', r.powerups], ['Mejor personal', s.tetris.mejor]];
      stats.forEach(([n, v], i) => {
        const cx = extra.tablero ? 620 + (i % 2) * 220 : 270 + (i % 3) * 270, cy = (extra.tablero ? 690 : 690) + Math.floor(i / (extra.tablero ? 2 : 3)) * 150;
        x.fillStyle = '#fff'; x.font = `800 62px ${FUENTE}`; x.fillText(num(v || 0), cx, cy); x.fillStyle = '#9fb0d6'; x.font = `500 27px ${FUENTE}`; x.fillText(n, cx, cy + 40);
      });
      x.fillStyle = '#9fb0d6'; x.font = `500 30px ${FUENTE}`; x.fillText(`Nivel ${s.nivel} · ${rango.nombre}`, W / 2, 1160);
      icono(x, tr, rango.icono, W / 2, 1225, 90, rango.color);
    } else {
      // Insignia de rango
      const cy = 400;
      const halo = x.createRadialGradient(W / 2, cy, 40, W / 2, cy, 250); halo.addColorStop(0, rango.color + 'aa'); halo.addColorStop(1, 'transparent'); x.fillStyle = halo; x.beginPath(); x.arc(W / 2, cy, 250, 0, 7); x.fill();
      x.lineWidth = 12; x.strokeStyle = marco && marco.id !== 'marco-ninguno' ? marco.colores[1] : rango.color; x.fillStyle = 'rgba(8,12,28,.9)'; x.beginPath(); x.arc(W / 2, cy, 170, 0, 7); x.fill(); x.stroke();
      icono(x, tr, rango.icono, W / 2, cy, 210, rango.color);
      x.fillStyle = '#fff'; x.font = `800 66px ${FUENTE}`; x.fillText(usuario, W / 2, 688);
      const tit = G.puesto('titulo'); x.fillStyle = '#9fb0d6'; x.font = `500 34px ${FUENTE}`; x.fillText(tit ? tit.nombre : '', W / 2, 734);
      x.fillStyle = rango.color; x.font = `800 58px ${FUENTE}`; x.fillText(`NIVEL ${s.nivel} · ${rango.nombre.toUpperCase()}`, W / 2, 810);
      // Barra de XP
      x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, 190, 840, 700, 26, 13); x.fill();
      const pc = s.maxNivel ? 1 : s.xpNivel / s.xpSiguiente; const gb = x.createLinearGradient(190, 0, 890, 0); gb.addColorStop(0, '#4f7cff'); gb.addColorStop(1, rango.color);
      x.fillStyle = gb; rr(x, 190, 840, Math.max(26, 700 * pc), 26, 13); x.fill();
      x.fillStyle = '#9fb0d6'; x.font = `500 28px ${FUENTE}`; x.fillText(s.maxNivel ? `${num(s.xp)} XP` : `${num(s.xpNivel)} / ${num(s.xpSiguiente)} XP`, W / 2, 906);
      // Datos
      const datos = [['flame', `${s.racha}`, 'días de racha'], ['hourglass', horas(s.segundos), 'de uso'], ['trophy', `${s.logros.hechos}/${s.logros.total}`, 'logros'], ['gamepad', num(s.tetris.mejor), 'récord Tetris']];
      datos.forEach(([ic, v, n], i) => {
        const cx = 190 + i * 233;
        icono(x, tr, ic, cx, 990, 62, '#cbd5ff'); x.fillStyle = '#fff'; x.font = `800 40px ${FUENTE}`; x.fillText(v, cx, 1068); x.fillStyle = '#9fb0d6'; x.font = `500 24px ${FUENTE}`; x.fillText(n, cx, 1102);
      });
      // Últimos logros
      const hechos = [];
      s.logros.familias.forEach(f => f.cuando.forEach((t, i) => { if (t) hechos.push({ t, ic: f.icono, i }); }));
      s.logros.especiales.forEach(e => { if (e.cuando) hechos.push({ t: e.cuando, ic: e.icono, i: 2 }); });
      hechos.sort((a, b) => b.t - a.t);
      const ult = hechos.slice(0, 6);
      ult.forEach((h, i) => { const cx = W / 2 - (ult.length - 1) * 70 + i * 140; x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.arc(cx, 1214, 52, 0, 7); x.fill(); icono(x, tr, h.ic, cx, 1214, 62, TRAMO_COLOR[h.i] || '#f59e0b'); });
    }
    x.fillStyle = '#6d7c9e'; x.font = `500 26px ${FUENTE}`; x.fillText(`${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} · ${location.host}`, W / 2, 1306);
    return cv;
  };

  // Muestra una tarjeta ya dibujada con las opciones de compartir, descargar y copiar (la usan Logros, Tetris y Juegos)
  G.muestraTarjeta = async (cv, nombre, titulo) => {
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) { K.toast('No se pudo crear la imagen'); return; }
    const url = URL.createObjectURL(blob);
    const file = new File([blob], nombre, { type: 'image/png' });
    const w = el('div', 'gm-tarjeta'); const im = el('img'); im.src = url; im.alt = 'Tarjeta para compartir'; w.appendChild(im);
    const contar = async () => { try { G.set(await K.post('/api/game/event', { type: 'tarjeta' })); } catch { /* no es crítico */ } };
    const acts = [{ label: 'Cerrar', onClick: () => { setTimeout(() => URL.revokeObjectURL(url), 1000); } }];
    acts.push({ label: 'Descargar', onClick: async () => { const a = el('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); await contar(); return false; } });
    if (navigator.clipboard && window.ClipboardItem) acts.push({ label: 'Copiar', onClick: async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); K.toast('Imagen copiada'); await contar(); } catch { K.toast('No se pudo copiar la imagen'); } return false; } });
    if (navigator.canShare && navigator.canShare({ files: [file] })) acts.push({ label: 'Compartir', primary: true, onClick: async () => { try { await navigator.share({ files: [file], title: 'KookyeCatCloud' }); await contar(); } catch { /* cancelado */ } return false; } });
    K.modal({ title: titulo, content: w, cls: 'wide', actions: acts, onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
  };
  G.tarjeta = async (tipo, extra) => {
    let cv;
    try { if (!G.state) await G.load(); cv = await G.dibujaTarjeta(tipo, extra); } catch (e) { K.fail(e); return; }
    const nombre = tipo === 'tetris' ? `tetris-${extra && extra.resultado ? extra.resultado.score : ''}.png` : 'mis-logros.png';
    await G.muestraTarjeta(cv, nombre, tipo === 'tetris' ? 'Tu puntuación' : 'Tu tarjeta de logros');
  };
  // Utilidades de dibujo para otras tarjetas (Juegos, 2048, Breakout)
  G.dibujo = { rr, icono, FUENTE, num, horas, TRAMO_COLOR };
  // Lienzo base de 1080×1350 con el fondo y el marco habituales; devuelve lo necesario para seguir dibujando encima
  G.lienzo = async (subtitulo) => {
    if (!G.state) await G.load();
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const rango = G.state.rango || { color: '#22d3ee', nombre: '' };
    const f = x.createLinearGradient(0, 0, W, H); f.addColorStop(0, '#0a0f24'); f.addColorStop(1, '#060814'); x.fillStyle = f; x.fillRect(0, 0, W, H);
    const b = x.createRadialGradient(W / 2, 420, 20, W / 2, 420, 760); b.addColorStop(0, rango.color + '40'); b.addColorStop(1, 'transparent'); x.fillStyle = b; x.fillRect(0, 0, W, H);
    const marco = G.puesto('marco');
    if (marco && marco.id !== 'marco-ninguno') { const g2 = x.createLinearGradient(0, 0, W, H); g2.addColorStop(0, marco.colores[0]); g2.addColorStop(1, marco.colores[1]); x.lineWidth = 16; x.strokeStyle = g2; rr(x, 18, 18, W - 36, H - 36, 46); x.stroke(); }
    else { x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.12)'; rr(x, 24, 24, W - 48, H - 48, 42); x.stroke(); }
    x.textAlign = 'center'; x.fillStyle = '#9fb0d6'; x.font = `600 32px ${FUENTE}`; x.fillText(subtitulo || 'KOOKYECATCLOUD', W / 2, 100);
    return { cv, x, rr, FUENTE, W, H, rango, usuario: (typeof state !== 'undefined' && state.user && state.user.username) || '' };
  };
})();
