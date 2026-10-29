'use strict';
/* Juegos: próximos, lista de deseos, backlog, jugados… con carátulas, notas, horas, estadísticas y tarjetas para compartir */
(function () {
  const root = document.getElementById('view-games');
  if (!root || !window.K) return;
  const ESTADOS = [
    ['proximo', 'Próximos', 'Aún no han salido'],
    ['deseado', 'Deseados', 'Lista de deseos'],
    ['pendiente', 'Pendientes', 'Backlog: comprados sin jugar'],
    ['jugando', 'Jugando', 'En marcha'],
    ['jugado', 'Jugados', 'Terminados'],
    ['abandonado', 'Abandonados', 'Dejados a medias'],
  ];
  const NOMBRE = Object.fromEntries(ESTADOS.map(e => [e[0], e[1]]));
  const S = { items: [], rawg: false, tab: 'jugando', q: '', genero: '', plataforma: '', orden: 'reciente', stats: false, built: false, loading: null };
  try { Object.assign(S, JSON.parse(localStorage.getItem('kcc-games-ui') || '{}'), { q: '', stats: false }); } catch { /* sin preferencias */ }
  const guarda = () => { try { localStorage.setItem('kcc-games-ui', JSON.stringify({ tab: S.tab, orden: S.orden })); } catch { /* ignorar */ } };
  const portada = g => `${BASE}/api/games/${g.id}/cover?v=${g.coverV || 0}`;
  const nf = n => (Math.round(Number(n) * 10) / 10).toString().replace('.', ',');
  const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const unicos = f => [...new Set(S.items.flatMap(f))].sort((a, b) => a.localeCompare(b, 'es'));
  const fechaTxt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };

  async function load() {
    if (S.loading) return S.loading;
    S.loading = K.get('/api/games').then(d => { S.items = d.items || []; S.rawg = !!d.rawg; S.built = true; pinta(); }).catch(K.fail).finally(() => { S.loading = null; });
    return S.loading;
  }
  // Tras cambiar algo se refrescan los logros (el servidor recalcula con los nuevos recuentos)
  const logros = () => { if (K.game && K.game.load) K.game.load(); K.bus.emit('calendar'); };
  async function guardar(fn) { try { const r = await fn(); await load(); logros(); return r; } catch (e) { K.fail(e); return null; } }

  /* ---------- Vista principal ---------- */
  function visibles() {
    const q = S.q.toLocaleLowerCase('es');
    const lista = S.items.filter(g => g.status === S.tab
      && (!q || `${g.title} ${g.series} ${g.developer} ${(g.tags || []).join(' ')}`.toLocaleLowerCase('es').includes(q))
      && (!S.genero || (g.genres || []).includes(S.genero))
      && (!S.plataforma || (g.platforms || []).includes(S.plataforma)));
    const cmp = {
      reciente: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      nota: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      horas: (a, b) => (b.hours || 0) - (a.hours || 0),
      titulo: (a, b) => a.title.localeCompare(b.title, 'es'),
      salida: (a, b) => (a.released || '9999').localeCompare(b.released || '9999'),
      prioridad: (a, b) => (b.priority || 0) - (a.priority || 0),
    }[S.orden] || (() => 0);
    return lista.sort(cmp);
  }
  function pinta() {
    if (!S.built) return;
    root.textContent = '';
    const page = el('section', 'gms-page');
    const head = el('header', 'gms-head');
    const t = el('div'); t.append(el('h1', null, 'Juegos'), el('p', 'k-muted', `${S.items.length} en tu colección`));
    const acc = el('div', 'gms-actions');
    acc.append(btn('Mi perfil', 'i-star', tarjetaPerfil), btn(S.stats ? 'Biblioteca' : 'Estadísticas', 'i-bars', () => { S.stats = !S.stats; pinta(); }), (() => { const m = btn('', 'i-dots', ev => menuMas(ev.currentTarget)); m.setAttribute('aria-label', 'Más opciones'); return m; })(), btn('Añadir', 'i-plus', () => anadir(), 'btn primary'));
    head.append(t, acc); page.appendChild(head);
    if (S.stats) page.appendChild(panelStats()); else page.appendChild(biblioteca());
    root.appendChild(page);
  }
  function menuMas(anchor) {
    K.menu(anchor, [
      { label: 'Exportar JSON', onClick: () => descarga('json') },
      { label: 'Exportar CSV (hoja de cálculo)', onClick: () => descarga('csv') },
      { label: 'Importar JSON', onClick: importar },
    ]);
  }
  async function descarga(fmt) {
    try {
      const r = await fetch(`${BASE}/api/games/export?format=${fmt}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('No se pudo exportar');
      const url = URL.createObjectURL(await r.blob());
      const a = el('a'); a.href = url; a.download = `juegos.${fmt}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { K.fail(e); }
  }
  function importar() {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        const r = await K.post('/api/games/import', { items: Array.isArray(j) ? j : j.items });
        K.toast(`Importados ${r.nuevos || 0} juegos` + (r.repetidos ? ` (${r.repetidos} repetidos)` : '')); await load(); logros();
      } catch (e) { K.fail(e); }
    });
    inp.click();
  }
  function biblioteca() {
    const w = el('div');
    const tabs = el('div', 'gms-tabs'); tabs.setAttribute('role', 'tablist');
    ESTADOS.forEach(([k, n, tip]) => {
      const c = S.items.filter(g => g.status === k).length;
      const b = el('button', S.tab === k ? 'is-active' : '', `${n} · ${c}`); b.type = 'button'; b.title = tip; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { S.tab = k; guarda(); pinta(); }); tabs.appendChild(b);
    });
    w.appendChild(tabs);
    const bar = el('div', 'gms-bar');
    const s = el('label', 'search gms-search'); s.appendChild(icon('i-search'));
    const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar por título, saga, etiqueta…'; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar juegos');
    inp.addEventListener('input', K.debounce(() => { S.q = inp.value; pintaGrid(); }, 150));
    s.appendChild(inp); bar.appendChild(s);
    const sel = (valor, opciones, cambio, etiqueta) => {
      const x = el('select'); x.setAttribute('aria-label', etiqueta);
      opciones.forEach(([v, n]) => { const o = el('option', null, n); o.value = v; x.appendChild(o); });
      x.value = valor; x.addEventListener('change', () => { cambio(x.value); pintaGrid(); }); return x;
    };
    bar.append(
      sel(S.genero, [['', 'Todos los géneros'], ...unicos(g => g.genres || []).map(v => [v, v])], v => { S.genero = v; }, 'Género'),
      sel(S.plataforma, [['', 'Todas las plataformas'], ...unicos(g => g.platforms || []).map(v => [v, v])], v => { S.plataforma = v; }, 'Plataforma'),
      sel(S.orden, [['reciente', 'Recientes'], ['nota', 'Mejor nota'], ['horas', 'Más horas'], ['titulo', 'Título A-Z'], ['salida', 'Fecha de salida'], ['prioridad', 'Prioridad']], v => { S.orden = v; guarda(); }, 'Ordenar'));
    w.appendChild(bar);
    const grid = el('div', 'gms-grid'); grid.id = 'gms-grid'; w.appendChild(grid);
    queueMicrotask(pintaGrid);
    return w;
  }
  function pintaGrid() {
    const grid = root.querySelector('#gms-grid'); if (!grid) return;
    grid.textContent = '';
    const v = visibles();
    if (!v.length) {
      const e = el('div', 'gms-empty'); e.append(el('div', 'gms-empty-i', '🎮'), el('h2', null, S.items.length ? 'Nada por aquí' : 'Tu colección está vacía'), el('p', 'k-muted', S.items.length ? 'Prueba con otro estado o quita los filtros.' : 'Añade tu primer juego y empieza a ganar logros.'));
      if (!S.items.length) e.appendChild(btn('Añadir juego', 'i-plus', () => anadir(), 'btn primary'));
      grid.appendChild(e); return;
    }
    v.forEach(g => grid.appendChild(tarjeta(g)));
  }
  function caratula(g, cls = '') {
    const b = el('div', 'gms-cover ' + cls);
    const inicial = () => { b.classList.add('sin'); b.textContent = ''; b.appendChild(el('span', null, Array.from(g.title)[0]?.toLocaleUpperCase('es') || '?')); };
    if (g.cover) { const im = el('img'); im.src = portada(g); im.alt = ''; im.loading = 'lazy'; im.addEventListener('error', inicial); b.appendChild(im); } else inicial();
    return b;
  }
  function tarjeta(g) {
    const c = el('article', 'gms-card'); c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', g.title);
    c.appendChild(caratula(g));
    const b = el('div', 'gms-body'); b.appendChild(el('strong', null, g.title));
    const meta = [(g.platforms || [])[0], (g.genres || [])[0]].filter(Boolean).join(' · '); if (meta) b.appendChild(el('small', 'k-muted', meta));
    const pie = el('div', 'gms-foot');
    if (g.rating != null) pie.appendChild(el('span', 'gms-nota', `★ ${nf(g.rating)}`));
    if (g.hours) pie.appendChild(el('span', 'k-muted', `${nf(g.hours)} h`));
    if (g.status === 'proximo' && g.released) pie.appendChild(el('span', 'k-muted', fechaTxt(g.released)));
    if (g.status === 'deseado' && g.priority) pie.appendChild(el('span', 'gms-nota', '!'.repeat(g.priority)));
    if (g.status === 'jugando' && g.percent) pie.appendChild(el('span', 'k-muted', `${g.percent}%`));
    b.appendChild(pie); c.appendChild(b);
    const abre = () => ficha(g.id);
    c.addEventListener('click', abre); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abre(); } });
    return c;
  }

  /* ---------- Añadir (RAWG o manual) ---------- */
  function anadir() {
    const w = el('div', 'gms-form');
    const estado = el('select'); ESTADOS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; estado.appendChild(o); }); estado.value = ['proximo', 'deseado', 'pendiente', 'jugando', 'jugado', 'abandonado'].includes(S.tab) ? S.tab : 'deseado';
    const res = el('div', 'gms-results');
    if (S.rawg) {
      const s = el('label', 'search'); s.appendChild(icon('i-search'));
      const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar juego en RAWG…'; s.appendChild(inp);
      const buscar = K.debounce(async () => {
        const q = inp.value.trim(); res.textContent = ''; if (q.length < 2) return;
        res.appendChild(el('p', 'k-muted', 'Buscando…'));
        try {
          const r = await K.get('/api/games/search?' + K.qs({ q })); res.textContent = '';
          const arr = r.items || [];
          if (!arr.length) res.appendChild(el('p', 'k-muted', 'Sin resultados. Puedes añadirlo a mano.'));
          arr.forEach(it => {
            const row = el('button', 'gms-res'); row.type = 'button';
            const im = el('div', 'gms-res-img'); if (it.image) { const i = el('img'); i.src = it.image; i.alt = ''; i.loading = 'lazy'; im.appendChild(i); }
            const tx = el('div'); tx.append(el('strong', null, it.title || it.name), el('small', 'k-muted', [it.released && it.released.slice(0, 4), (it.platforms || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')));
            row.append(im, tx);
            row.addEventListener('click', async () => {
              row.disabled = true;
              try { await K.post('/api/games/from-rawg', { rawgId: it.rawgId ?? it.id, status: estado.value }); modal.close(); S.tab = estado.value; guarda(); await load(); logros(); K.toast('Juego añadido'); } catch (e) { row.disabled = false; K.fail(e); }
            });
            res.appendChild(row);
          });
        } catch (e) { res.textContent = ''; res.appendChild(el('p', 'k-muted', e.message || 'No se pudo buscar')); }
      }, 350);
      inp.addEventListener('input', buscar);
      w.append(s, res);
      w.appendChild(el('p', 'k-faint gms-attr', 'Datos de RAWG.io'));
    } else {
      w.appendChild(el('p', 'k-muted', 'La búsqueda automática se activa con RAWG_KEY en el .env del servidor. Mientras tanto puedes añadir juegos a mano.'));
    }
    const fila = el('label', 'gms-field'); fila.append(el('span', null, 'Estado inicial'), estado); w.appendChild(fila);
    const modal = K.modal({ title: 'Añadir juego', content: w, actions: [{ label: 'Cancelar' }, { label: 'Añadir a mano', primary: !S.rawg, onClick: () => { const e = estado.value; setTimeout(() => editar(null, e), 0); } }] });
  }

  /* ---------- Formulario completo ---------- */
  function editar(g, estadoInicial) {
    const d = g || { status: estadoInicial || 'deseado', title: '', platforms: [], genres: [], tags: [] };
    const f = {};
    const campo = (clave, etiqueta, tipo = 'text', extra = {}) => {
      const i = el(tipo === 'textarea' ? 'textarea' : 'input'); if (tipo !== 'textarea') i.type = tipo; if (tipo === 'textarea') i.rows = extra.rows || 3;
      const v = d[clave]; i.value = Array.isArray(v) ? v.join(', ') : (v ?? '');
      Object.entries(extra).forEach(([k, val]) => { if (k !== 'rows') i.setAttribute(k, val); });
      f[clave] = i; const l = el('label', 'gms-field'); l.append(el('span', null, etiqueta), i); return l;
    };
    const w = el('div', 'gms-form');
    const st = el('select'); ESTADOS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; st.appendChild(o); }); st.value = d.status; f.status = st;
    const stL = el('label', 'gms-field'); stL.append(el('span', null, 'Estado'), st);
    const fmt = el('select'); [['', 'Sin indicar'], ['fisico', 'Físico'], ['digital', 'Digital']].forEach(([v, n]) => { const o = el('option', null, n); o.value = v; fmt.appendChild(o); }); fmt.value = d.format || ''; f.format = fmt;
    const fmtL = el('label', 'gms-field'); fmtL.append(el('span', null, 'Formato'), fmt);
    const pr = el('select'); [['0', 'Normal'], ['1', 'Baja'], ['2', 'Media'], ['3', 'Alta']].forEach(([v, n]) => { const o = el('option', null, `Prioridad: ${n}`); o.value = v; pr.appendChild(o); }); pr.value = String(d.priority || 0); f.priority = pr;
    const grid = (...x) => { const r = el('div', 'gms-row'); r.append(...x); return r; };
    w.append(
      campo('title', 'Título', 'text', { maxlength: 160, required: 'true' }),
      grid(stL, campo('rating', 'Nota personal (0-10)', 'number', { min: 0, max: 10, step: 0.5, inputmode: 'decimal' })),
      campo('platforms', 'Plataformas (separadas por comas)'), campo('genres', 'Géneros (separados por comas)'),
      grid(campo('developer', 'Estudio'), campo('series', 'Saga')),
      grid(campo('released', 'Salida', 'date'), campo('hours', 'Horas jugadas', 'number', { min: 0, step: 0.5, inputmode: 'decimal' })),
      grid(campo('started', 'Empezado', 'date'), campo('finished', 'Terminado', 'date')),
      grid(campo('percent', '% completado', 'number', { min: 0, max: 100, inputmode: 'numeric' }), campo('replays', 'Rejugadas', 'number', { min: 0, inputmode: 'numeric' })),
      campo('review', 'Reseña', 'textarea', { rows: 4, maxlength: 4000 }),
      grid(campo('pros', 'Lo mejor', 'textarea', { rows: 2 }), campo('cons', 'Lo peor', 'textarea', { rows: 2 })),
      campo('tags', 'Etiquetas (separadas por comas)'),
      grid(fmtL, pr),
      grid(campo('store', 'Tienda'), campo('price', 'Precio pagado (€)', 'number', { min: 0, step: 0.01, inputmode: 'decimal' })),
      grid(campo('targetPrice', 'Precio objetivo (€)', 'number', { min: 0, step: 0.01, inputmode: 'decimal' }), campo('lentTo', 'Prestado a')),
      campo('url', 'Enlace', 'url'),
      (() => { const i = el('input'); i.type = 'file'; i.accept = 'image/*'; f.portada = i; const l = el('label', 'gms-field'); l.append(el('span', null, g && g.cover ? 'Cambiar carátula' : 'Carátula (imagen)'), i); return l; })());
    const cal = K.calField({ value: g && g.cal ? { date: g.cal.date, time: g.cal.time, calendarId: 'juegos' } : null, label: 'Añadir la salida al calendario', hint: 'Se crea un evento en el calendario «Juegos»', defaultDate: d.released || undefined, defaultCalendar: 'juegos' });
    w.appendChild(cal);
    const modal = K.modal({
      title: g ? 'Editar juego' : 'Nuevo juego', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, {
        label: 'Guardar', primary: true, onClick: async () => {
          const v = k => f[k].value;
          const body = {
            title: v('title').trim(), status: v('status'), rating: v('rating') === '' ? null : Number(v('rating')),
            platforms: lista(v('platforms')), genres: lista(v('genres')), developer: v('developer'), series: v('series'),
            released: v('released'), hours: v('hours') === '' ? 0 : Number(v('hours')), started: v('started'), finished: v('finished'),
            percent: v('percent') === '' ? 0 : Number(v('percent')), replays: v('replays') === '' ? 0 : Number(v('replays')),
            review: v('review'), pros: v('pros'), cons: v('cons'), tags: lista(v('tags')), format: v('format'), priority: Number(v('priority')),
            store: v('store'), price: v('price') === '' ? null : Number(v('price')), targetPrice: v('targetPrice') === '' ? null : Number(v('targetPrice')),
            lentTo: v('lentTo'), url: v('url'),
          };
          if (!body.title) { K.toast('Escribe el título'); return false; }
          const c = cal.get(); body.calendar = c ? { date: c.date, time: c.time, calendarId: c.calendarId || 'juegos' } : null;
          if (!g && !c) delete body.calendar;
          const r = await guardar(async () => {
            const res = await (g ? K.put('/api/games/' + g.id, body) : K.post('/api/games', body));
            const img = f.portada.files[0];
            if (img && res && res.id) { const fd = new FormData(); fd.append('image', img); const up = await fetch(`${BASE}/api/games/${res.id}/cover`, { method: 'PUT', body: fd, credentials: 'same-origin' }); if (!up.ok) K.toast('El juego se guardó, pero la carátula no se pudo subir'); }
            return res;
          });
          if (r) { S.tab = body.status; guarda(); pinta(); }
          return !!r;
        },
      }],
    });
  }

  /* ---------- Ficha ---------- */
  function ficha(id) {
    const g = S.items.find(x => x.id === id); if (!g) return;
    const w = el('div', 'gms-ficha');
    const top = el('div', 'gms-ficha-top'); top.appendChild(caratula(g, 'grande'));
    const info = el('div', 'gms-ficha-info');
    info.append(el('h2', null, g.title), el('p', 'k-muted', [NOMBRE[g.status], (g.platforms || []).join(', ')].filter(Boolean).join(' · ')));
    if (g.rating != null) info.appendChild(el('div', 'gms-nota-grande', `★ ${nf(g.rating)}/10`));
    const datos = [['Horas', g.hours ? `${nf(g.hours)} h` : ''], ['Géneros', (g.genres || []).join(', ')], ['Estudio', g.developer], ['Saga', g.series], ['Salida', fechaTxt(g.released)], ['Empezado', fechaTxt(g.started)], ['Terminado', fechaTxt(g.finished)], ['Completado', g.percent ? g.percent + '%' : ''], ['Rejugadas', g.replays || ''], ['Formato', g.format === 'fisico' ? 'Físico' : g.format === 'digital' ? 'Digital' : ''], ['Tienda', g.store], ['Precio', g.price != null ? eur(g.price) : ''], ['Precio objetivo', g.targetPrice != null ? eur(g.targetPrice) : ''], ['Prestado a', g.lentTo]].filter(x => x[1] !== '' && x[1] != null);
    const dl = el('dl', 'gms-datos'); datos.forEach(([k, v]) => { dl.append(el('dt', null, k), el('dd', null, String(v))); }); info.appendChild(dl);
    top.appendChild(info); w.appendChild(top);
    if (g.review) w.appendChild(el('p', 'gms-review', g.review));
    if (g.pros) w.appendChild(el('p', 'gms-pc', '👍 ' + g.pros));
    if (g.cons) w.appendChild(el('p', 'gms-pc', '👎 ' + g.cons));
    if ((g.tags || []).length) { const t = el('div', 'gms-tags'); g.tags.forEach(x => t.appendChild(el('span', null, '#' + x))); w.appendChild(t); }
    if (g.url) { const a = el('a', 'gms-link', 'Abrir enlace'); a.href = g.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; w.appendChild(a); }
    const rapidas = el('div', 'gms-quick');
    rapidas.append(
      btn('Sesión', 'i-plus', () => { m.close(); setTimeout(() => sesion(g), 0); }, 'btn sm'),
      btn('Tarjeta', 'i-star', () => { m.close(); setTimeout(() => tarjetaJuego(g), 0); }, 'btn sm'),
      btn('Carátula', 'i-image', () => subePortada(g), 'btn sm'));
    w.appendChild(rapidas);
    const m = K.modal({
      title: '', content: w, cls: 'wide', actions: [
        { label: 'Cerrar' },
        { label: 'Eliminar', danger: true, onClick: async () => { if (!await K.confirm(`Se eliminará «${g.title}» y su carátula.`, { ok: 'Eliminar', danger: true })) return false; return !!await guardar(() => K.del('/api/games/' + g.id)); } },
        { label: 'Editar', primary: true, onClick: () => { setTimeout(() => editar(g), 0); return true; } },
      ],
    });
  }
  function sesion(g) {
    const h = el('input'); h.type = 'number'; h.min = '0.25'; h.step = '0.25'; h.value = '1'; h.inputmode = 'decimal';
    const l = el('label', 'gms-field'); l.append(el('span', null, 'Horas jugadas hoy'), h);
    K.modal({ title: `Sesión de ${g.title}`, content: l, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { const n = Number(h.value); if (!(n > 0)) return false; return !!await guardar(() => K.post(`/api/games/${g.id}/sessions`, { hours: n })); } }] });
    setTimeout(() => h.select(), 50);
  }
  function subePortada(g) {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try { const fd = new FormData(); fd.append('image', f); const r = await fetch(`${BASE}/api/games/${g.id}/cover`, { method: 'PUT', body: fd, credentials: 'same-origin' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo subir'); await load(); K.toast('Carátula actualizada'); } catch (e) { K.fail(e); }
    });
    inp.click();
  }

  /* ---------- Estadísticas ---------- */
  function resumenStats() {
    const it = S.items, jug = it.filter(g => g.status === 'jugado');
    const notas = it.filter(g => g.rating != null);
    const horas = it.reduce((a, g) => a + (g.hours || 0), 0);
    const gasto = it.reduce((a, g) => a + (g.price || 0), 0);
    const porGenero = {}; it.forEach(g => (g.genres || []).forEach(x => { porGenero[x] = (porGenero[x] || 0) + (g.hours || 0); }));
    const porAno = {}; jug.forEach(g => { const y = (g.finished || '').slice(0, 4); if (y) porAno[y] = (porAno[y] || 0) + 1; });
    const horasAno = {}; it.forEach(g => (g.sessions || []).forEach(s => { const y = String(s.d || s.date || '').slice(0, 4); if (y) horasAno[y] = (horasAno[y] || 0) + (s.h || 0); }));
    return {
      total: it.length, jugados: jug.length, horas, gasto, backlog: it.filter(g => g.status === 'pendiente').length,
      media: notas.length ? notas.reduce((a, g) => a + g.rating, 0) / notas.length : null,
      euroHora: gasto && horas ? gasto / horas : null,
      generos: Object.entries(porGenero).sort((a, b) => b[1] - a[1]), porAno, horasAno,
      top: [...notas].sort((a, b) => b.rating - a.rating || (b.hours || 0) - (a.hours || 0)).slice(0, 5),
    };
  }
  function barras(datos, fmt = x => nf(x)) {
    const w = el('div', 'gms-bars'); const max = Math.max(1, ...datos.map(d => d[1]));
    datos.forEach(([n, v]) => { const r = el('div', 'gms-bar-r'); const b = el('span', 'gms-bar-b'); b.style.width = Math.max(3, v / max * 100) + '%'; r.append(el('span', 'gms-bar-n', n), b, el('span', 'gms-bar-v', fmt(v))); w.appendChild(r); });
    return w;
  }
  function panelStats() {
    const s = resumenStats(), w = el('div', 'gms-stats');
    const kpis = el('div', 'gms-kpis');
    [['Juegos', s.total], ['Jugados', s.jugados], ['Horas', nf(s.horas)], ['Nota media', s.media != null ? nf(s.media) : '–'], ['Backlog', s.backlog], ['Gasto', s.gasto ? eur(s.gasto) : '–'], ['€ por hora', s.euroHora != null ? eur(s.euroHora) : '–']].forEach(([n, v]) => {
      const k = el('div', 'gms-kpi'); k.append(el('strong', null, String(v)), el('small', 'k-muted', n)); kpis.appendChild(k);
    });
    w.appendChild(kpis);
    const bloque = (t, nodo) => { const b = el('section', 'gms-block'); b.append(el('h3', null, t), nodo); w.appendChild(b); };
    if (s.generos.length) bloque('Horas por género', barras(s.generos.slice(0, 8), v => nf(v) + ' h'));
    const anos = Object.entries(s.porAno).sort(); if (anos.length) bloque('Jugados por año', barras(anos, v => String(v)));
    const hAnos = Object.entries(s.horasAno).sort(); if (hAnos.length) bloque('Horas registradas por año', barras(hAnos, v => nf(v) + ' h'));
    if (s.top.length) bloque('Mejor valorados', barras(s.top.map(g => [g.title, g.rating]), v => '★ ' + nf(v)));
    if (!s.total) w.appendChild(el('p', 'k-muted', 'Añade juegos para ver tus estadísticas.'));
    return w;
  }

  /* ---------- Tarjetas para compartir ---------- */
  const cargaImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function texto(x, t, px, y, ancho, lineas, alto) {
    const pal = String(t).split(/\s+/); const ls = []; let cur = '';
    for (const p of pal) { const prueba = cur ? cur + ' ' + p : p; if (x.measureText(prueba).width > ancho && cur) { ls.push(cur); cur = p; } else cur = prueba; }
    if (cur) ls.push(cur);
    ls.slice(0, lineas).forEach((l, i) => { let s = l; if (i === lineas - 1 && ls.length > lineas) s = l.replace(/.{0,2}$/, '…'); x.fillText(s, px, y + i * alto); });
    return Math.min(ls.length, lineas) * alto;
  }
  async function lienzo() {
    const G = K.game; if (!G.state) await G.load();
    const { rr, FUENTE } = G.dibujo; const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const rango = G.state.rango || { color: '#22d3ee', nombre: '' };
    const f = x.createLinearGradient(0, 0, W, H); f.addColorStop(0, '#0a0f24'); f.addColorStop(1, '#060814'); x.fillStyle = f; x.fillRect(0, 0, W, H);
    const b = x.createRadialGradient(W / 2, 420, 20, W / 2, 420, 760); b.addColorStop(0, rango.color + '40'); b.addColorStop(1, 'transparent'); x.fillStyle = b; x.fillRect(0, 0, W, H);
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.12)'; rr(x, 24, 24, W - 48, H - 48, 42); x.stroke();
    x.textAlign = 'center'; x.fillStyle = '#9fb0d6'; x.font = `600 32px ${FUENTE}`; x.fillText('KOOKYECATCLOUD · JUEGOS', W / 2, 100);
    return { cv, x, G, rr, FUENTE, W, H, rango, usuario: (state.user && state.user.username) || '' };
  }
  function pildora(x, rr, FUENTE, t, cx, cy, color) {
    x.font = `600 30px ${FUENTE}`; const w = x.measureText(t).width + 44;
    x.fillStyle = color + '33'; rr(x, cx - w / 2, cy - 30, w, 60, 30); x.fill(); x.fillStyle = color; x.textAlign = 'center'; x.fillText(t, cx, cy + 11); return w;
  }
  async function tarjetaJuego(g) {
    try {
      const { cv, x, G, rr, FUENTE, W, H, rango, usuario } = await lienzo();
      const img = g.cover ? await cargaImg(portada(g)) : null;
      const cw = 520, ch = 690, cx0 = (W - cw) / 2, cy0 = 150;
      x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 50; x.shadowOffsetY = 20; x.fillStyle = '#111936'; rr(x, cx0, cy0, cw, ch, 28); x.fill(); x.restore();
      x.save(); rr(x, cx0, cy0, cw, ch, 28); x.clip();
      if (img) { const r = Math.max(cw / img.width, ch / img.height); const dw = img.width * r, dh = img.height * r; x.drawImage(img, cx0 + (cw - dw) / 2, cy0 + (ch - dh) / 2, dw, dh); }
      else { const gr = x.createLinearGradient(cx0, cy0, cx0 + cw, cy0 + ch); gr.addColorStop(0, rango.color + '88'); gr.addColorStop(1, '#1b2350'); x.fillStyle = gr; x.fillRect(cx0, cy0, cw, ch); x.fillStyle = 'rgba(255,255,255,.85)'; x.font = `800 260px ${FUENTE}`; x.textAlign = 'center'; x.fillText(Array.from(g.title)[0]?.toLocaleUpperCase('es') || '?', W / 2, cy0 + ch / 2 + 90); }
      x.restore();
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `800 56px ${FUENTE}`;
      let y = cy0 + ch + 80; y += texto(x, g.title, W / 2, y, W - 160, 2, 62);
      const meta = [(g.platforms || []).slice(0, 3).join(' · '), (g.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join('  |  ');
      x.fillStyle = '#9fb0d6'; x.font = `500 30px ${FUENTE}`; if (meta) { x.fillText(meta.length > 60 ? meta.slice(0, 58) + '…' : meta, W / 2, y); y += 56; } else y += 10;
      // Datos clave
      const bloques = [];
      if (g.rating != null) bloques.push([`★ ${nf(g.rating)}`, 'MI NOTA', '#facc15']);
      if (g.hours) bloques.push([`${nf(g.hours)} h`, 'JUGADAS', '#22d3ee']);
      bloques.push([NOMBRE[g.status].toUpperCase(), 'ESTADO', '#a855f7']);
      if (g.percent) bloques.push([`${g.percent}%`, 'COMPLETADO', '#22c55e']);
      const n = Math.min(4, bloques.length), bw = 230, sep = 20, tot = n * bw + (n - 1) * sep; let bx = (W - tot) / 2;
      bloques.slice(0, n).forEach(([v, e, c]) => {
        x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, bx, y, bw, 120, 22); x.fill();
        x.fillStyle = c; x.font = `800 ${v.length > 8 ? 30 : 42}px ${FUENTE}`; x.textAlign = 'center'; x.fillText(v, bx + bw / 2, y + 60);
        x.fillStyle = '#9fb0d6'; x.font = `600 20px ${FUENTE}`; x.fillText(e, bx + bw / 2, y + 96); bx += bw + sep;
      });
      y += 175;
      if (g.review) { x.fillStyle = '#dbe4ff'; x.font = `italic 500 30px ${FUENTE}`; texto(x, `«${g.review.replace(/\s+/g, ' ')}»`, W / 2, y, W - 200, 3, 42); }
      x.fillStyle = '#6f7fa8'; x.font = `500 28px ${FUENTE}`; x.textAlign = 'center'; x.fillText(`${usuario} · Nivel ${G.state.nivel} · ${rango.nombre}`, W / 2, H - 70);
      await G.muestraTarjeta(cv, `juego-${g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'juego'}.png`, 'Tarjeta del juego');
    } catch (e) { K.fail(e); }
  }
  async function tarjetaPerfil() {
    try {
      const { cv, x, G, rr, FUENTE, W, H, rango, usuario } = await lienzo();
      const s = resumenStats(); const tr = await G.trazados(); const { num } = G.dibujo;
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `800 64px ${FUENTE}`; x.fillText(usuario || 'Jugador', W / 2, 190);
      x.fillStyle = rango.color; x.font = `600 34px ${FUENTE}`; x.fillText(`Nivel ${G.state.nivel} · ${rango.nombre}`, W / 2, 240);
      const kp = [[String(s.total), 'JUEGOS', '#22d3ee'], [String(s.jugados), 'JUGADOS', '#22c55e'], [num ? num(Math.round(s.horas)) : String(Math.round(s.horas)), 'HORAS', '#facc15'], [s.media != null ? nf(s.media) : '–', 'NOTA MEDIA', '#a855f7']];
      kp.forEach(([v, e, c], i) => {
        const bw = 235, sep = 20, bx = (W - (4 * bw + 3 * sep)) / 2 + i * (bw + sep), by = 290;
        x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, bx, by, bw, 150, 24); x.fill();
        x.fillStyle = c; x.font = `800 56px ${FUENTE}`; x.textAlign = 'center'; x.fillText(v, bx + bw / 2, by + 78);
        x.fillStyle = '#9fb0d6'; x.font = `600 22px ${FUENTE}`; x.fillText(e, bx + bw / 2, by + 120);
      });
      // Géneros favoritos
      x.textAlign = 'left'; x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('GÉNEROS CON MÁS HORAS', 90, 520);
      const gens = s.generos.slice(0, 4), max = Math.max(1, ...gens.map(g => g[1]));
      gens.forEach(([n, v], i) => {
        const by = 560 + i * 62; x.fillStyle = 'rgba(255,255,255,.07)'; rr(x, 90, by, 900, 44, 22); x.fill();
        x.fillStyle = ['#22d3ee', '#a855f7', '#facc15', '#22c55e'][i]; rr(x, 90, by, Math.max(44, 900 * v / max), 44, 22); x.fill();
        x.fillStyle = '#06101f'; x.font = `700 24px ${FUENTE}`; x.fillText(n.slice(0, 26), 110, by + 31);
        x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(nf(v) + ' h', 975, by + 31); x.textAlign = 'left';
      });
      if (!gens.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Aún sin horas por género', 90, 600); }
      // Carátulas mejor valoradas
      x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('MIS MEJOR VALORADOS', 90, 860);
      const imgs = await Promise.all(s.top.slice(0, 5).map(g => g.cover ? cargaImg(portada(g)) : null));
      s.top.slice(0, 5).forEach((g, i) => {
        const cw = 180, ch = 240, gap = 0, bx = 90 + i * (cw + 22), by = 890;
        x.save(); rr(x, bx, by, cw, ch, 18); x.clip(); x.fillStyle = '#1b2350'; x.fillRect(bx, by, cw, ch);
        const im = imgs[i];
        if (im) { const r = Math.max(cw / im.width, ch / im.height); x.drawImage(im, bx + (cw - im.width * r) / 2, by + (ch - im.height * r) / 2, im.width * r, im.height * r); }
        else { x.fillStyle = '#fff'; x.font = `800 80px ${FUENTE}`; x.textAlign = 'center'; x.fillText(Array.from(g.title)[0]?.toLocaleUpperCase('es') || '?', bx + cw / 2, by + 140); x.textAlign = 'left'; }
        x.restore();
        x.fillStyle = 'rgba(0,0,0,.72)'; rr(x, bx + 8, by + 8, 84, 40, 20); x.fill(); x.fillStyle = '#facc15'; x.font = `800 24px ${FUENTE}`; x.textAlign = 'center'; x.fillText('★ ' + nf(g.rating), bx + 50, by + 36); x.textAlign = 'left';
        void gap;
      });
      if (!s.top.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Valora tus juegos para verlos aquí', 90, 960); }
      // Logros de juegos
      const L = G.state.logros || {};
      const logr = [...(L.familias || []).filter(l => l.grupo === 'Juegos' && l.tramos > 0).map(l => ({ icono: l.icono, tramo: l.tramos, g: 'Juegos' })),
        ...(L.especiales || []).filter(l => ['retro', 'plataformas', 'sesion'].includes(l.id) && l.cuando).map(l => ({ icono: l.icono, tramo: 5, g: 'Especiales' }))].slice(0, 6);
      x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('LOGROS DE JUEGOS', 90, 1170);
      logr.forEach((l, i) => { G.dibujo.medalla(x, tr, l.icono, 130 + i * 160, 1235, 100, G.dibujo.TRAMO_COLOR[Math.max(0, Math.min(4, l.tramo - 1))], l.g); });
      if (!logr.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Añade juegos para desbloquear logros', 90, 1225); }
      x.textAlign = 'center'; x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('KookyeCatCloud', W / 2, H - 50);
      await G.muestraTarjeta(cv, 'mi-perfil-gamer.png', 'Mi perfil de jugador');
    } catch (e) { K.fail(e); }
  }

  /* ---------- Integración ---------- */
  K.openers.game = id => { switchTab('games'); load().then(() => ficha(id)); };
  K.srcIcon.game = 'i-gamepad'; K.srcName.game = 'Juego';
  K.bus.on('games', () => { if (S.built) load(); });
  K.registerView('games', { open() { load(); }, close() {} });
})();
