'use strict';
/* app/visores/detalles.js: parte de visores.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Detalles de la foto (EXIF)
--------------------------------------------------------------- */
// La exposición viene en segundos: 0.004 se lee mucho mejor como 1/250
function fmtExposicion(s) {
  if (!s) return null;
  if (s >= 1) return `${s} s`;
  return `1/${Math.round(1 / s)} s`;
}

function filaExif(padre, clave, valor) {
  if (valor === null || valor === undefined || valor === '') return;
  const f = el('div', 'exif-fila');
  f.appendChild(el('span', 'k', clave));
  f.appendChild(el('span', 'v', String(valor)));
  padre.appendChild(f);
}

async function alternarExif() {
  const panel = $('lb-exif');
  if (!panel.hidden) { panel.hidden = true; return; }
  const item = state.viewables[state.lbIndex];
  if (!item) return;

  panel.textContent = '';
  panel.appendChild(el('div', 'exif-vacio', 'Leyendo los datos…'));
  panel.hidden = false;

  try {
    const res = await api(BASE + '/api/exif?path=' + qs(item.rel));
    const e = await res.json();
    if (state.viewables[state.lbIndex] !== item) return;
    panel.textContent = '';
    if (!res.ok) { panel.appendChild(el('div', 'exif-vacio', e.error || 'No se pudieron leer')); return; }

    panel.appendChild(el('h4', null, e.nombre));
    panel.appendChild(el('p', 'sub', e.hayExif ? 'Datos de la cámara' : 'Esta foto no guarda datos de cámara'));

    filaExif(panel, 'Tomada', e.tomada ? new Date(e.tomada).toLocaleString('es-ES') : null);
    filaExif(panel, 'Cámara', e.camara);
    filaExif(panel, 'Objetivo', e.objetivo);
    filaExif(panel, 'Exposición', fmtExposicion(e.exposicion));
    filaExif(panel, 'Diafragma', e.diafragma ? `f/${e.diafragma}` : null);
    filaExif(panel, 'ISO', e.iso);
    filaExif(panel, 'Focal', e.focal ? `${e.focal} mm${e.focal35 && e.focal35 !== e.focal ? ` (${e.focal35} mm equiv.)` : ''}` : null);
    filaExif(panel, 'Dimensiones', e.ancho && e.alto ? `${e.ancho} × ${e.alto}` : null);
    filaExif(panel, 'Tamaño', fmtSize(e.tamano));
    filaExif(panel, 'Software', e.software);
    filaExif(panel, 'Altitud', e.altitud !== null && e.altitud !== undefined ? `${e.altitud} m` : null);

    if (e.lat !== null && e.lat !== undefined && e.lon !== null) {
      // Enlace, no botón: así se puede abrir en otra pestaña o copiar la dirección
      const enlace = el('a', 'exif-mapa');
      enlace.href = `https://www.google.com/maps?q=${e.lat},${e.lon}`;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.appendChild(icon('i-pin'));
      enlace.appendChild(el('span', null, 'Ver en Google Maps'));
      panel.appendChild(enlace);
      panel.appendChild(el('div', 'exif-coords', `${e.lat.toFixed(6)}, ${e.lon.toFixed(6)}`));
    } else if (e.hayExif) {
      panel.appendChild(el('div', 'exif-coords', 'Sin coordenadas guardadas'));
    }
  } catch {
    panel.textContent = '';
    panel.appendChild(el('div', 'exif-vacio', 'Error de conexión'));
  }
}

function lbStep(delta) {
  if (!state.viewables.length) return;
  state.lbIndex = (state.lbIndex + delta + state.viewables.length) % state.viewables.length;
  paintLightbox();
}

/* ---------------------------------------------------------------
   Acciones individuales
--------------------------------------------------------------- */
function openActions(item) {
  state.selected = item;
  $('action-title').textContent = item.name;
  $('action-sub').textContent =
    (item.isDir ? 'Carpeta' : fmtSize(item.size)) + ' · ' + fmtDate(item.modified);
  $('action-open').hidden = item.isDir || !isViewable(item.name);
  $('action-open-label').textContent =
    isVideo(item.name) ? 'Reproducir' : isAudio(item.name) ? 'Escuchar'
    : isDoc(item.name) ? 'Abrir documento' : 'Ver imagen';
  $('action-download').hidden = item.isDir;

  const esHeic = /\.(heic|heif)$/i.test(item.name);
  const esOfficeConvertible = /\.(docx?|pptx?|odt|odp|rtf|pages|key)$/i.test(item.name);
  $('action-download-jpg').hidden = item.isDir || !esHeic || (state.caps && state.caps.sharp === false);
  $('action-download-pdf').hidden = item.isDir || !esOfficeConvertible || (state.caps && state.caps.office === false);

  $('action-fav-label').textContent = favSet.has(item.rel) ? 'Quitar de favoritos' : 'Añadir a favoritos';
  $('action-fav').hidden = false;
  $('action-album').hidden = item.isDir;

  $('action-zip').hidden = false;
  show('action-modal');
}
function downloadConvertido(rel, as) {
  return K.guardarUrl('/api/download?path=' + qs(rel) + '&as=' + as, { nombre: '' });
}

async function renameSelected() {
  const item = state.selected;
  hide('action-modal');
  if (!item) return;
  const newName = prompt('Nuevo nombre:', item.name);
  if (!newName || newName === item.name) return;
  if (/[\\/]/.test(newName)) { showToast('El nombre no puede contener / ni \\'); return; }
  const dir = parentOf(item.rel);
  try {
    const res = await post(BASE + '/api/move', { from: item.rel, to: joinPath(dir, newName) });
    if (res.ok) { showToast('Renombrado'); refresh(); }
    else showToast(await errorOf(res, 'No se pudo renombrar'));
  } catch { showToast('Error de conexión'); }
}

async function deleteSelected() {
  const item = state.selected;
  hide('action-modal');
  if (!item) return;
  const what = item.isDir ? 'la carpeta y todo su contenido' : 'el archivo';
  if (!confirm(`¿Enviar ${what} "${item.name}" a la papelera?`)) return;
  try {
    const res = await api(BASE + '/api/files?path=' + qs(item.rel), { method: 'DELETE' });
    if (res.ok) { showToast('En la papelera. Puedes restaurarlo desde ahí.'); refresh(); }
    else showToast(await errorOf(res, 'No se pudo eliminar'));
  } catch { showToast('Error de conexión'); }
}
