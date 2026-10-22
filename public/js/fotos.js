'use strict';
/* Fotos: línea de tiempo por fecha de captura (EXIF) y álbumes inteligentes (año, cámara, lugar).
   Se apoya en /api/photoindex, que devuelve todas las fotos con fecha, cámara y coordenadas.
   Vive dentro de Colecciones (pestañas "Línea de tiempo" e "Inteligentes"). */
(function () {
  const TROZO = 240;                 // fotos que se pintan cada vez que se llega al final
  const MAX_ALBUM = 2000;            // tope de elementos de un álbum (el mismo del servidor)
  const CELDA = 4;                   // lugares: celdas de 1/4 de grado (~25 km)

  const F = {
    indice: null,                    // { fotos, cortado, limite }
    cuando: 0,
    cargando: null,
    filtro: { year: '', cam: '', geo: false },
    vista: null,                     // álbum inteligente abierto: { titulo, fotos, lugar }
    obs: null,
  };

  const mesFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  const año = (f) => new Date(f.t).getFullYear();
  const plural = (n, uno, varios) => `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`;

  async function pideIndice(forzar) {
    if (F.indice && !forzar && Date.now() - F.cuando < 120000) return F.indice;
    if (F.cargando) return F.cargando;
    F.cargando = (async () => {
      const res = await api(BASE + '/api/photoindex');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el índice de fotos');
      F.indice = data;
      F.cuando = Date.now();
      return data;
    })();
    try { return await F.cargando; } finally { F.cargando = null; }
  }

  // El visor trabaja con una lista de elementos con la forma del listado de archivos
  const comoItem = (f) => ({ name: f.name, rel: f.rel, size: f.size, modified: f.t, isDir: false });

  function tile(f, lista, i) {
    const t = el('div', 'tile photo ft-tile');
    const box = el('div', 'thumb-box');
    const img = el('img');
    img.src = BASE + '/api/thumb?path=' + encodeURIComponent(f.rel);
    img.loading = 'lazy';
    img.alt = f.name;
    img.title = `${f.name} · ${new Date(f.t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    img.addEventListener('error', () => { img.remove(); box.appendChild(icon('i-image')); });
    box.appendChild(img);
    t.appendChild(box);
    t.addEventListener('click', () => {
      state.viewables = lista.map(comoItem);
      openLightbox(i);
    });
    return t;
  }

  /* Cuadrícula agrupada por meses, que se va completando al hacer scroll */
  function pintaGrid(cont, fotos) {
    if (F.obs) { F.obs.disconnect(); F.obs = null; }
    cont.textContent = '';
    if (!fotos.length) {
      cont.appendChild(emptyState('No hay fotos con estos filtros', 'Prueba con otro año u otra cámara', 'i-image'));
      return;
    }
    let pintadas = 0, mesActual = '', grid = null;
    const centinela = el('div', 'ft-centinela');
    cont.appendChild(centinela);

    function mas() {
      const hasta = Math.min(pintadas + TROZO, fotos.length);
      for (; pintadas < hasta; pintadas++) {
        const f = fotos[pintadas];
        const mes = mesFmt.format(new Date(f.t));
        if (mes !== mesActual || !grid) {
          mesActual = mes;
          const cabeza = el('h3', 'ft-mes', mes);
          // Cuántas hay en ese mes (se cuenta solo cuando se abre el grupo)
          let n = 0;
          for (let k = pintadas; k < fotos.length && mesFmt.format(new Date(fotos[k].t)) === mes; k++) n++;
          cabeza.appendChild(el('span', null, plural(n, 'foto', 'fotos')));
          cont.insertBefore(cabeza, centinela);
          grid = el('div', 'grid ft-grid');
          cont.insertBefore(grid, centinela);
        }
        grid.appendChild(tile(f, fotos, pintadas));
      }
      if (pintadas >= fotos.length) { centinela.remove(); if (F.obs) { F.obs.disconnect(); F.obs = null; } }
    }
    mas();
    if (pintadas < fotos.length && 'IntersectionObserver' in window) {
      F.obs = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) mas(); }, { rootMargin: '600px' });
      F.obs.observe(centinela);
    } else {
      while (pintadas < fotos.length) mas();
    }
  }

  function filtra(fotos) {
    const { year, cam, geo } = F.filtro;
    return fotos.filter(f => (!year || String(año(f)) === year) && (!cam || f.c === cam) && (!geo || f.lat !== null));
  }

  async function guardarComoAlbum(titulo, fotos) {
    if (!fotos.length) return;
    const rutas = fotos.slice(0, MAX_ALBUM).map(f => f.rel);
    const nombre = prompt(`Nombre del álbum (${rutas.length} fotos${fotos.length > MAX_ALBUM ? `, de las ${fotos.length}` : ''}):`, titulo);
    if (nombre === null) return;
    try {
      const res = await post(BASE + '/api/albums', { title: nombre.trim() || titulo, paths: rutas });
      if (res.ok) showToast('Álbum creado en Colecciones → Álbumes');
      else showToast(await errorOf(res, 'No se pudo crear el álbum'));
    } catch { showToast('Error de conexión'); }
  }

  function barraEstado(ind) {
    const ex = ind.fotos.filter(f => f.exif).length;
    let txt = `${plural(ind.fotos.length, 'foto', 'fotos')} · ${ex.toLocaleString('es-ES')} con fecha de captura`;
    if (ind.cortado) txt += ` · mostrando las ${ind.limite.toLocaleString('es-ES')} más recientes`;
    return txt;
  }

  /* ---------- Línea de tiempo ---------- */
  function lineaDeTiempo(raiz, ind) {
    raiz.textContent = '';
    const años = [...new Set(ind.fotos.map(año))].sort((a, b) => b - a);
    const camaras = [...new Set(ind.fotos.map(f => f.c).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

    const barra = el('div', 'toolbar ft-barra');
    const selY = el('select');
    selY.setAttribute('aria-label', 'Año');
    selY.appendChild(new Option('Todos los años', ''));
    años.forEach(y => selY.appendChild(new Option(String(y), String(y))));
    selY.value = F.filtro.year;
    const selC = el('select');
    selC.setAttribute('aria-label', 'Cámara');
    selC.appendChild(new Option('Todas las cámaras', ''));
    camaras.forEach(c => selC.appendChild(new Option(c, c)));
    selC.value = F.filtro.cam;
    const lblG = el('label', 'ft-check');
    const chk = el('input'); chk.type = 'checkbox'; chk.checked = F.filtro.geo;
    lblG.append(chk, el('span', null, 'Con ubicación'));
    const sp = el('span', 'spacer');
    const btnA = el('button', 'btn ghost'); btnA.type = 'button';
    btnA.append(icon('i-stack'), el('span', 'lbl', 'Guardar como álbum'));
    const btnR = el('button', 'btn ghost icon'); btnR.type = 'button'; btnR.title = 'Volver a leer las fotos'; btnR.setAttribute('aria-label', 'Actualizar');
    btnR.appendChild(icon('i-refresh'));
    barra.append(selY, selC, lblG, sp, btnA, btnR);
    raiz.appendChild(barra);

    const estado = el('p', 'ft-estado');
    raiz.appendChild(estado);
    const cont = el('div', 'ft-cont');
    raiz.appendChild(cont);

    let actual = [];
    function aplica() {
      F.filtro = { year: selY.value, cam: selC.value, geo: chk.checked };
      actual = filtra(ind.fotos);
      const filtrado = F.filtro.year || F.filtro.cam || F.filtro.geo;
      estado.textContent = filtrado ? `${plural(actual.length, 'foto', 'fotos')} con estos filtros` : barraEstado(ind);
      btnA.hidden = !actual.length;
      pintaGrid(cont, actual);
    }
    [selY, selC, chk].forEach(c => c.addEventListener('change', aplica));
    btnA.addEventListener('click', () => {
      const partes = [F.filtro.year, F.filtro.cam, F.filtro.geo ? 'con ubicación' : ''].filter(Boolean);
      guardarComoAlbum(partes.join(' · ') || 'Todas las fotos', actual);
    });
    btnR.addEventListener('click', () => { F.indice = null; carga('timeline'); });
    aplica();
  }

  /* ---------- Álbumes inteligentes ---------- */
  function agrupa(fotos, clave) {
    const m = new Map();
    for (const f of fotos) {
      const k = clave(f);
      if (k === null || k === undefined) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return m;
  }

  function lugares(fotos) {
    const celdas = agrupa(fotos, f => f.lat === null ? null : `${Math.round(f.lat * CELDA)}|${Math.round(f.lon * CELDA)}`);
    return [...celdas.values()].map(lista => {
      const lat = lista.reduce((a, f) => a + f.lat, 0) / lista.length;
      const lon = lista.reduce((a, f) => a + f.lon, 0) / lista.length;
      const dias = lista.map(f => f.t);
      return { lista, lat, lon, desde: Math.min(...dias), hasta: Math.max(...dias) };
    }).sort((a, b) => b.lista.length - a.lista.length).slice(0, 60);
  }

  function tarjeta(titulo, sub, fotos, extra) {
    const t = el('div', 'album-tile');
    const cover = el('div', 'cover');
    const img = el('img');
    img.src = BASE + '/api/thumb?path=' + encodeURIComponent(fotos[0].rel);
    img.loading = 'lazy';
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); cover.appendChild(icon('i-image')); });
    cover.appendChild(img);
    t.appendChild(cover);
    const cap = el('div', 'cap');
    cap.appendChild(el('div', 'name', titulo));
    cap.appendChild(el('div', 'n', sub));
    t.appendChild(cap);
    t.addEventListener('click', () => abre({ titulo, fotos, ...extra }));
    return t;
  }

  function seccion(raiz, titulo, tarjetas) {
    if (!tarjetas.length) return;
    raiz.appendChild(el('h3', 'ft-mes', titulo));
    const g = el('div', 'grid ft-albumes');
    tarjetas.forEach(t => g.appendChild(t));
    raiz.appendChild(g);
  }

  function inteligentes(raiz, ind) {
    raiz.textContent = '';
    if (F.vista) { detalle(raiz, F.vista); return; }
    if (!ind.fotos.length) {
      raiz.appendChild(emptyState('Aún no hay fotos', 'Sube fotos a Archivos y aquí se agruparán solas por año, cámara y lugar', 'i-image'));
      return;
    }
    const barra = el('div', 'toolbar');
    barra.appendChild(el('p', 'ft-estado', barraEstado(ind)));
    barra.appendChild(el('span', 'spacer'));
    const btnR = el('button', 'btn ghost icon'); btnR.type = 'button'; btnR.title = 'Volver a leer las fotos'; btnR.setAttribute('aria-label', 'Actualizar');
    btnR.appendChild(icon('i-refresh'));
    btnR.addEventListener('click', () => { F.indice = null; carga('smart'); });
    barra.appendChild(btnR);
    raiz.appendChild(barra);

    const porAño = [...agrupa(ind.fotos, f => año(f)).entries()].sort((a, b) => b[0] - a[0]);
    seccion(raiz, 'Por año', porAño.map(([y, l]) => tarjeta(String(y), plural(l.length, 'foto', 'fotos'), l)));

    const porCam = [...agrupa(ind.fotos, f => f.c).entries()].sort((a, b) => b[1].length - a[1].length);
    seccion(raiz, 'Por cámara', porCam.map(([c, l]) => tarjeta(c, plural(l.length, 'foto', 'fotos'), l)));

    const lug = lugares(ind.fotos);
    seccion(raiz, 'Por lugar', lug.map(z => {
      const rango = z.desde === z.hasta ? new Date(z.desde).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
        : `${new Date(z.desde).getFullYear()}–${new Date(z.hasta).getFullYear()}`;
      return tarjeta(`${z.lat.toFixed(2)}°, ${z.lon.toFixed(2)}°`, `${plural(z.lista.length, 'foto', 'fotos')} · ${rango}`, z.lista, { lugar: z });
    }));

    const sinGeo = ind.fotos.filter(f => f.lat === null);
    const sinFecha = ind.fotos.filter(f => !f.exif);
    seccion(raiz, 'Para revisar', [
      sinGeo.length ? tarjeta('Sin ubicación', plural(sinGeo.length, 'foto', 'fotos'), sinGeo) : null,
      sinFecha.length ? tarjeta('Sin fecha de captura', plural(sinFecha.length, 'foto', 'fotos'), sinFecha) : null,
    ].filter(Boolean));
  }

  function abre(vista) {
    F.vista = vista;
    inteligentes($('col-fotos'), F.indice);
  }

  function detalle(raiz, v) {
    const barra = el('div', 'toolbar');
    const volver = el('button', 'btn ghost icon'); volver.type = 'button'; volver.setAttribute('aria-label', 'Volver');
    volver.appendChild(icon('i-left'));
    volver.addEventListener('click', () => { F.vista = null; inteligentes(raiz, F.indice); });
    barra.append(volver, el('b', 'ft-titulo', v.titulo), el('span', 'ft-estado', plural(v.fotos.length, 'foto', 'fotos')), el('span', 'spacer'));
    if (v.lugar) {
      const a = el('a', 'btn ghost', 'Ver en el mapa');
      a.href = `https://www.openstreetmap.org/?mlat=${v.lugar.lat.toFixed(5)}&mlon=${v.lugar.lon.toFixed(5)}#map=11/${v.lugar.lat.toFixed(5)}/${v.lugar.lon.toFixed(5)}`;
      a.target = '_blank'; a.rel = 'noopener';
      barra.appendChild(a);
    }
    const btnA = el('button', 'btn primary'); btnA.type = 'button';
    btnA.append(icon('i-stack'), el('span', 'lbl', 'Guardar como álbum'));
    btnA.addEventListener('click', () => guardarComoAlbum(v.titulo, v.fotos));
    barra.appendChild(btnA);
    raiz.appendChild(barra);
    const cont = el('div', 'ft-cont');
    raiz.appendChild(cont);
    pintaGrid(cont, [...v.fotos].sort((a, b) => b.t - a.t));
  }

  /* ---------- Entrada desde Colecciones ---------- */
  async function carga(modo) {
    const raiz = $('col-fotos');
    if (!raiz) return;
    if (!F.indice || Date.now() - F.cuando >= 120000) {
      raiz.textContent = '';
      const cargandoMsg = el('div', 'ft-cargando');
      cargandoMsg.appendChild(el('div', 'skel', ''));
      cargandoMsg.appendChild(el('p', 'ft-estado', 'Leyendo las fotos… la primera vez puede tardar un poco si hay muchas.'));
      raiz.appendChild(cargandoMsg);
    }
    try {
      const ind = await pideIndice(false);
      if (modo === 'timeline') lineaDeTiempo(raiz, ind);
      else inteligentes(raiz, ind);
    } catch (e) {
      raiz.textContent = '';
      raiz.appendChild(emptyState('No se pudieron leer las fotos', e.message || '', 'i-image'));
    }
  }

  window.Fotos = { carga, reset() { F.indice = null; F.vista = null; } };
})();
