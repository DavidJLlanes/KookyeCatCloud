'use strict';
// Búsqueda global sin IA: un índice BM25 por usuario sobre notas, prompts, bases, código, contactos, calendario, pagos,
// recordatorios, marcadores, portapapeles, bloques sincronizados y archivos de texto. Todo en memoria; se reconstruye al
// cambiar algo (alCambiar) o pasados 10 s (las notas no avisan de sus cambios). Los datos propios son solo el historial reciente y los contadores (.kcc/busqueda/).
// La capa de IA (lib/ia) reutiliza `core.contexto` para responder solo con los fragmentos que esta búsqueda encuentra.
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson } = store;
const { Indice } = require('./indice');
const { fragmento, plano } = require('./texto');
const { FUENTES, NOMBRES } = require('./fuentes');

const TTL_MS = 10000, MIN_RECONSTRUIR_MS = 2000, MAX_RECIENTES = 15;

function createBusqueda({ express, userRoot, sendError, registrarActividad, alCambiar, notas }) {
  const router = express.Router();
  const dir = (user) => kccDir(userRoot(user), 'busqueda');
  const statsFile = (user) => path.join(dir(user), 'stats.json');
  const recientesFile = (user) => path.join(dir(user), 'recientes.json');
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no rompe la búsqueda */ } };
  const ctx = { userRoot, get notas() { return typeof notas === 'function' ? notas() : notas; } };

  const cache = new Map();   // usuario -> { indice, en, sucio, promesa }

  async function construye(user) {
    const docs = [];
    // Cada fuente falla por separado: un módulo dañado no deja a los demás sin búsqueda
    await Promise.all(FUENTES.map(async (f) => { try { docs.push(...await f.documentos(ctx, user)); } catch (e) { console.warn(`[busqueda] ${f.id}: ${e.message}`); } }));
    return new Indice(docs.filter(d => d && (d.titulo || d.texto)));
  }

  async function indiceDe(user, { fuerza = false } = {}) {
    let c = cache.get(user);
    if (!c) { c = { indice: null, en: 0, sucio: true, promesa: null }; cache.set(user, c); }
    const ahora = Date.now();
    const caducado = !c.indice || (c.sucio && ahora - c.en > MIN_RECONSTRUIR_MS) || ahora - c.en > TTL_MS || fuerza;
    if (caducado && !c.promesa) {
      c.promesa = construye(user).then((ix) => { c.indice = ix; c.en = Date.now(); c.sucio = false; }).finally(() => { c.promesa = null; });
    }
    if (c.promesa && (!c.indice || fuerza)) await c.promesa;
    return c.indice || new Indice([]);
  }
  const invalida = (user) => { const c = cache.get(user); if (c) c.sucio = true; };

  const fuentesDe = (m) => {
    const ids = String(m || '').split(',').map(s => s.trim()).filter(s => NOMBRES[s]);
    return ids.length ? new Set(ids) : null;
  };

  /** Resultados para una consulta: { resultados, total, fuentes: {id: n}, terminos } */
  async function buscar(user, q, { m = null, n = 40 } = {}) {
    const ix = await indiceDe(user);
    const todos = ix.busca(q, { limite: 500 });
    const facetas = {};
    for (const r of todos) facetas[r.doc.fuente] = (facetas[r.doc.fuente] || 0) + 1;
    const filtro = fuentesDe(m);
    const sel = filtro ? todos.filter(r => filtro.has(r.doc.fuente)) : todos;
    return { resultados: sel.slice(0, n).map(r => ix.resultado(r)), total: sel.length, fuentes: facetas, terminos: todos.length ? todos[0].terminos : [] };
  }

  /** Pasajes más relevantes para dar contexto a una IA: [{ fuente, id, sub, titulo, texto }] */
  async function contexto(user, q, { max = 8, ancho = 900, m = null } = {}) {
    const ix = await indiceDe(user);
    const filtro = fuentesDe(m);
    const out = [];
    for (const r of ix.busca(q, { fuentes: filtro, limite: max })) {
      out.push({ fuente: r.doc.fuente, id: r.doc.id, sub: r.doc.sub || null, titulo: r.doc.titulo, texto: fragmento(r.doc.texto, r.terminos, ancho).texto });
    }
    return out;
  }

  /** Texto completo (el indexado) de un elemento, para resumirlo. */
  async function documento(user, fuente, id, sub = null) {
    const ix = await indiceDe(user);
    const d = ix.docs.find(x => x.fuente === fuente && x.id === id && (x.sub || null) === (sub || null));
    return d ? { fuente: d.fuente, id: d.id, sub: d.sub || null, titulo: d.titulo, texto: d.texto } : null;
  }

  const suma = (user, campo, n = 1) => updateJson(statsFile(user), () => ({}), (d) => { d[campo] = (d[campo] || 0) + n; }).then(() => cambio(user)).catch(() => {});
  const lee = async (file, vacio) => { try { return await readJson(file, vacio); } catch { return typeof vacio === 'function' ? vacio() : vacio; } };

  router.get('/', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().slice(0, 200);
      if (plano(q).replace(/[^a-z0-9]/g, '').length < 2) return res.json({ resultados: [], total: 0, fuentes: {}, terminos: [], ms: 0 });
      const t0 = Date.now();
      const out = await buscar(req.user, q, { m: req.query.m, n: Math.min(100, Math.max(1, Number(req.query.n) || 40)) });
      out.ms = Date.now() - t0;
      // Historial y contador: si fallan, la búsqueda no debe fallar
      if (req.query.guarda !== '0') {
        await Promise.all([
          updateJson(recientesFile(req.user), () => ({ q: [] }), (d) => { d.q = [q, ...(d.q || []).filter(x => plano(x) !== plano(q))].slice(0, MAX_RECIENTES); }),
          suma(req.user, 'busquedas'),
        ]).catch(() => {});
      }
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get('/fuentes', async (req, res) => {
    try {
      const ix = await indiceDe(req.user);
      const n = {}; for (const d of ix.docs) n[d.fuente] = (n[d.fuente] || 0) + 1;
      res.json({ fuentes: FUENTES.map(f => ({ id: f.id, nombre: f.nombre, documentos: n[f.id] || 0 })), total: ix.docs.length });
    } catch (e) { sendError(res, e); }
  });

  router.get('/recientes', async (req, res) => {
    try { res.json({ recientes: (await lee(recientesFile(req.user), () => ({ q: [] }))).q || [] }); } catch (e) { sendError(res, e); }
  });
  router.delete('/recientes', async (req, res) => {
    try { await updateJson(recientesFile(req.user), () => ({ q: [] }), (d) => { d.q = []; }); res.json({ ok: true }); } catch (e) { sendError(res, e); }
  });
  router.post('/reindexar', async (req, res) => {
    try { const ix = await indiceDe(req.user, { fuerza: true }); res.json({ ok: true, total: ix.docs.length }); } catch (e) { sendError(res, e); }
  });

  const core = {
    invalida, buscar, contexto, documento, suma,
    async resumen(user) {
      const s = await lee(statsFile(user), () => ({}));
      return { bu_busquedas: s.busquedas || 0 };
    },
  };
  return { router, core };
}

module.exports = createBusqueda;
