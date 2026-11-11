'use strict';
/* notes/ricos-base.js: una base de datos dentro de la nota (::base <id>). Muestra una tabla de lectura con las primeras
   filas de la vista principal; pulsar «Abrir» lleva a la base completa.                                              */
(function () {
  const C = (K._notes = K._notes || {});
  const MAX_FILAS = 12, MAX_COLS = 6;
  const nodo = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };

  function tabla(base) {
    const B = K.bases, vista = (base.views || [])[0] || {}, cols = base.columns.filter(c => !(vista.ocultas || []).includes(c.id)).slice(0, MAX_COLS);
    const t = nodo('table', 'nb-bs-tabla'), cab = t.createTHead().insertRow();
    cols.forEach(c => cab.appendChild(nodo('th', null, c.nombre)));
    const cuerpo = t.createTBody();
    base.rows.slice(0, MAX_FILAS).forEach(r => {
      const tr = cuerpo.insertRow();
      cols.forEach(c => { const td = tr.insertCell(); td.textContent = B ? B.texto(r, c) : String((r.c || {})[c.id] ?? ''); });
    });
    return t;
  }

  async function carga(caja, id) {
    caja.textContent = 'Cargando…';
    try {
      const base = await K.get('/api/bases/' + encodeURIComponent(id));
      caja.textContent = '';
      const cab = nodo('div', 'nb-bs-cab'); cab.append(nodo('b', null, `${base.icon || ''} ${base.name}`.trim()), nodo('span', 'k-faint', `${base.rows.length} fila${base.rows.length === 1 ? '' : 's'}`));
      const ab = nodo('button', 'btn ghost sm', 'Abrir'); ab.type = 'button'; ab.addEventListener('click', () => { if (typeof switchTab === 'function') switchTab('bases'); if (K.bases && K.bases.abre) K.bases.abre(id); }); cab.appendChild(ab);
      caja.append(cab, base.rows.length ? (() => { const sc = nodo('div', 'nb-bs-sc'); sc.appendChild(tabla(base)); return sc; })() : nodo('p', 'k-faint', 'Esta base todavía no tiene filas.'));
      if (base.rows.length > MAX_FILAS) caja.appendChild(nodo('p', 'k-faint nb-bs-mas', `… y ${base.rows.length - MAX_FILAS} más`));
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
    parse(lines, i) { const m = /^::base\s+([a-f0-9]{8,32})\s*$/.exec(lines[i]); return m ? { b: { t: 'base', ref: m[1] }, next: i + 1 } : null; },
    md: (b) => '::base ' + (b.ref || ''),
    pinta(w, c, b) {
      w.dataset.ref = b.ref || '';
      const caja = nodo('div', 'nb-bs-cont'); c.appendChild(caja); w._caja = caja;
      if (b.ref) carga(caja, b.ref);
    },
    lee: (w, b) => ({ ...b, ref: w.dataset.ref || b.ref }),
    alCrear(w) {
      const quita = () => { if (!w.isConnected) return; w.remove(); if (!C.EST.host.querySelector('.nb-block')) C.EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); C.change(true); };
      elige((id) => { w.dataset.ref = id; carga(w._caja, id); C.change(true); }, quita);
    },
  });
})();
