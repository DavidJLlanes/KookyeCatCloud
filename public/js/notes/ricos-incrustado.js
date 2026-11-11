'use strict';
/* notes/ricos-incrustado.js: contenido incrustado en la nota (::embed <referencia> [pie]).
     https://youtu.be/ID  o  youtube.com/watch?v=ID   → vídeo de YouTube (youtube-nocookie.com)
     geo:40.4168,-3.7038,12                            → mapa con el Leaflet de la app (sin salir a ningún otro servidor)
     kcc:file/<ruta>.pdf                               → PDF de tu nube                                              */
(function () {
  const C = (K._notes = K._notes || {});
  const YT = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})(?:[?&#][^\s]*)?$/i;
  const GEO = /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(\d{1,2}))?$/;

  // Lo que escribe la persona (enlace de YouTube, enlace de OpenStreetMap, «40.41, -3.70», ruta de un PDF) → referencia guardada
  C.normalizaIncrustado = function (txt) {
    const t = String(txt || '').trim();
    let m = YT.exec(t); if (m) return 'https://www.youtube.com/watch?v=' + m[1];
    m = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)(?:\s*[,;]\s*(\d{1,2}))?$/.exec(t);
    if (!m) m = /openstreetmap\.org\/.*#map=(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i.exec(t) && ((x) => [x[0], x[2], x[3], x[1]])(/openstreetmap\.org\/.*#map=(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i.exec(t));
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return `geo:${+(+m[1]).toFixed(5)},${+(+m[2]).toFixed(5)},${m[3] || 13}`;
    if (/^kcc:file\/.+\.pdf$/i.test(t)) return t;
    return '';
  };

  function pintaMapa(caja, lat, lon, zoom) {
    if (typeof L === 'undefined') { caja.textContent = 'No se pudo cargar el mapa'; return; }
    caja.classList.add('nb-emb-mapa');
    const mapa = L.map(caja, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([lat, lon], zoom);
    const url = (typeof state !== 'undefined' && state.caps && state.caps.tileUrl) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr = (typeof state !== 'undefined' && state.caps && state.caps.tileAttr) || '&copy; colaboradores de OpenStreetMap';
    L.tileLayer(url, { maxZoom: 19, attribution: attr, referrerPolicy: 'origin' }).addTo(mapa);
    L.marker([lat, lon]).addTo(mapa);
    setTimeout(() => mapa.invalidateSize(), 80);
  }

  function pintaContenido(caja, src) {
    caja.textContent = '';
    let m;
    if ((m = YT.exec(src))) {
      const f = document.createElement('iframe'); f.src = 'https://www.youtube-nocookie.com/embed/' + m[1]; f.title = 'Vídeo de YouTube'; f.loading = 'lazy'; f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';   // YouTube exige saber de qué web viene; la app, por defecto, no manda referer
      f.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
      caja.classList.add('nb-emb-video'); caja.appendChild(f); return;
    }
    if ((m = GEO.exec(src))) { pintaMapa(caja, +m[1], +m[2], +(m[3] || 13)); return; }
    if (/^kcc:file\/.+\.pdf$/i.test(src)) {
      const f = document.createElement('iframe'); f.src = BASE + '/api/preview?path=' + encodeURIComponent(C.rutaDeSrc(src)); f.title = 'Documento PDF'; f.loading = 'lazy';
      caja.classList.add('nb-emb-pdf'); caja.appendChild(f); return;
    }
    caja.classList.add('error'); caja.textContent = 'Contenido no admitido';
  }

  // Pide qué incrustar: pega un enlace o coordenadas, o busca un PDF de tu nube
  function pregunta(alElegir, alCancelar) {
    let elegido = false; const elige = (r) => { elegido = true; alElegir(r); };
    const caja = document.createElement('div'); caja.className = 'nb-emb-form';
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Enlace de YouTube, enlace de OpenStreetMap, «40.41, -3.70» o busca un PDF…';
    const ayuda = document.createElement('small'); ayuda.className = 'k-faint'; ayuda.textContent = 'Vídeos de YouTube, mapas (sin salir de tu servidor) y PDF de tu nube.';
    const lista = document.createElement('div'); lista.className = 'nb-emb-lista'; caja.append(inp, ayuda, lista);
    const m = K.modal({ title: 'Incrustar', content: caja, actions: [{ label: 'Cancelar' }, { label: 'Incrustar', primary: true, onClick: () => { const r = C.normalizaIncrustado(inp.value); if (!r) { K.toast('No reconozco eso: usa un enlace de YouTube, coordenadas o un PDF'); return false; } elige(r); } }], onClose: () => { if (!elegido) alCancelar(); } });
    const busca = K.debounce(async () => {
      const q = inp.value.trim(); lista.textContent = '';
      if (q.length < 2 || C.normalizaIncrustado(q)) return;
      try {
        const r = await K.get('/api/search?' + K.qs({ q }));
        (r.items || []).filter(f => /\.pdf$/i.test(f.name)).slice(0, 8).forEach(f => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = f.name + (f.dir ? ' · ' + f.dir : '');
          b.addEventListener('click', () => { elige('kcc:file/' + C.refArchivo((f.dir ? f.dir + '/' : '') + f.name)); m.close(); }); lista.appendChild(b);
        });
      } catch { /* sin resultados */ }
    }, 250);
    inp.addEventListener('input', busca); setTimeout(() => inp.focus(), 40);
  }

  C.registraRico('embed', {
    slash: ['Incrustar', 'Vídeo de YouTube, mapa o PDF', '▶'],
    parse(lines, i) { const m = /^::embed\s+(\S+)(?:\s+(.*))?$/.exec(lines[i]); return m ? { b: { t: 'embed', src: m[1], text: (m[2] || '').trim() }, next: i + 1 } : null; },
    md: (b) => `::embed ${b.src || ''}${b.text ? ' ' + String(b.text).replace(/<br>/g, ' ') : ''}`,
    pinta(w, c, b) {
      const marco = document.createElement('div'); marco.className = 'nb-emb';
      const cont = document.createElement('div'); cont.className = 'nb-emb-cont';
      const pie = C.subEditable('nb-emb-pie nb-una-linea', b.text, 'Pie (opcional)');
      const quitar = document.createElement('button'); quitar.type = 'button'; quitar.className = 'nb-emb-x'; quitar.title = 'Quitar'; quitar.setAttribute('aria-label', 'Quitar'); quitar.textContent = '×';
      quitar.addEventListener('click', () => { const sig = w.nextElementSibling || w.previousElementSibling; w.remove(); if (!C.EST.host.querySelector('.nb-block')) C.EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); if (sig) C.focusBlock(sig); C.change(true); });
      w.dataset.src = b.src || '';
      pintaContenido(cont, b.src || ''); marco.append(cont, quitar); c.append(marco, pie);
    },
    lee: (w, b) => ({ ...b, src: w.dataset.src || b.src, text: C.leeSub(w.querySelector('.nb-emb-pie')).replace(/<br>/g, ' ') }),
    // Recién creado desde «/»: se pregunta qué incrustar; si se cancela, el bloque no se queda vacío
    alCrear(w) {
      const quita = () => { if (!w.isConnected) return; w.remove(); if (!C.EST.host.querySelector('.nb-block')) C.EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); C.change(true); };
      pregunta((ref) => { w.dataset.src = ref; pintaContenido(w.querySelector('.nb-emb-cont'), ref); C.change(true); }, quita);
    },
  });
})();
