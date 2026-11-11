'use strict';
/* Bases · tablero Kanban. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  // Datos de una tarjeta o ficha (galería): chips y valores cortos de las columnas visibles, sin repetir el título ni la agrupación
  B.metaFila = (r, v, excluye = []) => {
    const meta = el('div', 'bs-meta'); const tit = S.base.columns.find(y => y.tipo === 'text');
    B.columnasVisibles(v).forEach(x => {
      if (excluye.includes(x.id) || x === tit) return; const val = r.c[x.id];
      if (x.tipo === 'select' && val) { const ch = B.chip(x, val); if (ch) meta.appendChild(ch); }
      else if (x.tipo === 'multiselect') (val || []).forEach(i => { const ch = B.chip(x, i); if (ch) meta.appendChild(ch); });
      else if (x.tipo === 'relation') ((r.f || {})[x.id] || []).forEach(i => meta.appendChild(B.chipTexto(i.t)));
      else if (x.tipo === 'date' && val) meta.appendChild(el('span', 'bs-dato', '📅 ' + B.fechaTxt(val)));
      else if (x.tipo === 'checkbox') { if (val) meta.appendChild(el('span', 'bs-dato', '✔ ' + x.nombre)); }
      else if (x.tipo === 'file') { if (val) meta.appendChild(el('span', 'bs-dato', '📎 ' + val.split('/').pop())); }
      else { const t = B.texto(r, x); if (t) meta.appendChild(el('span', 'bs-dato', x.tipo === 'text' ? t : `${x.nombre}: ${t}`)); }
    });
    return meta;
  };

  B.pintaKanban = (cont, v) => {
    const g = B.col(v.agrupa);
    if (!g) { cont.appendChild(el('p', 'k-muted bs-vacio', 'Este tablero necesita una columna de tipo «Selección» para agrupar las tarjetas. Añádela en «Columnas» y elígela en «Vista».')); return; }
    const lista = B.filas(v); const board = el('div', 'bs-board');
    const grupos = [...(g.opciones || []).map(o => ({ id: o.id, nombre: o.nombre, color: o.color })), { id: '', nombre: 'Sin asignar', color: '#64748b' }];
    grupos.forEach(gr => {
      const rs = lista.filter(r => (r.c[g.id] || '') === gr.id);
      if (!gr.id && !rs.length) return;
      const colu = el('section', 'bs-col'); colu.style.setProperty('--o', gr.color);
      const h = el('header'); h.append(el('b', null, gr.nombre), el('span', 'bs-n', String(rs.length)));
      if (gr.id) { const add = el('button', 'icon-btn'); add.type = 'button'; add.title = 'Añadir tarjeta'; add.setAttribute('aria-label', `Añadir tarjeta en ${gr.nombre}`); add.appendChild(icon('i-plus')); add.addEventListener('click', async () => { const r = await B.nuevaFila({ [g.id]: gr.id }); if (r) B.editaFila(r); }); h.appendChild(add); }
      colu.appendChild(h);
      const cuerpo = el('div', 'bs-cards-col');
      colu.addEventListener('dragover', e => { e.preventDefault(); colu.classList.add('sobre'); }); colu.addEventListener('dragleave', () => colu.classList.remove('sobre'));
      colu.addEventListener('drop', e => { e.preventDefault(); colu.classList.remove('sobre'); const rid = e.dataTransfer.getData('text/plain'); const r = S.base.rows.find(x => x.id === rid); if (r && (r.c[g.id] || '') !== gr.id) B.mueve(r, g, gr.id); });
      rs.forEach(r => cuerpo.appendChild(tarjeta(r, v, g, grupos)));
      colu.appendChild(cuerpo); board.appendChild(colu);
    });
    cont.appendChild(board);
    cont.appendChild(B.btn('Nueva tarjeta', 'i-plus', async () => { const r = await B.nuevaFila(); if (r) B.editaFila(r); }, 'btn bs-nueva'));
  };

  function tarjeta(r, v, g, grupos) {
    const c = el('article', 'bs-tarjeta'); c.draggable = true; c.tabIndex = 0;
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastra'); }); c.addEventListener('dragend', () => c.classList.remove('arrastra'));
    c.appendChild(el('strong', null, B.titulo(r)));
    const meta = B.metaFila(r, v, [g.id]); if (meta.childNodes.length) c.appendChild(meta);
    const mv = el('button', 'icon-btn bs-mover'); mv.type = 'button'; mv.title = 'Mover a…'; mv.setAttribute('aria-label', 'Mover a otra columna'); mv.textContent = '⇄';
    mv.addEventListener('click', ev => { ev.stopPropagation(); K.menu(mv, grupos.filter(x => x.id || (r.c[g.id])).map(x => ({ label: x.nombre, dot: x.color, checked: (r.c[g.id] || '') === x.id, onClick: () => B.mueve(r, g, x.id) }))); });
    c.appendChild(mv);
    c.addEventListener('click', () => B.editaFila(r)); c.addEventListener('keydown', e => { if (e.key === 'Enter') B.editaFila(r); });
    return c;
  }
})();
