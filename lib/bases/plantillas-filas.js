'use strict';
// Bases · plantillas de fila: «Nueva reunión», «Tarea urgente»… Cada una guarda los valores con los que nace una fila y se
// usa con un botón. Viven dentro del JSON de su base (`plantillas: [ { id, nombre, icono, valores } ]`).
// En las fechas se puede guardar «hoy», «mañana», «en una semana» o «en un mes» en vez de un día fijo.
const store = require('../store');
const { newId, HttpError, cleanStr } = store;
const { valorCelda, esCalculada, tieneValor } = require('./valores');
const { sumaDias, ahora } = require('../push/tiempo');

const MAX_PLANTILLAS = 20;
const TOKENS = { '{{hoy}}': 0, '{{manana}}': 1, '{{semana}}': 7, '{{mes}}': 30 };
const esToken = (col, v) => col.tipo === 'date' && Object.prototype.hasOwnProperty.call(TOKENS, v);
// Las relaciones y los archivos dependen de datos concretos: no se guardan en una plantilla
const admite = (col) => !esCalculada(col) && col.tipo !== 'relation';

function limpiaPlantilla(b, columnas, prev) {
  const p = prev ? { ...prev } : { id: newId(), createdAt: Date.now() };
  const tiene = (k) => b && Object.prototype.hasOwnProperty.call(b, k);
  if (tiene('nombre')) p.nombre = cleanStr(b.nombre, 60).trim();
  if (!p.nombre) throw new HttpError(400, 'Ponle un nombre a la plantilla');
  if (tiene('icono')) p.icono = cleanStr(b.icono, 8).trim();
  if (p.icono === undefined || p.icono === '') p.icono = '📋';
  if (tiene('valores')) {
    if (!b.valores || typeof b.valores !== 'object' || Array.isArray(b.valores)) throw new HttpError(400, 'Los valores de la plantilla no son válidos');
    const v = {};
    for (const col of columnas) {
      if (!admite(col) || !Object.prototype.hasOwnProperty.call(b.valores, col.id)) continue;
      const x = esToken(col, b.valores[col.id]) ? b.valores[col.id] : valorCelda(col, b.valores[col.id]);
      if (esToken(col, x) || tieneValor(col, x)) v[col.id] = x;
    }
    p.valores = v;
  }
  if (!p.valores) p.valores = {};
  p.updatedAt = Date.now();
  return p;
}

// Valores listos para crear la fila: los «hoy», «mañana»… pasan a ser el día de hoy más N; las columnas que ya no existen se descartan
function resuelve(p, columnas, hoy = ahora().dia) {
  const out = {};
  for (const col of columnas) {
    if (!admite(col) || !Object.prototype.hasOwnProperty.call(p.valores || {}, col.id)) continue;
    const v = p.valores[col.id];
    out[col.id] = esToken(col, v) ? sumaDias(hoy, TOKENS[v]) : v;
  }
  return out;
}

// Rutas (se montan en el router de Bases). ctx: { json, leer, mutar, nuevaFila, cambio, sendError }
function montaPlantillasFilas(router, ctx) {
  const { json, leer, mutar, nuevaFila, cambio, sendError, guardaBorrado, registrarActividad } = ctx;
  const en = (b, pid) => { const p = (b.plantillas || []).find(x => x.id === pid); if (!p) throw new HttpError(404, 'No existe esa plantilla'); return p; };

  router.post('/:id/plantillas', json, async (req, res) => {
    try {
      let creada;
      await mutar(req.user, req.params.id, (b) => {
        b.plantillas = b.plantillas || [];
        if (b.plantillas.length >= MAX_PLANTILLAS) throw new HttpError(400, `Máximo ${MAX_PLANTILLAS} plantillas por base`);
        creada = limpiaPlantilla(req.body, b.columns, null); b.plantillas.push(creada);
      });
      cambio(req.user);
      res.json({ plantilla: creada });
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id/plantillas/:pid', json, async (req, res) => {
    try {
      let guardada;
      await mutar(req.user, req.params.id, (b) => { const p = en(b, req.params.pid); guardada = limpiaPlantilla(req.body, b.columns, p); b.plantillas[b.plantillas.indexOf(p)] = guardada; });
      cambio(req.user);
      res.json({ plantilla: guardada });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/plantillas/:pid', async (req, res) => {
    try {
      await mutar(req.user, req.params.id, async (b) => {
        const p = en(b, req.params.pid);
        await guardaBorrado(req.user, 'bases-plantillas', `${b.id}-${p.id}`, p);
        b.plantillas.splice(b.plantillas.indexOf(p), 1);
      });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  // Crea una fila nueva con los valores de la plantilla (y cuenta el uso para los logros)
  router.post('/:id/plantillas/:pid/usar', async (req, res) => {
    try {
      const base0 = await leer(req.user, req.params.id), p = en(base0, req.params.pid);
      const r = await nuevaFila(req.user, req.params.id, resuelve(p, base0.columns), (x) => { x.stats = x.stats || { moves: 0 }; x.stats.plantillaUsos = Math.min(1e6, (x.stats.plantillaUsos || 0) + 1); }, true);   // true: lo que ya no encaja (una opción borrada) se descarta en vez de fallar
      if (registrarActividad) registrarActividad(req, 'bases', { accion: 'plantilla', nombre: p.nombre });
      res.json(r);
    } catch (e) { sendError(res, e); }
  });
}

module.exports = { montaPlantillasFilas, limpiaPlantilla, resuelve, MAX_PLANTILLAS, TOKENS };
