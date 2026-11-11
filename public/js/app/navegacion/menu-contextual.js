'use strict';
/* app/navegacion/menu-contextual.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
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
    if (!sobreSeleccion && K.recordar) opcionCtx(menu, 'i-bell', 'Recordar…', () => K.recordar('file', item.rel, nombreVisible(item.name)));
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
