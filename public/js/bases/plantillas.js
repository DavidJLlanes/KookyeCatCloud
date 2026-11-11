'use strict';
/* Bases · plantillas de fila («Nueva reunión»…): botones junto a «Nueva fila», gestión y editor. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const MAX_VISIBLES = 3;
  const FECHAS = [['', 'Sin fecha'], ['{{hoy}}', 'Hoy'], ['{{manana}}', 'Mañana'], ['{{semana}}', 'En una semana'], ['{{mes}}', 'En un mes'], ['fija', 'Un día concreto…']];
  const lista = () => S.base.plantillas || (S.base.plantillas = []);
  const admite = (c) => !B.esCalc(c) && c.tipo !== 'relation';

  // Crea una fila con la plantilla y la abre para completarla
  B.usaPlantilla = async (p) => {
    try {
      const d = await K.post(`/api/bases/${S.base.id}/plantillas/${p.id}/usar`, {});
      S.base.rows.push(d.row); B.repinta(); B.actualizaContador(); B.logros(); B.editaFila(d.row);
    } catch (e) { K.fail(e); }
  };

  // «Nueva fila» + un botón por plantilla (las primeras) + acceso a gestionarlas
  B.botonesNueva = (etiqueta, alNueva) => {
    const caja = el('div', 'bs-nuevas');
    caja.appendChild(B.btn(etiqueta, 'i-plus', alNueva, 'btn bs-nueva'));
    lista().slice(0, MAX_VISIBLES).forEach(p => { const b = B.btn(`${p.icono} ${p.nombre}`, null, () => B.usaPlantilla(p), 'btn ghost bs-nueva bs-plant'); b.title = `Nueva fila desde la plantilla «${p.nombre}»`; caja.appendChild(b); });
    const g = B.btn(lista().length > MAX_VISIBLES ? `Plantillas (${lista().length})` : 'Plantillas', null, () => B.gestionaPlantillas(), 'btn ghost bs-nueva'); g.title = 'Crear y gestionar las plantillas de fila';
    caja.appendChild(g);
    return caja;
  };

  B.gestionaPlantillas = () => {
    const caja = el('div', 'bs-plantlista');
    const pinta = () => {
      caja.textContent = '';
      if (!lista().length) caja.appendChild(el('p', 'k-muted', 'Aún no hay plantillas. Una plantilla es una fila con valores ya puestos (p. ej. «Reunión»: estado Pendiente, fecha de hoy) que se crea con un solo botón.'));
      lista().forEach(p => {
        const f = el('div', 'bs-plantfila'); f.appendChild(el('span', 'bs-plantfila-n', `${p.icono} ${p.nombre}`));
        f.appendChild(B.btn('Usar', null, () => { m.close(); B.usaPlantilla(p); }, 'btn sm'));
        f.appendChild(B.btn('Editar', null, () => B.editaPlantilla(p, pinta), 'btn ghost sm'));
        f.appendChild(B.btn('Eliminar', null, async () => {
          if (!await K.confirm(`Se eliminará la plantilla «${p.nombre}». Se guarda 30 días por si te arrepientes.`, { ok: 'Eliminar', danger: true })) return;
          try { await K.del(`/api/bases/${S.base.id}/plantillas/${p.id}`); S.base.plantillas = lista().filter(x => x.id !== p.id); pinta(); B.repinta(); } catch (e) { K.fail(e); }
        }, 'btn ghost sm danger'));
        caja.appendChild(f);
      });
      caja.appendChild(B.btn('Nueva plantilla', 'i-plus', () => B.editaPlantilla(null, pinta), 'btn'));
    };
    pinta();
    const m = K.modal({ title: 'Plantillas de fila', content: caja, actions: [{ label: 'Cerrar', onClick: () => { B.repinta(); return true; } }] });
  };

  // Una fecha de plantilla puede ser «hoy», «mañana»… o un día fijo
  function campoFecha(c, val) {
    const caja = el('div', 'bs-plantfecha'); const sel = B.select(FECHAS); const dia = el('input'); dia.type = 'date';
    const v = val[c.id] || '';
    sel.value = FECHAS.some(x => x[0] === v) ? v : (v ? 'fija' : ''); dia.value = /^\d{4}-/.test(v) ? v : '';
    const sync = () => { dia.hidden = sel.value !== 'fija'; val[c.id] = sel.value === 'fija' ? dia.value : sel.value; };
    sel.addEventListener('change', sync); dia.addEventListener('input', sync); sync(); caja.append(sel, dia); return caja;
  }

  // p: plantilla a editar (null = nueva) · inicial: valores de partida (al guardar una fila como plantilla)
  B.editaPlantilla = (p, alGuardar, inicial) => {
    const w = el('div', 'bs-form'); const val = { ...(p ? p.valores : inicial || {}) };
    const nombre = el('input'); nombre.maxLength = 60; nombre.value = p ? p.nombre : ''; nombre.placeholder = 'Nueva reunión';
    const icono = el('input'); icono.maxLength = 8; icono.value = p ? p.icono : '📋'; icono.className = 'bs-plant-ic';
    const cab = el('div', 'bs-plantcab'); cab.append(icono, nombre);
    w.appendChild(B.campo('Nombre del botón', cab));
    const pseudo = { c: {}, f: {} };
    S.base.columns.filter(admite).forEach(c => {
      const l = el('div', 'bs-field'); l.appendChild(el('span', null, c.nombre));
      l.appendChild(c.tipo === 'date' ? campoFecha(c, val) : B.campoFila(c, pseudo, val)); w.appendChild(l);
    });
    w.appendChild(el('p', 'k-faint', 'Lo que dejes vacío se queda vacío en las filas nuevas.'));
    K.modal({ title: p ? 'Editar plantilla' : 'Nueva plantilla', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const cuerpo = { nombre: nombre.value, icono: icono.value, valores: val };
        const d = p ? await K.put(`/api/bases/${S.base.id}/plantillas/${p.id}`, cuerpo) : await K.post(`/api/bases/${S.base.id}/plantillas`, cuerpo);
        if (p) S.base.plantillas = lista().map(x => (x.id === p.id ? d.plantilla : x)); else lista().push(d.plantilla);
        K.toast('Plantilla guardada'); B.logros(); B.repinta(); if (alGuardar) alGuardar(); return true;
      } catch (e) { K.fail(e); return false; }
    } }] });
  };
})();
