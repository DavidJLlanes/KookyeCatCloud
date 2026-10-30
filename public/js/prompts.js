'use strict';
/* ---------------------------------------------------------------
   Prompts de IA: biblioteca con categorías (en árbol), listas, etiquetas de color, tipo,
   estado, modelo, valoración, imágenes de muestra (WebP), variables {{así}}, historial,
   papelera, importación/exportación y fecha vinculada al calendario.
--------------------------------------------------------------- */
(function () {
  const KIND_BASE = [
    { id: 'imagen', name: 'Imagen', icon: 'i-image' }, { id: 'texto', name: 'Texto', icon: 'i-doc' },
    { id: 'codigo', name: 'Código', icon: 'i-bars' }, { id: 'video', name: 'Vídeo', icon: 'i-play' },
    { id: 'audio', name: 'Audio', icon: 'i-music' }, { id: 'agente', name: 'Agente', icon: 'i-sparkle' },
    { id: 'fragmento', name: 'Fragmento', icon: 'i-tag' }, { id: 'otro', name: 'Otro', icon: 'i-stack' },
  ];
  const KIND_ICONS = [
    ['i-image', 'Imagen'], ['i-doc', 'Documento'], ['i-bars', 'Código'], ['i-play', 'Vídeo'], ['i-music', 'Audio'],
    ['i-sparkle', 'Destello'], ['i-tag', 'Etiqueta'], ['i-stack', 'Capas'], ['i-folder', 'Carpeta'], ['i-note', 'Nota'],
    ['i-server', 'Servidor'], ['i-monitor', 'Pantalla'], ['i-globe', 'Web'], ['i-mail', 'Correo'], ['i-calendar', 'Calendario'],
    ['i-palette', 'Paleta'], ['i-activity', 'Actividad'], ['i-cloud', 'Nube'], ['i-key', 'Llave'], ['i-link', 'Enlace'],
    ['i-shield', 'Escudo'], ['i-user', 'Usuario'], ['i-users', 'Usuarios'], ['i-zip', 'Archivo ZIP'], ['i-check', 'Correcto'],
    ['i-star', 'Estrella'], ['i-pin', 'Fijado'], ['i-cart', 'Compra'],
  ];
  const PRO = () => (K.prompts && K.prompts.pro) || null;
  const STATUS = { borrador: 'Borrador', probando: 'Probando', final: 'Final', archivado: 'Archivado' };
  const SORTS = [['updated', 'Modificados recientemente'], ['created', 'Más nuevos'], ['oldest', 'Más antiguos'], ['title', 'Título A-Z'],
    ['rating', 'Mejor valorados'], ['uses', 'Más usados']];

  const S = {
    built: false, M: null, items: [], total: 0, page: 1, pages: 1, loading: 0,
    q: { q: '', category: '', list: '', kind: '', status: '', model: '', tool: '', fav: false, minRating: 0, images: '', cal: false, from: '', to: '', trash: false, sort: 'updated' },
    labels: new Set(), view: 'grid', sel: new Set(), selMode: false, modelsAll: false, toolsAll: false,
  };
  try { S.view = localStorage.getItem('kcc-pr-view') || 'grid'; S.q.sort = localStorage.getItem('kcc-pr-sort') || 'updated'; } catch {}
  const R = {};
  const imgUrl = (pid, iid, thumb) => `${BASE}/api/prompts/${pid}/img/${iid}${thumb ? '?thumb=1' : ''}`;
  const kindDefs = () => {
    const saved = S.M && Array.isArray(S.M.kindDefs) ? S.M.kindDefs : [];
    const byId = new Map(saved.filter(k => k && typeof k === 'object' && typeof k.id === 'string').map(k => [k.id, k]));
    return KIND_BASE.map(base => {
      const k = byId.get(base.id);
      const storedName = k && typeof k.name === 'string' ? k.name.trim() : '';
      const name = storedName && !/^(?:false|true|null|undefined)$/i.test(storedName) ? storedName : base.name;
      const icono = k && KIND_ICONS.some(([id]) => id === k.icon) ? k.icon : base.icon;
      return { ...base, name, icon: icono };
    });
  };
  const kindBy = (id) => kindDefs().find(k => k.id === id) || { id, name: id || 'Otro', icon: 'i-stack' };
  const catBy = (id) => (S.M ? S.M.categories.find(c => c.id === id) : null);
  const listBy = (id) => (S.M ? S.M.lists.find(c => c.id === id) : null);
  const colorOf = (p) => p.color || (catBy(p.category) && catBy(p.category).color) || 'transparent';

  /* ---------- Datos ---------- */
  function params(page) {
    const q = S.q;
    return K.qs({
      q: q.q, category: q.category, list: q.list, kind: q.kind, status: q.status, model: q.model, tool: q.tool,
      fav: q.fav, minRating: q.minRating || '', images: q.images, cal: q.cal, from: q.from, to: q.to,
      trash: q.trash, sort: q.sort, labels: [...S.labels].join(','), page, limit: S.view === 'board' ? 200 : 48,
    });
  }
  async function loadMeta() {
    S.M = await K.get('/api/prompts/meta');
  }
  async function load(append) {
    const n = ++S.loading;
    try {
      if (!append) S.page = 1;
      const [r, m] = await Promise.all([K.get('/api/prompts?' + params(append ? S.page + 1 : 1)), append ? Promise.resolve(S.M) : K.get('/api/prompts/meta')]);
      if (n !== S.loading) return;
      S.M = m;
      if (append) { S.items.push(...r.items); S.page++; } else { S.items = r.items; S.page = 1; }
      S.total = r.total; S.pages = r.pages;
      if (!append) S.sel = new Set([...S.sel].filter(id => S.items.some(i => i.id === id)));
    } catch (e) { K.fail(e); }
    render();
  }

  /* ---------- Estructura ---------- */
  function build() {
    const v = $('view-prompts');
    v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); const h2 = el('h2', null, 'Prompts'); const sub = el('p', 'sub', ''); t.append(h2, sub);
    const search = el('div', 'kv-search'); search.appendChild(icon('i-search'));
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar en títulos, textos, notas…  ( / )'; si.autocomplete = 'off'; search.appendChild(si);
    const nuevo = el('button', 'btn primary'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', 'lbl', 'Nuevo prompt'));
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.title = 'Importar, exportar y más';
    head.append(t, el('span', 'grow'), search, nuevo, mas);

    const wrap = el('div', 'pr');
    const rail = el('aside', 'pr-rail');
    const main = el('section', 'pr-main');
    const tools = el('div', 'pr-tools');
    const sort = el('select'); SORTS.forEach(([v2, l]) => { const o = el('option', null, l); o.value = v2; sort.appendChild(o); }); sort.value = S.q.sort;
    const seg = el('div', 'seg'); seg.style.width = 'auto';
    for (const [id, ic, tt] of [['grid', 'i-grid', 'Tarjetas'], ['list', 'i-list', 'Lista'], ['board', 'i-columns', 'Tablero por estado']]) {
      const b = el('button'); b.type = 'button'; b.dataset.v = id; b.title = tt; b.appendChild(icon(ic));
      b.addEventListener('click', () => { S.view = id; try { localStorage.setItem('kcc-pr-view', id); } catch {} load(); });
      seg.appendChild(b);
    }
    const filt = el('button', 'btn sm'); filt.type = 'button'; filt.append(icon('i-filter'), el('span', null, 'Filtros'));
    const selb = el('button', 'btn sm'); selb.type = 'button'; selb.append(icon('i-check-square'), el('span', null, 'Seleccionar'));
    const count = el('span', 'pr-count');
    // En pantallas estrechas la barra de categorías se esconde tras este botón
    const railBtn = el('button', 'btn sm pr-railbtn'); railBtn.type = 'button'; railBtn.append(icon('i-sidebar'), el('span', null, 'Categorías'));
    railBtn.addEventListener('click', () => { wrap.classList.toggle('rail-open'); railBtn.classList.toggle('is-on'); });
    tools.append(railBtn, sort, seg, filt, selb, count);
    const active = el('div', 'pr-active');
    const content = el('div', 'pr-content');
    main.append(tools, active, content);
    wrap.append(rail, main);
    v.append(head, wrap);
    const selbar = el('div', 'pr-selbar'); selbar.hidden = true; v.appendChild(selbar);
    Object.assign(R, { head, sub, rail, content, active, count, sort, seg, si, selbar, selb, filt });

    si.addEventListener('input', K.debounce(() => { S.q.q = si.value.trim(); load(); }, 220));
    sort.addEventListener('change', () => { S.q.sort = sort.value; try { localStorage.setItem('kcc-pr-sort', sort.value); } catch {} load(); });
    nuevo.addEventListener('click', () => openEditor(null));
    mas.addEventListener('click', () => K.menu(mas, [
      { label: 'Importar prompts…', icon: 'i-upload', onClick: openImport },
      { label: 'Exportar todo (JSON)', icon: 'i-download', onClick: () => { location.href = BASE + '/api/prompts/export/all'; } },
      { label: 'Editar nombres e iconos de tipos…', icon: 'i-palette', onClick: manageKinds },
      ...((K.prompts && K.prompts.extraMenu) || []),
      '-', { label: 'Gestionar etiquetas…', icon: 'i-tag', onClick: () => K.manageLabels() },
    ], { align: 'end' }));
    filt.addEventListener('click', () => openFilters(filt));
    selb.addEventListener('click', () => { S.selMode = !S.selMode; if (!S.selMode) S.sel.clear(); render(); });
    document.addEventListener('keydown', (e) => {
      if ($('view-prompts').hidden || e.target.closest('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey) return;
      if (e.key === '/') { e.preventDefault(); si.focus(); }
      else if (e.key === 'n' && !document.querySelector('.overlay')) { e.preventDefault(); openEditor(null); }
    });
    S.built = true;
  }

  /* ---------- Barra lateral ---------- */
  function link({ emoji, ic, name, n, on, color, depth = 0, onClick, menu }) {
    const b = el('div', 'pr-link' + (on ? ' is-on' : '') + (depth ? ' sub' + Math.min(depth, 2) : ''));
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    if (color) b.style.setProperty('--c', color);
    const em = el('span', 'em'); if (emoji) em.textContent = emoji; else if (ic) em.appendChild(icon(ic)); else { const d = el('span', 'k-dot'); d.style.setProperty('--c', color || '#64748b'); em.appendChild(d); }
    b.append(em, el('span', 'nm', name));
    if (n !== undefined) b.appendChild(el('span', 'n', String(n)));
    if (menu) { const m = el('button', 'more'); m.type = 'button'; m.appendChild(icon('i-dots')); m.addEventListener('click', (e) => { e.stopPropagation(); menu(m); }); b.appendChild(m); }
    b.addEventListener('click', onClick);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); });
    return b;
  }
  const resetNav = () => { Object.assign(S.q, { category: '', list: '', fav: false, images: '', trash: false, kind: '', status: '', model: '', tool: '' }); };

  function section(title, action) {
    const s = el('div', 'pr-sec'); const h = el('h4'); h.appendChild(el('span', null, title));
    if (action) { const b = el('button'); b.type = 'button'; b.appendChild(icon('i-plus')); b.title = action.title; b.addEventListener('click', action.fn); h.appendChild(b); }
    const nav = el('div', 'pr-nav'); s.append(h, nav); return [s, nav];
  }

  async function guardaVista() {
    const q = S.q;
    const filtros = ['q', 'category', 'list', 'kind', 'status', 'model', 'tool', 'fav', 'minRating', 'images', 'cal', 'from', 'to', 'trash', 'sort'];
    const guardado = {}; filtros.forEach(k => { if (q[k]) guardado[k] = q[k]; });
    if (Object.keys(guardado).length <= 1 && !S.labels.size) { K.toast('Aplica primero una búsqueda o algún filtro'); return; }
    const name = await K.ask('Nombre de la vista', { placeholder: 'p. ej. Prompts finales de Claude' });
    if (!name) return;
    try { await K.post('/api/prompts/views', { name, q: guardado, labels: [...S.labels] }); await loadMeta(); renderRail(); K.toast('Vista guardada'); } catch (e) { K.fail(e); }
  }
  function renderRail() {
    const rail = R.rail; const f = S.M.facets; const q = S.q;
    rail.textContent = '';
    const noFilter = !q.category && !q.list && !q.fav && !q.images && !q.trash;

    const [s1, n1] = section('Biblioteca');
    n1.append(
      link({ ic: 'i-sparkle', name: 'Todos los prompts', n: f.total, on: noFilter && !q.kind && !q.status && !q.model && !q.tool, onClick: () => { resetNav(); load(); } }),
      link({ ic: 'i-star-fill', name: 'Favoritos', n: f.favorites, on: q.fav, onClick: () => { resetNav(); q.fav = true; load(); } }),
      link({ ic: 'i-image', name: 'Con imágenes', n: f.withImages, on: q.images === '1' && !q.trash, onClick: () => { resetNav(); q.images = '1'; load(); } }),
      link({ ic: 'i-inbox', name: 'Sin categoría', n: f.noCategory, on: q.category === '__none', onClick: () => { const k = q.category === '__none'; q.category = k ? '' : '__none'; q.list = ''; q.fav = false; q.images = ''; q.trash = false; load(); } }),
      link({ ic: 'i-trash', name: 'Papelera', n: f.trash, on: q.trash, onClick: () => { resetNav(); q.trash = true; load(); } }),
    );
    rail.appendChild(s1);

    // Vistas guardadas: una combinación de búsqueda y filtros a un clic
    const [sv, nv] = section('Vistas guardadas', { title: 'Guardar la búsqueda y los filtros actuales', fn: guardaVista });
    (S.M.views || []).forEach(v => nv.appendChild(link({
      ic: 'i-search', name: v.name, on: false,
      onClick: () => { resetNav(); S.q.q = ''; Object.assign(S.q, v.q || {}); S.labels = new Set(v.labels || []); if (R.si) R.si.value = S.q.q || ''; load(); },
      menu: (a) => K.menu(a, [{ label: 'Borrar vista', icon: 'i-trash', danger: true, onClick: async () => { try { await K.del('/api/prompts/views/' + v.id); await loadMeta(); renderRail(); } catch (e) { K.fail(e); } } }], { align: 'end' }),
    })));
    if (!(S.M.views || []).length) { const p = el('p', 'k-faint', 'Filtra o busca y pulsa + para guardar la combinación'); p.style.cssText = 'font-size:12.5px;padding:4px 8px'; nv.appendChild(p); }
    rail.appendChild(sv);

    // Categorías en árbol
    const [s2, n2] = section('Categorías', { title: 'Nueva categoría', fn: () => editCategory(null) });
    const pinta = (parent, depth) => {
      S.M.categories.filter(c => (c.parent || '') === parent).forEach(c => {
        const total = countTree(c.id);
        n2.appendChild(link({
          emoji: c.emoji, color: c.color, name: c.name, n: total, depth, on: q.category === c.id,
          onClick: () => { const k = q.category === c.id; q.category = k ? '' : c.id; q.list = ''; q.fav = false; q.images = ''; q.trash = false; load(); },
          menu: (a) => K.menu(a, [
            { label: 'Editar…', icon: 'i-pencil', onClick: () => editCategory(c) },
            { label: 'Añadir subcategoría…', icon: 'i-plus', onClick: () => editCategory(null, c.id) },
            '-', { label: 'Borrar', icon: 'i-trash', danger: true, onClick: () => delMeta('categories', c) },
          ], { align: 'end' }),
        }));
        pinta(c.id, depth + 1);
      });
    };
    pinta('', 0);
    if (!S.M.categories.length) n2.appendChild(el('p', 'k-faint', 'Crea tu primera categoría con +')).style.cssText = 'font-size:12.5px;padding:4px 8px';
    rail.appendChild(s2);

    // Listas
    const [s3, n3] = section('Listas', { title: 'Nueva lista', fn: () => editList(null) });
    S.M.lists.forEach(l => n3.appendChild(link({
      emoji: l.emoji || '📌', color: l.color, name: l.name, n: f.list[l.id] || 0, on: q.list === l.id,
      onClick: () => { const k = q.list === l.id; resetNav(); q.list = k ? '' : l.id; load(); },
      menu: (a) => K.menu(a, [{ label: 'Editar…', icon: 'i-pencil', onClick: () => editList(l) }, '-', { label: 'Borrar', icon: 'i-trash', danger: true, onClick: () => delMeta('lists', l) }], { align: 'end' }),
    })));
    if (!S.M.lists.length) { const p = el('p', 'k-faint', 'Agrupa prompts de un proyecto con una lista'); p.style.cssText = 'font-size:12.5px;padding:4px 8px'; n3.appendChild(p); }
    rail.appendChild(s3);

    // Tipo
    const [s4, n4] = section('Tipo', { title: 'Editar nombres e iconos de los tipos', fn: manageKinds });
    kindDefs().forEach(k => { if (f.kind[k.id]) n4.appendChild(link({ ic: k.icon, name: k.name, n: f.kind[k.id], on: q.kind === k.id, onClick: () => { q.kind = q.kind === k.id ? '' : k.id; load(); }, menu: a => K.menu(a, [{ label: 'Editar nombre e icono…', icon: 'i-pencil', onClick: () => editKind(k) }], { align: 'end' }) })); });
    rail.appendChild(s4);

    // Estado
    const [s5, n5] = section('Estado');
    Object.entries(STATUS).forEach(([k, name]) => { if (f.status[k]) n5.appendChild(link({ name, n: f.status[k], color: { borrador: '#94a3b8', probando: '#f59e0b', final: '#22c55e', archivado: '#64748b' }[k], on: q.status === k, onClick: () => { q.status = q.status === k ? '' : k; load(); } })); });
    if (n5.children.length) rail.appendChild(s5);

    // Modelo
    const modelos = Object.entries(f.model).sort((a, b) => b[1] - a[1]);
    if (modelos.length) {
      const [s6, n6] = section('Modelo');
      (S.modelsAll ? modelos : modelos.slice(0, 8)).forEach(([m, n]) => n6.appendChild(link({ ic: 'i-server', name: m, n, on: q.model === m, onClick: () => { q.model = q.model === m ? '' : m; load(); } })));
      if (modelos.length > 8) { const b = el('button', 'btn ghost tiny', S.modelsAll ? 'Ver menos' : `Ver ${modelos.length - 8} más`); b.type = 'button'; b.style.margin = '4px 0 0 6px'; b.addEventListener('click', () => { S.modelsAll = !S.modelsAll; renderRail(); }); n6.appendChild(b); }
      rail.appendChild(s6);
    }
    // Herramienta
    const herrs = Object.entries(f.tool || {}).sort((a, b) => b[1] - a[1]);
    if (herrs.length) {
      const [s7, n7] = section('Herramienta');
      (S.toolsAll ? herrs : herrs.slice(0, 8)).forEach(([m, n]) => n7.appendChild(link({ ic: 'i-sparkle', name: m, n, on: q.tool === m, onClick: () => { q.tool = q.tool === m ? '' : m; load(); } })));
      if (herrs.length > 8) { const b = el('button', 'btn ghost tiny', S.toolsAll ? 'Ver menos' : `Ver ${herrs.length - 8} más`); b.type = 'button'; b.style.margin = '4px 0 0 6px'; b.addEventListener('click', () => { S.toolsAll = !S.toolsAll; renderRail(); }); n7.appendChild(b); }
    }

    // Etiquetas
    const used = K.labels.list.filter(l => f.label[l.id]);
    if (used.length) {
      const s7 = el('div', 'pr-sec'); const h = el('h4'); h.appendChild(el('span', null, 'Etiquetas'));
      const g = el('button'); g.type = 'button'; g.appendChild(icon('i-pencil')); g.title = 'Gestionar etiquetas'; g.addEventListener('click', () => K.manageLabels()); h.appendChild(g);
      const ch = el('div', 'k-chips'); ch.style.padding = '2px 4px 4px';
      used.forEach(l => {
        const c = K.labelChip(l, { onClick: () => { if (S.labels.has(l.id)) S.labels.delete(l.id); else S.labels.add(l.id); load(); } });
        c.append(el('span', null, ' ' + f.label[l.id])); c.lastChild.style.opacity = '.6';
        if (S.labels.size && !S.labels.has(l.id)) c.classList.add('is-off');
        ch.appendChild(c);
      });
      s7.append(h, ch); rail.appendChild(s7);
    }
  }
  function countTree(id) {
    const ids = new Set([id]); let grow = true;
    while (grow) { grow = false; for (const c of S.M.categories) if (c.parent && ids.has(c.parent) && !ids.has(c.id)) { ids.add(c.id); grow = true; } }
    let n = 0; ids.forEach(i => { n += S.M.facets.category[i] || 0; }); return n;
  }

  function selectorIcono(anchor, inicial, alElegir) {
    const g = el('div', 'pk-icon-grid');
    KIND_ICONS.forEach(([id, nombre]) => {
      const b = el('button', 'pk-icon' + (id === inicial ? ' is-on' : '')); b.type = 'button'; b.title = nombre; b.setAttribute('aria-label', nombre);
      b.appendChild(icon(id)); b.addEventListener('click', () => { pop.close(); alElegir(id); }); g.appendChild(b);
    });
    const pop = K.pop(anchor, g, { width: 308 });
  }

  function manageKinds() {
    const w = el('div', 'pk-kinds');
    const campos = kindDefs().map(kind => {
      const row = el('div', 'pk-kind-row');
      const pick = el('button', 'btn ghost icon pk-icon-current'); pick.type = 'button'; pick.title = `Cambiar icono de ${kind.name}`; pick.appendChild(icon(kind.icon));
      let icono = kind.icon; pick.addEventListener('click', () => selectorIcono(pick, icono, v => { icono = v; pick.replaceChildren(icon(v)); }));
      const name = el('input'); name.value = kind.name; name.maxLength = 60; name.setAttribute('aria-label', `Nombre del tipo ${kind.name}`);
      row.append(pick, name); w.appendChild(row); return { id: kind.id, name, get icon() { return icono; } };
    });
    K.modal({ title: 'Tipos de prompt', sub: 'Personaliza el nombre y el icono que aparecen en la biblioteca. Los prompts guardados conservan su tipo.', content: w, cls: 'wide', actions: [
      { label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
        try {
          const r = await K.put('/api/prompts/kinds', { kinds: campos.map(k => ({ id: k.id, name: k.name.value, icon: k.icon })) });
          S.M.kindDefs = r.kinds; await load();
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
  }

  function editKind(kind) {
    const name = el('input'); name.value = kind.name; name.maxLength = 60;
    const pick = el('button', 'btn ghost icon pk-icon-current'); pick.type = 'button'; pick.title = 'Cambiar icono'; pick.appendChild(icon(kind.icon));
    let icono = kind.icon; pick.addEventListener('click', () => selectorIcono(pick, icono, v => { icono = v; pick.replaceChildren(icon(v)); }));
    const row = el('div', 'pk-kind-row'); row.append(pick, name);
    K.modal({ title: `Editar tipo: ${kind.name}`, content: row, cls: 'wide', actions: [
      { label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
        try {
          const kinds = kindDefs().map(k => k.id === kind.id ? { id: k.id, name: name.value, icon: icono } : k);
          const r = await K.put('/api/prompts/kinds', { kinds }); S.M.kindDefs = r.kinds; await load();
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
  }

  async function editCategory(c, parent, alGuardar) {
    const nm = el('input'); nm.value = c ? c.name : ''; nm.maxLength = 60; nm.placeholder = 'Nombre';
    const em = el('button', 'btn'); em.type = 'button'; let emoji = c ? c.emoji : '📁'; em.textContent = emoji || '＋'; em.style.fontSize = '20px';
    em.addEventListener('click', () => K.emojiPicker(em, (e) => { emoji = e; em.textContent = e || '＋'; }));
    const col = K.colorPicker({ value: c ? c.color : '#8b5cf6' });
    const par = el('select'); const o0 = el('option', null, 'Sin categoría padre'); o0.value = ''; par.appendChild(o0);
    const add = (p, d) => S.M.categories.filter(x => (x.parent || '') === p).forEach(x => { if (!c || x.id !== c.id) { const o = el('option', null, '  '.repeat(d) + x.name); o.value = x.id; par.appendChild(o); add(x.id, d + 1); } });
    add('', 0); par.value = c ? (c.parent || '') : (parent || '');
    const w = el('div'); const r1 = el('div', 'k-row'); r1.style.marginBottom = '14px'; r1.append(em, nm); nm.style.flex = '1';
    const f2 = el('div', 'field'); f2.append(el('span', null, 'Color'), col);
    const f3 = el('label', 'field'); f3.append(el('span', null, 'Dentro de'), par);
    w.append(r1, f2, f3);
    K.modal({ title: c ? 'Editar categoría' : 'Nueva categoría', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const body = { name: nm.value, emoji, color: col.get(), parent: par.value };
        if (c) await K.put('/api/prompts/categories/' + c.id, body); else await K.post('/api/prompts/categories', body);
        K.bus.emit('prompts'); await load();
        if (alGuardar) alGuardar(body.name);
      } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => nm.focus(), 30);
  }
  function editList(l) {
    const nm = el('input'); nm.value = l ? l.name : ''; nm.maxLength = 60; nm.placeholder = 'Nombre de la lista';
    const em = el('button', 'btn'); em.type = 'button'; let emoji = l ? l.emoji : '📌'; em.textContent = emoji || '＋'; em.style.fontSize = '20px';
    em.addEventListener('click', () => K.emojiPicker(em, (e) => { emoji = e; em.textContent = e || '＋'; }));
    const col = K.colorPicker({ value: l ? l.color : '#06b6d4' });
    const w = el('div'); const r1 = el('div', 'k-row'); r1.style.marginBottom = '14px'; r1.append(em, nm); nm.style.flex = '1';
    const f2 = el('div', 'field'); f2.append(el('span', null, 'Color'), col); w.append(r1, f2);
    K.modal({ title: l ? 'Editar lista' : 'Nueva lista', sub: 'Una lista agrupa prompts de cualquier categoría (un proyecto, un cliente…)', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const body = { name: nm.value, emoji, color: col.get() };
        if (l) await K.put('/api/prompts/lists/' + l.id, body); else await K.post('/api/prompts/lists', body);
        K.bus.emit('prompts'); await load();
      } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => nm.focus(), 30);
  }
  async function delMeta(tipo, x) {
    if (!await K.confirm(tipo === 'categories' ? `Se borrará “${x.name}”. Sus prompts pasarán a la categoría superior.` : `Se borrará la lista “${x.name}”. Los prompts no se tocan.`, { ok: 'Borrar', danger: true })) return;
    try {
      await K.del(`/api/prompts/${tipo}/${x.id}`);
      if (S.q.category === x.id) S.q.category = ''; if (S.q.list === x.id) S.q.list = '';
      await load();
    } catch (e) { K.fail(e); }
  }

  /* ---------- Filtros avanzados ---------- */
  function openFilters(anchor) {
    const q = S.q;
    const w = el('div'); w.style.cssText = 'padding:6px;display:flex;flex-direction:column;gap:12px;width:290px';
    const tipo = el('label', 'field tight'); tipo.appendChild(el('span', null, 'Tipo de prompt'));
    const tipoSel = el('select');
    const allKinds = el('option', null, 'Todos los tipos'); allKinds.value = ''; tipoSel.appendChild(allKinds);
    kindDefs().forEach(k => { const o = el('option', null, k.name); o.value = k.id; tipoSel.appendChild(o); });
    tipoSel.value = q.kind; tipoSel.addEventListener('change', () => { q.kind = tipoSel.value; load(); }); tipo.appendChild(tipoSel);
    const categoria = el('label', 'field tight'); categoria.appendChild(el('span', null, 'Categoría'));
    const categoriaSel = el('select');
    const allCategories = el('option', null, 'Todas las categorías'); allCategories.value = ''; categoriaSel.appendChild(allCategories);
    const noCategory = el('option', null, 'Sin categoría'); noCategory.value = '__none'; categoriaSel.appendChild(noCategory);
    const addCats = (parent, depth) => S.M.categories.filter(c => (c.parent || '') === parent).forEach(c => {
      const o = el('option', null, `${'　'.repeat(depth)}${c.emoji || ''} ${c.name}`.trim()); o.value = c.id; categoriaSel.appendChild(o); addCats(c.id, depth + 1);
    });
    addCats('', 0); categoriaSel.value = q.category; categoriaSel.addEventListener('change', () => { q.category = categoriaSel.value; load(); }); categoria.appendChild(categoriaSel);
    const f1 = el('div'); f1.append(el('div', 'head', 'Valoración mínima'));
    const st = K.stars(q.minRating, (v) => { q.minRating = v; load(); }); st.style.padding = '2px 8px'; f1.appendChild(st);
    const f2 = el('div'); f2.appendChild(el('div', 'head', 'Imágenes'));
    const sg = el('div', 'seg'); sg.style.cssText = 'width:auto;margin:2px 8px';
    for (const [v, l] of [['', 'Todos'], ['1', 'Con'], ['0', 'Sin']]) { const b = el('button', q.images === v ? 'is-active' : '', l); b.type = 'button'; b.style.cssText = 'width:auto;padding:0 12px;font-size:12.5px'; b.addEventListener('click', () => { q.images = v; sg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); load(); }); sg.appendChild(b); }
    f2.appendChild(sg);
    const f3 = el('div'); f3.appendChild(el('div', 'head', 'Fecha de creación'));
    const r = el('div', 'k-row'); r.style.cssText = 'padding:0 8px;flex-wrap:nowrap';
    const d1 = el('input'); d1.type = 'date'; d1.value = q.from; const d2 = el('input'); d2.type = 'date'; d2.value = q.to;
    [d1, d2].forEach(i => { i.style.cssText = 'padding:7px 8px;font-size:13px'; });
    d1.addEventListener('change', () => { q.from = d1.value; load(); }); d2.addEventListener('change', () => { q.to = d2.value; load(); });
    r.append(d1, d2); f3.appendChild(r);
    const f4 = el('div'); f4.style.padding = '0 8px';
    const sw = el('label', 'k-switch'); const ck = el('input'); ck.type = 'checkbox'; ck.checked = q.cal; sw.append(ck, el('span', 'track'), el('span', null, 'Solo con fecha en el calendario'));
    ck.addEventListener('change', () => { q.cal = ck.checked; load(); }); f4.appendChild(sw);
    const clear = el('button', 'btn sm', 'Limpiar todos los filtros'); clear.type = 'button'; clear.addEventListener('click', () => { clearAll(); p.close(); });
    w.append(tipo, categoria, f1, f2, f3, f4, clear);
    const p = K.pop(anchor, w, { width: 310 });
  }
  function clearAll() {
    Object.assign(S.q, { q: '', category: '', list: '', kind: '', status: '', model: '', tool: '', fav: false, minRating: 0, images: '', cal: false, from: '', to: '', trash: false });
    S.labels.clear(); R.si.value = ''; load();
  }

  /* ---------- Render ---------- */
  function render() {
    if (!S.built || !S.M) return;
    const f = S.M.facets;
    R.sub.textContent = S.q.trash ? `${f.trash} en la papelera` : `${f.total} prompt${f.total === 1 ? '' : 's'} guardado${f.total === 1 ? '' : 's'}`;
    R.seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.v === S.view));
    R.selb.classList.toggle('is-on', S.selMode);
    renderRail();
    renderActive();
    R.count.textContent = S.total === S.items.length ? `${S.total} resultado${S.total === 1 ? '' : 's'}` : `${S.items.length} de ${S.total}`;
    const c = R.content; c.textContent = '';
    if (S.q.trash && f.trash) {
      const b = el('div', 'k-row'); b.style.marginBottom = '12px';
      b.append(el('span', 'k-faint', 'Los prompts en la papelera se borran solos pasados unos días.'));
      const v = el('button', 'btn sm danger', 'Vaciar papelera'); v.type = 'button'; v.addEventListener('click', async () => { if (await K.confirm('Se borrarán para siempre, con sus imágenes.', { ok: 'Vaciar', danger: true })) { try { await K.del('/api/prompts'); load(); } catch (e) { K.fail(e); } } });
      b.appendChild(v); c.appendChild(b);
    }
    if (!S.items.length) { c.appendChild(emptyState()); renderSelbar(); return; }
    if (S.view === 'list') {
      const l = el('div', 'pr-list'); S.items.forEach(p => l.appendChild(row(p))); c.appendChild(l);
    } else if (S.view === 'board') {
      const b = el('div', 'pr-board');
      Object.entries(STATUS).forEach(([k, name]) => {
        const col = el('div', 'pr-col'); const items = S.items.filter(p => p.status === k);
        const h = el('h4'); h.append(el('span', null, name), el('span', null, String(items.length))); col.appendChild(h);
        items.forEach(p => col.appendChild(card(p)));
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
        col.addEventListener('dragleave', () => col.classList.remove('drop'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('drop');
          const id = e.dataTransfer.getData('text/plain'); const p = S.items.find(x => x.id === id);
          if (!p || p.status === k) return;
          try { await K.put('/api/prompts/' + id, { status: k }); K.bus.emit('prompts'); load(); } catch (er) { K.fail(er); }
        });
        b.appendChild(col);
      });
      c.appendChild(b);
    } else {
      const g = el('div', 'pr-grid'); S.items.forEach(p => g.appendChild(card(p))); c.appendChild(g);
    }
    if (S.view !== 'board' && S.items.length < S.total) {
      const m = el('div', 'pr-more'); const b = el('button', 'btn', `Cargar más (${S.total - S.items.length})`); b.type = 'button'; b.addEventListener('click', () => load(true)); m.appendChild(b); c.appendChild(m);
    }
    renderSelbar();
  }

  function renderActive() {
    const a = R.active; a.textContent = ''; const q = S.q;
    const chip = (txt, fn, color) => { const c = el('span', 'k-chip btnlike'); c.style.setProperty('--c', color || '#6366f1'); c.append(el('span', null, txt), el('span', null, ' ×')); c.addEventListener('click', fn); a.appendChild(c); };
    if (q.q) chip(`“${q.q}”`, () => { q.q = ''; R.si.value = ''; load(); });
    if (q.category === '__none') chip('Sin categoría', () => { q.category = ''; load(); });
    else if (q.category && catBy(q.category)) chip(`${catBy(q.category).emoji || ''} ${catBy(q.category).name}`, () => { q.category = ''; load(); }, catBy(q.category).color);
    if (q.list && listBy(q.list)) chip(`Lista: ${listBy(q.list).name}`, () => { q.list = ''; load(); }, listBy(q.list).color);
    if (q.kind) chip(`Tipo: ${kindBy(q.kind).name}`, () => { q.kind = ''; load(); });
    if (q.status) chip(`Estado: ${STATUS[q.status]}`, () => { q.status = ''; load(); });
    if (q.model) chip(`Modelo: ${q.model}`, () => { q.model = ''; load(); });
    if (q.tool) chip(`Herramienta: ${q.tool}`, () => { q.tool = ''; load(); });
    if (q.minRating) chip(`★ ${q.minRating}+`, () => { q.minRating = 0; load(); }, '#f59e0b');
    if (q.images) chip(q.images === '1' ? 'Con imágenes' : 'Sin imágenes', () => { q.images = ''; load(); });
    if (q.cal) chip('En el calendario', () => { q.cal = false; load(); }, '#8b5cf6');
    if (q.from || q.to) chip(`${q.from || '…'} → ${q.to || '…'}`, () => { q.from = q.to = ''; load(); });
    S.labels.forEach(id => { const l = K.labels.by[id]; if (l) chip('# ' + l.name, () => { S.labels.delete(id); load(); }, l.color); });
  }

  function emptyState() {
    const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon(S.q.trash ? 'i-trash' : 'i-sparkle')); e.appendChild(em);
    const filtrado = S.q.q || S.q.category || S.q.list || S.q.kind || S.q.status || S.q.model || S.q.tool || S.q.fav || S.q.minRating || S.q.images || S.q.cal || S.labels.size || S.q.from || S.q.to;
    if (S.q.trash) { e.append(el('h3', null, 'La papelera está vacía'), el('p', null, 'Los prompts que borres aparecerán aquí.')); return e; }
    if (filtrado) {
      e.append(el('h3', null, 'Nada coincide con esos filtros'), el('p', null, 'Prueba a quitar alguno.'));
      const b = el('button', 'btn', 'Limpiar filtros'); b.type = 'button'; b.addEventListener('click', clearAll); e.appendChild(b); return e;
    }
    e.append(el('h3', null, 'Tu biblioteca de prompts está vacía'), el('p', null, 'Guarda el primero con su texto, categoría, etiquetas e imágenes de muestra.'));
    const b = el('button', 'btn primary', 'Crear el primer prompt'); b.type = 'button'; b.addEventListener('click', () => openEditor(null)); e.appendChild(b);
    return e;
  }

  // Texto con las {{variables}} resaltadas, sin tocar innerHTML. Las que llevan valor por
  // defecto o lista se muestran solo con su nombre (el texto completo va en el tooltip).
  function conVars(texto, completo) {
    const frag = document.createDocumentFragment();
    String(texto).split(/(\{\{[^{}\n]{1,120}\}\})/g).forEach(parte => {
      const m = /^\{\{([^{}\n]{1,120})\}\}$/.exec(parte);
      if (m) {
        const v = leeVar(m[1]);
        const s = el('span', 'var', completo ? parte : `{{${v.nombre}}}`);
        if (v.opciones.length) s.classList.add('lista');
        s.title = v.opciones.length ? `Lista: ${v.opciones.join(' · ')}` : (v.def ? `Por defecto: ${v.def}` : 'Variable');
        frag.appendChild(s);
      } else if (parte) frag.appendChild(document.createTextNode(parte));
    });
    return frag;
  }

  function card(p) {
    const c = el('article', 'pr-card' + (S.sel.has(p.id) ? ' is-sel' : '') + (S.selMode ? ' sel-mode' : ''));
    c.style.setProperty('--c', colorOf(p)); c.tabIndex = 0; c.draggable = S.view === 'board';
    c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', p.id));
    const cover = el('div', 'pr-cover');
    if (p.cover) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imgUrl(p.id, p.cover, true); cover.appendChild(im); }
    else { const ph = el('div', 'ph'); ph.appendChild(icon(kindBy(p.kind).icon)); cover.appendChild(ph); }
    const badges = el('div', 'pr-badges'); badges.appendChild(el('span', 'pr-badge ' + p.status, STATUS[p.status] || p.status)); cover.appendChild(badges);
    if (p.images.length > 1) { const n = el('span', 'nimg'); n.append(icon('i-image'), document.createTextNode(String(p.images.length))); cover.appendChild(n); }
    if (p.pinned) { const pin = el('span', 'pr-pin'); pin.appendChild(icon('i-pin-fill')); cover.appendChild(pin); }
    const fav = el('button', 'pr-fav' + (p.favorite ? ' on' : '')); fav.type = 'button'; fav.appendChild(icon(p.favorite ? 'i-star-fill' : 'i-star')); fav.title = 'Favorito';
    fav.addEventListener('click', async (e) => { e.stopPropagation(); try { await K.put('/api/prompts/' + p.id, { favorite: !p.favorite }); p.favorite = !p.favorite; fav.classList.toggle('on', p.favorite); fav.replaceChildren(icon(p.favorite ? 'i-star-fill' : 'i-star')); S.M.facets.favorites += p.favorite ? 1 : -1; renderRail(); } catch (er) { K.fail(er); } });
    cover.appendChild(fav);
    const chk = el('div', 'pr-chk'); chk.appendChild(icon('i-check')); cover.appendChild(chk);
    c.appendChild(cover);

    const body = el('div', 'pr-body');
    body.appendChild(el('h3', 'pr-title', p.title));
    const sn = el('p', 'pr-snip'); sn.appendChild(conVars(p.snippet)); body.appendChild(sn);
    const chips = el('div', 'k-chips');
    const cat = catBy(p.category);
    if (cat) { const ch = el('span', 'k-chip'); ch.style.setProperty('--c', cat.color); ch.textContent = `${cat.emoji || ''} ${cat.name}`.trim(); chips.appendChild(ch); }
    p.labels.slice(0, 3).forEach(l => { const ch = K.labelChip(l); if (ch) chips.appendChild(ch); });
    if (p.labels.length > 3) chips.appendChild(el('span', 'k-chip', `+${p.labels.length - 3}`));
    if (chips.children.length) body.appendChild(chips);
    const foot = el('div', 'pr-foot');
    if (p.model || p.tool) foot.appendChild(el('span', 'model', [p.model, p.tool].filter(Boolean).join(' · ')));
    if (p.rating) { const r = el('span', null, '★ ' + p.rating); r.style.color = '#fbbf24'; foot.appendChild(r); }
    if (p.cal) { const cl = el('span', 'pr-date'); cl.appendChild(icon('i-calendar')); cl.firstChild.style.cssText = 'width:12px;height:12px;vertical-align:-1px;flex:none'; cl.append(' ' + K.d.short(K.d.parse(p.cal.date))); cl.title = 'En el calendario'; foot.appendChild(cl); }
    foot.appendChild(el('span', 'grow'));
    if (!S.q.trash) {
      const cp = el('button', 'btn tiny pr-copy'); cp.type = 'button'; cp.append(icon('i-copy'), document.createTextNode('Copiar'));
      cp.addEventListener('click', (e) => { e.stopPropagation(); copyPrompt(p.id); });
      foot.appendChild(cp);
    } else foot.appendChild(el('span', null, 'Borrado ' + K.ago(p.deletedAt)));
    body.appendChild(foot);
    c.appendChild(body);
    activate(c, p);
    return c;
  }

  function row(p) {
    const r = el('article', 'pr-row'); r.style.setProperty('--c', colorOf(p)); r.tabIndex = 0;
    const th = el('div', 'th'); if (p.cover) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imgUrl(p.id, p.cover, true); th.appendChild(im); } else th.appendChild(icon(kindBy(p.kind).icon));
    const mid = el('div'); mid.style.minWidth = 0;
    const h = el('h3'); h.append(document.createTextNode(p.title));
    if (p.favorite) { const s = icon('i-star-fill'); s.style.cssText = 'width:14px;height:14px;color:#fbbf24;margin-left:6px;vertical-align:-1px'; h.appendChild(s); }
    const sn = el('p'); sn.textContent = p.snippet.replace(/\s+/g, ' ');
    const chips = el('div', 'k-chips'); chips.style.marginTop = '6px';
    const cat = catBy(p.category); if (cat) { const ch = el('span', 'k-chip'); ch.style.setProperty('--c', cat.color); ch.textContent = `${cat.emoji || ''} ${cat.name}`.trim(); chips.appendChild(ch); }
    p.labels.slice(0, 4).forEach(l => { const ch = K.labelChip(l); if (ch) chips.appendChild(ch); });
    mid.append(h, sn, chips);
    const side = el('div', 'side');
    if (p.model) side.appendChild(el('span', 'k-chip', p.model));
    if (p.tool) side.appendChild(el('span', 'k-chip', p.tool));
    side.appendChild(el('span', 'pr-badge ' + p.status, STATUS[p.status]));
    if (p.rating) { const rr = el('span', null, '★ ' + p.rating); rr.style.color = '#fbbf24'; side.appendChild(rr); }
    side.appendChild(el('span', null, K.ago(p.updatedAt)));
    if (S.selMode) { const ck = el('span', 'cal-check' + (S.sel.has(p.id) ? ' on' : '')); ck.style.setProperty('--c', '#6366f1'); ck.appendChild(icon('i-check')); side.prepend(ck); }
    r.append(th, mid, side);
    activate(r, p);
    return r;
  }

  function activate(node, p) {
    const go = (e) => {
      if (S.selMode) { e.preventDefault(); toggleSel(p.id, node); return; }
      openDetail(p.id);
    };
    node.addEventListener('click', go);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      K.menu({ x: e.clientX, y: e.clientY }, S.q.trash ? [
        { label: 'Restaurar', icon: 'i-restore', onClick: () => bulk([p.id], 'restore') },
        { label: 'Borrar para siempre', icon: 'i-trash', danger: true, onClick: () => purge([p.id]) },
      ] : [
        { label: 'Abrir', icon: 'i-external', onClick: () => openDetail(p.id) },
        { label: 'Copiar prompt', icon: 'i-copy', onClick: () => copyPrompt(p.id) },
        { label: 'Editar…', icon: 'i-pencil', onClick: () => openEditor(p.id) },
        { label: 'Duplicar', icon: 'i-stack', onClick: () => duplicar(p.id) },
        { label: p.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'i-pin', onClick: () => patch(p.id, { pinned: !p.pinned }) },
        '-', { label: 'Enviar a la papelera', icon: 'i-trash', danger: true, onClick: () => bulk([p.id], 'delete') },
      ]);
    });
  }

  /* ---------- Selección múltiple ---------- */
  function toggleSel(id) { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); render(); }
  function renderSelbar() {
    const b = R.selbar; b.textContent = '';
    if (!S.selMode || !S.sel.size) { b.hidden = true; return; }
    b.hidden = false;
    const ids = () => [...S.sel];
    const btn = (label, ic, fn, cls) => { const x = el('button', 'btn sm' + (cls ? ' ' + cls : '')); x.type = 'button'; x.append(icon(ic), el('span', null, label)); x.addEventListener('click', (e) => fn(x, e)); b.appendChild(x); };
    b.appendChild(el('span', 'n', `${S.sel.size} seleccionado${S.sel.size === 1 ? '' : 's'}`));
    btn('Todos', 'i-check', () => { S.items.forEach(i => S.sel.add(i.id)); render(); });
    if (S.q.trash) {
      btn('Restaurar', 'i-restore', () => bulk(ids(), 'restore'));
      btn('Borrar', 'i-trash', () => purge(ids()), 'danger');
    } else {
      btn('Categoría', 'i-folder', (x) => K.menu(x, [{ label: 'Sin categoría', onClick: () => bulk(ids(), 'category', '') }, '-', ...S.M.categories.map(c => ({ label: `${c.emoji || ''} ${c.name}`, dot: c.color, onClick: () => bulk(ids(), 'category', c.id) }))]));
      btn('Etiqueta', 'i-tag', (x) => K.menu(x, K.labels.list.length ? [{ head: 'Añadir' }, ...K.labels.list.map(l => ({ label: l.name, dot: l.color, onClick: () => bulk(ids(), 'addLabel', l.id) })), '-', { head: 'Quitar' }, ...K.labels.list.map(l => ({ label: l.name, dot: l.color, onClick: () => bulk(ids(), 'removeLabel', l.id) }))] : [{ head: 'Aún no hay etiquetas' }]));
      btn('Lista', 'i-stack', (x) => K.menu(x, S.M.lists.length ? S.M.lists.map(l => ({ label: `${l.emoji || ''} ${l.name}`, dot: l.color, onClick: () => bulk(ids(), 'addList', l.id) })) : [{ head: 'Crea una lista primero' }]));
      btn('Estado', 'i-check-square', (x) => K.menu(x, Object.entries(STATUS).map(([k, n]) => ({ label: n, onClick: () => bulk(ids(), 'status', k) }))));
      btn('Favorito', 'i-star', () => bulk(ids(), 'favorite', true));
      if (PRO()) {
        btn('Exportar', 'i-download', () => PRO().exportar(ids(), null));
        btn('Compartir', 'i-link', () => PRO().compartir(ids()));
      }
      btn('Papelera', 'i-trash', () => bulk(ids(), 'delete'), 'danger');
    }
    btn('', 'i-x', () => { S.sel.clear(); S.selMode = false; render(); }, 'ghost');
  }
  async function bulk(ids, op, value) {
    try {
      const r = await K.post('/api/prompts/bulk', { ids, op, value });
      K.toast(`${r.changed} prompt${r.changed === 1 ? '' : 's'} actualizado${r.changed === 1 ? '' : 's'}`);
      S.sel.clear(); K.bus.emit('prompts'); load();
    } catch (e) { K.fail(e); }
  }
  async function purge(ids) {
    if (!await K.confirm(`Se borrar${ids.length === 1 ? 'á este prompt' : 'án ' + ids.length + ' prompts'} para siempre, con sus imágenes.`, { ok: 'Borrar', danger: true })) return;
    try { await K.post('/api/prompts/bulk', { ids, op: 'delete', purge: true }); S.sel.clear(); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); }
  }
  async function patch(id, campos) { try { await K.put('/api/prompts/' + id, campos); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }
  async function duplicar(id) { try { await K.post(`/api/prompts/${id}/duplicate`); K.toast('Prompt duplicado'); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }

  /* ---------- Copiar (con variables) ----------
     Sintaxis de las variables dentro del texto:
       {{nombre}}                      campo de texto
       {{nombre=valor}}                con valor por defecto
       {{tono=formal|cercano|técnico}} lista desplegable (la primera opción es la predeterminada)
       {{detalle:largo}}               texto de varias líneas   (también :numero y :fecha)   */
  const RE_VAR = /\{\{([^{}\n]{1,120})\}\}/g;
  function leeVar(dentro) {
    const i = dentro.indexOf('=');
    const cab = (i < 0 ? dentro : dentro.slice(0, i)).trim();
    const resto = i < 0 ? '' : dentro.slice(i + 1).trim();
    const j = cab.indexOf(':');
    const nombre = (j < 0 ? cab : cab.slice(0, j)).trim();
    let tipo = j < 0 ? '' : cab.slice(j + 1).trim().toLowerCase();
    if (!['largo', 'numero', 'fecha'].includes(tipo)) tipo = '';
    const opciones = resto.includes('|') ? resto.split('|').map(x => x.trim()).filter(Boolean) : [];
    return { nombre, tipo, def: opciones.length ? opciones[0] : resto, opciones };
  }
  // Variables distintas de uno o varios textos, en orden de aparición. Si una variable sale
  // varias veces, manda la primera definición (salvo que la primera no traiga opciones).
  function parseVars(...textos) {
    const mapa = new Map();
    for (const t of textos) {
      for (const m of String(t || '').matchAll(RE_VAR)) {
        const v = leeVar(m[1]);
        if (!v.nombre || v.nombre.startsWith('@')) continue;   // {{@fragmento}} no es una variable
        const prev = mapa.get(v.nombre);
        if (!prev) mapa.set(v.nombre, v);
        else {
          if (!prev.opciones.length && v.opciones.length) { prev.opciones = v.opciones; prev.def = prev.def || v.def; }
          if (!prev.def && v.def) prev.def = v.def;
          if (!prev.tipo && v.tipo) prev.tipo = v.tipo;
        }
      }
    }
    return [...mapa.values()];
  }
  const varsDe = (txt) => parseVars(txt).map(v => v.nombre);
  const rellena = (texto, valores) => String(texto || '').replace(RE_VAR, (m, dentro) => {
    const v = leeVar(dentro);
    return valores[v.nombre] !== undefined && valores[v.nombre] !== '' ? valores[v.nombre] : m;
  });

  async function copyPrompt(id, full) {
    try {
      const orig = full || await K.get('/api/prompts/' + id);
      // Los fragmentos {{@nombre}} se sustituyen por su texto antes de pedir las variables
      const pro = PRO();
      const ex = pro ? (t) => pro.expande(t) : async (t) => t;
      const p = { ...orig, body: await ex(orig.body), negative: await ex(orig.negative), system: await ex(orig.system) };
      const vars = parseVars(p.body, p.negative, p.system);
      if (vars.length) { fillVars(p, vars); return; }
      await finishCopy(p, p.body);
    } catch (e) { K.fail(e); }
  }
  async function finishCopy(p, texto, msg) {
    const ok = await K.copy(texto);
    K.toast(ok ? (msg || 'Prompt copiado') : 'No se pudo copiar');
    try { await K.post(`/api/prompts/${p.id}/use`); } catch {}
  }

  // Formulario para rellenar las variables antes de copiar. Recuerda los últimos valores usados.
  function fillVars(p, vars) {
    const clave = 'kcc-pv-' + p.id;
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(clave) || '{}'); } catch {}
    const w = el('div', 'var-form'); const ins = {};
    const valores = () => {
      const o = {};
      vars.forEach(v => { o[v.nombre] = ins[v.nombre].value; });
      return o;
    };
    const caja = (titulo) => {
      const b = el('div'); const t = el('div', 'k-faint', titulo); t.style.cssText = 'font-size:11px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.08em';
      const pre = el('pre'); pre.style.cssText = 'white-space:pre-wrap;margin:0;padding:12px;border-radius:12px;background:rgba(4,7,15,.6);border:1px solid var(--line);font:inherit;font-size:13.5px;max-height:180px;overflow:auto;word-break:break-word';
      b.append(t, pre); return [b, pre];
    };
    const [bSys, outSys] = caja('Mensaje de sistema');
    const [bBody, outBody] = caja('Resultado');
    const [bNeg, outNeg] = caja('Prompt negativo');
    const pinta = () => {
      const v = valores();
      bSys.hidden = !p.system; outSys.textContent = rellena(p.system, v);
      outBody.textContent = rellena(p.body, v);
      bNeg.hidden = !p.negative; outNeg.textContent = rellena(p.negative, v);
      // Se marcan los huecos todavía sin rellenar
      vars.forEach(x => ins[x.nombre].classList.toggle('vacio', ins[x.nombre].value === ''));
    };
    vars.forEach(v => {
      const l = el('label', 'field tight');
      const rot = el('span', null, v.nombre);
      if (v.opciones.length) rot.append(el('small', 'k-faint', '  · lista'));
      l.appendChild(rot);
      let c;
      if (v.opciones.length) {
        c = el('select');
        v.opciones.forEach(o => { const op = el('option', null, o); op.value = o; c.appendChild(op); });
        // Una opción guardada que ya no existe en la lista se añade para no perderla
        const g = guardado[v.nombre];
        if (g && !v.opciones.includes(g)) { const op = el('option', null, g); op.value = g; c.appendChild(op); }
        c.value = g || v.def;
      } else if (v.tipo === 'largo') {
        c = el('textarea'); c.rows = 3; c.value = guardado[v.nombre] !== undefined ? guardado[v.nombre] : v.def; c.placeholder = v.def ? '' : `Valor de ${v.nombre}`;
      } else {
        c = el('input'); c.value = guardado[v.nombre] !== undefined ? guardado[v.nombre] : v.def;
        if (v.tipo === 'numero') c.type = 'number'; else if (v.tipo === 'fecha') c.type = 'date';
        c.placeholder = v.def ? '' : `Valor de ${v.nombre}`;
      }
      ins[v.nombre] = c;
      c.addEventListener('input', pinta); c.addEventListener('change', pinta);
      l.appendChild(c); w.appendChild(l);
    });
    w.append(bSys, bBody, bNeg);
    pinta();
    const recuerda = () => { try { localStorage.setItem(clave, JSON.stringify(valores())); } catch {} };
    const acciones = [
      { label: 'Restablecer', close: false, onClick: () => { vars.forEach(v => { ins[v.nombre].value = v.def; }); try { localStorage.removeItem(clave); } catch {} pinta(); return false; } },
    ];
    if (p.system) acciones.push({ label: 'Copiar sistema', onClick: async () => { recuerda(); await finishCopy(p, rellena(p.system, valores()), 'Mensaje de sistema copiado'); } });
    if (p.negative) acciones.push({ label: 'Copiar negativo', onClick: async () => { recuerda(); await finishCopy(p, rellena(p.negative, valores()), 'Negativo copiado'); } });
    acciones.push({ label: 'Copiar prompt', primary: true, onClick: async () => { recuerda(); await finishCopy(p, rellena(p.body, valores())); } });
    K.modal({ title: 'Rellenar variables', sub: p.title, cls: 'wide', content: w, actions: acciones });
    const primero = ins[vars[0].nombre]; setTimeout(() => { primero.focus(); if (primero.select) primero.select(); }, 40);
  }

  /* ---------- Ficha ---------- */
  /* ---------- Vínculo con Código ---------- */
  // Ficha de un prompt de tipo código: proyectos de Código donde está guardado su resultado.
  // El vínculo va en los dos lados (lib/vinculos.js), así que desde el proyecto también se llega al prompt.
  function bloqueCodigo(p, cerrar) {
    const b = el('div', 'pd-blk pd-vinc');
    const h = el('header'); h.appendChild(el('span', null, 'Resultado en Código'));
    const acc = el('div', 'pd-vinc-acc');
    const nuevo = el('button', 'btn sm'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', null, 'Crear proyecto'));
    const vinc = el('button', 'btn sm'); vinc.type = 'button'; vinc.append(icon('i-link'), el('span', null, 'Vincular…'));
    acc.append(nuevo, vinc); h.appendChild(acc);
    const lista = el('div', 'pd-vinc-lista'); b.append(h, lista);
    let vivos = [];
    const pinta = async () => {
      try { vivos = (await K.get('/api/vinculos/codigo/prompt/' + p.id)).proyectos; }
      catch (e) { lista.textContent = ''; lista.appendChild(el('p', 'pd-vinc-vacio', 'No se pudieron cargar los proyectos vinculados')); return; }
      lista.textContent = '';
      if (!vivos.length) { lista.appendChild(el('p', 'pd-vinc-vacio', 'Todavía no hay ningún proyecto de Código vinculado. Crea uno con este prompt o vincula uno que ya tengas.')); return; }
      vivos.forEach(x => {
        const fila = el('div', 'pd-vinc-fila'); fila.appendChild(el('span', 'pd-vinc-n', x.nombre));
        const ver = el('button', 'btn sm'); ver.type = 'button'; ver.append(icon('i-code'), el('span', null, 'Ver'));
        ver.setAttribute('aria-label', `Ver el proyecto ${x.nombre}`);
        ver.addEventListener('click', () => { cerrar(); K.open('codigo', x.id); });
        const q = el('button', 'btn sm ghost icon'); q.type = 'button'; q.title = 'Quitar el vínculo'; q.setAttribute('aria-label', `Quitar el vínculo con ${x.nombre}`); q.appendChild(icon('i-x'));
        q.addEventListener('click', async () => {
          try { await K.post('/api/vinculos/codigo/quitar', { promptId: p.id, proyectoId: x.id }); K.toast('Vínculo quitado'); pinta(); } catch (e) { K.fail(e); }
        });
        fila.append(ver, q); lista.appendChild(fila);
      });
    };
    nuevo.addEventListener('click', async () => {
      nuevo.disabled = true;
      try {
        await K.post('/api/vinculos/codigo/crear-proyecto', { promptId: p.id });
        K.toast('Proyecto creado y vinculado'); if (K.game && K.game.load) K.game.load();
        await pinta();
      } catch (e) { K.fail(e); } finally { nuevo.disabled = false; }
    });
    vinc.addEventListener('click', async () => {
      try {
        const todos = (await K.get('/api/codigo')).items.filter(x => !vivos.some(v => v.id === x.id));
        if (!todos.length) { K.toast(vivos.length ? 'No quedan más proyectos por vincular' : 'Todavía no tienes proyectos en Código'); return; }
        K.menu(vinc, todos.map(x => ({ label: x.nombre, onClick: async () => {
          try { await K.post('/api/vinculos/codigo', { promptId: p.id, proyectoId: x.id }); K.toast('Proyecto vinculado'); pinta(); } catch (e) { K.fail(e); }
        } })));
      } catch (e) { K.fail(e); }
    });
    pinta();
    return b;
  }

  async function openDetail(id) {
    let p;
    try { p = await K.get('/api/prompts/' + id); } catch (e) { K.fail(e); return; }
    const idx = S.items.findIndex(i => i.id === id);
    const root = el('div', 'pd');
    let cur = 0;
    // Galería
    const gal = el('div', 'pd-gal');
    if (p.images.length) {
      const main = el('div', 'pd-main'); const im = el('img'); im.alt = p.title; main.appendChild(im);
      const cap = el('div', 'cap'); main.appendChild(cap);
      const thumbs = el('div', 'pd-thumbs');
      const show = (i) => {
        cur = (i + p.images.length) % p.images.length; const x = p.images[cur];
        im.src = imgUrl(p.id, x.id); cap.textContent = x.caption || ''; cap.hidden = !x.caption;
        thumbs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === cur));
      };
      p.images.forEach((x, i) => { const b = el('button'); b.type = 'button'; const t = el('img'); t.src = imgUrl(p.id, x.id, true); t.alt = ''; b.appendChild(t); b.addEventListener('click', () => show(i)); thumbs.appendChild(b); });
      if (p.images.length > 1) {
        for (const [cls, d, rot] of [['l', -1, true], ['r', 1, false]]) { const a = el('button', 'arrow ' + cls); a.type = 'button'; const ic = icon('i-caret'); if (rot) ic.style.transform = 'rotate(180deg)'; a.appendChild(ic); a.addEventListener('click', () => show(cur + d)); main.appendChild(a); }
      }
      // Visor a pantalla completa con zoom (rueda, pellizco, doble toque); empieza en la foto que se ve
      im.addEventListener('click', () => {
        if (window.KZoom) KZoom.lightbox({ items: p.images.map(x => ({ src: imgUrl(p.id, x.id), caption: x.caption || '' })), index: cur, title: p.title });
        else window.open(imgUrl(p.id, p.images[cur].id), '_blank', 'noopener');
      });
      gal.append(main); if (p.images.length > 1) gal.appendChild(thumbs);
      show(Math.max(0, p.images.findIndex(x => x.id === p.cover)));
    } else {
      const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon(kindBy(p.kind).icon)); e.append(em, el('p', null, 'Sin imágenes de muestra'));
      if (!p.deletedAt) { const b = el('button', 'btn sm', 'Añadir imágenes'); b.type = 'button'; b.addEventListener('click', () => { m.close(); openEditor(p.id); }); e.appendChild(b); }
      gal.appendChild(e);
    }

    // Información
    const info = el('div', 'pd-info');
    const top = el('div', 'k-row'); top.style.cssText = 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap';
    const h2 = el('h2', null, p.title);
    const x = el('button', 'btn ghost icon'); x.type = 'button'; x.appendChild(icon('i-x')); x.addEventListener('click', () => m.close());
    top.append(h2, x); info.appendChild(top);

    // Propiedades con título; cada valor es un botón que cierra la ficha y filtra la biblioteca
    const props = el('div', 'pd-props');
    const filtra = (fn) => () => { m.close(); resetNav(); S.labels.clear(); fn(); load(); };
    const valor = (txt, color, fn, ic) => {
      const c = el('button', 'k-chip btnlike pd-val'); c.type = 'button'; c.style.setProperty('--c', color);
      if (ic) { const i = icon(ic); i.style.cssText = 'width:13px;height:13px'; c.appendChild(i); }
      c.appendChild(document.createTextNode(txt)); c.title = 'Ver los prompts con este valor';
      c.addEventListener('click', filtra(fn)); return c;
    };
    const fila = (titulo, nodos) => {
      if (!nodos.length) return;
      const r = el('div', 'pd-prop'); r.appendChild(el('span', 'pd-pk', titulo));
      const v = el('div', 'k-chips pd-pv'); nodos.forEach(n => v.appendChild(n)); r.appendChild(v); props.appendChild(r);
    };
    const cat = catBy(p.category);
    fila('Categoría', cat ? [valor(`${cat.emoji || ''} ${cat.name}`.trim(), cat.color, () => { S.q.category = cat.id; })] : []);
    fila('Listas', (p.lists || []).map(listBy).filter(Boolean).map(l => valor(`${l.emoji || '📌'} ${l.name}`, l.color, () => { S.q.list = l.id; })));
    const kd = kindBy(p.kind);
    fila('Tipo', [valor(kd.name, '#64748b', () => { S.q.kind = p.kind; }, kd.icon)]);
    fila('Estado', [valor(STATUS[p.status] || p.status, { borrador: '#94a3b8', probando: '#f59e0b', final: '#22c55e', archivado: '#64748b' }[p.status] || '#64748b', () => { S.q.status = p.status; })]);
    fila('Modelo', p.model ? [valor(p.model, '#06b6d4', () => { S.q.model = p.model; }, 'i-server')] : []);
    fila('Herramienta', p.tool ? [valor(p.tool, '#8b5cf6', () => { S.q.tool = p.tool; }, 'i-sparkle')] : []);
    fila('Etiquetas', (p.labels || []).map(id => K.labels.by[id]).filter(Boolean).map(l => valor(l.name, l.color, () => { S.labels.add(l.id); })));
    info.appendChild(props);

    const meta = el('div', 'pd-meta');
    const st = K.stars(p.rating, async (v) => { try { await K.put('/api/prompts/' + p.id, { rating: v }); p.rating = v; K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }, { readonly: !!p.deletedAt });
    meta.appendChild(st);
    const fav = el('span'); fav.style.cursor = 'pointer';
    const pintaFav = () => { fav.replaceChildren(icon(p.favorite ? 'i-star-fill' : 'i-star'), document.createTextNode(p.favorite ? 'Favorito' : 'Marcar favorito')); fav.style.color = p.favorite ? '#fbbf24' : ''; };
    pintaFav(); fav.addEventListener('click', async () => { try { await K.put('/api/prompts/' + p.id, { favorite: !p.favorite }); p.favorite = !p.favorite; pintaFav(); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } });
    if (!p.deletedAt) meta.appendChild(fav);
    const dd = el('span'); dd.append(icon('i-clock'), document.createTextNode(`Creado ${K.d.short(new Date(p.createdAt))}`)); meta.appendChild(dd);
    if (p.updatedAt - p.createdAt > 60000) { const u = el('span'); u.textContent = `Editado ${K.ago(p.updatedAt)}`; meta.appendChild(u); }
    if (PRO() && (p.body || p.system)) { const t = el('span', null, `≈ ${PRO().tokens((p.system || '') + (p.body || '')).toLocaleString('es')} tokens`); t.title = 'Estimación aproximada (unos 4 caracteres por token)'; meta.appendChild(t); }
    if (p.uses) { const u = el('span'); u.textContent = `Usado ${p.uses} vez${p.uses === 1 ? '' : 'ces'}`.replace('veces', 'veces'); meta.appendChild(u); }
    info.appendChild(meta);

    // Calendario
    const calRow = el('div', 'k-row');
    if (p.cal) {
      const cb = el('button', 'btn sm'); cb.type = 'button'; cb.append(icon('i-calendar'), el('span', null, `En el calendario: ${K.d.short(K.d.parse(p.cal.date))}${p.cal.time ? ' ' + p.cal.time : ''}`));
      cb.addEventListener('click', () => { m.close(); switchTab('calendar'); K.calendar.goto(K.d.parse(p.cal.date), 'month'); });
      calRow.appendChild(cb);
    }
    if (!p.deletedAt) {
      const cc = el('button', 'btn ghost sm'); cc.type = 'button'; cc.append(icon('i-pencil'), el('span', null, p.cal ? 'Cambiar fecha' : 'Añadir al calendario'));
      cc.addEventListener('click', () => editCalDate(p, m));
      calRow.appendChild(cc);
    }
    info.appendChild(calRow);

    // Acciones
    const acts = el('div', 'pd-actions');
    if (p.deletedAt) {
      const r = el('button', 'btn primary', 'Restaurar'); r.type = 'button'; r.addEventListener('click', async () => { m.close(); await bulk([p.id], 'restore'); });
      const d = el('button', 'btn danger', 'Borrar para siempre'); d.type = 'button'; d.addEventListener('click', () => { m.close(); purge([p.id]); });
      acts.append(r, d);
    } else {
      const cp = el('button', 'btn primary'); cp.type = 'button'; cp.append(icon('i-copy'), el('span', null, varsDe(p.body).length ? 'Copiar…' : 'Copiar prompt')); cp.addEventListener('click', () => copyPrompt(p.id, p));
      const ed = el('button', 'btn'); ed.type = 'button'; ed.append(icon('i-pencil'), el('span', null, 'Editar')); ed.addEventListener('click', () => { m.close(); openEditor(p.id); });
      const mo = el('button', 'btn ghost icon'); mo.type = 'button'; mo.appendChild(icon('i-dots'));
      mo.addEventListener('click', () => K.menu(mo, [
        { label: 'Duplicar', icon: 'i-stack', onClick: async () => { m.close(); await duplicar(p.id); } },
        { label: p.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'i-pin', onClick: async () => { m.close(); await patch(p.id, { pinned: !p.pinned }); } },
        { label: p.negative ? 'Copiar con el negativo' : 'Copiar sistema + mensaje', icon: 'i-copy', onClick: async () => {
          const ex = PRO() ? PRO().expande : async (t) => t;
          const b = await ex(p.body), n = await ex(p.negative), s = await ex(p.system);
          await K.copy((s ? s + '\n\n' : '') + b + (n ? `\n\nNegative prompt: ${n}` : '')); K.toast('Copiado');
        } },
        { label: 'Exportar…', icon: 'i-download', onClick: () => PRO() && PRO().exportar([p.id]) },
        { label: 'Compartir con enlace…', icon: 'i-link', onClick: () => PRO() && PRO().compartir([p.id]) },
        '-', { label: 'Enviar a la papelera', icon: 'i-trash', danger: true, onClick: async () => { m.close(); await bulk([p.id], 'delete'); } },
      ], { align: 'end' }));
      acts.append(cp, ed, mo);
    }
    info.appendChild(acts);
    // Notas que mencionan este prompt (enlaces internos)
    const menc = el('div'); info.appendChild(menc);
    K.get('/api/backlinks?' + K.qs({ type: 'prompt', ref: p.id })).then(r => {
      if (!r.items.length) return;
      const h = el('div', 'pd-meta'); h.append(icon('i-note'), document.createTextNode('Mencionado en: '));
      r.items.forEach(n => { const b = el('button', 'btn tiny', (n.icon ? n.icon + ' ' : '') + n.title); b.type = 'button'; b.addEventListener('click', () => { m.close(); K.open('note', n.id); }); h.appendChild(b); });
      menc.appendChild(h);
    }).catch(() => {});

    const bloque = (titulo, texto, cls) => {
      const b = el('div', 'pd-blk ' + (cls || '')); const h = el('header'); h.appendChild(el('span', null, titulo));
      const c = el('button', 'btn ghost tiny'); c.type = 'button'; c.append(icon('i-copy'), document.createTextNode('Copiar')); c.addEventListener('click', async () => { K.toast((await K.copy(texto)) ? 'Copiado' : 'No se pudo copiar'); }); h.appendChild(c);
      const pre = el('pre'); pre.appendChild(conVars(texto, true)); b.append(h, pre); return b;
    };
    const pro = PRO();
    if (p.system) info.appendChild(bloque('Mensaje de sistema', p.system));
    if (p.body) info.appendChild(bloque(pro ? pro.etiquetaCuerpo(p.kind) : 'Prompt', p.body));
    if (p.negative) info.appendChild(bloque('Prompt negativo', p.negative, 'neg'));
    if (pro && !p.deletedAt && S.M.comfy && p.kind === 'imagen' && p.body) {
      const cb = el('button', 'btn sm'); cb.type = 'button'; cb.append(icon('i-play'), el('span', null, 'Generar en ComfyUI'));
      cb.addEventListener('click', async () => {
        const pv = parseVars(p.body, p.negative);
        const txt = await pro.expande(p.body), neg = await pro.expande(p.negative);
        if (pv.length) { K.toast('Rellena las variables copiando el prompt; ComfyUI usará el texto tal cual'); }
        cb.disabled = true; await pro.generarComfy(p, txt, neg); cb.disabled = false;
      });
      info.appendChild(cb);
    }
    const pk = Object.entries(p.params || {});
    if (pk.length) { const b = el('div', 'pd-blk'); const h = el('header'); h.appendChild(el('span', null, 'Parámetros')); const dl = el('dl', 'pd-params'); pk.forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v))); b.append(h, dl); info.appendChild(b); }
    if (p.notes) info.appendChild(bloque('Notas', p.notes));
    if (pro) pro.seccionesDetalle(p, info, () => m.close());
    if (p.kind === 'codigo' && !p.deletedAt) info.appendChild(bloqueCodigo(p, () => m.close()));
    if (p.source) { const a = /^https?:\/\//i.test(p.source) ? (() => { const l = el('a', null, p.source); l.href = p.source; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.style.cssText = 'color:var(--accent-text);word-break:break-all'; return l; })() : el('span', null, p.source); const d = el('div', 'pd-meta'); d.append(icon('i-link'), document.createTextNode('Fuente: '), a); info.appendChild(d); }
    if (p.versions && p.versions.length) {
      const det = el('details'); const sm = el('summary', null, `Historial (${p.versions.length} versiones)`); sm.style.cssText = 'cursor:pointer;color:var(--muted);font-size:13px'; det.appendChild(sm);
      const vl = el('div', 'pd-vers');
      p.versions.forEach(v => { const b = el('button'); b.type = 'button'; b.append(el('span', null, v.title), el('span', 'k-faint', K.ago(v.at))); b.addEventListener('click', () => { m.close(); openEditor(p.id, { restore: v }); }); vl.appendChild(b); });
      if (K.prompts && K.prompts.comparar) {
        const cmp = el('button', 'btn sm'); cmp.type = 'button'; cmp.append(icon('i-columns'), el('span', null, 'Comparar versiones'));
        cmp.style.margin = '8px 10px 0';
        cmp.addEventListener('click', () => K.prompts.comparar(p));
        det.appendChild(cmp);
      }
      det.appendChild(vl); info.appendChild(det);
    }
    root.append(gal, info);
    const m = K.modal({ cls: 'xl flush', content: root, bare: true });
    m.el.classList.add('prompt-detail-modal');
    // Cerrar flotante para móvil (en escritorio el CSS lo oculta y vale el de la cabecera)
    const xw = el('div', 'pd-xwrap'); const xb = el('button'); xb.type = 'button'; xb.setAttribute('aria-label', 'Cerrar'); xb.appendChild(icon('i-x'));
    xb.addEventListener('click', () => m.close()); xw.appendChild(xb); m.el.insertBefore(xw, m.el.firstChild);
    // Flechas para pasar al anterior/siguiente de la lista
    const nav = (e) => {
      if (!document.body.contains(root) || e.target.closest('input,textarea')) { if (!document.body.contains(root)) document.removeEventListener('keydown', nav); return; }
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || idx < 0 || document.querySelectorAll('.overlay').length > 1) return;
      const n = S.items[idx + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { m.close(); openDetail(n.id); }
    };
    document.addEventListener('keydown', nav);
  }

  function editCalDate(p, parentModal) {
    const f = K.calField({ value: p.cal ? { date: p.cal.date, time: p.cal.time, calendarId: 'prompts' } : null, defaultCalendar: 'prompts', label: 'Mostrar en el calendario' });
    K.modal({ title: 'Fecha en el calendario', sub: p.title, content: f, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { const v = f.get(); await K.put('/api/prompts/' + p.id, { calendar: v }); K.bus.emit('prompts'); K.bus.emit('calendar'); parentModal.close(); load(); openDetail(p.id); } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Editor ---------- */
  async function openEditor(id, extra = {}) {
    await Promise.all([K.loadLabels(), K.loadCalendars()]).catch(() => {});
    let p = null;
    if (id) { try { p = await K.get('/api/prompts/' + id); } catch (e) { K.fail(e); return; } }
    const nuevo = !p;
    if (extra.restore && p) { p = { ...p, title: extra.restore.title, body: extra.restore.body, negative: extra.restore.negative, system: extra.restore.system !== undefined ? extra.restore.system : p.system }; K.toast('Versión anterior cargada: pulsa Guardar para aplicarla'); }
    const d = p || { title: '', body: '', negative: '', system: '', chain: [], outputs: [], notes: '', kind: 'imagen', status: 'borrador', model: '', tool: '', language: '', source: '', rating: 0, favorite: false, category: S.q.category && S.q.category !== '__none' ? S.q.category : '', labels: [...S.labels], lists: S.q.list ? [S.q.list] : [], params: {}, images: [], color: '', cal: null };

    const root = el('div', 'pe-grid');
    const left = el('div'); const right = el('div');
    const fld = (label, node, tight) => { const l = el('label', 'field' + (tight ? ' tight' : '')); l.append(el('span', null, label), node); return l; };
    const title = el('input'); title.value = d.title; title.maxLength = 200; title.placeholder = 'Nombre descriptivo del prompt';
    title.style.cssText = 'font-size:18px;font-weight:650';
    const body = el('textarea', 'pe-textarea'); body.value = d.body; body.placeholder = 'Escribe el prompt. Usa {{variable}} para huecos que rellenarás al copiar.'; body.rows = 9;
    const tb = el('div', 'pe-toolbar');
    const bv = el('button', 'btn tiny', '{{ }} Variable ▾'); bv.type = 'button';
    // Inserta una variable de cada tipo; si hay texto seleccionado, lo usa como nombre
    const poneVar = (plantilla) => {
      const st = body.selectionStart, e2 = body.selectionEnd; const sel = body.value.slice(st, e2);
      const txt = plantilla.replace('NOMBRE', sel || 'nombre');
      body.setRangeText(txt, st, e2, 'select'); body.focus(); upd();
    };
    bv.addEventListener('click', () => K.menu(bv, [
      { head: 'Insertar variable' },
      { label: 'Campo de texto  {{nombre}}', onClick: () => poneVar('{{NOMBRE}}') },
      { label: 'Con valor por defecto  {{nombre=valor}}', onClick: () => poneVar('{{NOMBRE=valor}}') },
      { label: 'Lista desplegable  {{nombre=a|b|c}}', onClick: () => poneVar('{{NOMBRE=opción 1|opción 2|opción 3}}') },
      { label: 'Texto largo  {{nombre:largo}}', onClick: () => poneVar('{{NOMBRE:largo}}') },
      { label: 'Número  {{nombre:numero}}', onClick: () => poneVar('{{NOMBRE:numero}}') },
      { label: 'Fecha  {{nombre:fecha}}', onClick: () => poneVar('{{NOMBRE:fecha}}') },
    ]));
    const cnt = el('span', 'k-faint'); cnt.style.cssText = 'font-size:12px;margin-left:auto;align-self:center';
    const vistaVars = el('div', 'k-chips'); vistaVars.style.margin = '2px 0 8px';
    const pro = PRO();
    const bf = el('button', 'btn tiny', '@ Fragmento ▾'); bf.type = 'button';
    bf.addEventListener('click', () => pro && pro.menuFragmentos(bf, (t) => { body.setRangeText(t, body.selectionStart, body.selectionEnd, 'end'); body.focus(); upd(); }));
    const upd = () => {
      const v = parseVars(body.value, neg.value, sys.value);
      const tk = pro ? pro.tokens(sys.value + body.value) : 0;
      cnt.textContent = `${body.value.length} caracteres${tk ? ` · ≈ ${tk.toLocaleString('es')} tokens` : ''}${v.length ? ` · ${v.length} variable${v.length === 1 ? '' : 's'}` : ''}`;
      vistaVars.textContent = '';
      v.forEach(x => { const c = el('span', 'k-chip'); c.style.setProperty('--c', x.opciones.length ? '#a855f7' : '#06b6d4'); c.textContent = x.nombre + (x.opciones.length ? ` ▾ ${x.opciones.length}` : x.def ? ` = ${x.def}` : '') + (x.tipo ? ` (${x.tipo})` : ''); vistaVars.appendChild(c); });
    };
    body.addEventListener('input', upd);
    tb.append(bv, bf, cnt);
    const neg = el('textarea', 'pe-textarea'); neg.value = d.negative; neg.rows = 3; neg.style.minHeight = '70px'; neg.placeholder = 'Qué evitar (opcional)';
    const sys = el('textarea', 'pe-textarea'); sys.value = d.system || ''; sys.rows = 4; sys.placeholder = 'Rol e instrucciones permanentes (opcional). Admite {{variables}} y {{@fragmentos}}.';
    sys.addEventListener('input', upd); neg.addEventListener('input', upd); upd();
    const notes = el('textarea'); notes.value = d.notes; notes.rows = 3; notes.placeholder = 'Resultados, trucos, qué funcionó…';
    const fSys = fld('Mensaje de sistema', sys), fBody = fld('Prompt', body, true), fNeg = fld('Prompt negativo', neg);
    const btnPlant = el('button', 'btn tiny', 'Plantilla ▾'); btnPlant.type = 'button';
    btnPlant.addEventListener('click', () => pro && pro.menuPlantillas(btnPlant, kindSel.value, async (t) => {
      if ((body.value.trim() || sys.value.trim()) && !await K.confirm('Se sustituirá el texto actual por la plantilla.', { ok: 'Usar plantilla' })) return;
      kindSel.value = t.kind; aplicaTipo(); sys.value = t.system; body.value = t.body; if (!title.value.trim()) title.value = t.n; upd();
    }));
    tb.insertBefore(btnPlant, bv);
    const salidasEd = pro ? pro.salidasEditor(d.outputs, true) : null;
    const cadenaEd = pro ? pro.cadenaEditor(d.chain, id) : null;
    const fSal = salidasEd ? fld('Resultados de ejemplo (por modelo, con valoración)', salidasEd.node) : null;
    const fCad = cadenaEd ? fld('Cadena de prompts (se ejecutan uno tras otro)', cadenaEd.node) : null;
    left.append(fld('Título', title), fSys, fBody, tb, vistaVars, fNeg, fld('Notas', notes));
    if (fSal) left.appendChild(fSal);
    if (fCad) left.appendChild(fCad);

    // Parámetros
    const paramsBox = el('div', 'pe-params');
    const paramsList = Object.entries(d.params || {});
    const pintaParams = () => {
      paramsBox.textContent = '';
      paramsList.forEach((kv, i) => {
        const r = el('div', 'pr-p'); const k = el('input'); k.placeholder = 'p. ej. ar'; k.setAttribute('list', 'pe-pk'); k.value = kv[0]; const v = el('input'); v.placeholder = '16:9'; v.value = kv[1];
        k.addEventListener('input', () => { kv[0] = k.value; }); v.addEventListener('input', () => { kv[1] = v.value; });
        const x2 = el('button', 'btn ghost icon'); x2.type = 'button'; x2.appendChild(icon('i-x')); x2.addEventListener('click', () => { paramsList.splice(i, 1); pintaParams(); });
        r.append(k, v, x2); paramsBox.appendChild(r);
      });
      const add = el('button', 'btn tiny'); add.type = 'button'; add.append(icon('i-plus'), document.createTextNode('Añadir parámetro')); add.addEventListener('click', () => { paramsList.push(['', '']); pintaParams(); });
      paramsBox.appendChild(add);
    };
    pintaParams();
    left.appendChild(fld('Parámetros (seed, steps, cfg, aspect ratio…)', paramsBox));

    // Derecha: clasificación
    const catSel = el('select');
    const llenaCats = (valor) => {
      catSel.textContent = '';
      const o0 = el('option', null, 'Sin categoría'); o0.value = ''; catSel.appendChild(o0);
      const addCat = (par, dep) => S.M.categories.filter(c => (c.parent || '') === par).forEach(c => { const o = el('option', null, '  '.repeat(dep) + `${c.emoji || ''} ${c.name}`.trim()); o.value = c.id; catSel.appendChild(o); addCat(c.id, dep + 1); });
      addCat('', 0);
      const on = el('option', null, '＋ Nueva categoría…'); on.value = '__new'; catSel.appendChild(on);
      catSel.value = valor || '';
    };
    llenaCats(d.category);
    let catPrev = catSel.value;
    catSel.addEventListener('change', () => {
      if (catSel.value !== '__new') { catPrev = catSel.value; return; }
      catSel.value = catPrev;
      editCategory(null, '', (nombre) => { const nueva = S.M.categories.find(c => c.name === nombre); llenaCats(nueva ? nueva.id : catPrev); catPrev = catSel.value; });
    });
    const kindSel = el('select'); kindDefs().forEach(k => { const o = el('option', null, k.name); o.value = k.id; kindSel.appendChild(o); }); kindSel.value = d.kind;
    // La ficha se adapta al tipo: negativo solo en imagen/vídeo/audio, mensaje de sistema en texto/código/agente…
    const dlPk = el('datalist'); dlPk.id = 'pe-pk';
    const aplicaTipo = () => {
      const k = kindSel.value; const c = pro ? pro.campos(k) : { sistema: true, negativo: true, cadena: true, resultados: true };
      fSys.hidden = !c.sistema && !sys.value.trim();
      fNeg.hidden = !c.negativo && !neg.value.trim();
      if (fSal) fSal.hidden = !c.resultados; if (fCad) fCad.hidden = !c.cadena;
      fBody.firstChild.textContent = pro ? pro.etiquetaCuerpo(k) : 'Prompt';
      dlPk.textContent = ''; (pro ? pro.paramSugeridos(k) : []).forEach(x2 => { const o = el('option'); o.value = x2; dlPk.appendChild(o); });
    };
    kindSel.addEventListener('change', aplicaTipo); aplicaTipo();
    const statSel = el('select'); Object.entries(STATUS).forEach(([k, n]) => { const o = el('option', null, n); o.value = k; statSel.appendChild(o); }); statSel.value = d.status;
    const model = el('input'); model.value = d.model; model.setAttribute('list', 'pr-models'); model.placeholder = 'GPT-5, Claude, FLUX, SDXL…'; model.maxLength = 60;
    const dl = el('datalist'); dl.id = 'pr-models';
    const tool = el('input'); tool.value = d.tool || ''; tool.setAttribute('list', 'pr-tools'); tool.placeholder = 'Midjourney, ComfyUI, Cursor…'; tool.maxLength = 60;
    const dlt = el('datalist'); dlt.id = 'pr-tools';
    const syncOptionLists = () => {
      dl.textContent = ''; (S.M.models || []).forEach(x2 => { const o = el('option'); o.value = x2; dl.appendChild(o); });
      dlt.textContent = ''; (S.M.tools || []).forEach(x2 => { const o = el('option'); o.value = x2; dlt.appendChild(o); });
    };
    const optionField = (label, input, type) => {
      const wrap = el('div', 'field tight'); wrap.appendChild(el('span', null, label)); wrap.appendChild(input);
      const known = () => (type === 'model' ? S.M.models : S.M.tools).some(x => x.toLocaleLowerCase() === input.value.trim().toLocaleLowerCase());
      const add = el('button', 'btn tiny ghost', '＋ Añadir a opciones'); add.type = 'button'; add.hidden = !input.value.trim() || known();
      input.addEventListener('input', () => { add.hidden = !input.value.trim() || known(); });
      add.addEventListener('click', async () => {
        try {
          const result = await K.post('/api/prompts/options', { [type]: input.value });
          S.M.models = result.models; S.M.tools = result.tools; syncOptionLists(); add.hidden = true;
          K.toast(`${label} añadido a las opciones`);
        } catch (e) { K.fail(e); }
      });
      wrap.appendChild(add); return wrap;
    };
    syncOptionLists();
    const lang = el('input'); lang.value = d.language; lang.placeholder = 'es, en…'; lang.maxLength = 30;
    const row2 = el('div', 'k-2'); row2.append(fld('Tipo', kindSel, true), fld('Estado', statSel, true));
    const row3 = el('div', 'k-2'); row3.append(optionField('Modelo', model, 'model'), optionField('Herramienta', tool, 'tool'));
    const row3b = el('div', 'k-2'); row3b.append(fld('Idioma', lang, true));
    const lp = K.labelPicker({ selected: d.labels });
    const rating = d.rating; let rate = rating; const stars = K.stars(rate, (v) => { rate = v; });
    let fav = !!d.favorite; const favSw = el('label', 'k-switch'); const favCk = el('input'); favCk.type = 'checkbox'; favCk.checked = fav; favSw.append(favCk, el('span', 'track'), el('span', null, 'Favorito')); favCk.addEventListener('change', () => { fav = favCk.checked; });
    const color = K.colorPicker({ value: d.color || '', allowNone: true });
    const src = el('input'); src.value = d.source; src.placeholder = 'https://… (de dónde lo sacaste)'; src.maxLength = 500;

    // Listas
    const listsBox = el('div', 'k-chips'); const listSel = new Set(d.lists || []);
    const pintaListas = () => { listsBox.textContent = ''; S.M.lists.forEach(l => { const c = el('span', 'k-chip btnlike' + (listSel.has(l.id) ? '' : ' is-off')); c.style.setProperty('--c', l.color); c.textContent = `${l.emoji || '📌'} ${l.name}`; c.addEventListener('click', () => { if (listSel.has(l.id)) listSel.delete(l.id); else listSel.add(l.id); pintaListas(); }); listsBox.appendChild(c); }); if (!S.M.lists.length) listsBox.appendChild(el('span', 'k-faint', 'Aún no hay listas: crea una desde la barra lateral')); };
    pintaListas();

    // Calendario
    const calF = K.calField({ value: d.cal ? { date: d.cal.date, time: d.cal.time, calendarId: 'prompts' } : null, defaultCalendar: 'prompts', label: 'Poner fecha de subida en el calendario', hint: 'Aparecerá como evento y podrás abrir el prompt desde el calendario.' });

    right.append(fld('Categoría', catSel, true), row2, row3, row3b, fld('Etiquetas', lp, true), fld('Listas', listsBox, true));
    const rr = el('div', 'k-row'); rr.style.margin = '4px 0 14px'; rr.append(stars, favSw); right.appendChild(rr);
    right.append(fld('Color de la tarjeta', color, true), fld('Fuente', src, true), dl, dlt, dlPk, fld('Calendario', calF, true));

    // Imágenes
    const imgs = (d.images || []).map(i => ({ ...i, key: i.id }));   // existentes
    let cover = d.cover || (imgs[0] && imgs[0].id) || '';
    const removed = [];
    const maxI = S.M.limits.images;
    const imgBox = el('div', 'pe-imgs');
    let dragKey = null;
    let metadataTask = Promise.resolve();
    const addFiles = (files) => {
      const arr = [...files].filter(f => /^image\//.test(f.type));
      if (!arr.length) return;
      const libre = maxI - imgs.length;
      if (arr.length > libre) K.toast(`Máximo ${maxI} imágenes por prompt`);
      const accepted = arr.slice(0, Math.max(0, libre));
      accepted.forEach(f => imgs.push({ key: 'n' + Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f), caption: '' }));
      pintaImgs();
      metadataTask = metadataTask.then(async () => {
        let applied = false, found = false;
        const candidates = accepted.filter(x => /^image\//.test(x.type) || /\.(png|jpe?g|webp|avif|heic|heif|tiff?)$/i.test(x.name)).slice(0, maxI);
        for (const f of candidates) {
          try {
            const fd = new FormData(); fd.append('image', f, f.name);
            const response = await api(`${BASE}/api/prompts/read-image-metadata`, { method: 'POST', body: fd });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron leer los metadatos');
            const meta = result.metadata; if (!meta) continue; found = true;
            let changed = false;
            if (!title.value.trim()) { title.value = (body.value.trim() || meta.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || f.name.replace(/\.[^.]+$/, ''); changed = true; }
            if (!body.value.trim() && meta.body) { body.value = meta.body; changed = true; }
            if (!neg.value.trim() && meta.negative) { neg.value = meta.negative; changed = true; }
            if (!model.value.trim() && meta.model) { model.value = meta.model; model.dispatchEvent(new Event('input')); changed = true; }
            if (!tool.value.trim() && meta.tool) { tool.value = meta.tool; tool.dispatchEvent(new Event('input')); changed = true; }
            if (!src.value.trim()) { src.value = f.name; changed = true; }
            Object.entries(meta.params || {}).forEach(([k, v]) => {
              if (!k || v == null || String(v).trim() === '') return;
              const key = k.trim().toLocaleLowerCase();
              const index = paramsList.findIndex(([oldKey]) => oldKey.trim().toLocaleLowerCase() === key);
              if (index < 0) { paramsList.push([k, String(v)]); changed = true; }
              else if (!String(paramsList[index][1] == null ? '' : paramsList[index][1]).trim()) { paramsList[index][1] = String(v); changed = true; }
            });
            if (changed) {
              kindSel.value = 'imagen'; aplicaTipo(); pintaParams(); upd();
              applied = true;
            }
          } catch (e) { console.warn('No se pudieron leer los metadatos de la imagen:', e); }
        }
        if (applied) K.toast('Metadatos de imagen aplicados a los campos vacíos');
        else if (candidates.length && !found) K.toast('La imagen no contiene metadatos de generación compatibles');
      });
      return metadataTask;
    };
    const pintaImgs = () => {
      imgBox.textContent = '';
      imgs.forEach((im) => {
        const t = el('div', 'pe-img' + (cover === im.key ? ' cover' : '')); t.draggable = true;
        const i = el('img'); i.alt = ''; i.src = im.file ? im.url : imgUrl(d.id, im.id, true); t.appendChild(i);
        const tools = el('div', 'tools');
        const star = el('button'); star.type = 'button'; star.title = 'Usar como portada'; star.appendChild(icon(cover === im.key ? 'i-star-fill' : 'i-star')); star.addEventListener('click', () => { cover = im.key; pintaImgs(); });
        const cap = el('button'); cap.type = 'button'; cap.title = 'Pie de foto'; cap.appendChild(icon('i-pencil')); cap.addEventListener('click', async () => { const v = await K.ask('Pie de foto', { value: im.caption || '', placeholder: 'Qué muestra esta imagen' }); if (v !== null) { im.caption = v; } });
        const del = el('button'); del.type = 'button'; del.title = 'Quitar'; del.appendChild(icon('i-trash')); del.addEventListener('click', () => { imgs.splice(imgs.indexOf(im), 1); if (!im.file) removed.push(im.id); if (cover === im.key) cover = imgs[0] ? imgs[0].key : ''; pintaImgs(); });
        tools.append(star, cap, del); t.appendChild(tools);
        t.addEventListener('dragstart', (e) => { dragKey = im.key; e.dataTransfer.setData('text/plain', 'img'); });
        t.addEventListener('dragover', (e) => { if (dragKey) { e.preventDefault(); t.classList.add('over'); } });
        t.addEventListener('dragleave', () => t.classList.remove('over'));
        t.addEventListener('drop', (e) => { if (!dragKey) return; e.preventDefault(); e.stopPropagation(); const a = imgs.findIndex(x => x.key === dragKey), b = imgs.indexOf(im); if (a >= 0 && a !== b) { const [mv] = imgs.splice(a, 1); imgs.splice(b, 0, mv); } dragKey = null; pintaImgs(); });
        t.addEventListener('dragend', () => { dragKey = null; });
        imgBox.appendChild(t);
      });
      if (imgs.length < maxI) {
        const add = el('button', 'pe-add'); add.type = 'button'; add.append(icon('i-image-plus'), document.createTextNode(`${imgs.length}/${maxI}`));
        const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.hidden = true; fi.addEventListener('change', () => { addFiles(fi.files); fi.value = ''; });
        add.addEventListener('click', () => fi.click());
        add.addEventListener('dragover', (e) => { if (!dragKey) { e.preventDefault(); add.classList.add('drag'); } });
        add.addEventListener('dragleave', () => add.classList.remove('drag'));
        add.addEventListener('drop', (e) => { e.preventDefault(); add.classList.remove('drag'); addFiles(e.dataTransfer.files); });
        imgBox.append(add, fi);
      }
    };
    pintaImgs();
    const imgNote = el('div', 'k-faint', S.M.canImages ? `Hasta ${maxI} imágenes. Se convierten a WebP y se reducen a ${S.M.limits.imageMax}px como máximo. Al añadir una imagen con metadatos compatibles, se rellenan los campos vacíos automáticamente. Puedes arrastrarlas o pegarlas (Ctrl+V).` : 'El servidor no tiene "sharp": no se pueden subir imágenes.');
    imgNote.style.cssText = 'font-size:11.5px;margin-top:6px';
    const imgField = el('div', 'field'); imgField.append(el('span', null, 'Imágenes de muestra'), imgBox, imgNote);
    right.insertBefore(imgField, right.firstChild);
    root.addEventListener('paste', (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.some(f => /^image\//.test(f.type))) { e.preventDefault(); addFiles(fs); } });
    root.addEventListener('dragover', (e) => { if (!dragKey && e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    root.addEventListener('drop', (e) => { if (!dragKey && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

    root.append(left, right);

    const guardar = async (h) => {
      h.buttons.save.disabled = true;
      await metadataTask.catch(e => console.warn('No se pudieron completar los metadatos de la imagen:', e));
      h.buttons.save.disabled = false;
      if (!title.value.trim() && !body.value.trim()) { K.toast('Escribe al menos un título o el prompt'); return false; }
      const params2 = {}; paramsList.forEach(([k, v]) => { if (k.trim()) params2[k.trim()] = v; });
      const campos = {
        title: title.value, body: body.value, negative: neg.value, notes: notes.value, category: catSel.value, kind: kindSel.value,
        status: statSel.value, model: model.value, tool: tool.value, language: lang.value, source: src.value, rating: rate, favorite: fav,
        labels: lp.get(), lists: [...listSel], color: color.get(), params: params2,
        system: sys.value,
      };
      if (salidasEd) campos.outputs = salidasEd.get();
      if (cadenaEd) campos.chain = cadenaEd.get();
      // Aviso si ya existe algo muy parecido (solo al crear o si cambió el texto)
      if (pro && kindSel.value !== 'fragmento' && (nuevo || body.value !== d.body) && body.value.trim().length > 30) {
        if (!await pro.confirmaParecidos({ title: title.value, body: body.value, excludeId: id || undefined })) return false;
      }
      const cal = calF.get();
      if (nuevo) { if (cal) campos.calendar = cal; } else campos.calendar = cal;   // al editar, null quita el evento
      h.buttons.save.disabled = true;
      try {
        let pid = id;
        if (nuevo) { const r = await K.post('/api/prompts', campos); pid = r.prompt.id; } else await K.put('/api/prompts/' + id, campos);
        // Imágenes: primero las quitadas, luego las nuevas, y al final orden, pies y portada
        for (const rid of removed) await K.del(`/api/prompts/${pid}/images/${rid}`);
        const nuevas = imgs.filter(i => i.file);
        let serverImgs = null;
        if (nuevas.length) {
          const fd = new FormData(); nuevas.forEach(i => fd.append('images', i.file, i.file.name));
          const res = await api(`${BASE}/api/prompts/${pid}/images`, { method: 'POST', body: fd });
          const j = await res.json(); if (!res.ok) throw new Error(j.error || 'No se pudieron subir las imágenes');
          if (j.failed && j.failed.length) K.toast(`No se pudieron procesar: ${j.failed.join(', ')}`);
          serverImgs = j.images;
          const idsNuevos = serverImgs.slice(serverImgs.length - nuevas.length - (j.failed ? j.failed.length : 0)).map(x => x.id);
          nuevas.forEach((n, k) => { if (idsNuevos[k]) { n.id = idsNuevos[k]; } });
        }
        if (imgs.length) {
          const finalIds = imgs.map(i => i.id).filter(Boolean);
          const caps = {}; imgs.forEach(i => { if (i.id) caps[i.id] = i.caption || ''; });
          const cov = imgs.find(i => i.key === cover);
          await K.put(`/api/prompts/${pid}/images`, { order: finalIds, captions: caps, cover: cov ? cov.id : '' });
        }
        try {
          const options = await K.post('/api/prompts/options', { model: model.value, tool: tool.value });
          S.M.models = options.models; S.M.tools = options.tools;
        } catch (e) { console.warn('No se pudieron actualizar las opciones guardadas de modelos y herramientas:', e); }
        imgs.forEach(i => { if (i.url) URL.revokeObjectURL(i.url); });
        K.bus.emit('prompts'); if (cal || (p && p.cal)) K.bus.emit('calendar');
        K.toast(nuevo ? 'Prompt guardado' : 'Cambios guardados');
        await load();
      } catch (e) { K.fail(e); h.buttons.save.disabled = false; return false; }
    };
    const m = K.modal({ title: nuevo ? 'Nuevo prompt' : 'Editar prompt', sub: nuevo ? 'Guarda tu prompt con todo su contexto' : '', cls: 'xl', content: root, dismiss: false,
      actions: [{ label: 'Cancelar', onClick: async () => { if ((title.value !== d.title || body.value !== d.body) && !await K.confirm('Hay cambios sin guardar. ¿Descartarlos?', { ok: 'Descartar', danger: true })) return false; } },
        { id: 'save', label: nuevo ? 'Guardar prompt' : 'Guardar cambios', primary: true, onClick: guardar }] });
    if (nuevo) setTimeout(() => title.focus(), 40);
  }

  /* ---------- Importar ---------- */
  function openImport() {
    const w = el('div');
    w.appendChild(el('p', 'k-muted', 'Importa un archivo JSON exportado desde aquí, o pega varios prompts separados por una línea con tres guiones (---).'));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 12px';
    const fi = el('input'); fi.type = 'file'; fi.accept = '.json,application/json,.txt,.md';
    const ta = el('textarea'); ta.rows = 8; ta.placeholder = 'Primer prompt…\n---\nSegundo prompt…';
    const cat = el('select'); const o0 = el('option', null, 'Sin categoría'); o0.value = ''; cat.appendChild(o0); S.M.categories.forEach(c => { const o = el('option', null, c.name); o.value = c.name; cat.appendChild(o); });
    const k = el('select'); kindDefs().forEach(kind => { const o = el('option', null, kind.name); o.value = kind.id; k.appendChild(o); });
    const fR = el('div', 'k-2'); const a = el('label', 'field tight'); a.append(el('span', null, 'Categoría (pegado)'), cat); const b = el('label', 'field tight'); b.append(el('span', null, 'Tipo (pegado)'), k); fR.append(a, b);
    const f1 = el('label', 'field'); f1.append(el('span', null, 'Archivo'), fi);
    const f2 = el('label', 'field'); f2.append(el('span', null, 'O pegar texto'), ta);
    w.append(f1, f2, fR);
    K.modal({ title: 'Importar prompts', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Importar', primary: true, onClick: async () => {
      try {
        let lista = [];
        if (fi.files[0]) {
          const txt = await fi.files[0].text();
          if (/\.json$/i.test(fi.files[0].name)) { const j = JSON.parse(txt); lista = Array.isArray(j) ? j : j.prompts || []; }
          else lista = txt.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean).map(s => ({ title: s.split('\n')[0].slice(0, 80), body: s, kind: k.value, category: cat.value }));
        }
        if (ta.value.trim()) lista.push(...ta.value.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean).map(s => ({ title: s.split('\n')[0].slice(0, 80), body: s, kind: k.value, category: cat.value })));
        if (!lista.length) { K.toast('No hay nada que importar'); return false; }
        let total = 0;
        for (let i = 0; i < lista.length; i += 1000) { const r = await K.post('/api/prompts/import', { prompts: lista.slice(i, i + 1000) }); total += r.created; }
        K.toast(`${total} prompts importados`); K.bus.emit('prompts'); K.bus.emit('labels'); await load();
      } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Registro ---------- */
  K.registerView('prompts', {
    async open() {
      if (!S.built) build();
      await K.loadLabels().catch(() => {});
      load();
    },
    close() { S.selMode = false; S.sel.clear(); },
  });
  K.bus.on('labels', () => { if (S.built && !$('view-prompts').hidden) load(); });
  K.openers.prompt = (id) => { switchTab('prompts'); setTimeout(() => openDetail(id), 60); };
  // prompts-extra.js cuelga de aquí sus entradas de menú, la comparación de versiones y las estadísticas
  K.prompts = Object.assign(K.prompts || {}, {
    kindLabel: (id) => kindBy(id).name,
    kindIcon: (id) => kindBy(id).icon,
    open: (id) => K.openers.prompt(id),
    newPrompt: () => { switchTab('prompts'); openEditor(null); },
    extraMenu: (K.prompts && K.prompts.extraMenu) || [],
    reload: () => { K.bus.emit('prompts'); return load(); },
    detail: (id) => openDetail(id),
    copiar: (id) => copyPrompt(id),
    filtrar: (campo, valor) => { S.q[campo] = valor; load(); },
  });
})();
