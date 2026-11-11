'use strict';
// Bases · contadores para la gamificación (sobre todas las bases del usuario).
const { esCalculada } = require('./valores');

function resumenBases(bases) {
  let plant = 0, usos = 0;
  let filas = 0, columnas = 0, mov = 0, hechas = 0, tipos = 0, maxFilas = 0, calc = 0, rel = 0, vistaTipos = 0;
  for (const b of bases) {
    plant += (b.plantillas || []).length; usos += (b.stats && b.stats.plantillaUsos) || 0;
    filas += b.rows.length; columnas += b.columns.length; mov += (b.stats && b.stats.moves) || 0;
    const cb = b.columns.filter(c => c.tipo === 'checkbox');
    for (const r of b.rows) for (const c of cb) if (r.c && r.c[c.id] === true) hechas++;
    tipos = Math.max(tipos, new Set(b.columns.map(c => c.tipo)).size);
    maxFilas = Math.max(maxFilas, b.rows.length);
    calc += b.columns.filter(esCalculada).length; rel += b.columns.filter(c => c.tipo === 'relation').length;
    vistaTipos = Math.max(vistaTipos, new Set((b.views || []).map(v => v.tipo)).size);
  }
  return { bases: bases.length, db_bases: bases.length, db_filas: filas, db_columnas: columnas, db_mov: mov, db_hechas: hechas, db_tipos: tipos, db_maxfilas: maxFilas, db_calc: calc, db_plantillas: plant, db_usos: usos, db_rel: rel, db_vistatipos: vistaTipos };
}

module.exports = { resumenBases };
