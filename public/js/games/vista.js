'use strict';
/* games/vista.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { ESTADOS, S, root } = C;
  const anadir = (...a) => C.anadir(...a);
  const btn = (...a) => C.btn(...a);
  const coincide = (...a) => C.coincide(...a);
  const fechaTxt = (...a) => C.fechaTxt(...a);
  const ficha = (...a) => C.ficha(...a);
  const guarda = (...a) => C.guarda(...a);
  const load = (...a) => C.load(...a);
  const logros = (...a) => C.logros(...a);
  const nf = (...a) => C.nf(...a);
  const panelStats = (...a) => C.panelStats(...a);
  const portada = (...a) => C.portada(...a);
  const tarjetaPerfil = (...a) => C.tarjetaPerfil(...a);
  const unicos = (...a) => C.unicos(...a);

  /* ---------- Vista principal ---------- */
  function visibles() {
    const q = S.q.toLocaleLowerCase('es');
    const lista = S.items.filter(g => g.status === S.tab
      && (!q || `${g.title} ${g.series} ${g.developer} ${(g.tags || []).join(' ')}`.toLocaleLowerCase('es').includes(q))
      && coincide(g));
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
      ...K.doc.items(() => S.items.length ? { titulo: 'Mis juegos', nombre: 'juegos', md: juegosMd(), ancho: true } : (K.toast('No hay juegos que exportar'), null)),
      { label: 'Importar JSON', onClick: importar },
    ]);
  }
  // Colección completa por estado, en tablas Markdown
  function juegosMd() {
    const L = ['# Mis juegos', '', `${S.items.length} en la colección`];
    for (const [k, nombre] of ESTADOS) {
      const l = S.items.filter(g => g.status === k).sort((a, b) => a.title.localeCompare(b.title, 'es'));
      if (!l.length) continue;
      L.push('', `## ${nombre} (${l.length})`, '', K.doc.tabla(['Título', 'Plataformas', 'Géneros', 'Nota', 'Progreso', 'Salida'],
        l.map(g => [g.title, (g.platforms || []).join(', '), (g.genres || []).join(', '), g.rating != null ? nf(g.rating) : '', g.percent ? g.percent + '%' : '', fechaTxt(g.released)])));
    }
    return L.join('\n');
  }
  async function descarga(fmt) {
    await K.guardarUrl(`/api/games/export?format=${fmt}`, { nombre: `juegos.${fmt}` });
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
    const act = [['estudio', 'Estudio'], ['saga', 'Saga'], ['tienda', 'Tienda'], ['etiqueta', 'Etiqueta']].filter(([k]) => S[k]);
    if (act.length) {
      const ba = el('div', 'gms-activos');
      act.forEach(([k, n]) => { const c = el('span', 'k-chip', `${n}: ${S[k]}`); const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar filtro'); x.addEventListener('click', () => { S[k] = ''; pinta(); }); c.appendChild(x); ba.appendChild(c); });
      w.appendChild(ba);
    }
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
    if ((g.platforms || [])[0] || (g.genres || [])[0]) { const m = el('div', 'gms-meta'); if ((g.platforms || [])[0]) m.appendChild(K.chipValor('games.platforms', g.platforms[0])); if ((g.genres || [])[0]) m.appendChild(K.chipValor('games.genres', g.genres[0])); b.appendChild(m); }
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


  Object.assign(C, { visibles, pinta, menuMas, juegosMd, descarga, importar, biblioteca, pintaGrid, caratula, tarjeta });
})();
