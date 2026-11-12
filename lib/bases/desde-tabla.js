'use strict';
// Bases · crear una base (o añadir filas a una) a partir de una tabla ya tipada, como la que sale de un CSV importado.
// columnas: [{ nombre, tipo, opciones? }] · filas: matrices alineadas con las columnas (selección = nombre de la opción).
const { newId } = require('../nucleo/store');
const { LIM } = require('./constantes');
const { limpiaColumnas } = require('./columnas');
const { limpiaCeldas, vacioDe, esCalculada } = require('./valores');

const TIPOS_OK = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url', 'email', 'phone'];

function cuerpoFila(cols, fila, indices) {
  const c = {};
  cols.forEach((col, k) => {
    const v = fila[indices ? indices[k] : k];
    if (col.tipo === 'select') c[col.id] = ((col.opciones || []).find(o => o.nombre === String(v == null ? '' : v).trim()) || {}).id || '';
    else if (col.tipo === 'multiselect') c[col.id] = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[;,|]/)).map(x => ((col.opciones || []).find(o => o.nombre === String(x).trim()) || {}).id).filter(Boolean);
    else c[col.id] = v == null ? '' : v;
  });
  return c;
}

/** Nueva base completa (sin guardar). */
function construyeBase({ nombre, icono, columnas, filas }) {
  const esquema = columnas.slice(0, LIM.COLS).map(c => ({ nombre: c.nombre, tipo: TIPOS_OK.includes(c.tipo) ? c.tipo : 'text', opciones: (c.opciones || []).map(n => ({ nombre: n })) }));
  const { cols } = limpiaColumnas(esquema, [], {});
  const vacias = Object.fromEntries(cols.filter(x => !esCalculada(x)).map(x => [x.id, vacioDe(x)]));
  const rows = filas.slice(0, LIM.FILAS).map(f => ({ id: newId(), c: limpiaCeldas(cols, cuerpoFila(cols, f), vacias, true), createdAt: Date.now(), updatedAt: Date.now() }));
  const views = [{ id: newId(), nombre: 'Tabla', tipo: 'table' }];
  const ahora = Date.now();
  return { id: newId(), name: String(nombre || 'Base importada').slice(0, 80), icon: icono || '🗂️', columns: cols, views, rows, stats: { moves: 0 }, createdAt: ahora, updatedAt: ahora };
}

/** Añade filas a una base que ya existe: `destino[k]` = columna de la base que recibe la columna k de la tabla (o -1 para ignorarla). */
function anadeFilasA(base, filas, destino) {
  const usadas = destino.map((d, k) => [base.columns[d], k]).filter(([c]) => c && !esCalculada(c) && c.tipo !== 'relation' && c.tipo !== 'file');
  const cols = usadas.map(([c]) => c), indices = usadas.map(([, k]) => k);
  const hueco = Math.max(0, LIM.FILAS - base.rows.length);
  const vacias = Object.fromEntries(base.columns.filter(x => !esCalculada(x)).map(x => [x.id, vacioDe(x)]));
  const nuevas = filas.slice(0, hueco).map(f => ({ id: newId(), c: limpiaCeldas(base.columns, cuerpoFila(cols, f, indices), { ...vacias }, true), createdAt: Date.now(), updatedAt: Date.now() }));
  base.rows.push(...nuevas);
  return { anadidas: nuevas.length, omitidas: filas.length - nuevas.length };
}

module.exports = { construyeBase, anadeFilasA };
