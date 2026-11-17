'use strict';
// Resincronizar juegos con RAWG: mira si ha cambiado la fecha de salida y propone los cambios (no aplica nada solo).
//   POST /resync/revisa  { ids?: [] }                       -> { revisados, sinRawg, errores, cambios: [{ id, title, antes, despues, calendario }] }
//   POST /resync/aplica  { cambios: [{ id, released, calendario }] } -> { aplicados }
// `calendario` (al revisar): la fecha/hora del evento del juego en el calendario, si lo tiene; (al aplicar): true = mover también ese evento
// (sus avisos «antes del evento» se mueven con él).
const { HttpError } = require('../nucleo/store');

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REVISION = 150;   // juegos por revisión: RAWG limita las peticiones
const PARALELAS = 4;
const ESPERA_MS = Number(process.env.KCC_RAWG_ESPERA_MS ?? 20000);   // entre revisiones de un mismo usuario: cada una gasta peticiones de la clave de RAWG del servidor
const ultima = new Map();  // usuario -> instante de su última revisión (o 'en curso')
const fechaValida = (v) => (RE_DIA.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : '');

function montaResincronizar({ router, json, leer, mutar, rawgJuego, calendar, validId, sendError }) {
  router.post('/resync/revisa', json, async (req, res) => {
    try {
      const antes = ultima.get(req.user.username);
      if (antes === 'en curso' || (antes && Date.now() - antes < ESPERA_MS)) throw new HttpError(429, 'Acabas de revisar los juegos: espera unos segundos');
      ultima.set(req.user.username, 'en curso');
      try { await revisa(req, res); } finally { ultima.set(req.user.username, Date.now()); if (ultima.size > 500) for (const [u, t] of ultima) if (t !== 'en curso' && Date.now() - t > ESPERA_MS) ultima.delete(u); }
    } catch (e) { sendError(res, e); }
  });

  async function revisa(req, res) {
    {
      const pedidos = Array.isArray(req.body && req.body.ids) ? new Set(req.body.ids.map(String).filter(validId)) : null;
      const todos = (await leer(req.user)).items.filter(g => !pedidos || pedidos.has(g.id));
      const vinculados = todos.filter(g => g.rawgId);
      if (pedidos && pedidos.size === 1 && !vinculados.length) throw new HttpError(400, 'Este juego no está vinculado con RAWG: usa «Buscar en RAWG» primero');
      if (vinculados.length > MAX_REVISION) throw new HttpError(400, `Son demasiados juegos de una vez (${vinculados.length}): se revisan hasta ${MAX_REVISION}. Revisa por estados o de uno en uno`);

      const cambios = []; let errores = 0, fatal = null, i = 0;
      async function trabajador() {
        while (i < vinculados.length && !fatal) {
          const g = vinculados[i++];
          try {
            const d = await rawgJuego(g.rawgId);
            const nueva = fechaValida(d.released);
            if (nueva && nueva !== (g.released || '')) cambios.push({ id: g.id, title: g.title, antes: g.released || '', despues: nueva, calendario: g.cal || null });
          } catch (e) { if (e instanceof HttpError && (e.status === 429 || e.status === 501 || e.status === 502 && /clave/.test(e.message))) fatal = e; else errores++; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALELAS, vinculados.length) }, trabajador));
      if (fatal && !cambios.length) throw fatal;
      cambios.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      res.json({ revisados: vinculados.length, sinRawg: todos.length - vinculados.length, errores: errores + (fatal ? 1 : 0), parcial: !!fatal, cambios });
    }
  }

  router.post('/resync/aplica', json, async (req, res) => {
    try {
      const lista = Array.isArray(req.body && req.body.cambios) ? req.body.cambios.slice(0, MAX_REVISION) : [];
      let aplicados = 0, movidos = 0;
      for (const c of lista) {
        if (!c || !validId(c.id) || !fechaValida(c.released)) continue;
        let g = null;
        await mutar(req.user, (d) => {
          const x = d.items.find(i => i.id === c.id);
          if (!x || !x.rawgId) return { __abort: true };
          x.released = c.released; x.updatedAt = Date.now(); g = { ...x };
        });
        if (!g) continue;
        aplicados++;
        if (c.calendario === true && g.cal && g.cal.date) {
          const cal = { date: c.released, time: g.cal.time || '' };
          await calendar.sincronizaOrigen(req.user, 'game', g.id, g.title, cal);
          await mutar(req.user, (d) => { const x = d.items.find(i => i.id === g.id); if (x) x.cal = { date: cal.date, time: cal.time }; });
          movidos++;
        }
      }
      res.json({ aplicados, movidos });
    } catch (e) { sendError(res, e); }
  });
}

module.exports = { montaResincronizar };
