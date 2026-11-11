'use strict';
/* notes/ricos-base-vistas.js: dibuja, de solo lectura y en pequeño, la vista elegida de una base dentro de una nota:
   tabla, tablero, galería, calendario o línea de tiempo, con los filtros, el orden y las columnas ocultas de esa vista. */
(function () {
  const C = (K._notes = K._notes || {});
  const MAX = 12, MAX_COLS = 6, MAX_TARJ = 5;
  const nodo = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
  const titulo = (base, r) => K.bases.tituloDestino(base, r);

  function tabla(base, vista, filas) {
    const B = K.bases, cols = base.columns.filter(c => !(vista.ocultas || []).includes(c.id)).slice(0, MAX_COLS);
    const t = nodo('table', 'nb-bs-tabla'), cab = t.createTHead().insertRow();
    cols.forEach(c => cab.appendChild(nodo('th', null, c.nombre)));
    const cuerpo = t.createTBody();
    filas.slice(0, MAX).forEach(r => { const tr = cuerpo.insertRow(); cols.forEach(c => { tr.insertCell().textContent = B.texto(r, c); }); });
    const sc = nodo('div', 'nb-bs-sc'); sc.appendChild(t); return sc;
  }
  function tablero(base, vista, filas) {
    const g = base.columns.find(c => c.id === vista.agrupa && c.tipo === 'select');
    if (!g) return nodo('p', 'k-faint', 'Este tablero necesita una columna de tipo Selección para agrupar las tarjetas.');
    const grupos = [...(g.opciones || []).map(o => ({ id: o.id, nombre: o.nombre, color: o.color })), { id: '', nombre: 'Sin asignar', color: '#64748b' }];
    const cont = nodo('div', 'nb-bs-kan');
    grupos.forEach(gr => {
      const rs = filas.filter(r => ((r.c || {})[g.id] || '') === gr.id); if (!gr.id && !rs.length) return;
      const col = nodo('section', 'nb-bs-kcol'); col.style.setProperty('--o', gr.color);
      const h = nodo('header'); h.append(nodo('b', null, gr.nombre), nodo('span', 'k-faint', String(rs.length))); col.appendChild(h);
      rs.slice(0, MAX_TARJ).forEach(r => col.appendChild(nodo('div', 'nb-bs-tarj', titulo(base, r))));
      if (rs.length > MAX_TARJ) col.appendChild(nodo('small', 'k-faint', `… y ${rs.length - MAX_TARJ} más`));
      cont.appendChild(col);
    });
    return cont;
  }
  function galeria(base, vista, filas) {
    const cont = nodo('div', 'nb-bs-gal'), p = base.columns.find(c => c.id === vista.portada && c.tipo === 'file');
    filas.slice(0, MAX).forEach(r => {
      const t = nodo('figure', 'nb-bs-ficha'); const ruta = p && (r.c || {})[p.id];
      if (ruta) { const im = nodo('img'); im.loading = 'lazy'; im.alt = ''; im.src = BASE + '/api/thumb?path=' + encodeURIComponent(ruta); im.addEventListener('error', () => im.remove()); t.appendChild(im); }
      t.appendChild(nodo('figcaption', null, titulo(base, r))); cont.appendChild(t);
    });
    return cont;
  }
  function agenda(base, vista, filas) {
    const B = K.bases, f = base.columns.find(c => c.id === vista.fecha && c.tipo === 'date');
    if (!f) return nodo('p', 'k-faint', 'Esta vista necesita una columna de tipo Fecha.');
    const fin = base.columns.find(c => c.id === vista.fechaFin);
    const con = filas.filter(r => (r.c || {})[f.id]).sort((a, b) => String(a.c[f.id]).localeCompare(String(b.c[f.id])));
    const lista = nodo('div', 'nb-bs-agenda');
    con.slice(0, MAX).forEach(r => {
      const l = nodo('div', 'nb-bs-dia'); const fi = fin && r.c[fin.id];
      l.append(nodo('b', null, B.fechaTxt(r.c[f.id]) + (fi ? ' → ' + B.fechaTxt(fi) : '')), nodo('span', null, ' ' + titulo(base, r))); lista.appendChild(l);
    });
    if (filas.length > con.length) lista.appendChild(nodo('small', 'k-faint', `${filas.length - con.length} sin fecha`));
    return lista;
  }

  // Devuelve { nodo, total, mostradas } para pintar el pie «… y N más»
  C.pintaVistaBase = function (base, vista) {
    const filas = K.bases.filasDe(base, vista, vista.ordenes || []);
    if (!filas.length) return { nodo: nodo('p', 'k-faint', base.rows.length ? 'Ninguna fila coincide con el filtro de esta vista.' : 'Esta base todavía no tiene filas.'), total: 0, mostradas: 0 };
    const f = { table: tabla, kanban: tablero, gallery: galeria, calendar: agenda, timeline: agenda }[vista.tipo] || tabla;
    return { nodo: f(base, vista, filas), total: filas.length, mostradas: vista.tipo === 'kanban' ? filas.length : Math.min(filas.length, MAX) };
  };
})();
