'use strict';
// Búsqueda y consultas por origen.
const store = require('../nucleo/store');
const { cleanStr } = store;

function montaConsultas(ctx) {
  const { express, leer, router, sendError } = ctx;

  router.get('/search', async (req, res) => {
    try {
      const q = cleanStr(req.query.q, 100).toLowerCase().trim();
      if (!q) return res.json({ events: [] });
      const d = await leer(req.user);
      const events = d.events
        .filter(e => (e.title + ' ' + (e.description || '') + ' ' + (e.location || '')).toLowerCase().includes(q))
        .sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 100);
      res.json({ events });
    } catch (err) { sendError(res, err); }
  });

  // Eventos de un origen (para enseñar "en el calendario: 3 mar" en la ficha de un prompt)
  router.get('/by-source', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ events: d.events.filter(e => e.source && e.source.type === req.query.type && e.source.ref === req.query.ref) });
    } catch (err) { sendError(res, err); }
  });

  // Qué eventos, tareas y recordatorios cuelgan de lo que se va a borrar (para preguntar antes) y cómo dejarlos sueltos si se conservan
  router.post('/dependientes', express.json({ limit: '100kb' }), async (req, res) => {
    try { res.json({ items: await ctx.core.dependientes(req.user, req.body && req.body.items) }); } catch (err) { sendError(res, err); }
  });
  router.post('/desvincula', express.json({ limit: '100kb' }), async (req, res) => {
    try { await ctx.core.desvincula(req.user, req.body && req.body.items); res.json({ ok: true }); } catch (err) { sendError(res, err); }
  });

  return {  };
}

module.exports = { montaConsultas };
