'use strict';
/* Bases · vista de tabla (con asa para reordenar, agrupación por columna y fila de totales). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  function fila(r, cols, v) {
    const f = el('tr'); f.dataset.rid = r.id; f.appendChild(B.asaOrden(f, r, v)); cols.forEach(c => f.appendChild(B.celda(r, c)));
    const a = el('td', 'acc'); const ed = el('button', 'icon-btn'); ed.type = 'button'; ed.title = 'Abrir fila'; ed.setAttribute('aria-label', 'Abrir fila'); ed.appendChild(icon('i-pencil')); ed.addEventListener('click', () => B.editaFila(r));
    const del = el('button', 'icon-btn'); del.type = 'button'; del.title = 'Eliminar fila'; del.setAttribute('aria-label', 'Eliminar fila'); del.appendChild(icon('i-trash')); del.addEventListener('click', () => B.borraFila(r));
    a.append(ed, del); f.appendChild(a);
    if (K.deslizar) K.deslizar(f, { alBorrar: () => B.borraFila(r), etiqueta: 'Eliminar' });
    return f;
  }

  B.pintaTabla = (cont, v) => {
    const lista = B.filas(v); const wrap = el('div', 'bs-scroll'); const t = el('table', 'bs-tabla');
    const cols = B.columnasVisibles(v); const os = B.ordenes(v); const o = os[0];
    const thead = el('thead'); const tr = el('tr'); tr.appendChild(el('th', 'asa'));
    cols.forEach(c => {
      const th = el('th'); const b = el('button', 'bs-th'); b.type = 'button';
      const pos = os.findIndex(x => x.col === c.id);
      b.append(el('span', null, c.nombre), el('small', null, pos >= 0 ? (os[pos].dir === 'desc' ? ' ▼' : ' ▲') + (os.length > 1 ? pos + 1 : '') : '')); b.title = `${B.TIPO_NOMBRE[c.tipo]} · pulsa para ordenar`;
      b.addEventListener('click', () => { S.ordenLocal = { vista: v.id, col: c.id, dir: o && o.col === c.id && o.dir === 'asc' ? 'desc' : 'asc' }; B.repinta(); }); th.appendChild(b); tr.appendChild(th);
    });
    tr.appendChild(el('th', 'acc')); thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody'); const grupos = B.agrupaFilas(v, lista);
    if (grupos) {
      grupos.forEach(g => {
        const clave = `${v.id}:${g.clave}`; const plegado = S.plegados.has(clave);
        const gr = el('tr', 'bs-grupo'); const td = el('td'); td.colSpan = cols.length + 2;
        const bt = el('button', 'bs-grupo-bt'); bt.type = 'button'; bt.setAttribute('aria-expanded', String(!plegado));
        const pt = el('span', 'bs-flecha', plegado ? '▸' : '▾'); const nm = el('b', null, g.titulo); if (g.color) nm.style.setProperty('--o', g.color);
        bt.append(pt, nm, el('span', 'bs-n', String(g.filas.length)));
        bt.addEventListener('click', () => { if (plegado) S.plegados.delete(clave); else S.plegados.add(clave); B.repinta(); });
        td.appendChild(bt); gr.appendChild(td); tb.appendChild(gr);
        if (!plegado) g.filas.forEach(r => tb.appendChild(fila(r, cols, v)));
      });
    } else lista.forEach(r => tb.appendChild(fila(r, cols, v)));
    t.appendChild(tb); t.appendChild(B.pieTotales(v, cols, lista)); wrap.appendChild(t); cont.appendChild(wrap);
    if (!lista.length) cont.appendChild(el('p', 'k-muted bs-vacio', S.base.rows.length ? 'Ninguna fila coincide con el filtro o la búsqueda.' : 'Aún no hay filas.'));
    cont.appendChild(B.botonesNueva('Nueva fila', () => B.nuevaFila()));
  };
})();
