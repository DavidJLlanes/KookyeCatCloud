'use strict';
/* Bases · fila de totales de la tabla (una operación por columna, guardada en la vista) y agrupación de filas. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  B.TOTAL_NOMBRE = { cuenta: 'Contar', rellenas: 'Con valor', vacias: 'Vacías', unicos: 'Distintos', suma: 'Suma', media: 'Media', min: 'Mínimo', max: 'Máximo', marcadas: '% marcadas' };
  const vacio = (v) => !(Array.isArray(v) ? v.length : v === true || (v !== '' && v !== null && v !== undefined && v !== false));
  const numerica = (c) => c.tipo === 'number' || c.tipo === 'formula' || c.tipo === 'rollup';

  B.totalesPara = (c) => {
    if (c.tipo === 'checkbox') return ['cuenta', 'marcadas', 'rellenas'];
    if (c.tipo === 'date') return ['cuenta', 'rellenas', 'vacias', 'min', 'max'];
    const base = ['cuenta', 'rellenas', 'vacias', 'unicos'];
    return numerica(c) ? [...base, 'suma', 'media', 'min', 'max'] : base;
  };
  // Resultado de la operación `f` sobre `filas` en la columna `c`, ya como texto
  B.calculaTotal = (filas, c, f) => {
    const vs = filas.map(r => B.crudo(r, c));
    const nums = () => vs.map(Number).filter((n, i) => Number.isFinite(n) && vs[i] !== '' && vs[i] !== null && typeof vs[i] !== 'boolean');
    switch (f) {
      case 'cuenta': return String(filas.length);
      case 'rellenas': return String(vs.filter(v => !vacio(v) || v === true).length);
      case 'vacias': return String(vs.filter(v => vacio(v) && v !== true).length);
      case 'unicos': return String(new Set(filas.map(r => B.texto(r, c)).filter(Boolean)).size);
      case 'marcadas': return filas.length ? Math.round(100 * vs.filter(v => v === true).length / filas.length) + ' %' : '—';
      case 'suma': { const n = nums(); return n.length ? B.nf(n.reduce((a, b) => a + b, 0)) : '—'; }
      case 'media': { const n = nums(); return n.length ? B.nf(n.reduce((a, b) => a + b, 0) / n.length) : '—'; }
      case 'min': case 'max': {
        if (c.tipo === 'date') { const d = vs.filter(Boolean).sort(); return d.length ? B.fechaTxt(f === 'min' ? d[0] : d[d.length - 1]) : '—'; }
        const n = nums(); return n.length ? B.nf(f === 'min' ? Math.min(...n) : Math.max(...n)) : '—';
      }
      default: return '';
    }
  };
  // ¿La vista tiene alguna operación puesta?
  B.hayTotales = (v) => Object.keys(v.totales || {}).some(k => B.col(k));

  B.pieTotales = (v, cols, filas) => {
    const tf = el('tfoot'); const tr = el('tr', 'bs-totales'); tr.appendChild(el('td', 'asa'));
    cols.forEach(c => {
      const td = el('td'); const f = (v.totales || {})[c.id] || '';
      const s = B.select([['', f ? 'Quitar' : 'Calcular…'], ...B.totalesPara(c).map(k => [k, B.TOTAL_NOMBRE[k]])], f); s.className = 'bs-tot-sel'; s.setAttribute('aria-label', `Total de ${c.nombre}`);
      const val = el('span', 'bs-tot-val', f ? B.calculaTotal(filas, c, f) : ''); if (f) val.title = B.TOTAL_NOMBRE[f];
      s.addEventListener('change', async () => {
        const totales = { ...(v.totales || {}) }; if (s.value) totales[c.id] = s.value; else delete totales[c.id];
        const b = await B.guardaEsquema({ vistas: S.base.views.map(x => (x.id === v.id ? { ...x, totales } : x)) });
        if (b) { B.repinta(); B.logros(); }
      });
      td.append(val, s); tr.appendChild(td);
    });
    tr.appendChild(el('td', 'acc')); tf.appendChild(tr); return tf;
  };

  // Grupos de filas por el valor de una columna: [{ clave, titulo, color, filas }] en el orden de las opciones (o de aparición)
  B.agrupaFilas = (v, lista) => {
    const g = B.col(v.agrupaPor); if (!g) return null;
    const mapa = new Map();
    const mete = (clave, titulo, color, r) => { if (!mapa.has(clave)) mapa.set(clave, { clave, titulo, color, filas: [] }); mapa.get(clave).filas.push(r); };
    lista.forEach(r => {
      const val = B.crudo(r, g);
      if (g.tipo === 'select') { const o = B.opcion(g, val); mete(o ? o.id : '', o ? o.nombre : 'Sin valor', o && o.color, r); }
      else if (g.tipo === 'checkbox') mete(val ? 'si' : 'no', val ? 'Marcadas' : 'Sin marcar', null, r);
      else { const t = B.texto(r, g).trim(); mete(t || '', t || 'Sin valor', null, r); }
    });
    let grupos = [...mapa.values()];
    if (g.tipo === 'select') { const orden = (g.opciones || []).map(o => o.id); grupos.sort((a, b) => (a.clave === '' ? 1 : 0) - (b.clave === '' ? 1 : 0) || orden.indexOf(a.clave) - orden.indexOf(b.clave)); }
    else grupos.sort((a, b) => (a.clave === '' ? 1 : 0) - (b.clave === '' ? 1 : 0) || a.titulo.localeCompare(b.titulo, 'es', { numeric: true }));
    return grupos;
  };
  S.plegados = S.plegados || new Set();
})();
