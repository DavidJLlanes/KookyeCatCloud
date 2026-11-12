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
    // Un error del servidor NO es «sin notas»: se conserva la lista que ya se ve y se avisa con el motivo
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las notas');
    NT.items = data.items || [];
    renderNotes();
    if (!mantener && NT.abierta && !NT.items.some(i => i.id === NT.abierta)) cerrarNota();
  } catch (e) { showToast(e && e.message && e.message !== 'No autenticado' ? e.message : 'No se pudieron cargar las notas'); }
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

// Firma de lo que se ve en el árbol. Si no cambió nada (típico tras cada autoguardado), no se reconstruye: reemplazar las
// filas mientras el dedo las pulsa hace que el toque se pierda y la nota «no se abra».
let firmaArbol = '';
function firmaDe(filas) {
  const lb = (window.K && K.labels && K.labels.by) || {};
  return JSON.stringify([NT.filtro, NT.abierta, NT.selMode, [...NT.sel], filas.map(([it, n]) => [
    it.id, n, it.title, it.type, it.color || '', it.icon || '', it.cal ? 1 : 0, it.pinned ? 1 : 0, NT.abiertas.has(it.id) ? 1 : 0,
    (it.labels || []).slice(0, 3).map(id => lb[id] ? lb[id].name + lb[id].color : '')])]);
}

function renderNotes() {
  pintaSelNotas();
  pintaVacio();
  const caja = $('notes-tree');
  const raiz = hijosDe('').filter(coincide);
  const filas = [];
  const reune = (lista, nivel) => {
    for (const item of lista) {
      filas.push([item, nivel]);
      const abierta = NT.abiertas.has(item.id) || (NT.filtro && item.type === 'folder');
      if (item.type === 'folder' && abierta) reune(hijosDe(item.id).filter(coincide), nivel + 1);
    }
  };
  reune(raiz, 0);
  const firma = firmaDe(filas);
  if (firma === firmaArbol && caja.childElementCount) return;
  firmaArbol = firma;
  caja.textContent = '';
  if (!raiz.length) {
    caja.appendChild(el('div', 'notes-vacio',
      NT.filtro ? 'Ningún título coincide' : 'Sin notas todavía. Crea la primera con el botón +'));
    return;
  }
  for (const [item, nivel] of filas) caja.appendChild(filaNota(item, nivel));
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
  if (K.menuAccesible) K.menuAccesible(menu, { items: 'button', cierra: cerrarCtx });   // flechas, roles y foco (kit-foco.js)
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

// Cada pulsación toma un número: si el usuario toca otra nota antes de que llegue la primera, solo vale la última
// (antes la respuesta más lenta podía pisar a la buena y parecía que «no se abría»)
let aperturaN = 0;
async function abrirNota(id) {
  const mia = ++aperturaN;
  // Un guardado pendiente no puede impedir abrir otra nota: se le da un momento y, si tarda, se sigue (su contenido
  // ya va en la petición y, si falla, queda en NT.pendientes para reintentarlo)
  await Promise.race([guardarAhora(), new Promise(r => setTimeout(r, 2500))]);
  if (mia !== aperturaN) return;
  $('note-saved').textContent = 'Abriendo…';
  $('note-saved').classList.remove('ok');
  try {
    const res = await api(BASE + '/api/notes/' + qs(id));
    const nota = await res.json();
    if (mia !== aperturaN) return;
    if (!res.ok) { $('note-saved').textContent = ''; showToast(nota.error || 'No se pudo abrir'); return; }
    NT.abierta = id;
    NT.sucia = false;
    NT.base = nota.bodyAt || 0;   // para detectar si otro dispositivo la cambia mientras la tienes abierta
    $('note-title').value = nota.title;
    $('note-body').value = nota.body || '';
    hide('editor-vacio');
    show('editor-cuerpo');
    $('notes-editor').closest('.notes').classList.add('editando');
    pintarMetaNota(nota);
    $('note-saved').textContent = '';
    renderNotes();
  } catch (e) {
    if (mia !== aperturaN) return;
    $('note-saved').textContent = '';
    showToast(e && e.name === 'TimeoutError' ? e.message : 'Error de conexión');
  }
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

// Guardados que no llegaron al servidor (sin red, tiempo agotado): se reintentan en el siguiente guardado, al abrir otra
// nota o cuando vuelve la conexión. Así cambiar de nota con la red mala no pierde lo escrito.
// También se copian en el almacenamiento del navegador: si la app se cierra o el móvil la descarta antes de guardar, se
// reintentan al volver (solo si la nota no se ha editado después en otro sitio, para no pisar una versión más nueva).
const CLAVE_PEND = 'kcc-notas-pendientes';
NT.pendientes = new Map();
try { for (const [id, c] of JSON.parse(localStorage.getItem(CLAVE_PEND) || '[]')) NT.pendientes.set(id, { ...c, restaurada: true }); } catch { /* sin almacenamiento */ }
function persistePendientes() { try { localStorage.setItem(CLAVE_PEND, JSON.stringify([...NT.pendientes])); } catch { /* sin almacenamiento */ } }
function pendiente(id, cuerpo) { if (cuerpo) NT.pendientes.set(id, { ...cuerpo, at: cuerpo.at || Date.now() }); else NT.pendientes.delete(id); persistePendientes(); }
async function reintentaPendientes() {
  for (const [id, c] of [...NT.pendientes]) {
    if (id === NT.abierta && NT.sucia) continue;          // la nota abierta ya tiene cambios más nuevos
    try {
      if (id.startsWith('conflicto-')) {   // copia en conflicto que no se pudo crear: se crea ahora como nota nueva
        const r = await post(BASE + '/api/notes', { type: 'note', title: `${c.title} (copia en conflicto)`.slice(0, 120), body: c.body });
        if (r.ok) { pendiente(id, null); loadNotes(true); }
        continue;
      }
      if (c.restaurada) {
        const r = await api(BASE + '/api/notes/' + qs(id));
        if (r.status === 404) { pendiente(id, null); continue; }
        const n = await r.json().catch(() => null);
        if (!r.ok || !n) continue;
        if ((n.updatedAt || 0) > (c.at || 0) || n.body === c.body) { pendiente(id, null); continue; }   // ya hay algo más nuevo
      }
      const res = await api(BASE + '/api/notes/' + qs(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: c.title, body: c.body }) });
      if (res.ok || res.status === 404) pendiente(id, null);
    } catch { /* se vuelve a intentar más tarde */ }
  }
}
// Al ocultar la app (cambiar de app en el móvil, cerrar la pestaña) se guarda ya, sin esperar al temporizador
function guardaAlOcultar() {
  if (!NT.abierta || !NT.sucia) return;
  pendiente(NT.abierta, { title: $('note-title').value.trim() || 'Nota sin título', body: $('note-body').value });
  guardarAhora();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) guardaAlOcultar(); });
// kit.js se carga después que este archivo: el registro espera a que estén todos los scripts
// (los pendientes ya están copiados en el navegador: no impiden recargar)
document.addEventListener('DOMContentLoaded', () => { if (window.K && K.registraSinGuardar) K.registraSinGuardar(() => NT.sucia); });
window.addEventListener('pagehide', guardaAlOcultar);
setTimeout(() => { if (NT.pendientes.size) reintentaPendientes(); }, 4000);
window.addEventListener('online', () => { reintentaPendientes(); });

// Otro dispositivo cambió la nota mientras estaba abierta aquí: no se pisa ninguna de las dos. Lo escrito aquí se guarda
// como una nota nueva «(copia en conflicto)» junto a la original y se abre la versión del servidor.
async function resuelveConflicto(id, cuerpo) {
  const it = NT.items.find(i => i.id === id) || {};
  const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  try {
    const r = await post(BASE + '/api/notes', { type: 'note', title: `${cuerpo.title} (copia en conflicto ${hora})`.slice(0, 120), body: cuerpo.body, parent: it.parent || '' });
    if (!r.ok) throw new Error(await errorOf(r, 'No se pudo guardar la copia'));
    showToast('Esta nota se cambió en otro dispositivo. Tu versión se ha guardado como «copia en conflicto».');
  } catch (e) {
    pendiente('conflicto-' + id, cuerpo);   // al menos queda en el navegador
    showToast('Esta nota se cambió en otro dispositivo y no se pudo guardar tu copia: ' + e.message);
  }
  await loadNotes(true);
  if (NT.abierta === id) { NT.sucia = false; await abrirNota(id); }
}
async function guardarAhora() {
  clearTimeout(NT.guardando);
  if (!NT.abierta || !NT.sucia) { if (NT.pendientes.size) reintentaPendientes(); return; }
  const id = NT.abierta;
  const cuerpo = { title: $('note-title').value.trim() || 'Nota sin título', body: $('note-body').value };
  const base = NT.base || 0;
  NT.sucia = false;
  try {
    const res = await api(BASE + '/api/notes/' + qs(id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, base }),
    });
    if (res.status === 409) { pendiente(id, null); await resuelveConflicto(id, cuerpo); return; }
    if (res.ok) {
      pendiente(id, null);
      try { const j = await res.clone().json(); if (NT.abierta === id && j.item && j.item.bodyAt) NT.base = j.item.bodyAt; } catch { /* sin cuerpo */ }
      if (NT.abierta === id) {
        $('note-saved').textContent = 'Guardado';
        $('note-saved').classList.add('ok');
        setTimeout(() => { if (!NT.sucia) $('note-saved').textContent = ''; }, 2000);
      }
      await loadNotes(true);
    } else {
      // Error del servidor: la nota abierta sigue sucia; si ya se abrió otra, el texto se guarda para reintentarlo
      if (NT.abierta === id) { NT.sucia = true; $('note-saved').textContent = await errorOf(res, 'Error al guardar'); }
      else pendiente(id, cuerpo);
    }
  } catch {
    if (NT.abierta === id) { NT.sucia = true; $('note-saved').textContent = 'Sin conexión'; }
    else pendiente(id, cuerpo);
  }
}
