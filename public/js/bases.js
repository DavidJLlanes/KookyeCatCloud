'use strict';
/* Bases de datos: columnas definidas por ti y vistas de tabla o tablero Kanban. Cada base es su propio JSON en el servidor. */
(function () {
  const root = document.getElementById('view-bases');
  if (!root || !window.K) return;
  const TIPOS = [['text', 'Texto'], ['number', 'Número'], ['date', 'Fecha'], ['checkbox', 'Casilla'], ['select', 'Selección'], ['multiselect', 'Etiquetas'], ['url', 'Enlace']];
  const TIPO_NOMBRE = Object.fromEntries(TIPOS);
  const OPS = { contains: 'contiene', equals: 'es igual a', not: 'no es', checked: 'marcada', unchecked: 'sin marcar', empty: 'está vacío', filled: 'tiene valor', gt: 'mayor que', lt: 'menor que' };
  const S = { lista: [], plantillas: [], base: null, vista: '', q: '', local: null, built: false, loading: null, ordenLocal: null };
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (label) b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };
  const bsEmptyIcon = () => { const d = el('div', 'bs-empty-i'); d.appendChild(icon('i-table')); return d; };
  const col = (id) => S.base.columns.find(c => c.id === id);
  const opcion = (c, id) => (c.opciones || []).find(o => o.id === id);
  const titulo = (r) => { const c = S.base.columns.find(x => x.tipo === 'text'); return (c && r.c[c.id]) || 'Sin título'; };
  const nf = (n) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 1000) / 1000).replace('.', ','));
  const fechaTxt = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  // Los logros se recalculan en el servidor al cambiar la base; aquí solo se pide el estado para mostrar los avisos
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);

  async function cargaLista() {
    try { const d = await K.get('/api/bases'); S.lista = d.bases; S.plantillas = d.plantillas; S.built = true; pinta(); } catch (e) { K.fail(e); }
  }
  async function abre(id) {
    try { S.base = await K.get('/api/bases/' + id); S.vista = (S.base.views[0] || {}).id; S.q = ''; S.ordenLocal = null; S.built = true; pinta(); } catch (e) { K.fail(e); }
  }
  async function recarga() { if (S.base) { try { S.base = await K.get('/api/bases/' + S.base.id); if (!S.base.views.some(v => v.id === S.vista)) S.vista = S.base.views[0].id; } catch (e) { K.fail(e); } } pinta(); logros(); }

  /* ---------- Lista de bases ---------- */
  function pinta() {
    if (!S.built) return;
    root.textContent = '';
    const page = el('section', 'bs-page'); root.appendChild(page);
    if (S.base) pintaBase(page); else pintaLista(page);
  }
  function pintaLista(page) {
    const head = el('header', 'bs-head'); const t = el('div'); t.append(el('h1', null, 'Bases'), el('p', 'k-muted', 'Tus propias bases de datos con vistas de tabla y tablero'));
    const acc = el('div', 'bs-actions');
    acc.append(btn('Importar', 'i-upload', importar), btn('Nueva base', 'i-plus', nueva, 'btn primary')); head.append(t, acc); page.appendChild(head);
    if (!S.lista.length) {
      const e = el('div', 'bs-empty'); e.append(bsEmptyIcon(), el('h2', null, 'Aún no tienes bases'), el('p', 'k-muted', 'Empieza con una plantilla (proyectos, libros, gastos…) o crea una a tu gusto.'), btn('Crear la primera', 'i-plus', nueva, 'btn primary')); page.appendChild(e); return;
    }
    const grid = el('div', 'bs-cards');
    S.lista.forEach(b => {
      const c = el('article', 'bs-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
      c.append(el('div', 'bs-card-i', b.icono), el('strong', null, b.nombre), el('small', 'k-muted', `${b.filas} fila${b.filas === 1 ? '' : 's'} · ${b.columnas} columnas`));
      const go = () => abre(b.id); c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      grid.appendChild(c);
    });
    page.appendChild(grid);
  }
  function nueva() {
    const w = el('div', 'bs-form'); let plantilla = 'proyectos';
    const nom = el('input'); nom.placeholder = 'Nombre de la base'; nom.maxLength = 80;
    const ico = el('input'); ico.placeholder = '🗂️'; ico.maxLength = 4; ico.className = 'bs-emoji';
    const f1 = el('label', 'bs-field'); f1.append(el('span', null, 'Nombre'), nom); const f2 = el('label', 'bs-field'); f2.append(el('span', null, 'Icono (emoji)'), ico);
    const fila = el('div', 'bs-row2'); fila.append(f1, f2);
    const grid = el('div', 'bs-plantillas');
    const marca = () => [...grid.children].forEach(c => c.classList.toggle('on', c.dataset.id === plantilla));
    S.plantillas.forEach(p => { const c = el('button', 'bs-plantilla'); c.type = 'button'; c.dataset.id = p.id; c.append(el('span', 'bs-plantilla-i', p.icono), el('b', null, p.nombre), el('small', 'k-muted', p.desc)); c.addEventListener('click', () => { plantilla = p.id; marca(); }); grid.appendChild(c); });
    marca(); w.append(fila, el('span', 'bs-lbl', 'Plantilla'), grid);
    K.modal({ title: 'Nueva base', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Crear', primary: true, onClick: async () => {
      try { const b = await K.post('/api/bases', { nombre: nom.value, icono: ico.value, plantilla }); S.base = b; S.vista = b.views[0].id; pinta(); logros(); return true; } catch (e) { K.fail(e); return false; }
    } }] });
  }
  function importar() {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => { const f = inp.files[0]; if (!f) return; try { const b = await K.post('/api/bases/import', JSON.parse(await f.text())); S.base = b; S.vista = b.views[0].id; pinta(); logros(); K.toast('Base importada'); } catch (e) { K.fail(e); } });
    inp.click();
  }

  /* ---------- Filtro y orden ---------- */
  function pasa(r, f) {
    if (!f) return true; const c = col(f.col); if (!c) return true; const v = r.c[c.id]; const txt = String(f.valor || '').toLocaleLowerCase('es');
    const plano = c.tipo === 'select' ? ((opcion(c, v) || {}).nombre || '') : c.tipo === 'multiselect' ? (v || []).map(i => (opcion(c, i) || {}).nombre).join(' ') : String(v ?? '');
    switch (f.op) {
      case 'contains': return plano.toLocaleLowerCase('es').includes(txt);
      case 'equals': return plano.toLocaleLowerCase('es') === txt;
      case 'not': return plano.toLocaleLowerCase('es') !== txt;
      case 'checked': return v === true; case 'unchecked': return v !== true;
      case 'empty': return !(Array.isArray(v) ? v.length : v === true || (v !== '' && v !== null && v !== undefined));
      case 'filled': return Array.isArray(v) ? v.length > 0 : v === true || (v !== '' && v !== null && v !== undefined && v !== false);
      case 'gt': return Number(v) > Number(f.valor); case 'lt': return Number(v) < Number(f.valor);
      default: return true;
    }
  }
  function filas(v) {
    const q = S.q.toLocaleLowerCase('es');
    let l = S.base.rows.filter(r => pasa(r, v.filtro) && (!q || S.base.columns.some(c => { const x = r.c[c.id]; const s = c.tipo === 'select' ? (opcion(c, x) || {}).nombre : c.tipo === 'multiselect' ? (x || []).map(i => (opcion(c, i) || {}).nombre).join(' ') : x; return String(s ?? '').toLocaleLowerCase('es').includes(q); })));
    const o = S.ordenLocal && S.ordenLocal.vista === v.id ? S.ordenLocal : v.orden ? { col: v.orden.col, dir: v.orden.dir } : null;
    if (o && col(o.col)) {
      const c = col(o.col); const k = (r) => { const x = r.c[c.id]; return c.tipo === 'select' ? (c.opciones || []).findIndex(p => p.id === x) : c.tipo === 'multiselect' ? (x || []).length : c.tipo === 'number' ? (x === null ? -Infinity : x) : c.tipo === 'checkbox' ? (x ? 1 : 0) : String(x || '').toLocaleLowerCase('es'); };
      l = [...l].sort((a, b) => { const A = k(a), B = k(b); return (A < B ? -1 : A > B ? 1 : 0) * (o.dir === 'desc' ? -1 : 1); });
    }
    return l;
  }

  /* ---------- Cabecera de una base ---------- */
  function pintaBase(page) {
    const b = S.base; const v = b.views.find(x => x.id === S.vista) || b.views[0];
    const head = el('header', 'bs-head');
    const back = btn('Bases', null, () => { S.base = null; cargaLista(); }, 'btn sm'); back.prepend(el('span', null, '← '));
    const t = el('div', 'bs-titulo'); const nm = el('h1'); nm.append(el('span', 'bs-ico', b.icon), el('span', null, b.name)); nm.title = 'Pulsa para renombrar'; nm.addEventListener('click', renombra); t.appendChild(nm);
    t.appendChild(el('p', 'k-muted', `${b.rows.length} fila${b.rows.length === 1 ? '' : 's'} · ${b.columns.length} columnas`));
    const acc = el('div', 'bs-actions');
    acc.append(btn('Columnas', 'i-list', editaColumnas), btn('Vista', 'i-pencil', () => editaVista(v)), btn('', 'i-dots', ev => menuMas(ev.currentTarget)));
    acc.lastChild.setAttribute('aria-label', 'Más opciones');
    head.append(back, t, acc); page.appendChild(head);
    const tabs = el('div', 'bs-tabs');
    b.views.forEach(x => { const t2 = el('button', x.id === v.id ? 'is-active' : '', `${x.tipo === 'kanban' ? '▦ ' : '☰ '}${x.nombre}`); t2.type = 'button'; t2.addEventListener('click', () => { S.vista = x.id; pinta(); }); tabs.appendChild(t2); });
    const plus = el('button', 'bs-tab-plus', '+'); plus.type = 'button'; plus.title = 'Nueva vista'; plus.setAttribute('aria-label', 'Nueva vista'); plus.addEventListener('click', () => editaVista(null)); tabs.appendChild(plus);
    page.appendChild(tabs);
    const bar = el('div', 'bs-bar'); const s = el('label', 'search bs-search'); s.appendChild(icon('i-search'));
    const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar en la base…'; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar');
    inp.addEventListener('input', K.debounce(() => { S.q = inp.value; repinta(); }, 150)); s.appendChild(inp); bar.appendChild(s);
    if (v.filtro) { const c = col(v.filtro.col); bar.appendChild(el('span', 'bs-chip', `Filtro: ${c ? c.nombre : '?'} ${OPS[v.filtro.op]}${['checked', 'unchecked', 'empty', 'filled'].includes(v.filtro.op) ? '' : ' «' + v.filtro.valor + '»'}`)); }
    page.appendChild(bar);
    const cont = el('div', 'bs-cont'); cont.id = 'bs-cont'; page.appendChild(cont);
    repinta();
  }
  function repinta() {
    const cont = root.querySelector('#bs-cont'); if (!cont || !S.base) return; cont.textContent = '';
    const v = S.base.views.find(x => x.id === S.vista) || S.base.views[0];
    if (v.tipo === 'kanban') pintaKanban(cont, v); else pintaTabla(cont, v);
  }
  function menuMas(anchor) {
    K.menu(anchor, [
      { label: 'Renombrar base', onClick: renombra },
      { label: 'Exportar CSV', onClick: () => descarga('csv') }, { label: 'Exportar JSON', onClick: () => descarga('json') },
      { label: 'Copiar o mover a…', onClick: () => K.transferir.abre({ tipo: 'bases', ids: [S.base.id], titulo: S.base.name }, { alTerminar: (r) => { if (r && r.modo === 'mover') { S.base = null; cargaLista(); } } }) },
      '-', { label: 'Eliminar base', danger: true, onClick: eliminar },
    ]);
  }
  function renombra() {
    const n = el('input'); n.value = S.base.name; n.maxLength = 80; const e = el('input'); e.value = S.base.icon; e.maxLength = 4; e.className = 'bs-emoji';
    const w = el('div', 'bs-form'); const f1 = el('label', 'bs-field'); f1.append(el('span', null, 'Nombre'), n); const f2 = el('label', 'bs-field'); f2.append(el('span', null, 'Icono'), e); const r = el('div', 'bs-row2'); r.append(f1, f2); w.appendChild(r);
    K.modal({ title: 'Renombrar base', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { try { S.base = await K.put('/api/bases/' + S.base.id, { nombre: n.value, icono: e.value }); pinta(); return true; } catch (er) { K.fail(er); return false; } } }] });
  }
  async function eliminar() {
    if (!await K.confirm(`Se eliminará la base «${S.base.name}» con todas sus filas.`, { ok: 'Eliminar', danger: true })) return;
    try { await K.del('/api/bases/' + S.base.id); S.base = null; await cargaLista(); logros(); } catch (e) { K.fail(e); }
  }
  async function descarga(fmt) {
    try {
      const r = await fetch(`${BASE}/api/bases/${S.base.id}/export?format=${fmt}`, { credentials: 'same-origin' }); if (!r.ok) throw new Error('No se pudo exportar');
      const url = URL.createObjectURL(await r.blob()); const a = el('a'); a.href = url; a.download = `${S.base.name}.${fmt}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { K.fail(e); }
  }

  /* ---------- Operaciones sobre filas ---------- */
  async function guardaCelda(r, c, valor) {
    r.c[c.id] = valor;
    try { const d = await K.put(`/api/bases/${S.base.id}/rows/${r.id}`, { c: { [c.id]: valor } }); Object.assign(r, d.row); logros(); } catch (e) { K.fail(e); recarga(); }
  }
  async function nuevaFila(inicial = {}) {
    try { const d = await K.post(`/api/bases/${S.base.id}/rows`, { c: inicial }); S.base.rows.push(d.row); repinta(); actualizaContador(); logros(); return d.row; } catch (e) { K.fail(e); return null; }
  }
  function actualizaContador() { const p = root.querySelector('.bs-titulo p'); if (p) p.textContent = `${S.base.rows.length} fila${S.base.rows.length === 1 ? '' : 's'} · ${S.base.columns.length} columnas`; }
  async function borraFila(r) {
    if (!await K.confirm(`Se eliminará la fila «${titulo(r)}».`, { ok: 'Eliminar', danger: true })) return false;
    try { await K.del(`/api/bases/${S.base.id}/rows/${r.id}`); S.base.rows = S.base.rows.filter(x => x.id !== r.id); repinta(); actualizaContador(); logros(); return true; } catch (e) { K.fail(e); return false; }
  }
  async function mueve(r, c, opId) {
    try { const d = await K.post(`/api/bases/${S.base.id}/rows/${r.id}/move`, { columna: c.id, opcion: opId }); Object.assign(r, d.row); repinta(); logros(); } catch (e) { K.fail(e); }
  }

  /* ---------- Tabla ---------- */
  function chip(c, id) { const o = opcion(c, id); if (!o) return null; const s = el('span', 'bs-opt', o.nombre); s.style.setProperty('--o', o.color); return s; }
  function celda(r, c) {
    const v = r.c[c.id]; const td = el('td'); td.dataset.t = c.tipo;
    if (c.tipo === 'text' || c.tipo === 'url') {
      const i = el('input'); i.type = c.tipo === 'url' ? 'url' : 'text'; i.value = v || ''; i.maxLength = c.tipo === 'url' ? 500 : 2000; i.setAttribute('aria-label', c.nombre); if (c.tipo === 'url') i.placeholder = 'https://…';
      i.addEventListener('change', () => guardaCelda(r, c, i.value)); td.appendChild(i);
      if (c.tipo === 'url' && v) { const a = el('a', 'bs-ext', '↗'); a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Abrir enlace'; td.appendChild(a); }
    } else if (c.tipo === 'number') {
      const i = el('input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal'; i.value = v === null || v === undefined ? '' : v; i.setAttribute('aria-label', c.nombre); i.addEventListener('change', () => guardaCelda(r, c, i.value === '' ? null : Number(i.value))); td.appendChild(i);
    } else if (c.tipo === 'date') {
      const i = el('input'); i.type = 'date'; i.value = v || ''; i.setAttribute('aria-label', c.nombre); i.addEventListener('change', () => guardaCelda(r, c, i.value)); td.appendChild(i);
    } else if (c.tipo === 'checkbox') {
      const i = el('input'); i.type = 'checkbox'; i.checked = v === true; i.setAttribute('aria-label', c.nombre); i.addEventListener('change', () => guardaCelda(r, c, i.checked)); td.appendChild(i); td.classList.add('centro');
    } else if (c.tipo === 'select') {
      const s = el('select'); s.setAttribute('aria-label', c.nombre); const o0 = el('option', null, '—'); o0.value = ''; s.appendChild(o0);
      (c.opciones || []).forEach(o => { const x = el('option', null, o.nombre); x.value = o.id; s.appendChild(x); }); s.value = v || '';
      const pinta2 = () => { const o = opcion(c, s.value); if (o) s.style.setProperty('--o', o.color); else s.style.removeProperty('--o'); s.classList.toggle('con', !!o); };
      pinta2(); s.addEventListener('change', () => { pinta2(); guardaCelda(r, c, s.value); }); td.appendChild(s);
    } else if (c.tipo === 'multiselect') {
      const b = el('button', 'bs-multi'); b.type = 'button'; b.setAttribute('aria-label', c.nombre);
      const pinta2 = () => { b.textContent = ''; const ids = r.c[c.id] || []; if (!ids.length) b.appendChild(el('span', 'k-faint', '—')); ids.forEach(i => { const ch = chip(c, i); if (ch) b.appendChild(ch); }); };
      pinta2(); b.addEventListener('click', () => eligeVarios(c, r.c[c.id] || [], (nuevo) => { guardaCelda(r, c, nuevo); pinta2(); })); td.appendChild(b);
    }
    return td;
  }
  function eligeVarios(c, actual, fn) {
    const w = el('div', 'bs-form'); const sel = new Set(actual);
    (c.opciones || []).forEach(o => { const l = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = sel.has(o.id); i.addEventListener('change', () => { i.checked ? sel.add(o.id) : sel.delete(o.id); }); const ch = chip(c, o.id); l.append(i, ch); w.appendChild(l); });
    if (!(c.opciones || []).length) w.appendChild(el('p', 'k-muted', 'Esta columna aún no tiene opciones. Añádelas en «Columnas».'));
    K.modal({ title: c.nombre, content: w, actions: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, onClick: () => { fn([...sel]); return true; } }] });
  }
  function pintaTabla(cont, v) {
    const lista = filas(v); const wrap = el('div', 'bs-scroll'); const t = el('table', 'bs-tabla');
    const thead = el('thead'); const tr = el('tr');
    const o = S.ordenLocal && S.ordenLocal.vista === v.id ? S.ordenLocal : v.orden;
    S.base.columns.forEach(c => {
      const th = el('th'); const b = el('button', 'bs-th'); b.type = 'button'; b.append(el('span', null, c.nombre), el('small', null, o && o.col === c.id ? (o.dir === 'desc' ? ' ▼' : ' ▲') : '')); b.title = `${TIPO_NOMBRE[c.tipo]} · pulsa para ordenar`;
      b.addEventListener('click', () => { S.ordenLocal = { vista: v.id, col: c.id, dir: o && o.col === c.id && o.dir === 'asc' ? 'desc' : 'asc' }; repinta(); }); th.appendChild(b); tr.appendChild(th);
    });
    tr.appendChild(el('th', 'acc')); thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody');
    lista.forEach(r => {
      const f = el('tr'); S.base.columns.forEach(c => f.appendChild(celda(r, c)));
      const a = el('td', 'acc'); const ed = el('button', 'icon-btn'); ed.type = 'button'; ed.title = 'Abrir fila'; ed.setAttribute('aria-label', 'Abrir fila'); ed.appendChild(icon('i-pencil')); ed.addEventListener('click', () => editaFila(r));
      const del = el('button', 'icon-btn'); del.type = 'button'; del.title = 'Eliminar fila'; del.setAttribute('aria-label', 'Eliminar fila'); del.appendChild(icon('i-trash')); del.addEventListener('click', () => borraFila(r));
      a.append(ed, del); f.appendChild(a); tb.appendChild(f);
    });
    t.appendChild(tb); wrap.appendChild(t); cont.appendChild(wrap);
    if (!lista.length) cont.appendChild(el('p', 'k-muted bs-vacio', S.base.rows.length ? 'Ninguna fila coincide con el filtro o la búsqueda.' : 'Aún no hay filas.'));
    cont.appendChild(btn('Nueva fila', 'i-plus', () => nuevaFila(), 'btn bs-nueva'));
  }

  /* ---------- Tablero Kanban ---------- */
  function pintaKanban(cont, v) {
    const g = col(v.agrupa);
    if (!g) { cont.appendChild(el('p', 'k-muted bs-vacio', 'Este tablero necesita una columna de tipo «Selección» para agrupar las tarjetas. Añádela en «Columnas» y elígela en «Vista».')); return; }
    const lista = filas(v); const board = el('div', 'bs-board');
    const grupos = [...(g.opciones || []).map(o => ({ id: o.id, nombre: o.nombre, color: o.color })), { id: '', nombre: 'Sin asignar', color: '#64748b' }];
    grupos.forEach(gr => {
      const rs = lista.filter(r => (r.c[g.id] || '') === gr.id);
      if (!gr.id && !rs.length) return;
      const colu = el('section', 'bs-col'); colu.style.setProperty('--o', gr.color);
      const h = el('header'); h.append(el('b', null, gr.nombre), el('span', 'bs-n', String(rs.length)));
      if (gr.id) { const add = el('button', 'icon-btn'); add.type = 'button'; add.title = 'Añadir tarjeta'; add.setAttribute('aria-label', `Añadir tarjeta en ${gr.nombre}`); add.appendChild(icon('i-plus')); add.addEventListener('click', async () => { const r = await nuevaFila({ [g.id]: gr.id }); if (r) editaFila(r); }); h.appendChild(add); }
      colu.appendChild(h);
      const cuerpo = el('div', 'bs-cards-col');
      colu.addEventListener('dragover', e => { e.preventDefault(); colu.classList.add('sobre'); }); colu.addEventListener('dragleave', () => colu.classList.remove('sobre'));
      colu.addEventListener('drop', e => { e.preventDefault(); colu.classList.remove('sobre'); const rid = e.dataTransfer.getData('text/plain'); const r = S.base.rows.find(x => x.id === rid); if (r && (r.c[g.id] || '') !== gr.id) mueve(r, g, gr.id); });
      rs.forEach(r => cuerpo.appendChild(tarjeta(r, g, grupos)));
      colu.appendChild(cuerpo); board.appendChild(colu);
    });
    cont.appendChild(board);
    cont.appendChild(btn('Nueva tarjeta', 'i-plus', async () => { const r = await nuevaFila(); if (r) editaFila(r); }, 'btn bs-nueva'));
  }
  function tarjeta(r, g, grupos) {
    const c = el('article', 'bs-tarjeta'); c.draggable = true; c.tabIndex = 0;
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastra'); }); c.addEventListener('dragend', () => c.classList.remove('arrastra'));
    c.appendChild(el('strong', null, titulo(r)));
    const meta = el('div', 'bs-meta');
    S.base.columns.forEach(x => {
      if (x.id === g.id) return; const val = r.c[x.id];
      if (x.tipo === 'text' && x === S.base.columns.find(y => y.tipo === 'text')) return;
      if (x.tipo === 'select' && val) { const ch = chip(x, val); if (ch) meta.appendChild(ch); }
      else if (x.tipo === 'multiselect') (val || []).forEach(i => { const ch = chip(x, i); if (ch) meta.appendChild(ch); });
      else if (x.tipo === 'date' && val) meta.appendChild(el('span', 'bs-dato', '📅 ' + fechaTxt(val)));
      else if (x.tipo === 'number' && val !== null && val !== undefined) meta.appendChild(el('span', 'bs-dato', `${x.nombre}: ${nf(val)}`));
      else if (x.tipo === 'checkbox' && val) meta.appendChild(el('span', 'bs-dato', '✔ ' + x.nombre));
    });
    if (meta.childNodes.length) c.appendChild(meta);
    const mv = el('button', 'icon-btn bs-mover'); mv.type = 'button'; mv.title = 'Mover a…'; mv.setAttribute('aria-label', 'Mover a otra columna'); mv.textContent = '⇄';
    mv.addEventListener('click', ev => { ev.stopPropagation(); K.menu(mv, grupos.filter(x => x.id || (r.c[g.id])).map(x => ({ label: x.nombre, dot: x.color, checked: (r.c[g.id] || '') === x.id, onClick: () => mueve(r, g, x.id) }))); });
    c.appendChild(mv);
    c.addEventListener('click', () => editaFila(r)); c.addEventListener('keydown', e => { if (e.key === 'Enter') editaFila(r); });
    return c;
  }

  /* ---------- Editor de una fila ---------- */
  function editaFila(r) {
    const w = el('div', 'bs-form'); const val = { ...r.c };
    S.base.columns.forEach(c => {
      const l = el('div', 'bs-field'); l.appendChild(el('span', null, c.nombre)); let ctl;
      if (c.tipo === 'text') { ctl = el('textarea'); ctl.rows = c === S.base.columns[0] ? 1 : 3; ctl.value = val[c.id] || ''; ctl.addEventListener('input', () => { val[c.id] = ctl.value; }); }
      else if (c.tipo === 'checkbox') { ctl = el('input'); ctl.type = 'checkbox'; ctl.checked = val[c.id] === true; ctl.addEventListener('change', () => { val[c.id] = ctl.checked; }); }
      else if (c.tipo === 'select') { ctl = el('select'); const o0 = el('option', null, '—'); o0.value = ''; ctl.appendChild(o0); (c.opciones || []).forEach(o => { const x = el('option', null, o.nombre); x.value = o.id; ctl.appendChild(x); }); ctl.value = val[c.id] || ''; ctl.addEventListener('change', () => { val[c.id] = ctl.value; }); }
      else if (c.tipo === 'multiselect') { ctl = el('div', 'bs-checks'); const sel = new Set(val[c.id] || []); (c.opciones || []).forEach(o => { const lb = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = sel.has(o.id); i.addEventListener('change', () => { i.checked ? sel.add(o.id) : sel.delete(o.id); val[c.id] = [...sel]; }); lb.append(i, chip(c, o.id)); ctl.appendChild(lb); }); if (!(c.opciones || []).length) ctl.appendChild(el('small', 'k-faint', 'Sin opciones')); }
      else { ctl = el('input'); ctl.type = c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'url'; if (c.tipo === 'number') { ctl.step = 'any'; ctl.inputMode = 'decimal'; } ctl.value = val[c.id] === null || val[c.id] === undefined ? '' : val[c.id]; ctl.addEventListener('input', () => { val[c.id] = c.tipo === 'number' ? (ctl.value === '' ? null : Number(ctl.value)) : ctl.value; }); }
      l.appendChild(ctl); w.appendChild(l);
    });
    K.modal({
      title: titulo(r), content: w, cls: 'wide', actions: [
        { label: 'Cerrar' },
        { label: 'Eliminar', danger: true, onClick: async () => !(await borraFila(r)) ? false : true },
        { label: 'Guardar', primary: true, onClick: async () => { try { const d = await K.put(`/api/bases/${S.base.id}/rows/${r.id}`, { c: val }); Object.assign(r, d.row); repinta(); logros(); return true; } catch (e) { K.fail(e); return false; } } },
      ],
    });
  }

  /* ---------- Editor de columnas ---------- */
  function editaColumnas() {
    const cols = S.base.columns.map(c => ({ ...c, opciones: (c.opciones || []).map(o => ({ ...o })) }));
    const w = el('div', 'bs-form bs-cols');
    const dibuja = () => {
      w.textContent = '';
      cols.forEach((c, i) => {
        const bloque = el('div', 'bs-colbloque'); const fila = el('div', 'bs-colfila');
        const n = el('input'); n.value = c.nombre; n.maxLength = 60; n.setAttribute('aria-label', 'Nombre de la columna'); n.addEventListener('input', () => { c.nombre = n.value; });
        const t = el('span', 'bs-tipo', TIPO_NOMBRE[c.tipo]);
        const del = el('button', 'icon-btn'); del.type = 'button'; del.title = 'Eliminar columna'; del.setAttribute('aria-label', 'Eliminar columna'); del.appendChild(icon('i-trash'));
        del.addEventListener('click', async () => { if (cols.length < 2) { K.toast('La base necesita al menos una columna'); return; } if (await K.confirm(`Se eliminará la columna «${c.nombre}» y sus datos.`, { ok: 'Quitar', danger: true })) { cols.splice(i, 1); dibuja(); } });
        fila.append(n, t, del); bloque.appendChild(fila);
        if (c.tipo === 'select' || c.tipo === 'multiselect') {
          const ops = el('div', 'bs-ops');
          c.opciones.forEach((o, j) => {
            const f = el('div', 'bs-op'); const cl = el('input'); cl.type = 'color'; cl.value = o.color; cl.addEventListener('input', () => { o.color = cl.value; });
            const nn = el('input'); nn.value = o.nombre; nn.maxLength = 40; nn.setAttribute('aria-label', 'Nombre de la opción'); nn.addEventListener('input', () => { o.nombre = nn.value; });
            const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar opción'); x.textContent = '×'; x.addEventListener('click', () => { c.opciones.splice(j, 1); dibuja(); });
            f.append(cl, nn, x); ops.appendChild(f);
          });
          ops.appendChild(btn('Opción', 'i-plus', () => { c.opciones.push({ nombre: '', color: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'][c.opciones.length % 8] }); dibuja(); }, 'btn sm')); bloque.appendChild(ops);
        }
        w.appendChild(bloque);
      });
      const nuevaFila2 = el('div', 'bs-colfila bs-nuevacol'); const nn = el('input'); nn.placeholder = 'Nueva columna…'; nn.maxLength = 60;
      const ts = el('select'); TIPOS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; ts.appendChild(o); });
      nuevaFila2.append(nn, ts, btn('Añadir', 'i-plus', () => { if (!nn.value.trim()) return; if (cols.length >= 30) { K.toast('Máximo 30 columnas'); return; } cols.push({ nombre: nn.value.trim(), tipo: ts.value, ...(ts.value === 'select' || ts.value === 'multiselect' ? { opciones: [] } : {}) }); dibuja(); }, 'btn sm')); w.appendChild(nuevaFila2);
    };
    dibuja();
    K.modal({ title: 'Columnas', sub: 'El tipo de una columna no se puede cambiar una vez creada', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { S.base = await K.put(`/api/bases/${S.base.id}/schema`, { columnas: cols, vistas: S.base.views }); if (!S.base.views.some(v => v.id === S.vista)) S.vista = S.base.views[0].id; pinta(); logros(); return true; } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Editor de vistas ---------- */
  function editaVista(v) {
    const nueva2 = !v; const d = v ? JSON.parse(JSON.stringify(v)) : { nombre: 'Nueva vista', tipo: 'table', orden: null, filtro: null };
    const w = el('div', 'bs-form');
    const nom = el('input'); nom.value = d.nombre; nom.maxLength = 40; const f1 = el('label', 'bs-field'); f1.append(el('span', null, 'Nombre'), nom);
    const tipo = el('select'); [['table', 'Tabla'], ['kanban', 'Tablero (Kanban)']].forEach(([k, n]) => { const o = el('option', null, n); o.value = k; tipo.appendChild(o); }); tipo.value = d.tipo; const f2 = el('label', 'bs-field'); f2.append(el('span', null, 'Tipo de vista'), tipo);
    const agr = el('select'); S.base.columns.filter(c => c.tipo === 'select').forEach(c => { const o = el('option', null, c.nombre); o.value = c.id; agr.appendChild(o); }); agr.value = d.agrupa || (agr.options[0] ? agr.options[0].value : '');
    const f3 = el('label', 'bs-field'); f3.append(el('span', null, 'Agrupar tarjetas por'), agr);
    const alt = () => { f3.hidden = tipo.value !== 'kanban'; }; tipo.addEventListener('change', alt); alt();
    const oc = el('select'); const o0 = el('option', null, 'Sin orden'); o0.value = ''; oc.appendChild(o0); S.base.columns.forEach(c => { const o = el('option', null, c.nombre); o.value = c.id; oc.appendChild(o); }); oc.value = d.orden ? d.orden.col : '';
    const od = el('select'); [['asc', 'Ascendente'], ['desc', 'Descendente']].forEach(([k, n]) => { const o = el('option', null, n); o.value = k; od.appendChild(o); }); od.value = d.orden ? d.orden.dir : 'asc';
    const f4 = el('div', 'bs-row2'); const a4 = el('label', 'bs-field'); a4.append(el('span', null, 'Ordenar por'), oc); const b4 = el('label', 'bs-field'); b4.append(el('span', null, 'Dirección'), od); f4.append(a4, b4);
    const fc = el('select'); const f0 = el('option', null, 'Sin filtro'); f0.value = ''; fc.appendChild(f0); S.base.columns.forEach(c => { const o = el('option', null, c.nombre); o.value = c.id; fc.appendChild(o); }); fc.value = d.filtro ? d.filtro.col : '';
    const fo = el('select'); Object.entries(OPS).forEach(([k, n]) => { const o = el('option', null, n); o.value = k; fo.appendChild(o); }); fo.value = d.filtro ? d.filtro.op : 'contains';
    const fv = el('input'); fv.placeholder = 'Valor'; fv.value = d.filtro ? d.filtro.valor : '';
    const f5 = el('div', 'bs-row3'); const a5 = el('label', 'bs-field'); a5.append(el('span', null, 'Filtrar'), fc); const b5 = el('label', 'bs-field'); b5.append(el('span', null, 'Condición'), fo); const c5 = el('label', 'bs-field'); c5.append(el('span', null, 'Valor'), fv); f5.append(a5, b5, c5);
    w.append(f1, f2, f3, f4, f5);
    const acts = [{ label: 'Cancelar' }];
    if (!nueva2 && S.base.views.length > 1) acts.push({ label: 'Eliminar vista', danger: true, onClick: async () => { try { S.base = await K.put(`/api/bases/${S.base.id}/schema`, { columnas: S.base.columns, vistas: S.base.views.filter(x => x.id !== v.id) }); S.vista = S.base.views[0].id; pinta(); return true; } catch (e) { K.fail(e); return false; } } });
    acts.push({ label: 'Guardar', primary: true, onClick: async () => {
      if (tipo.value === 'kanban' && !agr.value) { K.toast('Para un tablero necesitas una columna de tipo Selección'); return false; }
      const nv = { ...(v || {}), nombre: nom.value, tipo: tipo.value, agrupa: tipo.value === 'kanban' ? agr.value : undefined, orden: oc.value ? { col: oc.value, dir: od.value } : null, filtro: fc.value ? { col: fc.value, op: fo.value, valor: fv.value } : null };
      const vistas = nueva2 ? [...S.base.views, nv] : S.base.views.map(x => x.id === v.id ? nv : x);
      try { S.base = await K.put(`/api/bases/${S.base.id}/schema`, { columnas: S.base.columns, vistas }); if (nueva2) S.vista = S.base.views[S.base.views.length - 1].id; S.ordenLocal = null; pinta(); return true; } catch (e) { K.fail(e); return false; }
    } });
    K.modal({ title: nueva2 ? 'Nueva vista' : 'Editar vista', content: w, cls: 'wide', actions: acts });
  }

  K.registerView('bases', { open() { if (S.base) recarga(); else cargaLista(); }, close() {} });
})();
