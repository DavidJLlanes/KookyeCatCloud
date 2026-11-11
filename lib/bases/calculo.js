'use strict';
// Bases · columnas calculadas: relaciones (títulos de las filas enlazadas), resúmenes sobre ellas y fórmulas.
// Nada de esto se guarda: se calcula al leer la base (con las bases enlazadas) y viaja en `fila.f`.
const { analiza, evalua, hoyAhora, ErrorFormula } = require('./formulas');
const { tieneValor, esCalculada } = require('./valores');

const tituloDe = (b, fila) => {
  const c = b.columns.find(x => x.tipo === 'text') || b.columns.find(x => !esCalculada(x) && x.tipo !== 'relation');
  const v = c && fila.c ? fila.c[c.id] : '';
  return (typeof v === 'string' && v.trim()) || 'Sin título';
};
const nombreOpc = (c, id) => ((c.opciones || []).find(o => o.id === id) || {}).nombre || '';
const errorDe = (e) => ({ e: e instanceof ErrorFormula ? e.codigo : '#ERROR', m: e && e.message ? e.message : 'Error' });

// Bases que hay que leer para calcular `b`: las de sus columnas de relación
const destinosDe = (b) => [...new Set(b.columns.filter(c => c.tipo === 'relation' && c.destino).map(c => c.destino))];
const haySimple = (b) => b.columns.some(c => esCalculada(c) || c.tipo === 'relation');

// destinos: Map id de base → base (incluida la propia, que se añade sola). filasId: solo estas filas (opcional).
function calcula(b, destinos, filasId) {
  const out = new Map();
  if (!haySimple(b)) return out;
  const bases = new Map(destinos || []); bases.set(b.id, b);
  const indice = new Map(); const indiceDe = (id) => { if (!indice.has(id)) { const base = bases.get(id); indice.set(id, base ? new Map(base.rows.map(r => [r.id, r])) : new Map()); } return indice.get(id); };
  const porNombre = new Map(); b.columns.forEach(c => { if (!porNombre.has(c.nombre)) porNombre.set(c.nombre, c); });
  const hoy = hoyAhora();
  const asts = new Map();
  const ast = (c) => { if (!asts.has(c.id)) { try { asts.set(c.id, analiza(c.expr)); } catch (e) { asts.set(c.id, e); } } return asts.get(c.id); };

  const relacionadas = (fila, c) => {
    const base = bases.get(c.destino); if (!base) return [];
    const idx = indiceDe(c.destino);
    return ((fila.c && fila.c[c.id]) || []).map(id => idx.get(id)).filter(Boolean).map(r => ({ r, base }));
  };

  function resumen(fila, c) {
    const rel = b.columns.find(x => x.id === c.relacion && x.tipo === 'relation');
    if (!rel) throw new ErrorFormula('La relación de este resumen ya no existe', '#REF');
    const filas = relacionadas(fila, rel);
    if (c.func === 'cuenta') return filas.length;
    const base = bases.get(rel.destino); const col = base && base.columns.find(x => x.id === c.columna);
    if (!col || esCalculada(col) || col.tipo === 'relation') throw new ErrorFormula('La columna elegida ya no existe', '#REF');
    const vals = filas.map(x => x.r.c && x.r.c[col.id]);
    const llenas = vals.filter(v => tieneValor(col, v));
    const nums = () => llenas.map(Number).filter(Number.isFinite);
    switch (c.func) {
      case 'rellenas': return llenas.length;
      case 'unicos': return new Set(llenas.map(v => (Array.isArray(v) ? v.join('|') : col.tipo === 'select' ? nombreOpc(col, v) : v))).size;
      case 'marcadas': return filas.length ? Math.round(vals.filter(v => v === true).length * 1000 / filas.length) / 10 : 0;
      case 'suma': return nums().reduce((s, x) => s + x, 0);
      case 'media': { const l = nums(); return l.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length * 1e6) / 1e6 : null; }
      case 'min': case 'max': {
        if (col.tipo === 'number') { const l = nums(); return l.length ? Math[c.func](...l) : null; }
        const l = llenas.map(String).sort(); return l.length ? (c.func === 'min' ? l[0] : l[l.length - 1]) : null;
      }
      default: throw new ErrorFormula('Operación de resumen desconocida');
    }
  }

  function fila1(fila) {
    const res = {}; const enCurso = new Set();
    const valor = (c) => {
      if (c.tipo === 'relation') return relacionadas(fila, c).map(x => tituloDe(x.base, x.r));
      if (esCalculada(c)) {
        if (c.id in res) { const v = res[c.id]; if (v && typeof v === 'object' && !Array.isArray(v) && v.e) throw new ErrorFormula(v.m, v.e); return v; }
        if (enCurso.has(c.id)) throw new ErrorFormula('Fórmulas que se usan entre sí (círculo)', '#CICLO');
        enCurso.add(c.id);
        try {
          const v = c.tipo === 'rollup' ? resumen(fila, c) : (() => { const a = ast(c); if (a instanceof Error) throw a; return evalua(a, (n) => { const x = porNombre.get(n); if (!x) throw new ErrorFormula(`No existe la columna «${n}»`, '#REF'); return valor(x); }, hoy); })();
          res[c.id] = v; return v;
        } catch (e) { res[c.id] = errorDe(e); throw e; } finally { enCurso.delete(c.id); }
      }
      const v = fila.c ? fila.c[c.id] : undefined;
      if (c.tipo === 'select') return nombreOpc(c, v);
      if (c.tipo === 'multiselect') return (v || []).map(i => nombreOpc(c, i)).filter(Boolean);
      return v === undefined ? null : v;
    };
    for (const c of b.columns) {
      if (c.tipo === 'relation') res[c.id] = relacionadas(fila, c).map(x => ({ id: x.r.id, t: tituloDe(x.base, x.r) }));
      else if (esCalculada(c) && !(c.id in res)) { try { valor(c); } catch (e) { res[c.id] = errorDe(e); } }
    }
    return res;
  }

  for (const fila of b.rows) { if (!filasId || filasId.has(fila.id)) out.set(fila.id, fila1(fila)); }
  return out;
}

module.exports = { calcula, destinosDe, haySimple, tituloDe };
