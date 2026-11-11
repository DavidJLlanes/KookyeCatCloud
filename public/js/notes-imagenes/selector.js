'use strict';
/* Imágenes de notas · ventana «Insertar imagen»: subir desde el dispositivo, hacer una foto (móvil) o elegir de tus archivos. */
(function () {
  if (!window.NB || !NB.imagenes) return;
  const I = NB.imagenes;
  const tactil = () => !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);

  // Botón grande que abre el selector de archivos (el <input> va dentro del <label>: funciona en iPhone, Android y PC)
  function opcion(texto, ayuda, ic, atributos, alElegir) {
    const l = el('label', 'ni-op'); const i = el('input'); i.type = 'file'; i.accept = 'image/*'; i.hidden = true;
    Object.entries(atributos).forEach(([k, v]) => { i[k] = v; });
    l.append(icon(ic), el('b', null, texto), el('small', 'k-faint', ayuda), i);
    i.addEventListener('change', () => { if (i.files.length) alElegir([...i.files]); i.value = ''; });
    return l;
  }

  NB.elegirImagen = function (w) {
    const raiz = el('div', 'ni');
    let m;
    const sube = (files) => { m.close(); NB.subeImagenes(files, w); };
    const ops = el('div', 'ni-ops');
    ops.appendChild(opcion(tactil() ? 'Fotos y archivos' : 'Subir imágenes', tactil() ? 'Galería o archivos' : 'Desde este equipo', 'i-upload', { multiple: true }, sube));
    if (tactil()) ops.appendChild(opcion('Hacer foto', 'Con la cámara', 'i-image', { capture: 'environment' }, sube));
    raiz.appendChild(ops);
    raiz.appendChild(el('p', 'k-faint ni-tip', tactil() ? 'Las fotos se reducen antes de subirlas para que no gasten datos ni espacio.' : 'También puedes pegar una imagen con Ctrl+V o arrastrarla a la nota. Se reducen antes de subirlas.'));

    const busca = el('input'); busca.type = 'search'; busca.placeholder = 'O busca una imagen de tus archivos…'; busca.setAttribute('aria-label', 'Buscar una imagen en tus archivos');
    const grid = el('div', 'ni-grid');
    raiz.append(busca, grid);
    m = K.modal({ title: 'Insertar imagen', content: raiz, cls: 'wide', actions: [{ label: 'Cancelar' }] });

    const pinta = (items, vacio) => {
      grid.textContent = '';
      if (!items.length) { grid.appendChild(el('p', 'k-faint ni-vacio', vacio)); return; }
      items.forEach(it => {
        const b = el('button', 'ni-th'); b.type = 'button'; b.title = it.rel;
        const im = el('img'); im.loading = 'lazy'; im.alt = it.name; im.src = BASE + '/api/thumb?path=' + encodeURIComponent(it.rel);
        b.appendChild(im);
        b.addEventListener('click', () => { m.close(); I.inserta([it.rel], w); });
        grid.appendChild(b);
      });
    };
    const deLista = (r, dir) => r.items.filter(i => !i.isDir && I.EXT.test(i.name)).slice(0, 60).map(i => ({ name: i.name, rel: (dir !== undefined ? dir : (i.dir ? i.dir + '/' : '')) + i.name }));
    K.get('/api/files?' + K.qs({ path: I.DIR })).then(r => pinta(deLista(r, I.DIR + '/'), 'Aún no has subido imágenes a tus notas.')).catch(() => pinta([], 'Busca una imagen por su nombre.'));
    busca.addEventListener('input', K.debounce(async () => {
      const q = busca.value.trim(); if (q.length < 2) return;
      try { pinta(deLista(await K.get('/api/search?' + K.qs({ q }))), 'No hay imágenes con ese nombre.'); } catch (e) { K.fail(e); }
    }, 250));
  };
})();
