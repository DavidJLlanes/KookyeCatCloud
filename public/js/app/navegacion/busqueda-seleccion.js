'use strict';
/* app/navegacion/busqueda-seleccion.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
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
  return K.guardarUrl('/api/download?path=' + qs(rel), { nombre: '' });
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
  // Varios archivos: un solo ZIP (varios cuadros de guardado seguidos no caben en el móvil)
  if (files.length > 1) descargarZip(files.map(f => f.rel)); else downloadRel(files[0].rel);
}

function reportBatch(data, singular, plural) {
  if (data.errors && data.errors.length) {
    showToast(`${data.done} ${data.done === 1 ? singular : plural}, ${data.errors.length} con error: ${data.errors[0].error}`);
  } else {
    showToast(`${data.done} ${data.done === 1 ? singular : plural}`);
  }
}
