'use strict';
/* Bases · pantalla de una base: cabecera, pestañas de vistas, búsqueda, menú y exportaciones. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  B.pinta = () => {
    if (!S.built) return;
    B.root.textContent = '';
    const page = el('section', 'bs-page'); B.root.appendChild(page);
    if (S.base) pintaBase(page); else B.pintaLista(page);
  };
  B.repinta = () => {
    const cont = B.root.querySelector('#bs-cont'); if (!cont || !S.base) return; cont.textContent = '';
    const v = B.vistaActual();
    ({ kanban: B.pintaKanban, calendar: B.pintaCalendario, gallery: B.pintaGaleria, timeline: B.pintaLinea }[v.tipo] || B.pintaTabla)(cont, v);
  };

  function pintaBase(page) {
    const b = S.base; const v = B.vistaActual();
    const head = el('header', 'bs-head');
    const back = B.btn('Bases', null, () => { S.base = null; B.cargaLista(); }, 'btn sm'); back.prepend(el('span', null, '← '));
    const t = el('div', 'bs-titulo'); const nm = el('h1'); nm.append(el('span', 'bs-ico', b.icon), el('span', null, b.name)); nm.title = 'Pulsa para renombrar'; nm.addEventListener('click', renombra); t.appendChild(nm);
    t.appendChild(el('p', 'k-muted', B.resumenTxt()));
    const acc = el('div', 'bs-actions');
    acc.append(B.btn('Columnas', 'i-list', B.editaColumnas), B.btn('Vista', 'i-pencil', () => B.editaVista(v)), B.btn('', 'i-dots', ev => menuMas(ev.currentTarget)));
    acc.lastChild.setAttribute('aria-label', 'Más opciones');
    head.append(back, t, acc); page.appendChild(head);
    const tabs = el('div', 'bs-tabs');
    b.views.forEach(x => { const t2 = el('button', x.id === v.id ? 'is-active' : '', `${B.iconoVista(x.tipo)} ${x.nombre}`); t2.type = 'button'; t2.addEventListener('click', () => { S.vista = x.id; B.pinta(); }); tabs.appendChild(t2); });
    const plus = el('button', 'bs-tab-plus', '+'); plus.type = 'button'; plus.title = 'Nueva vista'; plus.setAttribute('aria-label', 'Nueva vista'); plus.addEventListener('click', () => B.editaVista(null)); tabs.appendChild(plus);
    page.appendChild(tabs);
    const bar = el('div', 'bs-bar'); const s = el('label', 'search bs-search'); s.appendChild(icon('i-search'));
    const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar en la base…'; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar');
    inp.addEventListener('input', K.debounce(() => { S.q = inp.value; B.repinta(); }, 150)); s.appendChild(inp); bar.appendChild(s);
    const fl = B.resumenFiltros(v); if (fl.length) { const ch = el('button', 'bs-chip', `${fl.length} filtro${fl.length === 1 ? '' : 's'}`); ch.type = 'button'; ch.title = fl.join(v.unir === 'o' ? ' · o · ' : ' · y · '); ch.addEventListener('click', () => B.editaVista(v)); bar.appendChild(ch); }
    page.appendChild(bar);
    const cont = el('div', 'bs-cont'); cont.id = 'bs-cont'; page.appendChild(cont);
    B.repinta();
  }

  function menuMas(anchor) {
    K.menu(anchor, [
      { label: 'Renombrar base', onClick: renombra },
      { label: 'Exportar CSV', onClick: () => descarga('csv') }, { label: 'Exportar JSON', onClick: () => descarga('json') },
      ...K.doc.items(() => { const d = baseMd(); return S.base.rows.length ? { titulo: S.base.name, nombre: S.base.name, md: d.md, ancho: d.ancho } : (K.toast('La base no tiene filas'), null); }),
      { label: 'Copiar o mover a…', onClick: () => K.transferir.abre({ tipo: 'bases', ids: [S.base.id], titulo: S.base.name }, { alTerminar: (r) => { if (r && r.modo === 'mover') { S.base = null; B.cargaLista(); } } }) },
      '-', { label: 'Eliminar base', danger: true, onClick: eliminar },
    ]);
  }
  function renombra() {
    const n = el('input'); n.value = S.base.name; n.maxLength = 80; const e = el('input'); e.value = S.base.icon; e.maxLength = 4; e.className = 'bs-emoji';
    const w = el('div', 'bs-form'); const r = el('div', 'bs-row2'); r.append(B.campo('Nombre', n), B.campo('Icono', e)); w.appendChild(r);
    K.modal({ title: 'Renombrar base', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { try { const b = await K.put('/api/bases/' + S.base.id, { nombre: n.value, icono: e.value }); S.base = b; B.pinta(); return true; } catch (er) { K.fail(er); return false; } } }] });
  }
  async function eliminar() {
    if (!await K.confirm(`Se eliminará la base «${S.base.name}» con todas sus filas.`, { ok: 'Eliminar', danger: true })) return;
    try { await K.del('/api/bases/' + S.base.id); S.base = null; await B.cargaLista(); B.logros(); } catch (e) { K.fail(e); }
  }
  // Toda la base como tabla Markdown (las columnas de opciones y las calculadas se escriben con su valor)
  function baseMd() {
    const b = S.base, cols = b.columns;
    return { ancho: cols.length > 5, md: `# ${b.name}\n\n${b.rows.length} fila${b.rows.length === 1 ? '' : 's'}\n\n` + K.doc.tabla(cols.map(c => c.nombre), b.rows.map(r => cols.map(c => B.texto(r, c)))) };
  }
  async function descarga(fmt) { await K.guardarUrl(`/api/bases/${S.base.id}/export?format=${fmt}`, { nombre: `${S.base.name}.${fmt}` }); }
})();
