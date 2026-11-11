'use strict';
/* Bases · editor de vistas: tipo, columnas que usa, varios filtros (con «y»/«o»), varios criterios de orden y columnas ocultas. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const de = (...tipos) => S.base.columns.filter(c => tipos.includes(c.tipo));
  const pares = (cols, vacio) => [...(vacio ? [['', vacio]] : []), ...cols.map(c => [c.id, c.nombre])];

  B.editaVista = (v) => {
    const nueva = !v; const d = v ? JSON.parse(JSON.stringify(v)) : { nombre: 'Nueva vista', tipo: 'table', filtros: [], unir: 'y', ordenes: [], ocultas: [] };
    d.filtros = d.filtros || []; d.ordenes = d.ordenes || []; d.ocultas = d.ocultas || [];
    const w = el('div', 'bs-form');
    const nom = el('input'); nom.value = d.nombre; nom.maxLength = 40;
    const tipo = B.select(B.VISTAS.map(([k, n]) => [k, n]), d.tipo);
    const agr = B.select(pares(de('select')), d.agrupa || (de('select')[0] || {}).id || '');
    const fec = B.select(pares(de('date')), d.fecha || (de('date')[0] || {}).id || '');
    const fin = B.select(pares(de('date'), 'Sin fecha de fin'), d.fechaFin || '');
    const por = B.select(pares(de('file'), 'Sin imagen'), d.portada || '');
    const fAgr = B.campo('Agrupar tarjetas por', agr), fFec = B.campo('Columna de fecha', fec), fFin = B.campo('Fecha de fin (opcional)', fin), fPor = B.campo('Imagen de portada', por);
    const alt = () => { fAgr.hidden = tipo.value !== 'kanban'; fFec.hidden = !['calendar', 'timeline'].includes(tipo.value); fFin.hidden = tipo.value !== 'timeline'; fPor.hidden = tipo.value !== 'gallery'; };
    tipo.addEventListener('change', alt); alt();
    w.append(B.campo('Nombre', nom), B.campo('Tipo de vista', tipo), fAgr, fFec, fFin, fPor);

    // Filtros
    const filtros = el('div', 'bs-lista-f'); const unir = B.select([['y', 'Se cumplen todos los filtros'], ['o', 'Se cumple alguno de los filtros']], d.unir || 'y');
    const dibujaF = () => {
      filtros.textContent = '';
      d.filtros.forEach((f, i) => {
        const fila = el('div', 'bs-filtro'); const c = B.select(pares(S.base.columns), f.col); const o = B.select(Object.entries(B.OPS), f.op); const val = el('input'); val.placeholder = 'Valor'; val.value = f.valor || '';
        const ajusta = () => { const col = B.col(f.col); val.hidden = B.SIN_VALOR.includes(f.op); val.type = col && col.tipo === 'date' && ['before', 'after', 'equals', 'not'].includes(f.op) ? 'date' : 'text'; };
        c.addEventListener('change', () => { f.col = c.value; ajusta(); }); o.addEventListener('change', () => { f.op = o.value; ajusta(); }); val.addEventListener('input', () => { f.valor = val.value; });
        const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar filtro'); x.textContent = '×'; x.addEventListener('click', () => { d.filtros.splice(i, 1); dibujaF(); });
        ajusta(); fila.append(c, o, val, x); filtros.appendChild(fila);
      });
      if (d.filtros.length > 1) filtros.appendChild(B.campo('Combinar', unir));
      if (d.filtros.length < 8) filtros.appendChild(B.btn('Filtro', 'i-plus', () => { d.filtros.push({ col: S.base.columns[0].id, op: 'contains', valor: '' }); dibujaF(); }, 'btn sm'));
    };
    dibujaF(); w.append(el('span', 'bs-lbl', 'Filtros'), filtros);

    // Orden
    const ordenes = el('div', 'bs-lista-f');
    const dibujaO = () => {
      ordenes.textContent = '';
      d.ordenes.forEach((o, i) => {
        const fila = el('div', 'bs-filtro bs-orden'); const c = B.select(pares(S.base.columns), o.col); const dir = B.select([['asc', 'Ascendente'], ['desc', 'Descendente']], o.dir);
        c.addEventListener('change', () => { o.col = c.value; }); dir.addEventListener('change', () => { o.dir = dir.value; });
        const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar orden'); x.textContent = '×'; x.addEventListener('click', () => { d.ordenes.splice(i, 1); dibujaO(); });
        fila.append(c, dir, x); ordenes.appendChild(fila);
      });
      if (d.ordenes.length < 4) ordenes.appendChild(B.btn('Orden', 'i-plus', () => { const libre = S.base.columns.find(c => !d.ordenes.some(o => o.col === c.id)); if (libre) { d.ordenes.push({ col: libre.id, dir: 'asc' }); dibujaO(); } }, 'btn sm'));
    };
    dibujaO(); w.append(el('span', 'bs-lbl', 'Orden (el primero manda; los siguientes desempatan)'), ordenes);

    // Columnas ocultas
    const ocultas = el('div', 'bs-checks bs-ocultas');
    S.base.columns.forEach(c => { const l = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = !d.ocultas.includes(c.id); i.addEventListener('change', () => { d.ocultas = i.checked ? d.ocultas.filter(x => x !== c.id) : [...d.ocultas, c.id]; }); l.append(i, el('span', null, c.nombre)); ocultas.appendChild(l); });
    w.append(el('span', 'bs-lbl', 'Columnas que se muestran en esta vista'), ocultas);

    const acts = [{ label: 'Cancelar' }];
    if (!nueva && S.base.views.length > 1) acts.push({ label: 'Eliminar vista', danger: true, onClick: async () => { const b = await B.guardaEsquema({ vistas: S.base.views.filter(x => x.id !== v.id) }); if (!b) return false; B.pinta(); return true; } });
    acts.push({ label: 'Guardar', primary: true, onClick: async () => {
      const t = tipo.value;
      if (t === 'kanban' && !agr.value) { K.toast('Para un tablero necesitas una columna de tipo Selección'); return false; }
      if ((t === 'calendar' || t === 'timeline') && !fec.value) { K.toast('Para esta vista necesitas una columna de tipo Fecha'); return false; }
      const nv = { ...(v || {}), nombre: nom.value, tipo: t, agrupa: t === 'kanban' ? agr.value : undefined, fecha: ['calendar', 'timeline'].includes(t) ? fec.value : undefined, fechaFin: t === 'timeline' ? fin.value : undefined, portada: t === 'gallery' ? por.value : undefined, unir: unir.value, filtros: d.filtros, ordenes: d.ordenes, ocultas: d.ocultas };
      const vistas = nueva ? [...S.base.views, nv] : S.base.views.map(x => x.id === v.id ? nv : x);
      const b = await B.guardaEsquema({ vistas }); if (!b) return false;
      if (nueva) S.vista = b.views[b.views.length - 1].id; S.ordenLocal = null; B.pinta(); B.logros(); return true;
    } });
    K.modal({ title: nueva ? 'Nueva vista' : 'Editar vista', content: w, cls: 'wide', actions: acts });
  };
})();
