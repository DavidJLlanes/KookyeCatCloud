'use strict';
/* app/navegacion/agrupacion.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Agrupación por meses y años
   La fecha buena es la de captura del EXIF, no la del archivo: subir una
   foto de 2019 hoy no debería colocarla en el mes actual.
--------------------------------------------------------------- */
async function cargarMetaFotos() {
  if (!state.agrupar || state.query) return;
  const hayFotos = state.items.some(i => !i.isDir && isImage(i.name));
  if (!hayFotos) return;
  const ruta = state.path;
  try {
    const res = await api(BASE + '/api/photometa?path=' + qs(ruta));
    const data = await res.json();
    if (!res.ok || ruta !== state.path) return;      // ya cambió de carpeta
    state.meta = data.fotos || {};
    for (const item of state.items) {
      const m = state.meta[item.name];
      if (m) { item.tomada = m.t; item.deExif = m.exif; item.lat = m.lat; item.lon = m.lon; }
    }
    render();
  } catch { /* se sigue agrupando por la fecha del archivo */ }
}

const fechaDe = (item) => item.tomada || new Date(item.modified).getTime();
const claveMes = (t) => {
  const d = new Date(t);
  return d.getFullYear() * 100 + d.getMonth();
};
function etiquetaMes(t) {
  const s = new Date(t).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pintarAgrupado(box, items) {
  const carpetas = items.filter(i => i.isDir);
  const archivos = items.filter(i => !i.isDir)
    .sort((a, b) => fechaDe(b) - fechaDe(a));        // lo más reciente primero

  const grid = () => {
    const c = el('div', state.view === 'grid' ? 'grid' : 'list');
    c.style.padding = '0 0 8px';
    return c;
  };
  let indice = 0;
  const trabajos = [];                               // cada uno añade su trozo; se ejecutan por tandas (tandas.js)
  const pinta = (item, contenedor) => {
    item._i = indice++;
    const nodo = state.view === 'grid' ? buildTile(item) : buildRow(item);
    nodo.style.animationDelay = Math.min(indice * 18, 300) + 'ms';
    sinEntradaSiLejos(nodo, indice);
    contenedor.appendChild(nodo);
  };

  if (carpetas.length) {
    const cab = el('div', 'grupo-cab');
    cab.appendChild(el('h3', null, 'Carpetas'));
    cab.appendChild(el('span', 'cuenta', `${carpetas.length}`));
    box.appendChild(cab);
    const c = grid();
    box.appendChild(c);
    for (const item of carpetas) trabajos.push(() => pinta(item, c));
  }

  // Archivos por mes: el recuento de cada mes se saca de una vez (antes se recorría la lista entera por cada mes)
  const porMes = new Map();
  for (const item of archivos) { const m = claveMes(fechaDe(item)); porMes.set(m, (porMes.get(m) || 0) + 1); }
  let mesActual = null, anyoAnterior = null, contenedor = null;
  for (const item of archivos) {
    const t = fechaDe(item);
    const mes = claveMes(t);
    if (mes !== mesActual) {
      mesActual = mes;
      const anyo = new Date(t).getFullYear();
      const delMes = porMes.get(mes);
      const conAnyo = anyo !== anyoAnterior;           // el año solo se destaca cuando cambia, para no repetirlo en cada mes
      anyoAnterior = anyo;
      trabajos.push(() => {
        const cab = el('div', 'grupo-cab');
        cab.appendChild(el('h3', null, etiquetaMes(t)));
        cab.appendChild(el('span', 'cuenta', `${delMes} archivo${delMes === 1 ? '' : 's'}`));
        if (conAnyo) cab.appendChild(el('span', 'anyo', String(anyo)));
        box.appendChild(cab);
        contenedor = grid();
        box.appendChild(contenedor);
      });
    }
    trabajos.push(() => pinta(item, contenedor));
  }
  pintaEnTandas(trabajos);
}

function render() {
  const box = $('file-list');
  const items = visibleItems();
  state.viewables = items.filter(i => !i.isDir && isViewable(i.name));

  const info = $('search-info');
  if (state.query) {
    info.textContent = '';
    info.appendChild(document.createTextNode(`${items.length} resultado${items.length === 1 ? '' : 's'} para `));
    info.appendChild(el('b', null, `«${state.query}»`));
    if (state.truncated) info.appendChild(document.createTextNode(' (mostrando solo los primeros 300)'));
    info.hidden = false;
  } else {
    info.hidden = true;
  }

  const dirs = items.filter(i => i.isDir).length;
  const files = items.length - dirs;
  $('folder-count').textContent = [
    dirs ? `${dirs} carpeta${dirs > 1 ? 's' : ''}` : '',
    files ? `${files} archivo${files > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');

  anulaTandas();
  box.textContent = '';
  if (!items.length) {
    box.className = '';
    box.appendChild(state.query
      ? emptyState('Sin resultados', 'Prueba con otra palabra', 'i-search')
      : state.filter !== 'all'
        ? emptyState('Nada de este tipo aquí', 'Cambia el filtro para ver el resto', 'i-search')
        : emptyState('Esta carpeta está vacía', 'Arrastra archivos aquí o usa "Subir archivos"'));
    return;
  }
  // Agrupado: cada mes con su cabecera. Sin agrupar: todo seguido, como siempre
  if (state.agrupar && !state.query) {
    box.className = 'agrupado';
    pintarAgrupado(box, items);
    return;
  }

  box.className = state.view === 'grid' ? 'grid' : 'list';
  pintaEnTandas(items.map((item, i) => () => {
    item._i = i;                                   // índice visible, para el rango con Shift
    const node = state.view === 'grid' ? buildTile(item) : buildRow(item);
    // Entrada escalonada, con tope para que una carpeta enorme no tarde en aparecer
    node.style.animationDelay = Math.min(i * 22, 360) + 'ms';
    sinEntradaSiLejos(node, i);
    box.appendChild(node);
  }));
}

function onItemClick(item, ev) {
  // Ctrl/Cmd para marcar suelto, Shift para marcar un rango
  if (ev && (ev.ctrlKey || ev.metaKey)) {
    if (!state.selectMode) enterSelectMode();
    toggleSelect(item);
    state.lastIndex = item._i;
    return;
  }
  if (ev && ev.shiftKey && state.lastIndex >= 0) {
    if (!state.selectMode) enterSelectMode();
    seleccionarRango(state.lastIndex, item._i);
    return;
  }
  if (state.selectMode) { toggleSelect(item); state.lastIndex = item._i; return; }
  if (item.isDir) { goTo(item.rel); return; }
  if (isViewable(item.name)) { openLightbox(state.viewables.indexOf(item)); return; }
  openActions(item);
}

function seleccionarRango(desde, hasta) {
  const lista = visibleItems();
  const a = Math.min(desde, hasta), b = Math.max(desde, hasta);
  for (let i = a; i <= b; i++) if (lista[i]) state.selection.add(lista[i].rel);
  updateSelbar();
  render();
}
