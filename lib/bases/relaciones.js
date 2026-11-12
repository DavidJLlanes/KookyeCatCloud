'use strict';
// Bases · lectura de las bases enlazadas (relaciones y resúmenes) y depuración de los enlaces que se guardan.
const fs = require('fs');
const path = require('path');
const { readJson, kccDir } = require('../nucleo/store');
const { RE_ID } = require('./constantes');
const { calcula, destinosDe, haySimple } = require('./calculo');

// Todas las bases del usuario (las que se pueden leer), como Map id → base
async function todasLasBases(userRoot, user) {
  const dir = kccDir(userRoot(user), 'bases'); const m = new Map();
  let nombres = []; try { nombres = (await fs.promises.readdir(dir)).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch { return m; }
  for (const f of nombres) { const b = await readJson(path.join(dir, f), null); if (b && Array.isArray(b.rows) && Array.isArray(b.columns)) m.set(b.id, b); }
  return m;
}
// Solo las bases que `b` enlaza (para no leerlas todas en cada petición)
async function basesEnlazadas(leer, b) {
  const m = new Map();
  for (const id of destinosDe(b)) { if (id === b.id || !RE_ID.test(id)) continue; const x = await leer(id); if (x) m.set(id, x); }
  return m;
}
// Columnas calculadas de la base (o solo de algunas filas): Map fila → { columna: valor }
async function calculo(leer, b, filasId) { return haySimple(b) ? calcula(b, await basesEnlazadas(leer, b), filasId) : new Map(); }
const conF = (r, calc) => (calc.has(r.id) ? { ...r, f: calc.get(r.id) } : r);
const baseConCalculo = (b, calc) => (calc.size ? { ...b, rows: b.rows.map(r => conF(r, calc)) } : b);

// Quita de los valores de relación las filas que no existen en la base enlazada
async function depuraRelaciones(leer, b, c) {
  if (!c) return c;
  const out = { ...c };
  for (const col of b.columns) {
    if (col.tipo !== 'relation' || !(col.id in out) || !Array.isArray(out[col.id])) continue;
    const destino = col.destino === b.id ? b : await leer(col.destino);
    const ok = new Set(destino ? destino.rows.map(r => r.id) : []);
    out[col.id] = out[col.id].filter(id => ok.has(id));
  }
  return out;
}

module.exports = { todasLasBases, calculo, conF, baseConCalculo, depuraRelaciones };
