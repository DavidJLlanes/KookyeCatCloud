'use strict';
/* Eventos y arranque. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Eventos
--------------------------------------------------------------- */
$('login-form').addEventListener('submit', doLogin);
$('btn-logout').addEventListener('click', logout);

// El logotipo vuelve a Inicio: sale de la búsqueda y de cualquier subcarpeta
$('btn-home').addEventListener('click', () => {
  switchTab('files');
  goTo('');
});

document.querySelectorAll('.tab, .mobilenav button').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.view));
});

$('btn-grid').addEventListener('click', () => setView('grid'));
$('btn-list').addEventListener('click', () => setView('list'));
$('btn-refresh').addEventListener('click', refresh);
// En iPhone, el selector de fotos de Safari quita la ubicación salvo que se active en "Opciones".
// Un aviso una sola vez evita subir cientos de fotos sin coordenadas sin darse cuenta.
function avisoUbicacionIOS() {
  try {
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent) || localStorage.getItem('kcc-aviso-ubic')) return;
    localStorage.setItem('kcc-aviso-ubic', '1');
    showToast('Para conservar la ubicación: en el selector pulsa «Opciones» y activa «Ubicación»');
  } catch { /* sin almacenamiento */ }
}
$('btn-upload').addEventListener('click', () => { avisoUbicacionIOS(); $('file-input').click(); });
$('file-input').addEventListener('change', e => handleUpload(e.target.files));

$('btn-newfolder').addEventListener('click', () => {
  $('folder-name-input').value = '';
  show('folder-modal');
  $('folder-name-input').focus();
});
$('btn-createfolder').addEventListener('click', createFolder);
$('folder-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') createFolder(); });

$('search-input').addEventListener('input', onSearchInput);
$('search-clear').addEventListener('click', () => { clearSearchInput(); refresh(); });
function pintaOrden() {
  const f = ORDENES.find(o => o[0] === state.sort);
  $('sort-label').textContent = f ? f[1] : ORDENES[0][1];
}
$('sort-btn').addEventListener('click', e => {
  e.stopPropagation();
  K.menu(e.currentTarget, ORDENES.map(([id, label]) => ({
    label, checked: state.sort === id,
    onClick: () => { state.sort = id; localStorage.setItem('fc-sort', id); pintaOrden(); render(); },
  })));
});
$('type-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.filter = chip.dataset.type;
  document.querySelectorAll('#type-chips .chip').forEach(c => c.classList.toggle('is-active', c === chip));
  render();
});

$('btn-select').addEventListener('click', () => {
  state.selectMode ? exitSelectMode() : enterSelectMode();
});
$('sel-cancel').addEventListener('click', exitSelectMode);
$('sel-all').addEventListener('click', () => {
  const items = visibleItems();
  const allPicked = items.every(i => state.selection.has(i.rel));
  state.selection.clear();
  if (!allPicked) items.forEach(i => state.selection.add(i.rel));
  updateSelbar();
  render();
});
$('sel-delete').addEventListener('click', bulkDelete);
$('sel-download').addEventListener('click', bulkDownload);
$('sel-move').addEventListener('click', () => openMove(selectedItems().map(i => i.rel)));
$('btn-move-here').addEventListener('click', confirmMove);

$('action-open').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) openLightbox(state.viewables.indexOf(item));
});
$('action-download').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) downloadRel(item.rel);
});
$('action-share').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) openShare(item);
});
$('action-zip').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) descargarZip([item.rel]);
});
$('btn-create-share').addEventListener('click', crearCompartir);
$('btn-copy-share').addEventListener('click', () => copiarTexto($('share-url').textContent, 'Enlace copiado'));
$('sel-zip').addEventListener('click', () => descargarZip(selectedItems().map(i => i.rel)));
$('btn-notes-trash').addEventListener('click', abrirPapeleraNotas);
$('btn-notes-select').addEventListener('click', () => { NT.selMode = !NT.selMode; if (!NT.selMode) NT.sel.clear(); renderNotes(); });
$('btn-empty-notes-trash').addEventListener('click', vaciarPapeleraNotas);

$('action-move').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) openMove([item.rel]);
});
$('action-rename').addEventListener('click', renameSelected);
$('action-delete').addEventListener('click', deleteSelected);

$('btn-map-refresh').addEventListener('click', () => { MP.cargado = false; pedirFotosMapa(); });
$('btn-empty-trash').addEventListener('click', emptyTrash);
$('btn-adduser').addEventListener('click', addUser);
$('btn-changepass').addEventListener('click', changeMyPassword);

// Colecciones: favoritos y álbumes
$('col-subnav').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  COL.modo = chip.dataset.col;
  pintarColSubnav();
  loadColecciones();
});
$('btn-nuevo-album').addEventListener('click', crearAlbumSolo);
$('btn-album-volver').addEventListener('click', volverAAlbumes);
$('btn-album-eliminar').addEventListener('click', eliminarAlbumActual);
$('btn-album-zip').addEventListener('click', descargarAlbum);
$('btn-album-compartir').addEventListener('click', compartirAlbum);
$('btn-album-pick-new').addEventListener('click', crearAlbumYAñadir);
$('sel-rename').addEventListener('click', () => openRenameModal(selectedItems().map(i => i.rel)));
$('sel-album').addEventListener('click', () => openAlbumPicker(selectedItems().filter(i => !i.isDir).map(i => i.rel)));
$('btn-rename-here').addEventListener('click', confirmRename);

// Acciones nuevas del modal de un solo archivo
$('action-fav').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) toggleFavorite(item.rel);
});
$('action-album').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) openAlbumPicker([item.rel]);
});
$('action-download-jpg').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) downloadConvertido(item.rel, 'jpg');
});
$('action-download-pdf').addEventListener('click', () => {
  const item = state.selected;
  hide('action-modal');
  if (item) downloadConvertido(item.rel, 'pdf');
});

// Administración: espacio por carpeta y duplicados
$('btn-du-up').addEventListener('click', () => loadDiskUsage(parentOf(duPath)));
$('btn-scan-dup').addEventListener('click', scanDuplicates);

// Cuenta: verificación en dos pasos
$('btn-2fa-activar').addEventListener('click', iniciar2faSetup);
$('btn-2fa-confirmar').addEventListener('click', confirmar2fa);
$('btn-2fa-desactivar').addEventListener('click', desactivar2fa);
$('btn-2fa-copiar').addEventListener('click', () => copiarTexto($('twofa-secret').textContent, 'Clave copiada'));

// Cuenta: tokens de aplicación y sesiones
$('btn-apptoken-crear').addEventListener('click', crearAppToken);
$('btn-sessions-others').addEventListener('click', cerrarOtrasSesiones);

// Cuenta: bloqueo con PIN
$('btn-pin-activar').addEventListener('click', activarPin);
$('btn-pin-desactivar').addEventListener('click', desactivarPin);
$('pinpad').addEventListener('click', e => {
  const btn = e.target.closest('button[data-k]');
  if (btn) tocarPinTecla(btn.dataset.k);
});
document.addEventListener('keydown', e => {
  if ($('pinlock').hidden) return;
  if (/^[0-9]$/.test(e.key)) tocarPinTecla(e.key);
  else if (e.key === 'Backspace') tocarPinTecla('borrar');
});

// Cola de subida
$('upbar-cancel').addEventListener('click', cancelarCola);
$('upbar-retry').addEventListener('click', reintentarFallidos);
$('upbar-close').addEventListener('click', cerrarCola);
$('upbar-toggle').addEventListener('click', () => $('upbar').classList.toggle('plegada'));

// Enlaces de subida
$('link-folder').addEventListener('click', openFolderForLink);
$('btn-createlink').addEventListener('click', crearEnlace);

// WebDAV
$('btn-copy-dav').addEventListener('click', async () => {
  const url = $('dav-url').textContent;
  try { await navigator.clipboard.writeText(url); showToast('Dirección copiada'); }
  catch { showToast('Copia la dirección de la tarjeta'); }
});

// Notas
$('btn-new-note').addEventListener('click', () => crearNota('note', ''));
$('btn-new-folder-note').addEventListener('click', () => crearNota('folder', ''));
$('btn-note-delete').addEventListener('click', () => {
  const item = NT.items.find(i => i.id === NT.abierta);
  if (item) borrarNota(item);
});
$('btn-notes-back').addEventListener('click', () => { guardarAhora(); cerrarNota(); });
$('note-title').addEventListener('input', marcarSucia);
$('note-body').addEventListener('input', marcarSucia);
$('note-body').addEventListener('blur', guardarAhora);
$('note-title').addEventListener('blur', guardarAhora);
$('notes-filter').addEventListener('input', e => {
  NT.filtro = e.target.value.trim().toLowerCase();
  renderNotes();
});
// Cerrar la pestaña con algo sin guardar: se intenta un último envío
window.addEventListener('beforeunload', () => {
  if (!NT.sucia || !NT.abierta) return;
  const datos = JSON.stringify({ title: $('note-title').value, body: $('note-body').value });
  navigator.sendBeacon?.(BASE + '/api/notes/' + qs(NT.abierta) + '?beacon=1', new Blob([datos], { type: 'application/json' }));
});

// Menú contextual: clic derecho en el hueco vacío del listado
$('file-list').addEventListener('contextmenu', e => {
  if (state.tab !== 'files') return;
  e.preventDefault();
  abrirCtx(e.clientX, e.clientY, null);
});
document.addEventListener('click', e => {
  if (!$('ctxmenu').hidden && !$('ctxmenu').contains(e.target)) cerrarCtx();
});
window.addEventListener('scroll', cerrarCtx, true);
window.addEventListener('resize', cerrarCtx);
window.addEventListener('blur', ocultarTip);

// El alto real del nav inferior (tipografía del sistema, zoom, notch...) varía entre
// dispositivos y entre navegador móvil y PWA instalada: medirlo con offsetHeight en vez
// de fijarlo a ojo evita que el mapa y las notas queden por detrás en algunos casos.
function medirAlturaNav() {
  const nav = $('mobilenav');
  if (nav && nav.offsetHeight) {
    document.documentElement.style.setProperty('--mobilenav-h', nav.offsetHeight + 'px');
  }
  if (MP.mapa) setTimeout(() => MP.mapa.invalidateSize(), 60);
}
window.addEventListener('resize', medirAlturaNav);
window.addEventListener('orientationchange', medirAlturaNav);

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => hide(btn.dataset.close));
});
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.hidden = true; });
});

$('lb-info').addEventListener('click', alternarExif);
$('btn-agrupar').addEventListener('click', () => {
  state.agrupar = !state.agrupar;
  localStorage.setItem('fc-agrupar', state.agrupar ? '1' : '0');
  aplicarBotonAgrupar();
  render();
  if (state.agrupar) cargarMetaFotos();
});
$('lb-close').addEventListener('click', closeLightbox);
$('lb-prev').addEventListener('click', e => { e.stopPropagation(); pararSlideshow(); lbStep(-1); });
$('lb-next').addEventListener('click', e => { e.stopPropagation(); pararSlideshow(); lbStep(1); });
$('lb-galeria').addEventListener('click', () => { const item = state.viewables[state.lbIndex]; if (item) guardaEnGaleria(item.rel); });
$('lb-download').addEventListener('click', () => {
  const item = state.viewables[state.lbIndex];
  if (item) downloadRel(item.rel);
});
$('lb-fav').addEventListener('click', () => {
  const item = state.viewables[state.lbIndex];
  if (item) toggleFavorite(item.rel).then(() => pintarLbFav(item));
});
$('lb-play').addEventListener('click', alternarSlideshow);
$('lb-edit').addEventListener('click', alternarEdicion);
$('lb-open').addEventListener('click', () => {
  const item = state.viewables[state.lbIndex];
  if (!item) return;
  const url = isOffice(item.name)
    ? BASE + '/api/office?path=' + qs(item.rel)
    : BASE + '/api/preview?path=' + qs(item.rel);
  window.open(url, '_blank', 'noopener');
});
// Se mira qué hay bajo el dedo y no e.target: con el zoom activo el puntero queda capturado
// por el escenario y el objetivo del clic sería siempre él, aunque se toque la foto
$('lb-stage').addEventListener('click', e => {
  if (e.target === $('lb-stage') && document.elementFromPoint(e.clientX, e.clientY) === $('lb-stage')) closeLightbox();
});

document.addEventListener('keydown', e => {
  if (!$('lightbox').hidden) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') { pararSlideshow(); lbStep(-1); }
    else if (e.key === 'ArrowRight') { pararSlideshow(); lbStep(1); }
    return;
  }
  if (e.key === 'Escape') {
    if (!$('ctxmenu').hidden) { cerrarCtx(); return; }
    if (state.selectMode) { exitSelectMode(); return; }
    document.querySelectorAll('.overlay').forEach(ov => { ov.hidden = true; });
  }
});

// Deslizar para cambiar de foto. No cuenta si hay zoom, si se usaron dos dedos (pellizco)
// ni si todavía queda algún dedo apoyado.
let touchX = 0, touchMulti = false;
$('lb-stage').addEventListener('touchstart', e => {
  if (e.touches.length > 1) touchMulti = true;
  else { touchMulti = false; touchX = e.changedTouches[0].clientX; }
}, { passive: true });
$('lb-stage').addEventListener('touchend', e => {
  if (e.touches.length) return;
  const multi = touchMulti;
  touchMulti = false;
  if (multi || (lbZoom && lbZoom.zoomed())) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 60) lbStep(dx < 0 ? 1 : -1);
}, { passive: true });

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if (!state.user || state.tab !== 'files') return;
  if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
  dragDepth++;
  show('dropzone');
});
window.addEventListener('dragover', e => { if (!$('dropzone').hidden) e.preventDefault(); });
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) hide('dropzone');
});
window.addEventListener('drop', e => {
  if ($('dropzone').hidden) return;
  e.preventDefault();
  dragDepth = 0;
  hide('dropzone');
  handleUpload(e.dataTransfer.files);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }).catch(() => {}));
}

// Antes de pintar nada, para que no se vea un cambio de color al entrar
applyTheme(temaElegido(), false);
applyAccent(acentoElegido(), false);
checkSession();
