'use strict';
/* notes/ricos-base.js: una base de datos dentro de la nota (::base <id>). Muestra, de solo lectura, la vista que elijas
   (::base <id> [<vista>]); sin vista, la primera. Pulsar «Abrir» lleva a la base completa.                                              */
(function () {
  const C = (K._notes = K._notes || {});
  const nodo = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };

  // Pinta la base `id` con la vista `vistaId` (o la primera). `w` es el bloque: guarda la vista elegida en data-vista.
  async function carga(caja, id, vistaId, w) {
    caja.textContent = 'Cargando…';
    try {
      const base = await K.get('/api/bases/' + encodeURIComponent(id));
      const vistas = base.views || [];
      const vista = vistas.find(v => v.id === vistaId) || vistas[0] || { tipo: 'table' };
      caja.textContent = '';
      const cab = nodo('div', 'nb-bs-cab'); cab.append(nodo('b', null, `${base.icon || ''} ${base.name}`.trim()), nodo('span', 'k-faint', `${base.rows.length} fila${base.rows.length === 1 ? '' : 's'}`));
      if (vistas.length > 1) {
        const sel = nodo('select', 'nb-bs-vista'); sel.setAttribute('aria-label', 'Vista de la base que se muestra');
        vistas.forEach(v => { const o = nodo('option', null, `${v.nombre}`); o.value = v.id; sel.appendChild(o); });
        sel.value = vista.id;
        sel.addEventListener('change', () => { w.dataset.vista = sel.value === vistas[0].id ? '' : sel.value; carga(caja, id, sel.value, w); C.change(true); });
        cab.appendChild(sel);
      }
      const ab = nodo('button', 'btn ghost sm', 'Abrir'); ab.type = 'button'; ab.addEventListener('click', () => { if (typeof switchTab === 'function') switchTab('bases'); if (K.bases && K.bases.abre) K.bases.abre(id); }); cab.appendChild(ab);
      const r = C.pintaVistaBase(base, vista);
      caja.append(cab, r.nodo);
      if (r.total > r.mostradas) caja.appendChild(nodo('p', 'k-faint nb-bs-mas', `… y ${r.total - r.mostradas} más`));
    } catch (e) { caja.textContent = ''; caja.appendChild(nodo('p', 'k-faint', e && e.status === 404 ? 'Esta base ya no existe.' : 'No se pudo cargar la base.')); }
  }

  function elige(alElegir, alCancelar) {
    let elegido = false;
    const caja = nodo('div', 'nb-emb-lista');
    const m = K.modal({ title: 'Mostrar una base', content: caja, actions: [{ label: 'Cancelar' }], onClose: () => { if (!elegido) alCancelar(); } });
    K.get('/api/bases').then(r => {
      if (!r.bases.length) caja.appendChild(nodo('p', 'k-faint', 'Todavía no tienes bases.'));
      r.bases.forEach(b => { const x = nodo('button', 'btn', `${b.icon || ''} ${b.name}`.trim()); x.type = 'button'; x.addEventListener('click', () => { elegido = true; alElegir(b.id); m.close(); }); caja.appendChild(x); });
    }).catch(K.fail);
  }

  C.registraRico('base', {
    slash: ['Base de datos', 'Muestra una de tus bases dentro de la nota', '▦'],
    parse(lines, i) { const m = /^::base\s+([a-f0-9]{8,32})(?:\s+([a-f0-9]{16}))?\s*$/.exec(lines[i]); return m ? { b: { t: 'base', ref: m[1], vista: m[2] || '' }, next: i + 1 } : null; },
    md: (b) => '::base ' + (b.ref || '') + (b.vista ? ' ' + b.vista : ''),
    pinta(w, c, b) {
      w.dataset.ref = b.ref || ''; w.dataset.vista = b.vista || '';
      const caja = nodo('div', 'nb-bs-cont'); c.appendChild(caja); w._caja = caja;
      if (b.ref) carga(caja, b.ref, b.vista || '', w);
    },
    lee: (w, b) => ({ ...b, ref: w.dataset.ref || b.ref, vista: w.dataset.vista || '' }),
    alCrear(w) {
      const quita = () => { if (!w.isConnected) return; w.remove(); if (!C.EST.host.querySelector('.nb-block')) C.EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); C.change(true); };
      elige((id) => { w.dataset.ref = id; w.dataset.vista = ''; carga(w._caja, id, '', w); C.change(true); }, quita);
    },
  });
})();
