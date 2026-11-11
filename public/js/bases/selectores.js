'use strict';
/* Bases · ventanas para elegir cosas: etiquetas, filas de otra base (relación) y un archivo de Archivos. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases;

  B.eligeVarios = (c, actual, fn) => {
    const w = el('div', 'bs-form'); const sel = new Set(actual);
    (c.opciones || []).forEach(o => { const l = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = sel.has(o.id); i.addEventListener('change', () => { i.checked ? sel.add(o.id) : sel.delete(o.id); }); l.append(i, B.chip(c, o.id)); w.appendChild(l); });
    if (!(c.opciones || []).length) w.appendChild(el('p', 'k-muted', 'Esta columna aún no tiene opciones. Añádelas en «Columnas».'));
    K.modal({ title: c.nombre, content: w, actions: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, onClick: () => { fn([...sel]); return true; } }] });
  };

  // Filas de la base enlazada por la columna de relación `c`; `actual`: ids ya enlazados
  B.eligeFilas = (c, actual, fn) => {
    const w = el('div', 'bs-form'); const sel = new Set(actual);
    const buscar = el('input'); buscar.type = 'search'; buscar.placeholder = 'Buscar…'; buscar.setAttribute('aria-label', 'Buscar');
    const lista = el('div', 'bs-checks bs-lista-rel'); w.append(buscar, lista);
    const pinta = (b) => {
      lista.textContent = '';
      if (!b) { lista.appendChild(el('p', 'k-muted', 'La base enlazada ya no existe. Cambia la relación en «Columnas».')); return; }
      const q = buscar.value.toLocaleLowerCase('es');
      const rs = b.rows.filter(r => !q || B.tituloDestino(b, r).toLocaleLowerCase('es').includes(q));
      if (!rs.length) lista.appendChild(el('p', 'k-muted', b.rows.length ? 'Nada coincide.' : 'La base enlazada aún no tiene filas.'));
      rs.slice(0, 300).forEach(r => { const l = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = sel.has(r.id); i.addEventListener('change', () => { i.checked ? sel.add(r.id) : sel.delete(r.id); }); l.append(i, el('span', null, B.tituloDestino(b, r))); lista.appendChild(l); });
    };
    const b0 = B.destino(c.destino, (b) => pinta(b));
    if (b0) pinta(b0); else lista.appendChild(el('p', 'k-muted', 'Cargando…'));
    buscar.addEventListener('input', K.debounce(() => pinta(B.destino(c.destino)), 120));
    K.modal({ title: c.nombre, sub: 'Elige las filas a enlazar', content: w, actions: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, onClick: () => { fn([...sel]); return true; } }] });
  };

  // Elegir un archivo de «Archivos» recorriendo las carpetas
  B.eligeArchivo = (actual, fn) => {
    const w = el('div', 'bs-form'); const ruta = el('div', 'bs-ruta'); const lista = el('div', 'bs-checks bs-lista-rel'); w.append(ruta, lista);
    let cierra = null;
    const abre = async (dir) => {
      ruta.textContent = '/' + dir; lista.textContent = '';
      try {
        const d = await K.get('/api/files?' + K.qs({ path: dir }));
        if (dir) { const up = el('button', 'bs-fila-ar', '↑ Subir'); up.type = 'button'; up.addEventListener('click', () => abre(dir.split('/').slice(0, -1).join('/'))); lista.appendChild(up); }
        (d.items || []).filter(x => !x.virtual).forEach(x => {
          const p = dir ? dir + '/' + x.name : x.name; const b = el('button', 'bs-fila-ar', (x.isDir ? '📁 ' : '📄 ') + x.name); b.type = 'button';
          b.addEventListener('click', () => { if (x.isDir) abre(p); else { fn(p); if (cierra) cierra(); } }); lista.appendChild(b);
        });
        if (!(d.items || []).length) lista.appendChild(el('p', 'k-muted', 'Carpeta vacía'));
      } catch (e) { lista.appendChild(el('p', 'k-muted', 'No se pudo leer la carpeta')); }
    };
    abre(actual && actual.includes('/') ? actual.split('/').slice(0, -1).join('/') : '');
    const m = K.modal({ title: 'Elegir archivo', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, ...(actual ? [{ label: 'Quitar archivo', danger: true, onClick: () => { fn(''); return true; } }] : [])] });
    cierra = m && m.close ? () => m.close() : () => { const x = document.querySelector('.modal-back .btn'); if (x) x.click(); };
  };
})();
