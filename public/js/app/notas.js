'use strict';
/* Bloc de notas (árbol y guardado). Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Bloc de notas
--------------------------------------------------------------- */
const NT = {
  items: [],
  abierta: null,              // id de la nota en edición
  abiertas: new Set(JSON.parse(localStorage.getItem('fc-notas-abiertas') || '[]')),
  filtro: '',
  guardando: null,
  sucia: false,
  arrastrada: null,
  selMode: false,
  sel: new Set(),
};

function guardarAbiertas() {
  localStorage.setItem('fc-notas-abiertas', JSON.stringify([...NT.abiertas]));
}

async function loadNotes(mantener) {
  try {
    const res = await api(BASE + '/api/notes');
    const data = await res.json();
    NT.items = data.items || [];
    renderNotes();
    if (!mantener && NT.abierta && !NT.items.some(i => i.id === NT.abierta)) cerrarNota();
  } catch { showToast('No se pudieron cargar las notas'); }
}

function hijosDe(parent) {
  return NT.items
    .filter(i => i.parent === parent)
    .sort((a, b) => (a.type === b.type
      ? ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || a.title.localeCompare(b.title, 'es')
      : a.type === 'folder' ? -1 : 1));
}

// Con filtro activo se muestran las coincidencias y sus carpetas padre, para no perder el contexto
function coincide(item) {
  if (!NT.filtro) return true;
  if (item.title.toLowerCase().includes(NT.filtro)) return true;
  return hijosDe(item.id).some(coincide);
}

function pintaSelNotas() {
  const b = $('notes-selbar');
  NT.sel = new Set([...NT.sel].filter(id => NT.items.some(i => i.id === id)));
  b.textContent = '';
  $('btn-notes-select').classList.toggle('on', NT.selMode);
  if (!NT.selMode) { b.hidden = true; return; }
  b.hidden = false;
  b.appendChild(el('span', 'n', `${NT.sel.size} seleccionada${NT.sel.size === 1 ? '' : 's'}`));
  const btn = (txt, fn, cls) => { const x = el('button', 'btn sm ' + (cls || ''), txt); x.type = 'button'; x.addEventListener('click', fn); b.appendChild(x); return x; };
  btn('Todas', () => { NT.items.filter(coincide).forEach(i => NT.sel.add(i.id)); renderNotes(); });
  btn('Ninguna', () => { NT.sel.clear(); renderNotes(); });
  b.appendChild(el('span', 'grow'));
  btn('Eliminar', borrarNotasSel, 'danger').disabled = !NT.sel.size;
}

async function borrarNotasSel() {
  const ids = [...NT.sel]; if (!ids.length) return;
  if (!confirm(`¿Eliminar ${ids.length} elemento${ids.length === 1 ? '' : 's'}? Las carpetas se llevan lo que contienen. Van a la papelera.`)) return;
  try {
    const res = await post(BASE + '/api/notes-bulk-delete', { ids });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo eliminar'); return; }
    showToast(`${data.borrados} elemento${data.borrados === 1 ? '' : 's'} eliminado${data.borrados === 1 ? '' : 's'}`);
    NT.sel.clear(); NT.selMode = false;
    await loadNotes(true); refrescarContadorPapeleraNotas();
    if (NT.abierta && !NT.items.some(i => i.id === NT.abierta)) cerrarNota();
  } catch { showToast('Error de conexión'); }
}

// Panel de «ninguna nota abierta»: las 6 notas editadas más recientemente y un botón para crear
function pintaVacio() {
  const lista = $('nv-list'), caja = $('nv-rec');
  if (!lista || !caja) return;
  lista.textContent = '';
  const recientes = NT.items.filter(i => i.type === 'note')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
  caja.hidden = !recientes.length;
  for (const n of recientes) {
    const b = el('button', null);
    b.type = 'button';
    b.append(el('span', 't', n.title || 'Nota sin título'), el('span', 'd', n.updatedAt ? fmtDate(n.updatedAt) : ''));
    b.addEventListener('click', () => abrirNota(n.id));
    lista.appendChild(el('li', null)).appendChild(b);
  }
}
$('nv-new').addEventListener('click', () => crearNota('note', ''));

function renderNotes() {
  pintaSelNotas();
  pintaVacio();
  const caja = $('notes-tree');
  caja.textContent = '';
  const raiz = hijosDe('').filter(coincide);
  if (!raiz.length) {
    caja.appendChild(el('div', 'notes-vacio',
      NT.filtro ? 'Ningún título coincide' : 'Sin notas todavía. Crea la primera con el botón +'));
    return;
  }
  const pinta = (lista, nivel) => {
    for (const item of lista) {
      caja.appendChild(filaNota(item, nivel));
      const abierta = NT.abiertas.has(item.id) || (NT.filtro && item.type === 'folder');
      if (item.type === 'folder' && abierta) pinta(hijosDe(item.id).filter(coincide), nivel + 1);
    }
  };
  pinta(raiz, 0);
}

function filaNota(item, nivel) {
  const row = el('div', 'nrow' + (item.type === 'note' ? ' nota' : ''));
  row.style.paddingLeft = 8 + nivel * 14 + 'px';
  if (item.id === NT.abierta) row.classList.add('sel');
  if (NT.abiertas.has(item.id)) row.classList.add('abierta');

  const caret = icon('i-caret', 'caret');
  if (item.type !== 'folder') caret.classList.add('hueco');
  caret.addEventListener('click', e => {
    e.stopPropagation();
    if (item.type !== 'folder') return;
    NT.abiertas.has(item.id) ? NT.abiertas.delete(item.id) : NT.abiertas.add(item.id);
    guardarAbiertas();
    renderNotes();
  });
  row.appendChild(caret);
  if (item.color) row.style.setProperty('--nc', item.color);
  if (item.icon) row.appendChild(el('span', 'em', item.icon));
  else row.appendChild(icon(item.type === 'folder' ? 'i-folder' : 'i-note', 'ic'));
  row.appendChild(el('span', 'tx', item.title));
  // Etiquetas (puntos de color), fecha del calendario y fijada: se ven sin abrir la nota
  if (window.K && K.labels && item.labels && item.labels.length) {
    const pts = el('span', 'ldots');
    item.labels.slice(0, 3).forEach(id => { const l = K.labels.by[id]; if (l) { const d = el('span', 'k-dot'); d.style.setProperty('--c', l.color); d.title = l.name; pts.appendChild(d); } });
    if (pts.children.length) row.appendChild(pts);
  }
  if (item.cal) { const c = icon('i-calendar', 'calmark'); c.setAttribute('aria-label', 'En el calendario'); row.appendChild(c); }
  if (item.pinned) row.appendChild(icon('i-pin-fill', 'pinmark'));

  const mas = el('button', 'mas');
  mas.appendChild(icon('i-dots'));
  mas.setAttribute('aria-label', 'Opciones');
  mas.addEventListener('click', e => { e.stopPropagation(); menuNota(e.clientX, e.clientY, item); });
  row.appendChild(mas);

  if (NT.selMode) {
    row.classList.add('sel-mode'); if (NT.sel.has(item.id)) row.classList.add('is-sel');
    const ck = el('span', 'cal-check' + (NT.sel.has(item.id) ? ' on' : '')); ck.style.setProperty('--c', '#6366f1'); ck.appendChild(icon('i-check'));
    row.insertBefore(ck, row.firstChild);
  }
  row.addEventListener('click', () => {
    if (NT.selMode) { NT.sel.has(item.id) ? NT.sel.delete(item.id) : NT.sel.add(item.id); renderNotes(); return; }
    if (item.type === 'folder') {
      NT.abiertas.has(item.id) ? NT.abiertas.delete(item.id) : NT.abiertas.add(item.id);
      guardarAbiertas();
      renderNotes();
    } else abrirNota(item.id);
  });
  row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); menuNota(e.clientX, e.clientY, item); });

  // Arrastrar dentro del árbol para reorganizar
  row.draggable = true;
  row.addEventListener('dragstart', e => { NT.arrastrada = item; e.dataTransfer.effectAllowed = 'move'; });
  row.addEventListener('dragend', () => {
    NT.arrastrada = null;
    document.querySelectorAll('.drop-note').forEach(n => n.classList.remove('drop-note'));
  });
  if (item.type === 'folder') {
    row.addEventListener('dragover', e => {
      if (!NT.arrastrada || NT.arrastrada.id === item.id) return;
      e.preventDefault();
      row.classList.add('drop-note');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-note'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drop-note');
      if (NT.arrastrada) moverNota(NT.arrastrada, item.id);
    });
  }
  return row;
}

function menuNota(x, y, item) {
  const menu = $('ctxmenu');
  menu.textContent = '';
  menu.appendChild(el('div', 'cab', item.title));
  if (item.type === 'folder') {
    opcionCtx(menu, 'i-plus', 'Nueva nota aquí', () => crearNota('note', item.id));
    opcionCtx(menu, 'i-folder-plus', 'Nueva subcarpeta', () => crearNota('folder', item.id));
  }
  opcionCtx(menu, 'i-pencil', 'Renombrar', () => renombrarNota(item));
  if (item.parent) opcionCtx(menu, 'i-up', 'Sacar a la raíz', () => moverNota(item, ''));
  if (window.KCC.noteMenu) window.KCC.noteMenu(menu, item);      // exportar, plantilla… (js/notes-extra.js)
  menu.appendChild(el('div', 'sep'));
  opcionCtx(menu, 'i-trash', item.type === 'folder' ? 'Eliminar carpeta y su contenido' : 'Eliminar nota',
    () => borrarNota(item), true);

  menu.style.left = '-9999px';
  menu.style.top = '0';
  show('ctxmenu');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}

async function crearNota(type, parent) {
  try {
    const res = await post(BASE + '/api/notes', { type, parent: parent || '', title: type === 'folder' ? 'Nueva carpeta' : 'Nota sin título' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo crear'); return; }
    if (parent) { NT.abiertas.add(parent); guardarAbiertas(); }
    await loadNotes(true);
    if (type === 'note') { abrirNota(data.item.id); $('note-title').focus(); $('note-title').select(); }
  } catch { showToast('Error de conexión'); }
}

async function renombrarNota(item) {
  const titulo = prompt('Nuevo nombre:', item.title);
  if (titulo === null || titulo.trim() === item.title) return;
  try {
    const res = await api(BASE + '/api/notes/' + qs(item.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titulo.trim() || item.title }),
    });
    if (res.ok) { await loadNotes(true); if (item.id === NT.abierta) $('note-title').value = titulo.trim(); }
    else showToast(await errorOf(res, 'No se pudo renombrar'));
  } catch { showToast('Error de conexión'); }
}

async function moverNota(item, parent) {
  try {
    const res = await api(BASE + '/api/notes/' + qs(item.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent }),
    });
    if (res.ok) { if (parent) { NT.abiertas.add(parent); guardarAbiertas(); } loadNotes(true); }
    else showToast(await errorOf(res, 'No se pudo mover'));
  } catch { showToast('Error de conexión'); }
}

async function borrarNota(item) {
  const aviso = item.type === 'folder'
    ? `¿Eliminar la carpeta "${item.title}" y todo lo que contiene? No va a la papelera.`
    : `¿Eliminar la nota "${item.title}"? No va a la papelera.`;
  if (!confirm(aviso)) return;
  try {
    const res = await api(BASE + '/api/notes/' + qs(item.id), { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.borrados > 1 ? `${data.borrados} elementos eliminados` : 'Eliminado');
      if (item.id === NT.abierta) cerrarNota();
      loadNotes();
    } else showToast(data.error || 'No se pudo eliminar');
  } catch { showToast('Error de conexión'); }
}

async function abrirNota(id) {
  await guardarAhora();                       // no perder lo escrito al cambiar de nota
  try {
    const res = await api(BASE + '/api/notes/' + qs(id));
    const nota = await res.json();
    if (!res.ok) { showToast(nota.error || 'No se pudo abrir'); return; }
    NT.abierta = id;
    NT.sucia = false;
    $('note-title').value = nota.title;
    $('note-body').value = nota.body || '';
    hide('editor-vacio');
    show('editor-cuerpo');
    $('notes-editor').closest('.notes').classList.add('editando');
    pintarMetaNota(nota);
    $('note-saved').textContent = '';
    renderNotes();
  } catch { showToast('Error de conexión'); }
}

function pintarMetaNota(nota) {
  const chars = ($('note-body').value || '').length;
  const palabras = ($('note-body').value.trim().match(/\S+/g) || []).length;
  $('note-meta').textContent =
    `${palabras} palabra${palabras === 1 ? '' : 's'} · ${chars} caracteres` +
    (nota && nota.updatedAt ? ` · editada el ${fmtDate(nota.updatedAt)}` : '');
}

function cerrarNota() {
  NT.abierta = null;
  NT.sucia = false;
  show('editor-vacio');
  hide('editor-cuerpo');
  $('notes-editor').closest('.notes').classList.remove('editando');
  renderNotes();
}

function marcarSucia() {
  NT.sucia = true;
  $('note-saved').textContent = 'Escribiendo…';
  $('note-saved').classList.remove('ok');
  clearTimeout(NT.guardando);
  NT.guardando = setTimeout(guardarAhora, 900);
  pintarMetaNota(NT.items.find(i => i.id === NT.abierta));
}

async function guardarAhora() {
  clearTimeout(NT.guardando);
  if (!NT.abierta || !NT.sucia) return;
  const id = NT.abierta;
  const cuerpo = { title: $('note-title').value.trim() || 'Nota sin título', body: $('note-body').value };
  NT.sucia = false;
  try {
    const res = await api(BASE + '/api/notes/' + qs(id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (res.ok) {
      $('note-saved').textContent = 'Guardado';
      $('note-saved').classList.add('ok');
      setTimeout(() => { if (!NT.sucia) $('note-saved').textContent = ''; }, 2000);
      await loadNotes(true);
    } else {
      NT.sucia = true;
      $('note-saved').textContent = await errorOf(res, 'Error al guardar');
    }
  } catch {
    NT.sucia = true;
    $('note-saved').textContent = 'Sin conexión';
  }
}
