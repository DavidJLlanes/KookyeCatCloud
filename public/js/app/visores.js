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
/* ---------------------------------------------------------------
   Visor de documentos
--------------------------------------------------------------- */
function estadoDoc(iconName, titulo, sub, item) {
  const caja = el('div', 'doc-estado');
  const em = el('div', 'em');
  em.appendChild(icon(iconName));
  caja.appendChild(em);
  caja.appendChild(el('h3', null, titulo));
  if (sub) caja.appendChild(el('p', null, sub));
  if (item) {
    const btn = el('button', 'btn primary');
    btn.appendChild(icon('i-download'));
    btn.appendChild(el('span', null, 'Descargar'));
    btn.addEventListener('click', () => downloadRel(item.rel));
    caja.appendChild(btn);
  }
  return caja;
}

// Marco para PDF y para Office. Los dos van dentro del mismo envoltorio: sin él,
// un iframe suelto se queda con su altura por defecto de 150 px.
function marcoDocumento(url, nombre) {
  const envoltorio = el('div', 'lb-pdf');
  const marco = el('iframe', 'lb-frame');
  marco.src = url;
  marco.title = nombre;
  envoltorio.appendChild(marco);
  // Salida de emergencia: algunos navegadores, sobre todo en móvil, no pintan
  // documentos dentro de un marco y no avisan de ello
  const salida = el('button', 'lb-fallback');
  salida.appendChild(icon('i-external'));
  salida.appendChild(el('span', null, '¿No se ve bien? Ábrelo en una pestaña'));
  salida.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
  envoltorio.appendChild(salida);
  return envoltorio;
}

/* ---------------------------------------------------------------
   Visor de hojas de cálculo (solo lectura)
--------------------------------------------------------------- */
// Letra de columna al estilo de Excel: A, B… Z, AA, AB…
function letraColumna(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function renderHoja(datos, item) {
  const caja = el('div', 'hoja');
  let indice = 0;

  const pestanas = el('div', 'hoja-pestanas');
  const zona = el('div', 'hoja-zona');

  function pintar() {
    const hoja = datos.hojas[indice];
    zona.textContent = '';
    [...pestanas.children].forEach((b, i) => b.classList.toggle('is-active', i === indice));

    if (!hoja || !hoja.filas.length) {
      zona.appendChild(el('div', 'hoja-vacia', 'Esta hoja está vacía'));
      return;
    }
    const columnas = hoja.filas.reduce((n, f) => Math.max(n, f.length), 0);
    const tabla = el('table', 'hoja-tabla');

    const thead = el('thead');
    const trh = el('tr');
    trh.appendChild(el('th', 'esquina', ''));
    for (let c = 1; c <= columnas; c++) {
      const th = el('th', 'col', letraColumna(c));
      const ancho = hoja.anchos[c - 1];
      // El ancho de Excel va en caracteres: se pasa a píxeles a ojo
      if (ancho) th.style.minWidth = Math.min(Math.round(ancho * 8), 420) + 'px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    tabla.appendChild(thead);

    const tbody = el('tbody');
    hoja.filas.forEach((fila, i) => {
      const tr = el('tr');
      tr.appendChild(el('th', 'fila', String(i + 1)));
      for (let c = 0; c < columnas; c++) {
        const celda = fila[c];
        const td = el('td', celda && celda.n ? 'num' : null, celda ? celda.t : '');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    zona.appendChild(tabla);

    if (datos.recortado) {
      zona.appendChild(el('div', 'doc-aviso',
        `Hoja muy grande: se muestran las primeras ${datos.maxFilas} filas y ${datos.maxCols} columnas. ` +
        'Descarga el archivo para verlo entero.'));
    }
  }

  datos.hojas.forEach((h, i) => {
    const b = el('button', 'hoja-pestana');
    b.appendChild(el('span', null, h.nombre));
    const n = h.filas.length;
    b.appendChild(el('small', null, n ? `${n} fila${n === 1 ? '' : 's'}` : 'vacía'));
    b.addEventListener('click', () => { indice = i; pintar(); });
    pestanas.appendChild(b);
  });

  caja.appendChild(zona);
  if (datos.hojas.length > 1) caja.appendChild(pestanas);
  else if (datos.hojas.length === 1) {
    const sola = el('div', 'hoja-pie', datos.hojas[0].nombre);
    caja.appendChild(sola);
  }
  pintar();
  return caja;
}

async function pintarDocumento(caja, item) {
  // Hoja de cálculo: rejilla de verdad, no un PDF paginado
  if (isSheet(item.name)) {
    const cargando = el('div', 'doc-estado');
    cargando.appendChild(el('h3', null, 'Abriendo la hoja…'));
    caja.appendChild(cargando);
    try {
      const res = await api(BASE + '/api/sheet?path=' + qs(item.rel));
      const datos = await res.json();
      if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;
      caja.textContent = '';
      if (!res.ok) {
        caja.appendChild(estadoDoc('i-doc-alert', 'No se pudo abrir', datos.error, item));
        return;
      }
      caja.appendChild(renderHoja(datos, item));
    } catch {
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
    }
    return;
  }

  // PDF: lo pinta el visor propio del navegador
  if (isPdf(item.name)) {
    caja.appendChild(marcoDocumento(BASE + '/api/preview?path=' + qs(item.rel), item.name));
    return;
  }

  // Office: convertido a PDF en el servidor
  if (isOffice(item.name)) {
    if (state.caps && state.caps.office === false) {
      caja.appendChild(estadoDoc('i-doc-alert', 'Sin vista previa',
        'Este servidor no tiene LibreOffice instalado para convertir documentos de Office.', item));
      return;
    }
    caja.appendChild(estadoDoc('i-refresh', 'Convirtiendo el documento…',
      'La primera vez tarda unos segundos; después queda en caché.'));
    const url = BASE + '/api/office?path=' + qs(item.rel);
    try {
      // HEAD primero: dispara la conversión y deja saber si salió bien, sin
      // arriesgarse a que el marco acabe enseñando un error en JSON
      const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
      if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;  // ya cambió de archivo
      caja.textContent = '';
      if (!res.ok) {
        caja.appendChild(estadoDoc('i-doc-alert', 'No se pudo convertir',
          res.status === 501 ? 'Falta LibreOffice en el servidor.' : 'El documento no se pudo abrir.', item));
        return;
      }
      caja.appendChild(marcoDocumento(url, item.name));
    } catch {
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
    }
    return;
  }

  // Texto, Markdown, CSV
  const cargando = el('div', 'doc-estado');
  cargando.appendChild(el('h3', null, 'Cargando…'));
  caja.appendChild(cargando);
  try {
    const res = await api(BASE + '/api/text?path=' + qs(item.rel));
    const data = await res.json();
    if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;
    caja.textContent = '';
    if (!res.ok) {
      caja.appendChild(estadoDoc('i-doc-alert', 'No se puede mostrar', data.error, item));
      return;
    }
    const doc = el('div', 'lb-doc');
    if (isMarkdown(item.name)) doc.appendChild(renderMarkdown(data.text));
    else if (isCsv(item.name)) doc.appendChild(renderCsv(data.text, item.name));
    else doc.appendChild(el('pre', 'doc-texto', data.text));
    if (data.truncated) {
      doc.appendChild(el('p', 'doc-aviso',
        `Mostrando los primeros ${fmtSize(data.shown)} de ${fmtSize(data.size)}. Descarga el archivo para verlo entero.`));
    }
    caja.appendChild(doc);
  } catch {
    caja.textContent = '';
    caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
  }
}

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
    DOC_EDITANDO = { item };
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
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto }),
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

/* ---------------------------------------------------------------
   Mapa de fotos (Leaflet, alojado aquí; los tiles vienen de OpenStreetMap)
--------------------------------------------------------------- */
const MP = { mapa: null, capa: null, fotos: [], cargado: false, cuando: 0 };

async function loadMap() {
  const vacio = $('mapa-vacio');
  if (typeof L === 'undefined') {
    vacio.hidden = false;
    vacio.textContent = '';
    vacio.appendChild(el('h3', null, 'No se pudo cargar el mapa'));
    vacio.appendChild(el('p', null, 'Falta la librería en /vendor/leaflet/.'));
    return;
  }
  if (!MP.mapa) {
    MP.mapa = L.map('mapa', { zoomControl: true, attributionControl: true })
      .setView([40.4168, -3.7038], 5);
    const url = (state.caps && state.caps.tileUrl) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr = (state.caps && state.caps.tileAttr) ||
      '&copy; colaboradores de OpenStreetMap';
    // OpenStreetMap bloquea (403 "Access blocked") las peticiones sin Referer. La app manda
    // Referrer-Policy: no-referrer en todo, así que solo estas imágenes envían el origen.
    L.tileLayer(url, { maxZoom: 19, attribution: attr, referrerPolicy: 'origin' }).addTo(MP.mapa);
    MP.capa = L.layerGroup().addTo(MP.mapa);
    // Solo al cambiar el zoom: la agrupación depende de él, no del desplazamiento.
    // Con 'moveend' además se rompía el globo: abrirlo desplaza el mapa para que
    // quepa, eso disparaba el evento y los marcadores se reconstruían encima.
    MP.mapa.on('zoomend', () => { MP.mapa.closePopup(); pintarPuntos(); });
  }
  // El contenedor estaba oculto al crearse el mapa: hay que recalcular su tamaño
  setTimeout(() => MP.mapa.invalidateSize(), 60);
  // Se vuelve a pedir al abrir el mapa (la lista sale de una caché, así que es barato): si no, las fotos
  // subidas después de la primera visita no aparecían hasta pulsar «Actualizar».
  if (!MP.cargado || Date.now() - MP.cuando > 15000) await pedirFotosMapa();
}

async function pedirFotosMapa() {
  $('map-resumen').textContent = 'Buscando fotos con ubicación…';
  try {
    const res = await api(BASE + '/api/photomap');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    MP.fotos = data.fotos || [];
    MP.cargado = true; MP.cuando = Date.now();

    const resumen = MP.fotos.length
      ? `${MP.fotos.length} foto${MP.fotos.length === 1 ? '' : 's'} con ubicación, de ${data.total} en total`
      : `Ninguna de tus ${data.total} fotos guarda coordenadas`;
    $('map-resumen').textContent = resumen + (data.cortado ? ` · tope de ${data.limite}` : '');

    const vacio = $('mapa-vacio');
    if (!MP.fotos.length) {
      vacio.textContent = '';
      const em = el('div', 'em');
      em.appendChild(icon('i-pin'));
      vacio.appendChild(em);
      vacio.appendChild(el('h3', null, 'Sin fotos ubicadas'));
      // Distinguir "los metadatos se borraron" de "hay metadatos pero sin GPS" dice dónde está el problema
      const sinMeta = data.total - (data.conExif || 0);
      vacio.appendChild(el('p', null, !data.total ? 'Aún no hay fotos.'
        : sinMeta === data.total ? `Ninguna de las ${data.total} fotos conserva metadatos: se borraron antes de subirlas (mensajería, recompresión o el selector del móvil). En iPhone, al elegirlas pulsa «Opciones» y activa «Ubicación».`
        : `${data.conExif} foto${data.conExif === 1 ? '' : 's'} conserva${data.conExif === 1 ? '' : 'n'} metadatos pero ninguna trae coordenadas: se hicieron sin la ubicación de la cámara activada. ${sinMeta} más no tienen metadatos.`));
      vacio.hidden = false;
      return;
    }
    vacio.hidden = true;

    // Encajar la vista en todos los puntos
    const limites = L.latLngBounds(MP.fotos.map(f => [f.lat, f.lon]));
    MP.mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 14 });
    pintarPuntos();
  } catch {
    $('map-resumen').textContent = 'No se pudieron cargar las ubicaciones';
  }
}

// Agrupación propia por rejilla: sin plugin extra, y suficiente para el caso
function pintarPuntos() {
  if (!MP.mapa || !MP.capa || !MP.fotos.length) return;
  MP.capa.clearLayers();
  const zoom = MP.mapa.getZoom();
  const paso = 360 / Math.pow(2, Math.min(zoom, 18)) * 1.4;   // celdas más finas al acercar

  const celdas = new Map();
  for (const f of MP.fotos) {
    const clave = `${Math.round(f.lat / paso)}|${Math.round(f.lon / paso)}`;
    if (!celdas.has(clave)) celdas.set(clave, []);
    celdas.get(clave).push(f);
  }

  for (const grupo of celdas.values()) {
    const lat = grupo.reduce((n, f) => n + f.lat, 0) / grupo.length;
    const lon = grupo.reduce((n, f) => n + f.lon, 0) / grupo.length;

    if (grupo.length === 1) {
      const f = grupo[0];
      const punto = L.circleMarker([f.lat, f.lon], {
        radius: 8, weight: 2, color: '#fff', fillColor: '#4f7cff', fillOpacity: .95,
      }).addTo(MP.capa);
      punto.bindPopup(() => popupFoto(f), { minWidth: 200, closeButton: true });
    } else {
      const tam = grupo.length > 99 ? 46 : grupo.length > 9 ? 40 : 34;
      const icono = L.divIcon({
        className: '',
        html: `<div class="cluster" style="width:${tam}px;height:${tam}px"></div>`,
        iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2],
      });
      const marca = L.marker([lat, lon], { icon: icono }).addTo(MP.capa);
      // El número se pone por texto, nunca por HTML
      const nodo = marca.getElement && marca.getElement();
      marca.on('add', () => {
        const div = marca.getElement() && marca.getElement().querySelector('.cluster');
        if (div) div.textContent = grupo.length > 999 ? '999+' : String(grupo.length);
      });
      if (nodo) {
        const div = nodo.querySelector('.cluster');
        if (div) div.textContent = String(grupo.length);
      }
      marca.on('click', () => {
        MP.mapa.setView([lat, lon], Math.min(MP.mapa.getZoom() + 3, 18));
      });
    }
  }
}

function popupFoto(f) {
  const caja = el('div', 'mapa-pop');
  const img = el('img');
  img.src = BASE + '/api/thumb?path=' + qs(f.rel);
  img.alt = f.nombre;
  img.addEventListener('error', () => img.remove());
  caja.appendChild(img);
  const cuerpo = el('div', 'cuerpo');
  cuerpo.appendChild(el('div', 'nm', f.nombre));
  cuerpo.appendChild(el('div', 'fh', fmtDate(f.t) + ' · ' + (f.rel.includes('/') ? parentOf(f.rel) : 'Inicio')));
  const btn = el('button', null, 'Ver foto');
  btn.addEventListener('click', () => abrirDesdeMapa(f));
  cuerpo.appendChild(btn);
  caja.appendChild(cuerpo);
  return caja;
}

// El visor trabaja sobre una lista: se le pasa la del mapa, ordenada por fecha
function abrirDesdeMapa(f) {
  state.viewables = MP.fotos.map(x => ({
    name: x.nombre, rel: x.rel, isDir: false, size: x.size || 0, modified: x.t,
  }));
  const i = MP.fotos.findIndex(x => x.rel === f.rel);
  openLightbox(i < 0 ? 0 : i);
}

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
  const a = document.createElement('a');
  a.href = BASE + '/api/download?path=' + qs(rel) + '&as=' + as;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
