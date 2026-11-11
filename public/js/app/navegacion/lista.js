'use strict';
/* Navegación, carga, agrupación, menú contextual, búsqueda, selección y mover. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Navegación
--------------------------------------------------------------- */
function renderBreadcrumb() {
  const bar = $('breadcrumb');
  bar.textContent = '';
  const parts = state.path.split('/').filter(Boolean);

  const home = el('button');
  home.appendChild(icon('i-home'));
  home.appendChild(el('span', null, 'Inicio'));
  if (!parts.length && !state.query) home.classList.add('current');
  else home.addEventListener('click', () => goTo(''));
  haceSoltable(home, '');            // soltar sobre una miga mueve ahí: la forma natural de subir de nivel
  bar.appendChild(home);

  let acc = '';
  parts.forEach((part, i) => {
    acc += (acc ? '/' : '') + part;
    const target = acc;
    bar.appendChild(el('span', 'sep', '/'));
    const btn = el('button', null, nombreVisible(part));
    if (i === parts.length - 1 && !state.query) btn.classList.add('current');
    else btn.addEventListener('click', () => goTo(target));
    haceSoltable(btn, target);
    bar.appendChild(btn);
  });
}

function goTo(p) {
  state.path = p;
  clearSearchInput();
  exitSelectMode();
  refresh();
}

function aplicarBotonAgrupar() {
  $('btn-agrupar').classList.toggle('is-active', state.agrupar);
  $('btn-agrupar').title = state.agrupar ? 'Ver todas seguidas' : 'Agrupar por meses';
}

function applyViewButtons() {
  $('btn-grid').classList.toggle('is-active', state.view === 'grid');
  $('btn-list').classList.toggle('is-active', state.view === 'list');
}
function setView(view) {
  state.view = view;
  localStorage.setItem('fc-view', view);
  applyViewButtons();
  render();
}

/* ---------------------------------------------------------------
   Carga y filtrado
--------------------------------------------------------------- */
function renderSkeleton() {
  const box = $('file-list');
  box.textContent = '';
  const grid = state.view === 'grid';
  box.className = grid ? 'grid' : 'list';
  for (let i = 0; i < (grid ? 12 : 6); i++) {
    const s = el('div', 'skel');
    if (grid) s.style.aspectRatio = '1 / 1.18';
    else s.style.height = '64px';
    box.appendChild(s);
  }
}

function emptyState(title, sub, iconName) {
  const wrap = el('div', 'empty');
  const em = el('div', 'em');
  em.appendChild(icon(iconName || 'i-inbox'));
  wrap.appendChild(em);
  wrap.appendChild(el('h3', null, title));
  if (sub) wrap.appendChild(el('p', null, sub));
  return wrap;
}

async function refresh(opts) {
  // silent: actualización en directo por un aviso del servidor; sin esqueleto y sin perder la selección
  const silent = !!(opts && opts.silent === true);
  if (!silent) {
    renderBreadcrumb();
    renderSkeleton();
    state.selection.clear();
    updateSelbar();
  }
  try {
    const url = state.query
      ? `${BASE}/api/search?q=${qs(state.query)}&path=${qs(state.path)}`
      : `${BASE}/api/files?path=${qs(state.path)}`;
    const res = await api(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    state.truncated = !!data.truncated;
    state.perm = data.perm || null;               // 'read' | 'write' dentro de una carpeta compartida contigo
    state.meta = {};
    // rel = ruta completa relativa a la raíz del usuario; en búsqueda viene el directorio aparte
    state.items = (data.items || []).map(it => ({
      ...it,
      rel: state.query ? joinPath(it.dir || '', it.name) : joinPath(state.path, it.name),
    }));
    if (silent) {
      const existen = new Set(state.items.map(i => i.rel));
      for (const r of [...state.selection]) if (!existen.has(r)) state.selection.delete(r);
    }
    render();
    if (silent) updateSelbar();
    if (window.KCC.afterList) window.KCC.afterList(data);
    cargarMetaFotos();          // en segundo plano: la rejilla ya está pintada
  } catch {
    if (silent) return;         // un fallo de red en una actualización en directo no debe tapar lo que ya se ve
    const box = $('file-list');
    box.textContent = '';
    box.className = '';
    box.appendChild(emptyState('No se pudo cargar', 'Comprueba la conexión y reinténtalo'));
  }
}

function visibleItems() {
  let list = state.items;
  if (state.filter !== 'all') {
    list = list.filter(i => i.isDir || catOf(i.name) === state.filter);
  }
  const [key, dir] = state.sort.split('-');
  const mul = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (key === 'name') return mul * a.name.localeCompare(b.name, 'es', { numeric: true });
    if (key === 'date') return mul * (new Date(a.modified) - new Date(b.modified));
    return mul * ((a.size || 0) - (b.size || 0));
  });
}
