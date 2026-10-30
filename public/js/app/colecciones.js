'use strict';
/* Favoritos y colecciones (álbumes). Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Favoritos
--------------------------------------------------------------- */
let favSet = new Set();
async function cargarFavoritosSet() {
  try {
    const res = await api(BASE + '/api/favorites');
    const data = await res.json();
    favSet = new Set(data.items || []);
  } catch { /* se deja el set como estaba */ }
}
async function toggleFavorite(rel) {
  const esFav = favSet.has(rel);
  try {
    const res = esFav
      ? await api(BASE + '/api/favorites?path=' + qs(rel), { method: 'DELETE' })
      : await post(BASE + '/api/favorites', { path: rel });
    if (!res.ok) { showToast(await errorOf(res, 'No se pudo actualizar')); return; }
    esFav ? favSet.delete(rel) : favSet.add(rel);
    showToast(esFav ? 'Quitado de favoritos' : 'Añadido a favoritos');
    if (state.tab === 'colecciones' && COL.modo === 'favoritos') cargarFavoritos();
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Colecciones: favoritos y álbumes
--------------------------------------------------------------- */
const COL = { modo: 'favoritos', albumAbierto: null };

function loadColecciones() {
  pintarColSubnav();
  if (COL.modo === 'favoritos') cargarFavoritos();
  else if (COL.modo === 'albumes') cargarAlbumes();
  else if (window.Fotos) Fotos.carga(COL.modo);
}
function pintarColSubnav() {
  document.querySelectorAll('#col-subnav .chip').forEach(c => c.classList.toggle('is-active', c.dataset.col === COL.modo));
  $('col-favoritos').hidden = COL.modo !== 'favoritos';
  $('col-albumes').hidden = COL.modo !== 'albumes';
  $('col-fotos').hidden = COL.modo !== 'timeline' && COL.modo !== 'smart';
}

function tileGenerico(item, onQuitar, tituloQuitar, iconoQuitar) {
  const tile = el('div', 'tile');
  const box = el('div', 'thumb-box');
  if (!item.isDir && hasThumb(item.name)) {
    tile.classList.add('photo');
    const img = el('img');
    img.src = BASE + '/api/thumb?path=' + qs(item.rel);
    img.loading = 'lazy';
    img.alt = item.name;
    img.addEventListener('error', () => {
      img.remove();
      tile.classList.remove('photo');
      const c = el('div', 'center');
      c.appendChild(fileBadge(item.name, false));
      box.appendChild(c);
    });
    box.appendChild(img);
  } else {
    const c = el('div', 'center');
    c.appendChild(fileBadge(item.name, item.isDir));
    box.appendChild(c);
  }
  if (onQuitar) {
    const quitar = el('button', 'dots');
    quitar.appendChild(icon(iconoQuitar || 'i-x'));
    quitar.title = tituloQuitar || 'Quitar';
    quitar.setAttribute('aria-label', tituloQuitar || 'Quitar');
    quitar.addEventListener('click', e => { e.stopPropagation(); onQuitar(); });
    box.appendChild(quitar);
  }
  tile.appendChild(box);
  const cap = el('div', 'cap');
  cap.appendChild(el('span', 'name', item.name));
  cap.appendChild(el('span', 'sz', item.isDir ? '' : fmtSize(item.size)));
  tile.appendChild(cap);
  tile.addEventListener('click', () => {
    if (item.isDir) { switchTab('files'); goTo(item.rel); return; }
    if (isViewable(item.name)) openLightbox(state.viewables.indexOf(item));
  });
  return tile;
}

async function cargarFavoritos() {
  const box = $('fav-list');
  box.className = 'grid';
  box.textContent = '';
  box.appendChild(el('div', 'skel', ''));
  try {
    const res = await api(BASE + '/api/favorites');
    const data = await res.json();
    favSet = new Set(data.items || []);
    if (!data.items.length) {
      box.className = '';
      box.textContent = '';
      box.appendChild(emptyState('Sin favoritos todavía', 'Márcalos desde el menú de opciones de cada archivo', 'i-star'));
      return;
    }
    const items = (await Promise.all(data.items.map(async rel => {
      try {
        const partes = rel.split('/');
        const name = partes.pop();
        const dir = partes.join('/');
        const r = await api(BASE + '/api/files?path=' + qs(dir));
        const d = await r.json();
        const it = (d.items || []).find(i => i.name === name);
        return it ? { ...it, rel } : null;
      } catch { return null; }
    }))).filter(Boolean);
    state.viewables = items.filter(i => !i.isDir && isViewable(i.name));
    box.textContent = '';
    items.forEach((item, i) => {
      const tile = tileGenerico(item, () => toggleFavorite(item.rel), 'Quitar de favoritos', 'i-star-fill');
      tile.style.animationDelay = Math.min(i * 20, 300) + 'ms';
      box.appendChild(tile);
    });
  } catch {
    box.textContent = '';
    box.className = '';
    box.appendChild(emptyState('No se pudieron cargar los favoritos'));
  }
}

async function cargarAlbumes() {
  $('albums-toolbar').hidden = false;
  $('albums-grid').hidden = false;
  $('album-detalle').hidden = true;
  const grid = $('albums-grid');
  grid.className = 'grid';
  grid.textContent = '';
  grid.appendChild(el('div', 'skel', ''));
  try {
    const res = await api(BASE + '/api/albums');
    const data = await res.json();
    grid.textContent = '';
    if (!data.items.length) {
      grid.className = '';
      grid.appendChild(emptyState('Sin álbumes todavía', 'Crea uno y añade fotos desde su menú de opciones', 'i-stack'));
      return;
    }
    for (const a of data.items) grid.appendChild(buildAlbumTile(a));
  } catch {
    grid.textContent = '';
    grid.className = '';
    grid.appendChild(emptyState('No se pudieron cargar los álbumes'));
  }
}

function buildAlbumTile(album) {
  const tile = el('div', 'album-tile');
  const cover = el('div', 'cover');
  cover.appendChild(icon('i-stack'));
  tile.appendChild(cover);
  const cap = el('div', 'cap');
  cap.appendChild(el('div', 'name', album.title));
  cap.appendChild(el('div', 'n', `${album.count} elemento${album.count === 1 ? '' : 's'}`));
  tile.appendChild(cap);
  tile.addEventListener('click', () => abrirAlbum(album.id));
  return tile;
}

async function abrirAlbum(id) {
  COL.albumAbierto = id;
  $('albums-toolbar').hidden = true;
  $('albums-grid').hidden = true;
  $('album-detalle').hidden = false;
  const box = $('album-items');
  box.className = 'grid';
  box.textContent = '';
  box.appendChild(el('div', 'skel', ''));
  try {
    const res = await api(BASE + '/api/albums/' + id);
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo abrir'); volverAAlbumes(); return; }
    $('album-titulo').textContent = data.title;
    COL.albumTitulo = data.title;
    state.viewables = data.items.filter(i => !i.isDir && isViewable(i.name));
    box.textContent = '';
    if (!data.items.length) {
      box.className = '';
      box.appendChild(emptyState('Álbum vacío', 'Añade fotos desde su menú de opciones'));
      return;
    }
    data.items.forEach(item => {
      box.appendChild(tileGenerico(item, async () => {
        try {
          const r = await api(`${BASE}/api/albums/${id}/items?path=` + qs(item.rel), { method: 'DELETE' });
          if (r.ok) abrirAlbum(id);
        } catch { showToast('Error de conexión'); }
      }, 'Quitar del álbum', 'i-x'));
    });
  } catch {
    box.textContent = '';
    box.className = '';
    box.appendChild(emptyState('No se pudo abrir el álbum'));
  }
}
function descargarAlbum() {
  if (!COL.albumAbierto) return;
  const a = el('a');
  a.href = BASE + '/api/albums/' + COL.albumAbierto + '/zip';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Preparando el ZIP del álbum…');
}
function compartirAlbum() {
  if (!COL.albumAbierto) return;
  openShare({ name: COL.albumTitulo || 'Álbum', isDir: true, rel: '', album: COL.albumAbierto });
}
function volverAAlbumes() {
  COL.albumAbierto = null;
  cargarAlbumes();
}
async function eliminarAlbumActual() {
  if (!COL.albumAbierto) return;
  if (!confirm('¿Eliminar este álbum? Las fotos no se borran, solo la colección.')) return;
  try {
    const res = await api(BASE + '/api/albums/' + COL.albumAbierto, { method: 'DELETE' });
    if (res.ok) { showToast('Álbum eliminado'); volverAAlbumes(); }
    else showToast(await errorOf(res, 'No se pudo eliminar'));
  } catch { showToast('Error de conexión'); }
}
async function crearAlbumSolo() {
  const nombre = prompt('Nombre del nuevo álbum:', 'Álbum sin título');
  if (nombre === null) return;
  try {
    const res = await post(BASE + '/api/albums', { title: nombre.trim() || 'Álbum sin título' });
    if (res.ok) { showToast('Álbum creado'); cargarAlbumes(); }
    else showToast(await errorOf(res, 'No se pudo crear'));
  } catch { showToast('Error de conexión'); }
}

/* --- Añadir elementos a un álbum, desde cualquier menú de opciones --- */
let albumPickRutas = [];
async function openAlbumPicker(rels) {
  if (!rels.length) return;
  albumPickRutas = rels;
  $('album-pick-sub').textContent = rels.length === 1
    ? `"${rels[0].split('/').pop()}"` : `${rels.length} elementos`;
  $('album-pick-new').value = '';
  const list = $('album-pick-list');
  list.textContent = '';
  list.appendChild(el('div', 'none', 'Cargando…'));
  show('album-pick-modal');
  try {
    const res = await api(BASE + '/api/albums');
    const data = await res.json();
    list.textContent = '';
    if (!data.items.length) { list.appendChild(el('div', 'none', 'No tienes álbumes todavía. Crea uno abajo.')); return; }
    for (const a of data.items) {
      const btn = el('button');
      btn.appendChild(icon('i-stack'));
      btn.appendChild(el('span', null, `${a.title} (${a.count})`));
      btn.addEventListener('click', () => añadirAAlbum(a.id));
      list.appendChild(btn);
    }
  } catch {
    list.textContent = '';
    list.appendChild(el('div', 'none', 'No se pudieron cargar'));
  }
}
async function añadirAAlbum(id) {
  try {
    const res = await post(`${BASE}/api/albums/${id}/items`, { paths: albumPickRutas });
    if (res.ok) { showToast('Añadido al álbum'); hide('album-pick-modal'); }
    else showToast(await errorOf(res, 'No se pudo añadir'));
  } catch { showToast('Error de conexión'); }
}
async function crearAlbumYAñadir() {
  const nombre = $('album-pick-new').value.trim();
  if (!nombre) { showToast('Escribe un nombre'); return; }
  try {
    const res = await post(BASE + '/api/albums', { title: nombre, paths: albumPickRutas });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo crear'); return; }
    showToast('Álbum creado y elementos añadidos');
    hide('album-pick-modal');
  } catch { showToast('Error de conexión'); }
}
