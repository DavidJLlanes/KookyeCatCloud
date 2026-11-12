'use strict';
// Bases de datos propias (al estilo Notion): columnas definidas por ti (también fórmulas, relaciones y resúmenes) y vistas de
// tabla, tablero, calendario, galería y línea de tiempo. Cada base es su propio JSON: <raíz>/.kcc/bases/<id>.json
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const store = require('../store');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = store;
const { LIM, RE_ID } = require('./constantes');
const { PLANTILLAS, desdePlantilla } = require('./plantillas');
const { limpiaColumnas, limpiaVistas } = require('./columnas');
const { limpiaCeldas, vacioDe, valorCelda, esCalculada } = require('./valores');
const { aplicaCambios } = require('./conversion');
const { calculo, conF, baseConCalculo, depuraRelaciones, todasLasBases } = require('./relaciones');
const { resumenBases } = require('./resumen');
const { montaPlantillasFilas } = require('./plantillas-filas');
const { montaOrdenFilas } = require('./orden-filas');
const doble = require('./doble');
const { aCsv } = require('./csv');
const { construyeBase, anadeFilasA } = require('./desde-tabla');
const { compila, ErrorFormula } = require('./formulas');

// ¿La fórmula solo usa columnas ya guardadas? (si usa alguna recién creada, no se pueden calcular ejemplos)
const compilaSoloGuardadas = (expr, b) => { try { compila(expr, new Set(b.columns.map(c => c.nombre))); return true; } catch { return false; } };

function createBases({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const json = express.json({ limit: '512kb' });
  const dir = (user) => kccDir(userRoot(user), 'bases');
  const archivo = (user, id) => path.join(dir(user), `${id}.json`);
  const validId = (id) => RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper la base */ } };

  async function lista(user) { return [...(await todasLasBases(userRoot, user)).values()]; }
  const leerOpc = (user) => async (id) => { if (!validId(id)) return null; const b = await readJson(archivo(user, id), null); return b && Array.isArray(b.rows) ? b : null; };
  const leer = async (user, id) => { if (!validId(id)) throw new HttpError(404, 'No existe'); const b = await readJson(archivo(user, id), null); if (!b || !Array.isArray(b.rows)) throw new HttpError(404, 'No existe'); return b; };
  // fn puede ser asíncrona (p. ej. guardar una copia antes de convertir una columna)
  const mutar = (user, id, fn) => {
    if (!validId(id)) throw new HttpError(404, 'No existe');
    return updateJson(archivo(user, id), () => null, async (b) => { if (!b || !Array.isArray(b.rows)) throw new HttpError(404, 'No existe'); const r = await fn(b); b.updatedAt = Date.now(); return r === undefined ? b : r; });
  };
  // Contar y crear van juntos, de uno en uno por usuario: así nunca se pasa del máximo de bases
  const alta = (user, fn) => store.enCola('alta-bases:' + userRoot(user), async () => {
    if ((await lista(user)).length >= LIM.BASES) throw new HttpError(400, 'Has llegado al máximo de bases');
    return fn();
  });
  const resumenCard = (b) => ({ id: b.id, nombre: b.name, icono: b.icon, filas: b.rows.length, columnas: b.columns.length, actualizada: b.updatedAt });
  // La base tal como se envía al cliente: con el valor de sus columnas calculadas en cada fila (`f`)
  const conCalculo = async (user, b) => baseConCalculo(b, await calculo(leerOpc(user), b));
  const filaConCalculo = async (user, b, fila) => conF(fila, await calculo(leerOpc(user), b, new Set([fila.id])));

  router.get('/', async (req, res) => {
    try {
      const bases = (await lista(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ bases: bases.map(resumenCard), plantillas: Object.entries(PLANTILLAS).map(([id, t]) => ({ id, nombre: t.nombre, icono: t.icono, desc: t.desc })) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      const t = PLANTILLAS[req.body && req.body.plantilla] || PLANTILLAS.vacia;
      const { cols, vistas } = desdePlantilla(t);
      const nombre = cleanStr(req.body && req.body.nombre, 80).trim() || t.nombre;
      const icono = cleanStr(req.body && req.body.icono, 8).trim() || t.icono;
      const b = { id: newId(), name: nombre, icon: icono, columns: cols, views: vistas, rows: [], stats: { moves: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
      await alta(req.user, () => writeJson(archivo(req.user, b.id), b));
      if (registrarActividad) registrarActividad(req, 'bases', { accion: 'crear', nombre });
      cambio(req.user);
      res.json(b);
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json(await conCalculo(req.user, await leer(req.user, req.params.id))); } catch (e) { sendError(res, e); } });

  router.put('/:id', json, async (req, res) => {
    try {
      const b = await mutar(req.user, req.params.id, (x) => {
        if (req.body && req.body.nombre !== undefined) x.name = cleanStr(req.body.nombre, 80).trim() || x.name;
        if (req.body && req.body.icono !== undefined) x.icon = cleanStr(req.body.icono, 8).trim() || x.icon;
      });
      res.json(await conCalculo(req.user, b));
    } catch (e) { sendError(res, e); }
  });

  // Esquema completo: columnas y vistas (se conservan los ids de las que ya existían; las columnas quitadas pierden sus valores)
  router.put('/:id/schema', json, async (req, res) => {
    try {
      const todas = await todasLasBases(userRoot, req.user); let avisos = []; let pendientes = []; let despuesDoble = null;
      const b = await mutar(req.user, req.params.id, async (x) => {
        const cuerpo = req.body || {};
        // Solo vistas: las columnas no se tocan (antes se reenviaban las del cliente y, si estaban desfasadas, se perdían
        // las columnas creadas en otro dispositivo con todos sus datos)
        let cols = x.columns, cambios = [];
        if (cuerpo.columnas !== undefined) {
          ({ cols, cambios } = limpiaColumnas(cuerpo.columnas, x.columns, { bases: todas, selfId: x.id }));
          // Columnas que este cliente no conocía (creadas en otro sitio después de cargar la base): se conservan
          if (Array.isArray(cuerpo.conocidas)) {
            const conocidas = new Set(cuerpo.conocidas.map(String)), ya = new Set(cols.map(c => c.id));
            for (const c of x.columns) if (!conocidas.has(c.id) && !ya.has(c.id) && cols.length < LIM.COLS) cols.push(c);
          }
          // Relaciones de doble sentido: crea o suelta las gemelas (las de otras bases se aplican al terminar)
          const dbl = doble.preparaEsquema({ x, cols, antes: x.columns, todas });
          pendientes = dbl.ops; despuesDoble = dbl.despues;
          // Cambiar el tipo de una columna convierte sus valores: antes se guarda una copia de la base (30 días)
          if (cambios.length) await store.guardaBorrado(userRoot(req.user), 'bases-antes-de-convertir', x.id, JSON.parse(JSON.stringify(x)));
        }
        x.columns = cols; x.views = limpiaVistas(cuerpo.vistas !== undefined ? cuerpo.vistas : x.views, cols);
        if (cuerpo.columnas !== undefined) {
          x.rows.forEach(r => { r.c = limpiaCeldas(cols, null, r.c || {}, true); });
          avisos = aplicaCambios(x, cambios);
          if (despuesDoble) despuesDoble(x);
        }
      });
      await doble.aplica(pendientes, (id, fn) => mutar(req.user, id, fn));
      cambio(req.user);
      res.json({ ...(await conCalculo(req.user, b)), avisos });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await leer(req.user, req.params.id);
      // Se aparta 30 días en .kcc/borrados/bases/ (ver lib/store.js, guardaBorrado) en vez de borrarse en el acto
      await store.guardaBorrado(userRoot(req.user), 'bases', req.params.id, { mover: archivo(req.user, req.params.id) });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  // Crea una fila con esos valores (los que no se dan, vacíos). `alAnadir` deja anotar algo más en la base (p. ej. el uso de una plantilla)
  async function nuevaFila(user, id, valores, alAnadir, recortar) {
    let fila, base;
    const cuerpo = await depuraRelaciones(leerOpc(user), await leer(user, id), valores);
    const b = await mutar(user, id, (x) => {
      if (x.rows.length >= LIM.FILAS) throw new HttpError(400, 'Has llegado al máximo de filas de esta base');
      const c = {}; x.columns.forEach(col => { if (!esCalculada(col)) c[col.id] = vacioDe(col); });
      fila = { id: newId(), c: limpiaCeldas(x.columns, cuerpo, c, recortar), createdAt: Date.now(), updatedAt: Date.now() };
      x.rows.push(fila); base = x; if (alAnadir) alAnadir(x);
    });
    await doble.reflejaFilas(doble.difiere(base, new Map(), new Map([[fila.id, fila.c]])), (bid, fn) => mutar(user, bid, fn));
    cambio(user);
    return { row: await filaConCalculo(user, base, fila), updatedAt: b.updatedAt };
  }
  router.post('/:id/rows', json, async (req, res) => {
    try { res.json(await nuevaFila(req.user, req.params.id, req.body && req.body.c)); } catch (e) { sendError(res, e); }
  });
  montaPlantillasFilas(router, { json, leer, mutar, nuevaFila, cambio, sendError, registrarActividad, guardaBorrado: (user, modulo, id, datos) => store.guardaBorrado(userRoot(user), modulo, id, datos) });

  montaOrdenFilas(router, { json, mutar: (u, id, fn) => mutar(u, id, fn), cambio, sendError });

  router.put('/:id/rows/:rid', json, async (req, res) => {
    try {
      let fila, base, previas;
      const cuerpo = await depuraRelaciones(leerOpc(req.user), await leer(req.user, req.params.id), req.body && req.body.c);
      await mutar(req.user, req.params.id, (x) => {
        fila = x.rows.find(r => r.id === req.params.rid); if (!fila) throw new HttpError(404, 'No existe la fila');
        previas = { ...(fila.c || {}) };
        fila.c = limpiaCeldas(x.columns, cuerpo, fila.c || {}); fila.updatedAt = Date.now(); base = x;
      });
      await doble.reflejaFilas(doble.difiere(base, new Map([[fila.id, previas]]), new Map([[fila.id, fila.c]])), (bid, fn) => mutar(req.user, bid, fn));
      cambio(req.user);
      res.json({ row: await filaConCalculo(req.user, base, fila) });
    } catch (e) { sendError(res, e); }
  });

  // Mover una tarjeta del tablero a otra columna (cambia el valor del campo «select» de agrupación)
  router.post('/:id/rows/:rid/move', json, async (req, res) => {
    try {
      let fila, base;
      await mutar(req.user, req.params.id, (x) => {
        fila = x.rows.find(r => r.id === req.params.rid); if (!fila) throw new HttpError(404, 'No existe la fila');
        const col = x.columns.find(c => c.id === (req.body && req.body.columna) && c.tipo === 'select'); if (!col) throw new HttpError(400, 'Columna no válida');
        const nuevo = valorCelda(col, req.body.opcion);
        base = x;
        if ((fila.c[col.id] || '') === nuevo) return;
        fila.c[col.id] = nuevo; fila.updatedAt = Date.now();
        x.stats = x.stats || { moves: 0 }; x.stats.moves = Math.min(1e6, (x.stats.moves || 0) + 1);
      });
      cambio(req.user);
      res.json({ row: await filaConCalculo(req.user, base, fila) });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/rows/:rid', async (req, res) => {
    try {
      await mutar(req.user, req.params.id, (x) => { const n = x.rows.length; x.rows = x.rows.filter(r => r.id !== req.params.rid); if (x.rows.length === n) throw new HttpError(404, 'No existe la fila'); });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  // Comprueba una fórmula mientras se escribe (sin guardar nada): devuelve error o el resultado en la primera fila
  router.post('/:id/formula', json, async (req, res) => {
    try {
      const b = await leer(req.user, req.params.id);
      const expr = String((req.body && req.body.expr) || '');
      const extra = Array.isArray(req.body && req.body.nombres) ? req.body.nombres.slice(0, 40).map(x => cleanStr(x, 60)) : [];
      const nombres = new Set([...b.columns.map(c => c.nombre), ...extra]);
      try { compila(expr, nombres); } catch (e) { if (e instanceof ErrorFormula) return res.json({ ok: false, error: e.message }); throw e; }
      if (![...nombres].every(n => b.columns.some(c => c.nombre === n)) && !compilaSoloGuardadas(expr, b)) return res.json({ ok: true, ejemplos: [] });
      const falsa = { ...b, id: b.id, columns: [...b.columns.filter(c => c.tipo !== 'formula' || c.nombre !== '__prueba'), { id: 'a'.repeat(16), nombre: '__prueba', tipo: 'formula', expr }], rows: b.rows.slice(0, 3) };
      const calc = await calculo(leerOpc(req.user), falsa);
      res.json({ ok: true, ejemplos: falsa.rows.map(r => (calc.get(r.id) || {})['a'.repeat(16)]) });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/export', async (req, res) => {
    try {
      const b = await leer(req.user, req.params.id);
      const nombre = (b.name || 'base').replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'base';
      const cd = (ext) => { const fn = nombre + ext; return `attachment; filename="${fn.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fn)}`; };
      if (req.query.format === 'json') return res.set('Content-Disposition', cd('.json')).json({ version: 2, name: b.name, icon: b.icon, columns: b.columns, views: b.views, rows: b.rows });
      const csv = aCsv(b, await calculo(leerOpc(req.user), b));
      res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', cd('.csv')).send(csv);
    } catch (e) { sendError(res, e); }
  });

  // Crea una base a partir de un JSON exportado antes. Las relaciones y resúmenes apuntan a bases de la copia original,
  // así que no se importan; las fórmulas solo si siguen siendo válidas sin ellos.
  router.post('/import', express.json({ limit: '8mb' }), async (req, res) => {
    try {
      const o = req.body || {};
      let crudas = (Array.isArray(o.columns) ? o.columns : []).filter(c => c && cleanStr(c.nombre, 60).trim() && c.tipo !== 'relation' && c.tipo !== 'rollup').slice(0, LIM.COLS);
      const nombres = new Set(crudas.map(c => cleanStr(c.nombre, 60).trim()));
      crudas = crudas.filter(c => { if (c.tipo !== 'formula') return true; try { compila(c.expr, nombres); return true; } catch { return false; } });
      const cols = limpiaColumnas(crudas.map(c => ({ ...c, id: undefined })), [], {}).cols;
      // Los ids de las columnas del archivo se reasignan: se emparejan por posición
      const mapaOpc = new Map();
      cols.forEach((c, i) => { if (c.opciones) (crudas[i].opciones || []).forEach(oo => { const n = c.opciones.find(x => x.nombre === cleanStr(oo && oo.nombre, 40).trim()); if (n) mapaOpc.set(`${i}:${oo.id}`, n.id); }); });
      const vistas = limpiaVistas((Array.isArray(o.views) ? o.views : []).map(v => {
        const col = (id) => (cols[crudas.findIndex(c => c.id === id)] || {}).id;
        return { nombre: v.nombre, tipo: v.tipo, unir: v.unir, agrupa: col(v.agrupa), fecha: col(v.fecha), fechaFin: col(v.fechaFin), portada: col(v.portada), ocultas: (v.ocultas || []).map(col) };
      }), cols);
      const filas = (Array.isArray(o.rows) ? o.rows : []).slice(0, LIM.FILAS).map(r => {
        const c = {}; cols.forEach((col, i) => { const v = r && r.c ? r.c[crudas[i].id] : undefined; c[col.id] = col.tipo === 'select' ? (mapaOpc.get(`${i}:${v}`) || '') : col.tipo === 'multiselect' ? (Array.isArray(v) ? v : []).map(x => mapaOpc.get(`${i}:${x}`)).filter(Boolean) : v; });
        return { id: newId(), c: limpiaCeldas(cols, c, Object.fromEntries(cols.filter(x => !esCalculada(x)).map(x => [x.id, vacioDe(x)])), true), createdAt: Date.now(), updatedAt: Date.now() };
      });
      const b = { id: newId(), name: cleanStr(o.name, 80).trim() || 'Base importada', icon: cleanStr(o.icon, 8).trim() || '🗂️', columns: cols, views: vistas, rows: filas, stats: { moves: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
      await alta(req.user, () => writeJson(archivo(req.user, b.id), b));
      cambio(req.user);
      res.json(await conCalculo(req.user, b));
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      resumen: async (user) => resumenBases(await lista(user)),
      // Importar CSV (lib/importar): base nueva desde una tabla tipada, o filas añadidas a una base que ya existe
      lista: (user) => lista(user),
      async importaTabla(user, tabla) {
        const b = construyeBase(tabla);
        await alta(user, () => writeJson(archivo(user, b.id), b)); cambio(user);
        return { id: b.id, nombre: b.name, filas: b.rows.length };
      },
      async anadeFilas(user, id, filas, destino) {
        let r; await mutar(user, id, (b) => { r = anadeFilasA(b, filas, destino); });
        cambio(user); return r;
      },
      // Enviar entre secciones (lib/transferir.js)
      async exporta(user, ids) {
        const out = [];
        for (const id of ids) {
          if (!validId(id)) continue;
          const b = await readJson(archivo(user, id), null);
          if (!b || !Array.isArray(b.rows)) continue;
          out.push({ ruta: (String(b.name || 'base').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 100) || 'base') + '.csv', buf: Buffer.from(aCsv(b, await calculo(leerOpc(user), b)), 'utf8') });
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
        for (const { id } of snap) await fsp.rename(path.join(stg, id + '.json'), archivo(user, id)).catch(e => { if (e.code !== 'ENOENT') throw e; });   // deshacer no puede fallar en silencio: lo apartado se borraría al caducar
        cambio(user);
      },
    },
  };
}

module.exports = createBases;
module.exports.resumenBases = resumenBases;
module.exports.tieneValor = require('./valores').tieneValor;
