'use strict';
// Bases · normalización del esquema: opciones, columnas (con tipos calculados y cambio de tipo) y vistas.
const { cleanStr, newId, HttpError } = require('../nucleo/store');
const { TIPOS, TIPOS_DATO, VISTAS, OPS, FUNC_RESUMEN, FUNC_TOTAL, LIM, COLORES, RE_ID, RE_COLOR } = require('./constantes');
const { esCalculada } = require('./valores');
const { compila, renombraRef, ErrorFormula } = require('./formulas');

function limpiaOpciones(arr, prev = []) {
  const vistos = new Set(); const out = [];
  for (const o of (Array.isArray(arr) ? arr : []).slice(0, LIM.OPC)) {
    const nombre = cleanStr(o && o.nombre, 40).trim(); if (!nombre) continue;
    let id = RE_ID.test(String(o && o.id)) ? o.id : (prev.find(p => p.nombre === nombre) || {}).id || newId();
    if (vistos.has(id)) id = newId();
    vistos.add(id);
    out.push({ id, nombre, color: RE_COLOR.test(String(o && o.color)) ? o.color : COLORES[out.length % COLORES.length] });
  }
  return out;
}

// ctx: { bases: Map id → base de todas las del usuario, selfId }. Devuelve { cols, cambios } (cambios: columnas que cambian de tipo).
function limpiaColumnas(arr, prev = [], ctx = {}) {
  const vistos = new Set(); const nombres = new Set(); const cols = []; const cambios = []; const renombres = [];
  for (const c of (Array.isArray(arr) ? arr : []).slice(0, LIM.COLS)) {
    const nombre = cleanStr(c && c.nombre, 60).trim(); if (!nombre) continue;
    const antes = RE_ID.test(String(c && c.id)) ? prev.find(p => p.id === c.id) : null;
    let id = antes ? antes.id : newId(); if (vistos.has(id)) id = newId(); vistos.add(id);
    if (nombres.has(nombre.toLocaleLowerCase('es'))) throw new HttpError(400, `Hay dos columnas que se llaman «${nombre}»: cada una necesita un nombre distinto`);
    nombres.add(nombre.toLocaleLowerCase('es'));
    let tipo = TIPOS.includes(c.tipo) ? c.tipo : (antes ? antes.tipo : 'text');
    if (antes && tipo !== antes.tipo) {
      if (!TIPOS_DATO.includes(tipo) || !TIPOS_DATO.includes(antes.tipo)) throw new HttpError(400, `«${nombre}»: una columna de fórmula, relación o resumen no cambia de tipo ni se convierte en otra; crea una nueva`);
      cambios.push({ id, nombre, de: antes, a: tipo });
    } else if (antes && !TIPOS_DATO.includes(tipo)) tipo = antes.tipo;
    if (antes && antes.nombre !== nombre) renombres.push([antes.nombre, nombre]);
    const col = { id, nombre, tipo };
    if (tipo === 'select' || tipo === 'multiselect') col.opciones = limpiaOpciones(c.opciones, antes ? antes.opciones : []);
    if (tipo === 'relation') {
      const destino = RE_ID.test(String(c.destino)) ? c.destino : '';
      if (antes && antes.destino === destino) col.destino = destino;      // si la base enlazada ya no existe, la columna se conserva
      else if (destino && ctx.bases && (ctx.bases.has(destino) || destino === ctx.selfId)) col.destino = destino;
      else throw new HttpError(400, `«${nombre}»: elige la base con la que se relaciona`);
      if (antes && antes.inversa && antes.destino === col.destino) col.inversa = antes.inversa;
      if (c.doble === true || c.doble === false) col.doble = c.doble;      // petición: la procesa doble.js al guardar el esquema
    }
    if (tipo === 'formula') col.expr = String(c.expr === undefined && antes ? antes.expr : c.expr || '');
    if (tipo === 'rollup') { col.relacion = String(c.relacion || ''); col.columna = RE_ID.test(String(c.columna)) ? c.columna : ''; col.func = FUNC_RESUMEN.includes(c.func) ? c.func : 'cuenta'; }
    cols.push(col);
  }
  if (!cols.length) throw new HttpError(400, 'La base necesita al menos una columna');
  if (!cols.some(c => !esCalculada(c) && c.tipo !== 'relation')) throw new HttpError(400, 'La base necesita al menos una columna que no sea calculada ni de relación');
  // Segunda pasada: lo que depende de otras columnas (renombradas, ya con id)
  const idsRel = new Map(cols.filter(c => c.tipo === 'relation').flatMap(c => [[c.id, c], [c.nombre, c]]));
  const todos = new Set(cols.map(c => c.nombre));
  for (const c of cols) {
    if (c.tipo === 'formula') {
      for (const [v, n] of renombres) c.expr = renombraRef(c.expr, v, n);
      try { c.expr = compila(c.expr, todos); } catch (e) { if (e instanceof ErrorFormula) throw new HttpError(400, `«${c.nombre}»: ${e.message}`); throw e; }
    }
    if (c.tipo === 'rollup') {
      const rel = idsRel.get(c.relacion); if (!rel) throw new HttpError(400, `«${c.nombre}»: elige la columna de relación sobre la que se resume`);
      c.relacion = rel.id;
      if (c.func !== 'cuenta') {
        const destino = ctx.bases && (rel.destino === ctx.selfId ? { columns: cols } : ctx.bases.get(rel.destino));
        const t = destino && destino.columns.find(x => x.id === c.columna);
        if (!t || esCalculada(t) || t.tipo === 'relation') throw new HttpError(400, `«${c.nombre}»: elige la columna de la base enlazada que se resume`);
        if ((c.func === 'suma' || c.func === 'media') && t.tipo !== 'number') throw new HttpError(400, `«${c.nombre}»: sumar o promediar solo sirve con columnas de número`);
        if (c.func === 'marcadas' && t.tipo !== 'checkbox') throw new HttpError(400, `«${c.nombre}»: el porcentaje de marcadas solo sirve con columnas de casilla`);
      }
    }
  }
  return { cols, cambios };
}

function limpiaVistas(arr, cols) {
  const ids = new Set(cols.map(c => c.id)); const de = (tipos) => cols.filter(c => tipos.includes(c.tipo));
  const vistos = new Set(); const out = [];
  for (const v of (Array.isArray(arr) ? arr : []).slice(0, LIM.VISTAS)) {
    const nombre = cleanStr(v && v.nombre, 40).trim() || 'Vista';
    const tipo = VISTAS.includes(v && v.tipo) ? v.tipo : 'table';
    let id = RE_ID.test(String(v && v.id)) ? v.id : newId(); if (vistos.has(id)) id = newId(); vistos.add(id);
    const vista = { id, nombre, tipo, filtros: [], unir: v && v.unir === 'o' ? 'o' : 'y', ordenes: [], ocultas: [] };
    const elige = (valor, tipos) => { const ok = de(tipos); return ok.some(c => c.id === valor) ? valor : (ok[0] ? ok[0].id : ''); };
    if (tipo === 'kanban') vista.agrupa = elige(v.agrupa, ['select']);
    if (tipo === 'calendar' || tipo === 'timeline') vista.fecha = elige(v.fecha, ['date']);
    if (tipo === 'timeline') vista.fechaFin = de(['date']).some(c => c.id === v.fechaFin && c.id !== vista.fecha) ? v.fechaFin : '';
    // Tabla: agrupar por una columna y fila de totales (función por columna)
    if (tipo === 'table') {
      vista.agrupaPor = ids.has(v.agrupaPor) ? v.agrupaPor : '';
      vista.totales = {};
      for (const [k, f] of Object.entries(v.totales && typeof v.totales === 'object' ? v.totales : {})) if (ids.has(k) && FUNC_TOTAL.includes(f)) vista.totales[k] = f;
    }
    if (tipo === 'gallery') vista.portada = de(['file']).some(c => c.id === v.portada) ? v.portada : '';
    // Filtros y orden: varios por vista (las vistas guardadas antes traen uno solo, en «filtro» y «orden»)
    const filtros = Array.isArray(v && v.filtros) ? v.filtros : (v && v.filtro ? [v.filtro] : []);
    for (const f of filtros.slice(0, LIM.FILTROS)) if (f && ids.has(f.col) && OPS.includes(f.op)) vista.filtros.push({ col: f.col, op: f.op, valor: cleanStr(f.valor, 100) });
    const ordenes = Array.isArray(v && v.ordenes) ? v.ordenes : (v && v.orden ? [v.orden] : []);
    for (const o of ordenes.slice(0, LIM.ORDENES)) if (o && ids.has(o.col) && !vista.ordenes.some(x => x.col === o.col)) vista.ordenes.push({ col: o.col, dir: o.dir === 'desc' ? 'desc' : 'asc' });
    vista.ocultas = [...new Set((Array.isArray(v && v.ocultas) ? v.ocultas : []).filter(x => ids.has(x)))].slice(0, LIM.COLS);
    out.push(vista);
  }
  if (!out.length) out.push({ id: newId(), nombre: 'Tabla', tipo: 'table', filtros: [], unir: 'y', ordenes: [], ocultas: [] });
  return out;
}

module.exports = { limpiaOpciones, limpiaColumnas, limpiaVistas };
