'use strict';
/* Bases · vista de tabla. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  B.pintaTabla = (cont, v) => {
    const lista = B.filas(v); const wrap = el('div', 'bs-scroll'); const t = el('table', 'bs-tabla');
    const cols = B.columnasVisibles(v); const os = B.ordenes(v); const o = os[0];
    const thead = el('thead'); const tr = el('tr');
    cols.forEach(c => {
      const th = el('th'); const b = el('button', 'bs-th'); b.type = 'button';
      const pos = os.findIndex(x => x.col === c.id);
      b.append(el('span', null, c.nombre), el('small', null, pos >= 0 ? (os[pos].dir === 'desc' ? ' ▼' : ' ▲') + (os.length > 1 ? pos + 1 : '') : '')); b.title = `${B.TIPO_NOMBRE[c.tipo]} · pulsa para ordenar`;
      b.addEventListener('click', () => { S.ordenLocal = { vista: v.id, col: c.id, dir: o && o.col === c.id && o.dir === 'asc' ? 'desc' : 'asc' }; B.repinta(); }); th.appendChild(b); tr.appendChild(th);
    });
    tr.appendChild(el('th', 'acc')); thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody');
    lista.forEach(r => {
      const f = el('tr'); f.dataset.rid = r.id; cols.forEach(c => f.appendChild(B.celda(r, c)));
      const a = el('td', 'acc'); const ed = el('button', 'icon-btn'); ed.type = 'button'; ed.title = 'Abrir fila'; ed.setAttribute('aria-label', 'Abrir fila'); ed.appendChild(icon('i-pencil')); ed.addEventListener('click', () => B.editaFila(r));
      const del = el('button', 'icon-btn'); del.type = 'button'; del.title = 'Eliminar fila'; del.setAttribute('aria-label', 'Eliminar fila'); del.appendChild(icon('i-trash')); del.addEventListener('click', () => B.borraFila(r));
      a.append(ed, del); f.appendChild(a); tb.appendChild(f);
    });
    t.appendChild(tb); wrap.appendChild(t); cont.appendChild(wrap);
    if (!lista.length) cont.appendChild(el('p', 'k-muted bs-vacio', S.base.rows.length ? 'Ninguna fila coincide con el filtro o la búsqueda.' : 'Aún no hay filas.'));
    cont.appendChild(B.btn('Nueva fila', 'i-plus', () => B.nuevaFila(), 'btn bs-nueva'));
  };
})();
