'use strict';
// Bases · exportación a CSV (separado por «;», con BOM para Excel en español). Incluye el valor de las columnas calculadas.
const { esCalculada } = require('./valores');

const csvCelda = (v) => {
  // Números sin protección (un -5 es un número, no una fórmula) y con coma decimal
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).replace('.', ',');
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // evita fórmulas en hojas de cálculo
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// calc: resultado de calcula() (Map fila → {columna: valor}); sin él, las columnas calculadas salen vacías
function aCsv(b, calc) {
  const opc = (c, v) => ((c.opciones || []).find(o => o.id === v) || {}).nombre || '';
  const valor = (c, r) => {
    const v = (r.c || {})[c.id];
    if (esCalculada(c) || c.tipo === 'relation') {
      const f = calc && calc.get(r.id) ? calc.get(r.id)[c.id] : undefined;
      if (c.tipo === 'relation') return (Array.isArray(f) ? f : []).map(x => x.t);
      return f && typeof f === 'object' && f.e ? f.e : f === null || f === undefined ? '' : f;
    }
    if (c.tipo === 'select') return opc(c, v);
    if (c.tipo === 'multiselect') return (Array.isArray(v) ? v : []).map(i => opc(c, i)).filter(Boolean);
    if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
    return v;
  };
  const filas = [b.columns.map(c => csvCelda(c.nombre)).join(';')];
  for (const r of b.rows) filas.push(b.columns.map(c => csvCelda(valor(c, r))).join(';'));
  return '﻿' + filas.join('\r\n');
}

module.exports = { aCsv };
