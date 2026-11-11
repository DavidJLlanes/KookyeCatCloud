'use strict';
/* app/visores/mapa.js: parte de visores.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
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
