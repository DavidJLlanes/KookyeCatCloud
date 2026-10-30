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

/* ---------------------------------------------------------------
   Agrupación por meses y años
   La fecha buena es la de captura del EXIF, no la del archivo: subir una
   foto de 2019 hoy no debería colocarla en el mes actual.
--------------------------------------------------------------- */
async function cargarMetaFotos() {
  if (!state.agrupar || state.query) return;
  const hayFotos = state.items.some(i => !i.isDir && isImage(i.name));
  if (!hayFotos) return;
  const ruta = state.path;
  try {
    const res = await api(BASE + '/api/photometa?path=' + qs(ruta));
    const data = await res.json();
    if (!res.ok || ruta !== state.path) return;      // ya cambió de carpeta
    state.meta = data.fotos || {};
    for (const item of state.items) {
      const m = state.meta[item.name];
      if (m) { item.tomada = m.t; item.deExif = m.exif; item.lat = m.lat; item.lon = m.lon; }
    }
    render();
  } catch { /* se sigue agrupando por la fecha del archivo */ }
}

const fechaDe = (item) => item.tomada || new Date(item.modified).getTime();
const claveMes = (t) => {
  const d = new Date(t);
  return d.getFullYear() * 100 + d.getMonth();
};
function etiquetaMes(t) {
  const s = new Date(t).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pintarAgrupado(box, items) {
  const carpetas = items.filter(i => i.isDir);
  const archivos = items.filter(i => !i.isDir)
    .sort((a, b) => fechaDe(b) - fechaDe(a));        // lo más reciente primero

  const grid = () => {
    const c = el('div', state.view === 'grid' ? 'grid' : 'list');
    c.style.padding = '0 0 8px';
    return c;
  };
  let indice = 0;
  const pinta = (lista, contenedor) => {
    lista.forEach(item => {
      item._i = indice++;
      const nodo = state.view === 'grid' ? buildTile(item) : buildRow(item);
      nodo.style.animationDelay = Math.min(indice * 18, 300) + 'ms';
      contenedor.appendChild(nodo);
    });
  };

  if (carpetas.length) {
    const cab = el('div', 'grupo-cab');
    cab.appendChild(el('h3', null, 'Carpetas'));
    cab.appendChild(el('span', 'cuenta', `${carpetas.length}`));
    box.appendChild(cab);
    const c = grid();
    pinta(carpetas, c);
    box.appendChild(c);
  }

  let mesActual = null, anyoAnterior = null, contenedor = null;
  for (const item of archivos) {
    const t = fechaDe(item);
    const mes = claveMes(t);
    if (mes !== mesActual) {
      mesActual = mes;
      const anyo = new Date(t).getFullYear();
      const cab = el('div', 'grupo-cab');
      cab.appendChild(el('h3', null, etiquetaMes(t)));
      const delMes = archivos.filter(x => claveMes(fechaDe(x)) === mes).length;
      cab.appendChild(el('span', 'cuenta', `${delMes} archivo${delMes === 1 ? '' : 's'}`));
      // El año solo se destaca cuando cambia, para no repetirlo en cada mes
      if (anyo !== anyoAnterior) { cab.appendChild(el('span', 'anyo', String(anyo))); anyoAnterior = anyo; }
      box.appendChild(cab);
      contenedor = grid();
      box.appendChild(contenedor);
    }
    pinta([item], contenedor);
  }
}

function render() {
  const box = $('file-list');
  const items = visibleItems();
  state.viewables = items.filter(i => !i.isDir && isViewable(i.name));

  const info = $('search-info');
  if (state.query) {
    info.textContent = '';
    info.appendChild(document.createTextNode(`${items.length} resultado${items.length === 1 ? '' : 's'} para `));
    info.appendChild(el('b', null, `«${state.query}»`));
    if (state.truncated) info.appendChild(document.createTextNode(' (mostrando solo los primeros 300)'));
    info.hidden = false;
  } else {
    info.hidden = true;
  }

  const dirs = items.filter(i => i.isDir).length;
  const files = items.length - dirs;
  $('folder-count').textContent = [
    dirs ? `${dirs} carpeta${dirs > 1 ? 's' : ''}` : '',
    files ? `${files} archivo${files > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');

  box.textContent = '';
  if (!items.length) {
    box.className = '';
    box.appendChild(state.query
      ? emptyState('Sin resultados', 'Prueba con otra palabra', 'i-search')
      : state.filter !== 'all'
        ? emptyState('Nada de este tipo aquí', 'Cambia el filtro para ver el resto', 'i-search')
        : emptyState('Esta carpeta está vacía', 'Arrastra archivos aquí o usa "Subir archivos"'));
    return;
  }
  // Agrupado: cada mes con su cabecera. Sin agrupar: todo seguido, como siempre
  if (state.agrupar && !state.query) {
    box.className = 'agrupado';
    pintarAgrupado(box, items);
    return;
  }

  box.className = state.view === 'grid' ? 'grid' : 'list';
  items.forEach((item, i) => {
    item._i = i;                                   // índice visible, para el rango con Shift
    const node = state.view === 'grid' ? buildTile(item) : buildRow(item);
    // Entrada escalonada, con tope para que una carpeta enorme no tarde en aparecer
    node.style.animationDelay = Math.min(i * 22, 360) + 'ms';
    box.appendChild(node);
  });
}

function onItemClick(item, ev) {
  // Ctrl/Cmd para marcar suelto, Shift para marcar un rango
  if (ev && (ev.ctrlKey || ev.metaKey)) {
    if (!state.selectMode) enterSelectMode();
    toggleSelect(item);
    state.lastIndex = item._i;
    return;
  }
  if (ev && ev.shiftKey && state.lastIndex >= 0) {
    if (!state.selectMode) enterSelectMode();
    seleccionarRango(state.lastIndex, item._i);
    return;
  }
  if (state.selectMode) { toggleSelect(item); state.lastIndex = item._i; return; }
  if (item.isDir) { goTo(item.rel); return; }
  if (isViewable(item.name)) { openLightbox(state.viewables.indexOf(item)); return; }
  openActions(item);
}

function seleccionarRango(desde, hasta) {
  const lista = visibleItems();
  const a = Math.min(desde, hasta), b = Math.max(desde, hasta);
  for (let i = a; i <= b; i++) if (lista[i]) state.selection.add(lista[i].rel);
  updateSelbar();
  render();
}

/* ---------------------------------------------------------------
   Arrastrar elementos sobre una carpeta para moverlos
--------------------------------------------------------------- */
let arrastre = [];   // rutas que se están arrastrando

function haceArrastrable(node, item) {
  node.draggable = true;
  node.addEventListener('dragstart', e => {
    // Si el elemento arrastrado está marcado, se arrastra la selección entera
    arrastre = state.selection.has(item.rel) ? [...state.selection] : [item.rel];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', arrastre.join('\n'));
    e.dataTransfer.setData('application/x-kcc-rutas', JSON.stringify(arrastre));   // para soltar en otra sección (transferir.js)
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => {
    node.classList.remove('dragging');
    arrastre = [];
    document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
  });
}

function haceSoltable(node, destino) {
  node.addEventListener('dragover', e => {
    if (!arrastre.length) return;                       // arrastre externo: lo maneja la ventana
    if (arrastre.includes(destino)) return;             // una carpeta no cae dentro de sí misma
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    node.classList.add('drop-target');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', e => {
    node.classList.remove('drop-target');
    if (!arrastre.length) return;
    e.preventDefault();
    e.stopPropagation();
    moverA(arrastre, destino);
    arrastre = [];
  });
}

async function moverA(rutas, destino) {
  try {
    const res = await post(BASE + '/api/batch', { op: 'move', paths: rutas, dest: destino });
    const data = await res.json();
    reportBatch(data, 'elemento movido', 'elementos movidos');
    exitSelectMode();
    refresh();
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Menú contextual (clic derecho)
--------------------------------------------------------------- */
function cerrarCtx() { hide('ctxmenu'); }

function opcionCtx(menu, iconName, texto, accion, peligro) {
  const b = el('button', peligro ? 'danger' : null);
  b.appendChild(icon(iconName));
  b.appendChild(el('span', null, texto));
  b.addEventListener('click', () => { cerrarCtx(); accion(); });
  menu.appendChild(b);
}

function abrirCtx(x, y, item) {
  const menu = $('ctxmenu');
  menu.textContent = '';

  // Si hay varios marcados y el del clic es uno de ellos, el menú actúa sobre todos
  const sobreSeleccion = item && state.selection.size > 1 && state.selection.has(item.rel);
  const rutas = sobreSeleccion ? [...state.selection] : item ? [item.rel] : [];

  if (item) {
    menu.appendChild(el('div', 'cab', sobreSeleccion ? `${rutas.length} elementos` : nombreVisible(item.name)));
    if (!sobreSeleccion) {
      if (item.isDir) opcionCtx(menu, 'i-folder', 'Abrir', () => goTo(item.rel));
      else if (isViewable(item.name)) opcionCtx(menu,
        isVideo(item.name) ? 'i-play' : isAudio(item.name) ? 'i-music' : isDoc(item.name) ? 'i-doc' : 'i-image',
        isVideo(item.name) ? 'Reproducir' : isAudio(item.name) ? 'Escuchar' : isDoc(item.name) ? 'Abrir' : 'Ver imagen',
        () => openLightbox(state.viewables.indexOf(item)));
      if (!item.isDir) opcionCtx(menu, 'i-download', 'Descargar', () => downloadRel(item.rel));
      if (!item.isDir && isImage(item.name) && esMovil()) opcionCtx(menu, 'i-image', 'Guardar en galería', () => guardaEnGaleria(item.rel));
    } else {
      opcionCtx(menu, 'i-download', 'Descargar', bulkDownload);
    }
    if (!sobreSeleccion || rutas.length) opcionCtx(menu, 'i-move', rutas.length > 1 ? `Copiar o mover ${rutas.length} elementos a…` : 'Copiar o mover a…', () => K.transferir.abre({ tipo: 'archivos', rutas }, { carpeta: state.path, alTerminar: () => refresh() }));
    opcionCtx(menu, 'i-restore', 'Historial de envíos…', () => K.transferir.historial(() => refresh()));
    if (!sobreSeleccion) opcionCtx(menu, 'i-share', 'Compartir enlace…', () => openShare(item));
    if (window.KCC.fileCalendar) opcionCtx(menu, 'i-calendar', 'Fecha en el calendario…', () => window.KCC.fileCalendar(rutas));
    if (window.KCC.toVault) opcionCtx(menu, 'i-lock', 'Mover a la caja fuerte…', () => window.KCC.toVault(rutas));
    if (window.KCC.shareMenu) window.KCC.shareMenu(menu, item, rutas, sobreSeleccion);
    if (!sobreSeleccion && !item.isDir && isTexto(item.name) && window.KCC.fileVersions) opcionCtx(menu, 'i-clock', 'Historial de versiones…', () => window.KCC.fileVersions(item));
    opcionCtx(menu, 'i-zip', 'Descargar como ZIP', () => descargarZip(rutas));
    opcionCtx(menu, 'i-move', 'Mover a…', () => openMove(rutas));
    if (!sobreSeleccion) {
      opcionCtx(menu, 'i-pencil', 'Renombrar', () => { state.selected = item; renameSelected(); });
      opcionCtx(menu, 'i-star', favSet.has(item.rel) ? 'Quitar de favoritos' : 'Añadir a favoritos',
        () => toggleFavorite(item.rel));
      if (!item.isDir) opcionCtx(menu, 'i-stack', 'Añadir a álbum…', () => openAlbumPicker([item.rel]));
    } else {
      opcionCtx(menu, 'i-pencil', 'Renombrar en lote…', () => openRenameModal(rutas));
      opcionCtx(menu, 'i-stack', 'Añadir a álbum…', () => openAlbumPicker(rutas.filter(r => {
        const it = state.items.find(i => i.rel === r);
        return it && !it.isDir;
      })));
    }
    opcionCtx(menu, 'i-check-square', sobreSeleccion ? 'Quitar selección' : 'Seleccionar', () => {
      if (sobreSeleccion) exitSelectMode();
      else { if (!state.selectMode) enterSelectMode(); toggleSelect(item); }
    });
    menu.appendChild(el('div', 'sep'));
    opcionCtx(menu, 'i-trash', sobreSeleccion ? 'Enviar a la papelera' : 'Enviar a la papelera', () => {
      if (sobreSeleccion) bulkDelete();
      else { state.selected = item; deleteSelected(); }
    }, true);
  } else {
    opcionCtx(menu, 'i-upload', 'Subir archivos', () => $('file-input').click());
    opcionCtx(menu, 'i-folder-plus', 'Nueva carpeta', () => {
      $('folder-name-input').value = '';
      show('folder-modal');
      $('folder-name-input').focus();
    });
    opcionCtx(menu, 'i-check-square', state.selectMode ? 'Salir de selección' : 'Seleccionar varios',
      () => state.selectMode ? exitSelectMode() : enterSelectMode());
    menu.appendChild(el('div', 'sep'));
    opcionCtx(menu, 'i-refresh', 'Actualizar', refresh);
  }

  // Se muestra fuera de pantalla para medirlo y luego se encaja en el viewport
  menu.style.left = '-9999px';
  menu.style.top = '0';
  show('ctxmenu');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}

function checkbox(selected) {
  const box = el('div', 'check');
  box.appendChild(icon('i-check'));
  if (selected) box.classList.add('on');
  return box;
}

function buildRow(item) {
  const row = el('div', 'row');
  if (state.selection.has(item.rel)) row.classList.add('is-sel');
  if (state.selectMode) row.appendChild(checkbox());

  if (!item.isDir && hasThumb(item.name)) {
    const img = el('img', 'thumb');
    img.src = BASE + '/api/thumb?path=' + qs(item.rel);
    img.loading = 'lazy';
    img.alt = '';
    // Si el servidor no puede generarla (sin ffmpeg, formato raro), cae al distintivo
    img.addEventListener('error', () => {
      const mini = row.querySelector('.play-mini');
      if (mini) mini.remove();
      img.replaceWith(fileBadge(item.name, false));
    });
    row.appendChild(img);
    if (isVideo(item.name)) {
      const play = el('span', 'play-mini');
      play.appendChild(icon('i-play'));
      row.appendChild(play);
    }
  } else {
    row.appendChild(fileBadge(item.name, item.isDir));
  }

  const info = el('div', 'info');
  info.appendChild(el('div', 'name', nombreVisible(item.name)));
  info.appendChild(el('div', 'meta',
    (item.isDir ? 'Carpeta' : fmtSize(item.size)) + ' · ' + fmtDate(item.modified)));
  if (state.query) {
    const where = el('div', 'where');
    where.appendChild(icon('i-folder'));
    where.appendChild(el('span', null, item.dir ? item.dir : 'Inicio'));
    info.appendChild(where);
  }
  row.appendChild(info);

  if (!state.selectMode) {
    const menu = el('button', 'icon-btn');
    menu.appendChild(icon('i-dots'));
    menu.setAttribute('aria-label', 'Opciones');
    menu.addEventListener('click', e => { e.stopPropagation(); openActions(item); });
    row.appendChild(menu);
  }

  row.addEventListener('click', e => onItemClick(item, e));
  row.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    abrirCtx(e.clientX, e.clientY, item);
  });
  haceArrastrable(row, item);
  if (item.isDir) haceSoltable(row, item.rel);
  return row;
}

function buildTile(item) {
  const tile = el('div', 'tile');
  if (state.selection.has(item.rel)) tile.classList.add('is-sel');
  const box = el('div', 'thumb-box');

  if (!item.isDir && hasThumb(item.name)) {
    // .photo: la imagen ocupa toda la baldosa y el nombre va sobre un velo degradado
    tile.classList.add('photo');
    const img = el('img');
    img.src = BASE + '/api/thumb?path=' + qs(item.rel);
    img.loading = 'lazy';
    img.alt = item.name;
    img.addEventListener('error', () => {
      img.remove();
      tile.classList.remove('photo');
      const play = box.querySelector('.play-badge');
      if (play) play.remove();
      const c = el('div', 'center');
      c.appendChild(fileBadge(item.name, false));
      box.appendChild(c);
    });
    box.appendChild(img);
    if (isVideo(item.name)) {
      const play = el('div', 'play-badge');
      play.appendChild(icon('i-play'));
      box.appendChild(play);
    }
  } else {
    const c = el('div', 'center');
    c.appendChild(fileBadge(item.name, item.isDir));
    box.appendChild(c);
  }

  let inlineDots = null;
  if (state.selectMode) box.appendChild(checkbox());
  else {
    const dots = el('button', 'dots');
    dots.appendChild(icon('i-dots'));
    dots.setAttribute('aria-label', 'Opciones');
    dots.addEventListener('click', e => { e.stopPropagation(); openActions(item); });
    // Foto: el ⋮ flota sobre la imagen. Archivo/carpeta: va en la franja del nombre,
    // para no tapar el icono (sobre todo en móvil, donde la baldosa es grande).
    if (tile.classList.contains('photo')) box.appendChild(dots);
    else inlineDots = dots;
  }
  tile.appendChild(box);

  const cap = el('div', 'cap');
  cap.appendChild(el('span', 'name', nombreVisible(item.name)));
  cap.appendChild(el('span', 'sz', item.isDir ? '' : fmtSize(item.size)));
  if (inlineDots) { inlineDots.classList.add('inline'); cap.appendChild(inlineDots); }
  tile.appendChild(cap);

  tile.addEventListener('click', e => onItemClick(item, e));
  tile.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    abrirCtx(e.clientX, e.clientY, item);
  });
  haceArrastrable(tile, item);
  if (item.isDir) haceSoltable(tile, item.rel);
  return tile;
}

/* ---------------------------------------------------------------
   Búsqueda
--------------------------------------------------------------- */
let searchTimer = null;
function onSearchInput() {
  const value = $('search-input').value.trim();
  $('search-clear').hidden = !value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = value.length >= 2 ? value : '';
    if (q === state.query) return;
    state.query = q;
    exitSelectMode();
    refresh();
  }, 300);
}
function clearSearchInput() {
  $('search-input').value = '';
  $('search-clear').hidden = true;
  state.query = '';
}

/* ---------------------------------------------------------------
   Selección múltiple
--------------------------------------------------------------- */
function enterSelectMode() {
  state.selectMode = true;
  $('btn-select').classList.add('is-active');
  updateSelbar();
  render();
}
function exitSelectMode() {
  if (!state.selectMode && !state.selection.size) return;
  state.selectMode = false;
  state.selection.clear();
  $('btn-select').classList.remove('is-active');
  updateSelbar();
  if (state.tab === 'files') render();
}
function toggleSelect(item) {
  if (state.selection.has(item.rel)) state.selection.delete(item.rel);
  else state.selection.add(item.rel);
  updateSelbar();
  render();
}
function updateSelbar() {
  const n = state.selection.size;
  $('selbar').hidden = !state.selectMode;
  $('sel-count').textContent = n === 0
    ? 'Selecciona elementos'
    : `${n} seleccionado${n > 1 ? 's' : ''}`;
  ['sel-move', 'sel-download', 'sel-delete'].forEach(id => { $(id).disabled = n === 0; });
}
// La barra de acciones de selección flota sobre el contenido y tapaba las últimas filas, que ya no se podían
// marcar. Se mide su altura real y se reserva ese hueco al final de la página mientras esté visible.
(function vigilaBarrasSeleccion() {
  let pendiente = false;
  const calcula = () => {
    pendiente = false;
    let alto = 0;
    document.querySelectorAll('.selbar,.pr-selbar').forEach(b => {
      if (!b.hidden && b.getClientRects().length) alto = Math.max(alto, b.offsetHeight);
    });
    document.documentElement.style.setProperty('--selbar-h', alto + 'px');
    document.body.classList.toggle('selbar-on', alto > 0);
  };
  const pide = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(calcula); } };
  new MutationObserver(pide).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  window.addEventListener('resize', pide);
})();

function selectedItems() {
  return state.items.filter(i => state.selection.has(i.rel));
}

// Guardar en la galería del móvil: se abre la hoja de compartir del sistema (iPhone «Guardar imagen»,
// Android «Galería» / «Fotos»). En PC no hay hoja con archivos, así que se descarga como siempre.
// En iPhone la hoja solo se abre con un toque directo: si la imagen tarda en llegar, se guarda y
// el siguiente toque la abre sin volver a descargarla.
const galeriaCache = new Map();
function esMovil() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
}
async function guardaEnGaleria(rel) {
  const nombre = rel.split('/').pop();
  if (!esMovil() || !navigator.canShare) return downloadRel(rel);
  try {
    let file = galeriaCache.get(rel);
    if (!file) {
      const heic = /\.(heic|heif)$/i.test(nombre);
      const r = await fetch(BASE + '/api/download?path=' + qs(rel) + (heic ? '&as=jpg' : ''), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('No se pudo preparar la imagen');
      const blob = await r.blob();
      const nuevo = heic ? nombre.replace(/\.(heic|heif)$/i, '.jpg') : nombre;
      const tipos = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' };
      file = new File([blob], nuevo, { type: tipos[nuevo.split('.').pop().toLowerCase()] || 'image/jpeg' });
      galeriaCache.set(rel, file);
    }
    if (!navigator.canShare({ files: [file] })) { galeriaCache.delete(rel); return downloadRel(rel); }
    await navigator.share({ files: [file], title: file.name });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (e && e.name === 'NotAllowedError') return K.toast('Pulsa otra vez «Guardar en galería»');
    K.fail(e);
  }
}
function downloadRel(rel) {
  const a = document.createElement('a');
  a.href = BASE + '/api/download?path=' + qs(rel);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function bulkDelete() {
  const items = selectedItems();
  if (!items.length) return;
  if (!confirm(`¿Enviar ${items.length} elemento${items.length > 1 ? 's' : ''} a la papelera?`)) return;
  try {
    const res = await post(BASE + '/api/batch', { op: 'delete', paths: items.map(i => i.rel) });
    const data = await res.json();
    reportBatch(data, 'movido a la papelera', 'movidos a la papelera');
    exitSelectMode();
    refresh();
  } catch { showToast('Error de conexión'); }
}

function bulkDownload() {
  const files = selectedItems().filter(i => !i.isDir);
  if (!files.length) { showToast('Las carpetas no se pueden descargar todavía'); return; }
  files.forEach((f, i) => setTimeout(() => downloadRel(f.rel), i * 350));
  showToast(`Descargando ${files.length} archivo${files.length > 1 ? 's' : ''}`);
}

function reportBatch(data, singular, plural) {
  if (data.errors && data.errors.length) {
    showToast(`${data.done} ${data.done === 1 ? singular : plural}, ${data.errors.length} con error: ${data.errors[0].error}`);
  } else {
    showToast(`${data.done} ${data.done === 1 ? singular : plural}`);
  }
}

/* ---------------------------------------------------------------
   Mover a…
--------------------------------------------------------------- */
function openMove(rels) {
  if (!rels.length) return;
  state.pickerMode = 'move';
  state.moving = rels;
  state.pickerPath = state.path;
  $('move-modal').querySelector('h3').textContent = 'Mover a…';
  $('btn-move-here').textContent = 'Mover aquí';
  $('move-sub').textContent = rels.length === 1
    ? `Se moverá "${rels[0].split('/').pop()}"`
    : `Se moverán ${rels.length} elementos`;
  show('move-modal');
  loadPicker();
}

// El mismo selector sirve para elegir dónde caerán los archivos de un enlace
function openFolderForLink() {
  state.pickerMode = 'link';
  state.moving = [];
  state.pickerPath = state.linkPath || '';
  $('move-modal').querySelector('h3').textContent = 'Carpeta de destino';
  $('btn-move-here').textContent = 'Usar esta carpeta';
  $('move-sub').textContent = 'Aquí llegarán los archivos que te envíen';
  show('move-modal');
  loadPicker();
}

async function loadPicker() {
  const list = $('picker-list');
  $('picker-path').textContent = state.pickerPath || 'Inicio';
  list.textContent = '';
  list.appendChild(el('div', 'none', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/files?path=' + qs(state.pickerPath));
    const data = await res.json();
    list.textContent = '';

    if (state.pickerPath) {
      const up = el('button');
      up.appendChild(icon('i-up'));
      up.appendChild(el('span', null, '.. subir un nivel'));
      up.addEventListener('click', () => { state.pickerPath = parentOf(state.pickerPath); loadPicker(); });
      list.appendChild(up);
    }
    // No se puede mover una carpeta dentro de sí misma: se ocultan del destino
    const dirs = (data.items || []).filter(i => i.isDir)
      .filter(i => !state.moving.includes(joinPath(state.pickerPath, i.name)));
    for (const d of dirs) {
      const btn = el('button');
      btn.appendChild(icon('i-folder'));
      btn.appendChild(el('span', null, d.name));
      btn.addEventListener('click', () => {
        state.pickerPath = joinPath(state.pickerPath, d.name);
        loadPicker();
      });
      list.appendChild(btn);
    }
    if (!dirs.length && !state.pickerPath) {
      list.appendChild(el('div', 'none', 'No hay subcarpetas. Puedes mover aquí, a la raíz.'));
    }
  } catch {
    list.textContent = '';
    list.appendChild(el('div', 'none', 'No se pudo cargar'));
  }
}

async function confirmMove() {
  const dest = state.pickerPath;
  if (state.pickerMode === 'link') {
    state.linkPath = dest;
    $('link-folder-name').textContent = dest || 'Inicio';
    hide('move-modal');
    return;
  }
  try {
    const res = await post(BASE + '/api/batch', { op: 'move', paths: state.moving, dest });
    const data = await res.json();
    hide('move-modal');
    reportBatch(data, 'elemento movido', 'elementos movidos');
    exitSelectMode();
    refresh();
  } catch { showToast('Error de conexión'); }
}
