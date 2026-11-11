'use strict';
/* Bases · editor de una fila (ventana con todos sus campos). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  // Chips con los títulos de las filas enlazadas (a partir de la base enlazada si ya está leída, o de lo que mandó el servidor)
  function chipsRelacion(c, r, ids, caja) {
    caja.textContent = '';
    const b = B.destino(c.destino, () => chipsRelacion(c, r, ids, caja));
    const previos = new Map(((r.f || {})[c.id] || []).map(x => [x.id, x.t]));
    ids.forEach(id => { const row = b && b.rows ? b.rows.find(x => x.id === id) : null; const t = row ? B.tituloDestino(b, row) : previos.get(id); if (t) caja.appendChild(B.chipTexto(t)); });
    if (!caja.childNodes.length) caja.appendChild(el('span', 'k-faint', '—'));
  }
  function campo(c, r, val) {
    if (B.esCalc(c)) { const e = B.error(r, c); const s = el('span', e ? 'bs-err' : 'bs-calc-v', e ? e.e + ' · ' + e.m : B.texto(r, c) || '—'); return s; }
    if (c.tipo === 'relation') {
      const b = el('button', 'bs-multi bs-multi-f'); b.type = 'button'; const ids = () => val[c.id] || [];
      chipsRelacion(c, r, ids(), b); b.addEventListener('click', () => B.eligeFilas(c, ids(), (nuevo) => { val[c.id] = nuevo; chipsRelacion(c, r, nuevo, b); })); return b;
    }
    if (c.tipo === 'file') {
      const b = el('button', 'bs-multi bs-multi-f'); b.type = 'button'; const pinta = () => { b.textContent = ''; b.appendChild(val[c.id] ? el('span', 'bs-archivo', '📎 ' + val[c.id]) : el('span', 'k-faint', 'Elegir archivo…')); };
      pinta(); b.addEventListener('click', () => B.eligeArchivo(val[c.id], (p) => { val[c.id] = p; pinta(); })); return b;
    }
    let ctl;
    if (c.tipo === 'text') { ctl = el('textarea'); ctl.rows = c === S.base.columns[0] ? 1 : 3; ctl.value = val[c.id] || ''; ctl.addEventListener('input', () => { val[c.id] = ctl.value; }); }
    else if (c.tipo === 'checkbox') { ctl = el('input'); ctl.type = 'checkbox'; ctl.checked = val[c.id] === true; ctl.addEventListener('change', () => { val[c.id] = ctl.checked; }); }
    else if (c.tipo === 'select') { ctl = el('select'); const o0 = el('option', null, '—'); o0.value = ''; ctl.appendChild(o0); (c.opciones || []).forEach(o => { const x = el('option', null, o.nombre); x.value = o.id; ctl.appendChild(x); }); ctl.value = val[c.id] || ''; ctl.addEventListener('change', () => { val[c.id] = ctl.value; }); }
    else if (c.tipo === 'multiselect') { ctl = el('div', 'bs-checks'); const sel = new Set(val[c.id] || []); (c.opciones || []).forEach(o => { const lb = el('label', 'bs-check'); const i = el('input'); i.type = 'checkbox'; i.checked = sel.has(o.id); i.addEventListener('change', () => { i.checked ? sel.add(o.id) : sel.delete(o.id); val[c.id] = [...sel]; }); lb.append(i, B.chip(c, o.id)); ctl.appendChild(lb); }); if (!(c.opciones || []).length) ctl.appendChild(el('small', 'k-faint', 'Sin opciones')); }
    else { ctl = el('input'); ctl.type = { number: 'number', date: 'date', email: 'email', phone: 'tel' }[c.tipo] || 'url'; if (c.tipo === 'number') { ctl.step = 'any'; ctl.inputMode = 'decimal'; } ctl.value = val[c.id] === null || val[c.id] === undefined ? '' : val[c.id]; ctl.addEventListener('input', () => { val[c.id] = c.tipo === 'number' ? (ctl.value === '' ? null : Number(ctl.value)) : ctl.value; }); }
    return ctl;
  }

  B.campoFila = campo;

  B.editaFila = (r) => {
    const w = el('div', 'bs-form'); const val = { ...r.c };
    S.base.columns.forEach(c => { const l = el('div', 'bs-field'); l.appendChild(el('span', null, c.nombre)); l.appendChild(campo(c, r, val)); w.appendChild(l); });
    K.modal({
      title: B.titulo(r), content: w, cls: 'wide', actions: [
        { label: 'Cerrar' },
        { label: 'Guardar como plantilla', onClick: () => { B.editaPlantilla(null, null, Object.fromEntries(Object.entries(val).filter(([k, v]) => { const c = B.col(k); return c && c.tipo !== 'relation' && v !== '' && v !== null && !(Array.isArray(v) && !v.length) && v !== false; }))); return false; } },
        { label: 'Eliminar', danger: true, onClick: async () => !(await B.borraFila(r)) ? false : true },
        { label: 'Guardar', primary: true, onClick: async () => { try { const d = await K.put(`/api/bases/${S.base.id}/rows/${r.id}`, { c: val }); Object.assign(r, d.row); B.repinta(); B.logros(); return true; } catch (e) { K.fail(e); return false; } } },
      ],
    });
  };
})();
