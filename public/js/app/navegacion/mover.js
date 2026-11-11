'use strict';
/* app/navegacion/mover.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
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
