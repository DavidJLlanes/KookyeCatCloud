'use strict';

// Bases de datos propias (al estilo Notion/AppFlowy): columnas definidas por ti y vistas de tabla o tablero Kanban.
// Cada base es su propio JSON: <raíz>/.kcc/bases/<id>.json  (columnas, vistas y filas juntas).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const TIPOS = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url'];
const VISTAS = ['table', 'kanban'];
const OPS = ['contains', 'equals', 'not', 'checked', 'unchecked', 'empty', 'filled', 'gt', 'lt'];
const MAX_BASES = 60, MAX_COLS = 30, MAX_FILAS = 5000, MAX_OPC = 40, MAX_VISTAS = 12;
const COLORES = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ID = /^[a-f0-9]{16}$/;
const RE_COLOR = /^#[0-9a-fA-F]{6}$/;

const opc = (nombre, i) => ({ nombre, color: COLORES[(i + 1) % COLORES.length] });
const PLANTILLAS = {
  vacia: { nombre: 'Base vacía', icono: '🗂️', desc: 'Empieza solo con una columna de nombre', columnas: [{ nombre: 'Nombre', tipo: 'text' }], vistas: [{ nombre: 'Tabla', tipo: 'table' }] },
  proyectos: {
    nombre: 'Proyectos', icono: '🚀', desc: 'Tablero con estados, prioridad y fecha límite',
    columnas: [{ nombre: 'Nombre', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Pendiente', 'En curso', 'Hecho'] }, { nombre: 'Prioridad', tipo: 'select', opciones: ['Baja', 'Media', 'Alta'] }, { nombre: 'Fecha límite', tipo: 'date' }, { nombre: 'Notas', tipo: 'text' }],
    vistas: [{ nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }, { nombre: 'Tabla', tipo: 'table' }],
  },
  tareas: {
    nombre: 'Tareas', icono: '✅', desc: 'Lista de tareas con casilla y estado',
    columnas: [{ nombre: 'Tarea', tipo: 'text' }, { nombre: 'Hecha', tipo: 'checkbox' }, { nombre: 'Estado', tipo: 'select', opciones: ['Por hacer', 'Haciendo', 'Hecho'] }, { nombre: 'Vence', tipo: 'date' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }],
  },
  libros: {
    nombre: 'Libros', icono: '📚', desc: 'Lo que lees, con nota y géneros',
    columnas: [{ nombre: 'Título', tipo: 'text' }, { nombre: 'Autor', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Por leer', 'Leyendo', 'Leído'] }, { nombre: 'Nota', tipo: 'number' }, { nombre: 'Géneros', tipo: 'multiselect', opciones: ['Novela', 'Ensayo', 'Fantasía', 'Ciencia ficción', 'Técnico'] }, { nombre: 'Terminado', tipo: 'date' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Tablero', tipo: 'kanban', agrupa: 'Estado' }],
  },
  gastos: {
    nombre: 'Gastos', icono: '💶', desc: 'Control sencillo de gastos',
    columnas: [{ nombre: 'Concepto', tipo: 'text' }, { nombre: 'Importe', tipo: 'number' }, { nombre: 'Fecha', tipo: 'date' }, { nombre: 'Categoría', tipo: 'select', opciones: ['Casa', 'Comida', 'Ocio', 'Transporte', 'Trabajo'] }, { nombre: 'Pagado', tipo: 'checkbox' }],
    vistas: [{ nombre: 'Tabla', tipo: 'table' }, { nombre: 'Por categoría', tipo: 'kanban', agrupa: 'Categoría' }],
  },
  clientes: {
    nombre: 'Clientes', icono: '🤝', desc: 'Seguimiento comercial',
    columnas: [{ nombre: 'Nombre', tipo: 'text' }, { nombre: 'Empresa', tipo: 'text' }, { nombre: 'Estado', tipo: 'select', opciones: ['Contacto', 'Propuesta', 'Cliente', 'Perdido'] }, { nombre: 'Email', tipo: 'text' }, { nombre: 'Web', tipo: 'url' }, { nombre: 'Próxima acción', tipo: 'date' }],
    vistas: [{ nombre: 'Embudo', tipo: 'kanban', agrupa: 'Estado' }, { nombre: 'Tabla', tipo: 'table' }],
  },
};

const dia = (v) => (RE_DIA.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : '');
const urlOk = (v) => { const s = cleanStr(v, 500).trim(); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; };

// ---------- Normalización ----------
function limpiaOpciones(arr, prev = []) {
  const vistos = new Set(); const out = [];
  for (const o of (Array.isArray(arr) ? arr : []).slice(0, MAX_OPC)) {
    const nombre = cleanStr(o && o.nombre, 40).trim(); if (!nombre) continue;
    let id = RE_ID.test(String(o && o.id)) ? o.id : (prev.find(p => p.nombre === nombre) || {}).id || newId();
    if (vistos.has(id)) id = newId();
    vistos.add(id);
    out.push({ id, nombre, color: RE_COLOR.test(String(o && o.color)) ? o.color : COLORES[out.length % COLORES.length] });
  }
  return out;
}
function limpiaColumnas(arr, prev = []) {
  const vistos = new Set(); const out = [];
  for (const c of (Array.isArray(arr) ? arr : []).slice(0, MAX_COLS)) {
    const nombre = cleanStr(c && c.nombre, 60).trim(); if (!nombre) continue;
    const antes = RE_ID.test(String(c && c.id)) ? prev.find(p => p.id === c.id) : null;
    let id = antes ? antes.id : newId(); if (vistos.has(id)) id = newId(); vistos.add(id);
    const tipo = antes ? antes.tipo : (TIPOS.includes(c.tipo) ? c.tipo : 'text');     // el tipo de una columna existente no cambia
    const col = { id, nombre, tipo };
    if (tipo === 'select' || tipo === 'multiselect') col.opciones = limpiaOpciones(c.opciones, antes ? antes.opciones : []);
    out.push(col);
  }
  if (!out.length) throw new HttpError(400, 'La base necesita al menos una columna');
  return out;
}
function limpiaVistas(arr, cols) {
  const ids = new Set(cols.map(c => c.id)); const vistos = new Set(); const out = [];
  for (const v of (Array.isArray(arr) ? arr : []).slice(0, MAX_VISTAS)) {
    const nombre = cleanStr(v && v.nombre, 40).trim() || 'Vista';
    const tipo = VISTAS.includes(v && v.tipo) ? v.tipo : 'table';
    let id = RE_ID.test(String(v && v.id)) ? v.id : newId(); if (vistos.has(id)) id = newId(); vistos.add(id);
    const vista = { id, nombre, tipo, orden: null, filtro: null };
    if (tipo === 'kanban') {
      const sel = cols.filter(c => c.tipo === 'select');
      vista.agrupa = ids.has(v.agrupa) && sel.some(c => c.id === v.agrupa) ? v.agrupa : (sel[0] ? sel[0].id : '');
    }
    if (v && v.orden && ids.has(v.orden.col)) vista.orden = { col: v.orden.col, dir: v.orden.dir === 'desc' ? 'desc' : 'asc' };
    if (v && v.filtro && ids.has(v.filtro.col) && OPS.includes(v.filtro.op)) vista.filtro = { col: v.filtro.col, op: v.filtro.op, valor: cleanStr(v.filtro.valor, 100) };
    out.push(vista);
  }
  if (!out.length) out.push({ id: newId(), nombre: 'Tabla', tipo: 'table', orden: null, filtro: null });
  return out;
}
// Valida el valor de una celda según el tipo de su columna; undefined = descartar
function valorCelda(col, v) {
  switch (col.tipo) {
    case 'text': return cleanStr(v, 2000);
    case 'number': { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.max(-1e12, Math.min(1e12, n)) : null; }
    case 'date': return dia(v);
    case 'checkbox': return v === true || v === 'true' || v === 1;
    case 'url': return urlOk(v);
    case 'select': return (col.opciones || []).some(o => o.id === v) ? v : '';
    case 'multiselect': { const ok = new Set((col.opciones || []).map(o => o.id)); return [...new Set((Array.isArray(v) ? v : []).filter(x => ok.has(x)))].slice(0, MAX_OPC); }
    default: return undefined;
  }
}
function limpiaCeldas(cols, c, prev = {}) {
  const out = { ...prev };
  for (const col of cols) {
    if (c && Object.prototype.hasOwnProperty.call(c, col.id)) out[col.id] = valorCelda(col, c[col.id]);
  }
  for (const k of Object.keys(out)) if (!cols.some(x => x.id === k)) delete out[k];
  return out;
}
const vacioDe = (col) => (col.tipo === 'checkbox' ? false : col.tipo === 'multiselect' ? [] : col.tipo === 'number' ? null : '');
const tieneValor = (col, v) => (col.tipo === 'checkbox' ? v === true : Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined);

function desdePlantilla(t) {
  const cols = t.columnas.map(c => ({ id: newId(), nombre: c.nombre, tipo: c.tipo, ...(c.opciones ? { opciones: c.opciones.map(opc).map(o => ({ id: newId(), ...o })) } : {}) }));
  const vistas = t.vistas.map(v => ({ id: newId(), nombre: v.nombre, tipo: v.tipo, orden: null, filtro: null, ...(v.agrupa ? { agrupa: (cols.find(c => c.nombre === v.agrupa) || {}).id } : {}) }));
  return { cols, vistas };
}

// Resumen para la gamificación (sobre todas las bases del usuario)
function resumenBases(bases) {
  let filas = 0, columnas = 0, mov = 0, hechas = 0, tipos = 0, maxFilas = 0;
  for (const b of bases) {
    filas += b.rows.length; columnas += b.columns.length; mov += (b.stats && b.stats.moves) || 0;
    const cb = b.columns.filter(c => c.tipo === 'checkbox');
    for (const r of b.rows) for (const c of cb) if (r.c && r.c[c.id] === true) hechas++;
    tipos = Math.max(tipos, new Set(b.columns.map(c => c.tipo)).size);
    maxFilas = Math.max(maxFilas, b.rows.length);
  }
  return { bases: bases.length, db_bases: bases.length, db_filas: filas, db_columnas: columnas, db_mov: mov, db_hechas: hechas, db_tipos: tipos, db_maxfilas: maxFilas };
}

const csvCelda = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // evita fórmulas en hojas de cálculo
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV de una base (separado por «;», con BOM para Excel)
function aCsv(b) {
  const op = (c, v) => (c.tipo === 'select' ? ((c.opciones || []).find(o => o.id === v) || {}).nombre || '' : c.tipo === 'multiselect' ? (Array.isArray(v) ? v : []).map(i => ((c.opciones || []).find(o => o.id === i) || {}).nombre).filter(Boolean) : c.tipo === 'checkbox' ? (v ? 'Sí' : 'No') : v);
  const filas = [b.columns.map(c => csvCelda(c.nombre)).join(';')];
  for (const r of b.rows) filas.push(b.columns.map(c => csvCelda(op(c, (r.c || {})[c.id]))).join(';'));
  return '﻿' + filas.join('\r\n');
}

function createBases({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const json = express.json({ limit: '512kb' });
  const dir = (user) => kccDir(userRoot(user), 'bases');
  const archivo = (user, id) => path.join(dir(user), `${id}.json`);
  const validId = (id) => RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper la base */ } };

  async function lista(user) {
    let nombres = [];
    try { nombres = (await fsp.readdir(dir(user))).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch { return []; }
    const out = [];
    for (const f of nombres) { const b = await readJson(path.join(dir(user), f), null); if (b && Array.isArray(b.rows) && Array.isArray(b.columns)) out.push(b); }
    return out;
  }
  const leer = async (user, id) => { if (!validId(id)) throw new HttpError(404, 'No existe'); const b = await readJson(archivo(user, id), null); if (!b || !Array.isArray(b.rows)) throw new HttpError(404, 'No existe'); return b; };
  const mutar = (user, id, fn) => { if (!validId(id)) throw new HttpError(404, 'No existe'); return updateJson(archivo(user, id), () => null, (b) => { if (!b || !Array.isArray(b.rows)) throw new HttpError(404, 'No existe'); const r = fn(b); b.updatedAt = Date.now(); return r === undefined ? b : r; }); };
  const resumenCard = (b) => ({ id: b.id, nombre: b.name, icono: b.icon, filas: b.rows.length, columnas: b.columns.length, actualizada: b.updatedAt });

  router.get('/', async (req, res) => {
    try {
      const bases = (await lista(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ bases: bases.map(resumenCard), plantillas: Object.entries(PLANTILLAS).map(([id, t]) => ({ id, nombre: t.nombre, icono: t.icono, desc: t.desc })) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      if ((await lista(req.user)).length >= MAX_BASES) throw new HttpError(400, 'Has llegado al máximo de bases');
      const t = PLANTILLAS[req.body && req.body.plantilla] || PLANTILLAS.vacia;
      const { cols, vistas } = desdePlantilla(t);
      const nombre = cleanStr(req.body && req.body.nombre, 80).trim() || t.nombre;
      const icono = cleanStr(req.body && req.body.icono, 8).trim() || t.icono;
      const b = { id: newId(), name: nombre, icon: icono, columns: cols, views: vistas, rows: [], stats: { moves: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
      await writeJson(archivo(req.user, b.id), b);
      if (registrarActividad) registrarActividad(req, 'bases', { accion: 'crear', nombre });
      cambio(req.user);
      res.json(b);
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json(await leer(req.user, req.params.id)); } catch (e) { sendError(res, e); } });

  router.put('/:id', json, async (req, res) => {
    try {
      const b = await mutar(req.user, req.params.id, (x) => {
        if (req.body && req.body.nombre !== undefined) x.name = cleanStr(req.body.nombre, 80).trim() || x.name;
        if (req.body && req.body.icono !== undefined) x.icon = cleanStr(req.body.icono, 8).trim() || x.icon;
      });
      res.json(b);
    } catch (e) { sendError(res, e); }
  });

  // Esquema completo: columnas y vistas (se conservan los ids de las que ya existían; las columnas quitadas pierden sus valores)
  router.put('/:id/schema', json, async (req, res) => {
    try {
      const b = await mutar(req.user, req.params.id, (x) => {
        const cols = limpiaColumnas(req.body && req.body.columnas, x.columns);
        x.columns = cols; x.views = limpiaVistas(req.body && req.body.vistas, cols);
        x.rows.forEach(r => { r.c = limpiaCeldas(cols, null, r.c || {}); });
      });
      cambio(req.user);
      res.json(b);
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await leer(req.user, req.params.id);
      await fsp.rm(archivo(req.user, req.params.id), { force: true });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/rows', json, async (req, res) => {
    try {
      let fila;
      const b = await mutar(req.user, req.params.id, (x) => {
        if (x.rows.length >= MAX_FILAS) throw new HttpError(400, 'Has llegado al máximo de filas de esta base');
        const c = {}; x.columns.forEach(col => { c[col.id] = vacioDe(col); });
        fila = { id: newId(), c: limpiaCeldas(x.columns, req.body && req.body.c, c), createdAt: Date.now(), updatedAt: Date.now() };
        x.rows.push(fila);
      });
      cambio(req.user);
      res.json({ row: fila, updatedAt: b.updatedAt });
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id/rows/:rid', json, async (req, res) => {
    try {
      let fila;
      await mutar(req.user, req.params.id, (x) => {
        fila = x.rows.find(r => r.id === req.params.rid); if (!fila) throw new HttpError(404, 'No existe la fila');
        fila.c = limpiaCeldas(x.columns, req.body && req.body.c, fila.c || {}); fila.updatedAt = Date.now();
      });
      cambio(req.user);
      res.json({ row: fila });
    } catch (e) { sendError(res, e); }
  });

  // Mover una tarjeta del tablero a otra columna (cambia el valor del campo «select» de agrupación)
  router.post('/:id/rows/:rid/move', json, async (req, res) => {
    try {
      let fila;
      await mutar(req.user, req.params.id, (x) => {
        fila = x.rows.find(r => r.id === req.params.rid); if (!fila) throw new HttpError(404, 'No existe la fila');
        const col = x.columns.find(c => c.id === (req.body && req.body.columna) && c.tipo === 'select'); if (!col) throw new HttpError(400, 'Columna no válida');
        const nuevo = valorCelda(col, req.body.opcion);
        if ((fila.c[col.id] || '') === nuevo) return;
        fila.c[col.id] = nuevo; fila.updatedAt = Date.now();
        x.stats = x.stats || { moves: 0 }; x.stats.moves = Math.min(1e6, (x.stats.moves || 0) + 1);
      });
      cambio(req.user);
      res.json({ row: fila });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/rows/:rid', async (req, res) => {
    try {
      await mutar(req.user, req.params.id, (x) => { const n = x.rows.length; x.rows = x.rows.filter(r => r.id !== req.params.rid); if (x.rows.length === n) throw new HttpError(404, 'No existe la fila'); });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/export', async (req, res) => {
    try {
      const b = await leer(req.user, req.params.id);
      const nombre = (b.name || 'base').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'base';
      if (req.query.format === 'json') return res.set('Content-Disposition', `attachment; filename="${nombre}.json"`).json({ version: 1, name: b.name, icon: b.icon, columns: b.columns, views: b.views, rows: b.rows });
      const csv = aCsv(b);
      res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${nombre}.csv"`).send(csv);
    } catch (e) { sendError(res, e); }
  });

  // Crea una base a partir de un JSON exportado antes
  router.post('/import', express.json({ limit: '8mb' }), async (req, res) => {
    try {
      if ((await lista(req.user)).length >= MAX_BASES) throw new HttpError(400, 'Has llegado al máximo de bases');
      const o = req.body || {};
      const cols = limpiaColumnas(o.columns, []);
      // Los ids de las columnas del archivo se reasignan: se emparejan por posición
      const origen = (Array.isArray(o.columns) ? o.columns : []).filter(c => cleanStr(c && c.nombre, 60).trim()).slice(0, MAX_COLS);
      const mapaOpc = new Map();
      cols.forEach((c, i) => { if (c.opciones) (origen[i].opciones || []).forEach(oo => { const n = c.opciones.find(x => x.nombre === cleanStr(oo && oo.nombre, 40).trim()); if (n) mapaOpc.set(`${i}:${oo.id}`, n.id); }); });
      const vistas = limpiaVistas((Array.isArray(o.views) ? o.views : []).map(v => ({ ...v, id: undefined, agrupa: (cols[origen.findIndex(c => c.id === v.agrupa)] || {}).id, orden: null, filtro: null })), cols);
      const filas = (Array.isArray(o.rows) ? o.rows : []).slice(0, MAX_FILAS).map(r => {
        const c = {}; cols.forEach((col, i) => { const v = r && r.c ? r.c[origen[i].id] : undefined; c[col.id] = col.tipo === 'select' ? (mapaOpc.get(`${i}:${v}`) || '') : col.tipo === 'multiselect' ? (Array.isArray(v) ? v : []).map(x => mapaOpc.get(`${i}:${x}`)).filter(Boolean) : v; });
        return { id: newId(), c: limpiaCeldas(cols, c, Object.fromEntries(cols.map(x => [x.id, vacioDe(x)]))), createdAt: Date.now(), updatedAt: Date.now() };
      });
      const b = { id: newId(), name: cleanStr(o.name, 80).trim() || 'Base importada', icon: cleanStr(o.icon, 8).trim() || '🗂️', columns: cols, views: vistas, rows: filas, stats: { moves: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
      await writeJson(archivo(req.user, b.id), b);
      cambio(req.user);
      res.json(b);
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      resumen: async (user) => resumenBases(await lista(user)),
      // Enviar entre secciones (lib/transferir.js)
      async exporta(user, ids) {
        const out = [];
        for (const id of ids) {
          if (!validId(id)) continue;
          const b = await readJson(archivo(user, id), null);
          if (!b || !Array.isArray(b.rows)) continue;
          out.push({ ruta: (String(b.name || 'base').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 100) || 'base') + '.csv', buf: Buffer.from(aCsv(b), 'utf8') });
        }
        return out;
      },
      // Aparta el JSON de cada base en «stg» (se recupera con restaura)
      async quita(user, ids, stg) {
        const snap = [];
        for (const id of ids) {
          if (!validId(id)) continue;
          const b = await readJson(archivo(user, id), null);
          if (!b) continue;
          await fsp.mkdir(stg, { recursive: true });
          await fsp.rename(archivo(user, id), path.join(stg, id + '.json')).catch(() => {});
          snap.push({ id });
        }
        cambio(user);
        return snap;
      },
      async restaura(user, snap, stg) {
        for (const { id } of snap) await fsp.rename(path.join(stg, id + '.json'), archivo(user, id)).catch(() => {});
        cambio(user);
      },
    },
  };
}

module.exports = createBases;
module.exports.resumenBases = resumenBases;
module.exports.tieneValor = tieneValor;
