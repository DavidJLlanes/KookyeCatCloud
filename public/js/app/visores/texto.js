'use strict';
/* app/visores/texto.js: parte de visores.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Edición de archivos de texto, desde el propio visor
--------------------------------------------------------------- */
let DOC_EDITANDO = null;   // { item } mientras se está editando

async function alternarEdicion() {
  const item = state.viewables[state.lbIndex];
  if (!item || !isTexto(item.name)) return;
  const caja = $('lb-media');

  if (DOC_EDITANDO && DOC_EDITANDO.item === item) {
    DOC_EDITANDO = null;
    $('lb-edit').classList.remove('is-active');
    pintarDocumento(caja, item);
    return;
  }

  $('lb-edit').classList.add('is-active');
  caja.textContent = '';
  caja.appendChild(estadoDoc('i-refresh', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/text?path=' + qs(item.rel));
    const data = await res.json();
    if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;
    if (!res.ok) {
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'No se pudo abrir', data.error, item));
      $('lb-edit').classList.remove('is-active');
      return;
    }
    if (data.truncated) {
      // Solo llega el principio del archivo: editarlo y guardarlo cortaría el resto
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'Archivo demasiado grande para editarlo aquí', 'Solo se puede ver el principio. Descárgalo para editarlo en tu ordenador.', item));
      $('lb-edit').classList.remove('is-active');
      return;
    }
    DOC_EDITANDO = { item, base: data.mtime || 0 };
    caja.textContent = '';
    const wrap = el('div', 'doc-edit');
    const ta = el('textarea');
    ta.value = data.text;
    ta.spellcheck = false;
    wrap.appendChild(ta);
    const acciones = el('div', 'doc-edit-acciones');
    const cancelar = el('button', 'btn', 'Cancelar');
    cancelar.addEventListener('click', () => alternarEdicion());
    const guardar = el('button', 'btn primary', 'Guardar');
    guardar.addEventListener('click', () => guardarEdicion(item, ta.value));
    if (window.KCC.fileVersions) {
      const hist = el('button', 'btn', 'Historial');
      hist.addEventListener('click', () => window.KCC.fileVersions(item));
      acciones.appendChild(hist);
    }
    acciones.appendChild(cancelar);
    acciones.appendChild(guardar);
    wrap.appendChild(acciones);
    caja.appendChild(wrap);
    ta.focus();
  } catch {
    caja.textContent = '';
    caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
    $('lb-edit').classList.remove('is-active');
  }
}

async function guardarEdicion(item, texto) {
  try {
    const res = await api(BASE + '/api/text?path=' + qs(item.rel), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto, base: (DOC_EDITANDO && DOC_EDITANDO.base) || 0 }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo guardar'); return; }
    showToast('Guardado');
    DOC_EDITANDO = null;
    $('lb-edit').classList.remove('is-active');
    if (state.lbIndex >= 0 && state.viewables[state.lbIndex] === item) pintarDocumento($('lb-media'), item);
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Favorito y presentación (slideshow), desde el visor
--------------------------------------------------------------- */
function pintarLbFav(item) {
  const btn = $('lb-fav');
  const activo = favSet.has(item.rel);
  btn.classList.toggle('is-active', activo);
  const texto = activo ? 'Quitar de favoritos' : 'Añadir a favoritos';
  btn.title = texto;
  btn.setAttribute('aria-label', texto);
}

let slideshowTimer = null;
function alternarSlideshow() {
  if (slideshowTimer) { pararSlideshow(); return; }
  slideshowTimer = setInterval(() => lbStep(1), 4000);
  $('lb-play').classList.add('is-active');
  $('lb-play').querySelector('use').setAttribute('href', '#i-pause');
  $('lb-play').title = 'Detener presentación';
}
function pararSlideshow() {
  if (!slideshowTimer) return;
  clearInterval(slideshowTimer);
  slideshowTimer = null;
  $('lb-play').classList.remove('is-active');
  $('lb-play').querySelector('use').setAttribute('href', '#i-play');
  $('lb-play').title = 'Presentación';
}
