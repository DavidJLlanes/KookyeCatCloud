'use strict';
/* app/navegacion/filas.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
function checkbox(selected) {
  const box = el('div', 'check');
  box.appendChild(icon('i-check'));
  if (selected) box.classList.add('on');
  return box;
}

function buildRow(item) {
  const row = el('div', 'row');
  if (state.selection.has(item.rel)) row.classList.add('is-sel');
  if (state.selectMode) row.appendChild(checkbox());

  if (!item.isDir && hasThumb(item.name)) {
    const img = el('img', 'thumb');
    img.src = BASE + '/api/thumb?path=' + qs(item.rel);
    img.loading = 'lazy';
    img.alt = '';
    // Si el servidor no puede generarla (sin ffmpeg, formato raro), cae al distintivo
    img.addEventListener('error', () => {
      const mini = row.querySelector('.play-mini');
      if (mini) mini.remove();
      img.replaceWith(fileBadge(item.name, false));
    });
    row.appendChild(img);
    if (isVideo(item.name)) {
      const play = el('span', 'play-mini');
      play.appendChild(icon('i-play'));
      row.appendChild(play);
    }
  } else {
    row.appendChild(fileBadge(item.name, item.isDir));
  }

  const info = el('div', 'info');
  info.appendChild(el('div', 'name', nombreVisible(item.name)));
  info.appendChild(el('div', 'meta',
    (item.isDir ? 'Carpeta' : fmtSize(item.size)) + ' · ' + fmtDate(item.modified)));
  if (state.query) {
    const where = el('div', 'where');
    where.appendChild(icon('i-folder'));
    where.appendChild(el('span', null, item.dir ? item.dir : 'Inicio'));
    info.appendChild(where);
  }
  row.appendChild(info);

  if (!state.selectMode) {
    const menu = el('button', 'icon-btn');
    menu.appendChild(icon('i-dots'));
    menu.setAttribute('aria-label', 'Opciones');
    menu.addEventListener('click', e => { e.stopPropagation(); openActions(item); });
    row.appendChild(menu);
  }

  row.addEventListener('click', e => onItemClick(item, e));
  row.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    abrirCtx(e.clientX, e.clientY, item);
  });
  haceArrastrable(row, item);
  if (item.isDir) haceSoltable(row, item.rel);
  return row;
}

function buildTile(item) {
  const tile = el('div', 'tile');
  if (state.selection.has(item.rel)) tile.classList.add('is-sel');
  const box = el('div', 'thumb-box');

  if (!item.isDir && hasThumb(item.name)) {
    // .photo: la imagen ocupa toda la baldosa y el nombre va sobre un velo degradado
    tile.classList.add('photo');
    const img = el('img');
    img.src = BASE + '/api/thumb?path=' + qs(item.rel);
    img.loading = 'lazy';
    img.alt = item.name;
    img.addEventListener('error', () => {
      img.remove();
      tile.classList.remove('photo');
      const play = box.querySelector('.play-badge');
      if (play) play.remove();
      const c = el('div', 'center');
      c.appendChild(fileBadge(item.name, false));
      box.appendChild(c);
    });
    box.appendChild(img);
    if (isVideo(item.name)) {
      const play = el('div', 'play-badge');
      play.appendChild(icon('i-play'));
      box.appendChild(play);
    }
  } else {
    const c = el('div', 'center');
    c.appendChild(fileBadge(item.name, item.isDir));
    box.appendChild(c);
  }

  let inlineDots = null;
  if (state.selectMode) box.appendChild(checkbox());
  else {
    const dots = el('button', 'dots');
    dots.appendChild(icon('i-dots'));
    dots.setAttribute('aria-label', 'Opciones');
    dots.addEventListener('click', e => { e.stopPropagation(); openActions(item); });
    // Foto: el ⋮ flota sobre la imagen. Archivo/carpeta: va en la franja del nombre,
    // para no tapar el icono (sobre todo en móvil, donde la baldosa es grande).
    if (tile.classList.contains('photo')) box.appendChild(dots);
    else inlineDots = dots;
  }
  tile.appendChild(box);

  const cap = el('div', 'cap');
  cap.appendChild(el('span', 'name', nombreVisible(item.name)));
  cap.appendChild(el('span', 'sz', item.isDir ? '' : fmtSize(item.size)));
  if (inlineDots) { inlineDots.classList.add('inline'); cap.appendChild(inlineDots); }
  tile.appendChild(cap);

  tile.addEventListener('click', e => onItemClick(item, e));
  tile.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    abrirCtx(e.clientX, e.clientY, item);
  });
  haceArrastrable(tile, item);
  if (item.isDir) haceSoltable(tile, item.rel);
  return tile;
}
