'use strict';
/* Visores (fotos, documentos, hojas), edición de texto, presentación, mapa, EXIF y acciones. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Visor de fotos
--------------------------------------------------------------- */
function openLightbox(index) {
  if (index < 0 || !state.viewables.length) return;
  state.lbIndex = index;
  paintLightbox();
  show('lightbox');
}
function closeLightbox() {
  hide('lightbox');
  $('lb-exif').hidden = true;
  pararSlideshow();
  DOC_EDITANDO = null;
  vaciarVisor();
  state.lbIndex = -1;
}

// Zoom de la foto abierta (rueda, pellizco, doble toque); null si el archivo no es una imagen
let lbZoom = null;

// Parar la reproducción de verdad: sin esto el vídeo sigue sonando al cerrar
function vaciarVisor() {
  if (lbZoom) { lbZoom.destroy(); lbZoom = null; }
  const caja = $('lb-media');
  caja.querySelectorAll('video, audio').forEach(m => { m.pause(); m.removeAttribute('src'); m.load(); });
  caja.textContent = '';
}

function paintLightbox() {
  const item = state.viewables[state.lbIndex];
  if (!item) return;
  const caja = $('lb-media');
  vaciarVisor();
  DOC_EDITANDO = null;
  $('lb-edit').classList.remove('is-active');
  $('lb-edit').hidden = !isTexto(item.name);
  $('lb-fav').hidden = false;
  pintarLbFav(item);
  $('lb-play').hidden = state.viewables.length <= 1;
  const src = BASE + '/api/preview?path=' + qs(item.rel);
  // Las hojas no se abren en pestaña: no hay PDF que enseñar, se pintan aquí
  $('lb-open').hidden = !(isPdf(item.name) || (isOffice(item.name) && !isSheet(item.name)));
  $('lb-info').hidden = !isImage(item.name);
  $('lb-galeria').hidden = !isImage(item.name) || !esMovil();
  $('lb-exif').hidden = true;   // al cambiar de foto se cierra el panel

  if (isDoc(item.name)) {
    pintarDocumento(caja, item);
  } else if (isVideo(item.name)) {
    const v = el('video');
    v.src = src;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'metadata';
    caja.appendChild(v);
  } else if (isAudio(item.name)) {
    const card = el('div', 'lb-audio');
    const disco = el('div', 'disco');
    disco.appendChild(icon('i-music'));
    card.appendChild(disco);
    card.appendChild(el('div', 'nom', item.name));
    const a = el('audio');
    a.src = src;
    a.controls = true;
    a.autoplay = true;
    a.preload = 'metadata';
    card.appendChild(a);
    caja.appendChild(card);
  } else {
    const img = el('img');
    img.src = src;
    img.alt = item.name;
    caja.appendChild(img);
    if (window.KZoom) lbZoom = KZoom.attach($('lb-stage'), img);
  }

  $('lb-name').textContent = item.name;
  $('lb-counter').textContent =
    `${state.lbIndex + 1} de ${state.viewables.length} · ${fmtSize(item.size)} · ${fmtDate(item.modified)}`;
  const multi = state.viewables.length > 1;
  $('lb-prev').hidden = !multi;
  $('lb-next').hidden = !multi;
}
