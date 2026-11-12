'use strict';
// Bases · relaciones de doble sentido: una columna de relación con `inversa` tiene una gemela en la base enlazada
// (también de relación, con `inversa` apuntando a ella). Al editar una, la otra se mantiene sola.
const { newId, HttpError } = require('../nucleo/store');
const { LIM, RE_ID } = require('./constantes');

const norm = (s) => String(s).toLocaleLowerCase('es');
function nombreLibre(cols, deseado) {
  const usados = new Set(cols.map(c => norm(c.nombre))); const ini = String(deseado).slice(0, 52) || 'Relación';
  let n = ini, i = 2; while (usados.has(norm(n))) n = `${ini} ${i++}`;
  return n;
}

// Prepara el esquema de la base `x` (ya normalizado en `cols`): crea las gemelas pedidas con `doble: true`, quita las vínculos
// de las columnas que se han borrado o con `doble: false`. Devuelve { ops, despues }:
//  - ops: trabajo pendiente en OTRAS bases (se aplica con `aplica` cuando `x` ya está guardada)
//  - despues(x): en relaciones consigo misma, rellena la gemela cuando las filas ya tienen las celdas normalizadas
function preparaEsquema({ x, cols, antes, todas }) {
  const ops = []; const propios = [];
  for (const col of cols) {
    if (col.tipo !== 'relation') { delete col.inversa; delete col.doble; continue; }
    const previa = antes.find(p => p.id === col.id);
    const quiere = { doble: col.doble }; delete col.doble;
    let inversaPrevia = previa && previa.inversa;
    if (inversaPrevia && previa.destino !== col.destino) { ops.push({ tipo: 'desvincula', base: previa.destino, col: inversaPrevia, hacia: col.id }); inversaPrevia = ''; }
    if (inversaPrevia && quiere && quiere.doble === false) {
      // Se deja de sincronizar: las dos columnas siguen existiendo como relaciones normales
      ops.push({ tipo: 'desvincula', base: col.destino, col: inversaPrevia, hacia: col.id });
      delete col.inversa; continue;
    }
    if (inversaPrevia) { col.inversa = inversaPrevia; continue; }
    delete col.inversa;
    if (!(quiere && quiere.doble === true)) continue;
    // Nueva gemela
    if (col.destino === x.id) {
      if (cols.length + propios.length >= LIM.COLS) throw new HttpError(400, `«${col.nombre}»: no caben más columnas para la relación de doble sentido`);
      const gemela = { id: newId(), nombre: nombreLibre([...cols, ...propios], `${col.nombre} (inversa)`), tipo: 'relation', destino: x.id, inversa: col.id };
      col.inversa = gemela.id; propios.push(gemela);
    } else {
      const d = todas.get(col.destino);
      if (!d) throw new HttpError(400, `«${col.nombre}»: la base enlazada no existe`);
      if (d.columns.length >= LIM.COLS) throw new HttpError(400, `«${col.nombre}»: la base enlazada ya no admite más columnas`);
      const id = newId(); col.inversa = id;
      ops.push({ tipo: 'crea', base: col.destino, col: id, nombre: `${x.name}`, hacia: col.id, origen: x.id,
        pares: x.rows.map(r => [r.id, ((r.c && r.c[col.id]) || []).slice()]).filter(p => p[1].length) });
    }
  }
  // Columnas que ya no están: sus gemelas quedan como relaciones normales
  for (const p of antes) if (p.tipo === 'relation' && p.inversa && !cols.some(c => c.id === p.id)) {
    ops.push({ tipo: 'desvincula', base: p.destino, col: p.inversa, hacia: p.id });
  }
  cols.push(...propios);
  const despues = (b) => {
    for (const g of propios) {
      const origen = b.columns.find(c => c.id === g.inversa); if (!origen) continue;
      const porId = new Map(b.rows.map(r => [r.id, r]));
      for (const r of b.rows) for (const t of ((r.c && r.c[origen.id]) || [])) {
        const f = porId.get(t); if (!f) continue;
        f.c = f.c || {}; f.c[g.id] = Array.isArray(f.c[g.id]) ? f.c[g.id] : [];
        if (!f.c[g.id].includes(r.id) && f.c[g.id].length < LIM.RELACION) f.c[g.id].push(r.id);
      }
    }
  };
  return { ops, despues, nuevas: propios.length + ops.filter(o => o.tipo === 'crea').length };
}

// Aplica el trabajo pendiente en otras bases. `mutar(id, fn)` guarda la base `id` con la función `fn(base)`.
async function aplica(ops, mutar) {
  for (const op of ops) {
    if (op.tipo === 'desvincula') {
      if (!RE_ID.test(op.base)) continue;
      try { await mutar(op.base, (d) => { const c = d.columns.find(y => y.id === op.col && y.inversa === op.hacia); if (c) delete c.inversa; }); } catch { /* la otra base ya no existe */ }
    } else if (op.tipo === 'crea') {
      await mutar(op.base, (d) => {
        if (d.columns.length >= LIM.COLS) return;
        d.columns.push({ id: op.col, nombre: nombreLibre(d.columns, op.nombre), tipo: 'relation', destino: op.origen, inversa: op.hacia });
        const porId = new Map(d.rows.map(r => [r.id, r]));
        d.rows.forEach(r => { r.c = r.c || {}; r.c[op.col] = []; });
        for (const [rid, ids] of op.pares) for (const t of ids) {
          const f = porId.get(t); if (f && f.c[op.col].length < LIM.RELACION && !f.c[op.col].includes(rid)) f.c[op.col].push(rid);
        }
      });
    }
  }
}

// Cambios en las filas de `b` (antes → después) que hay que reflejar en las bases enlazadas por columnas con gemela.
// antes/despues: Map filaId → celdas `c`. Devuelve operaciones agrupadas por base: { base, col, fila, add[], quita[] }
function difiere(b, antes, despues) {
  const ops = [];
  for (const col of b.columns) {
    if (col.tipo !== 'relation' || !col.inversa) continue;
    for (const [rid, nuevo] of despues) {
      const a = new Set(((antes.get(rid) || {})[col.id]) || []); const d = new Set(nuevo[col.id] || []);
      for (const t of d) if (!a.has(t)) ops.push({ base: col.destino, col: col.inversa, fila: t, mueve: rid, quita: false });
      for (const t of a) if (!d.has(t)) ops.push({ base: col.destino, col: col.inversa, fila: t, mueve: rid, quita: true });
    }
  }
  return ops;
}
async function reflejaFilas(ops, mutar) {
  const porBase = new Map(); for (const o of ops) { if (!porBase.has(o.base)) porBase.set(o.base, []); porBase.get(o.base).push(o); }
  for (const [base, lista] of porBase) {
    if (!RE_ID.test(base)) continue;
    try {
      await mutar(base, (d) => {
        const porId = new Map(d.rows.map(r => [r.id, r]));
        for (const o of lista) {
          const f = porId.get(o.fila); if (!f || !d.columns.some(c => c.id === o.col && c.inversa)) continue;
          f.c = f.c || {}; const arr = Array.isArray(f.c[o.col]) ? f.c[o.col] : [];
          const i = arr.indexOf(o.mueve);
          if (o.quita) { if (i >= 0) arr.splice(i, 1); } else if (i < 0 && arr.length < LIM.RELACION) arr.push(o.mueve);
          f.c[o.col] = arr; f.updatedAt = Date.now();
        }
      });
    } catch { /* la base enlazada ya no existe */ }
  }
}

module.exports = { preparaEsquema, aplica, difiere, reflejaFilas };
