'use strict';
// Tareas sin fecha y festivos.
const holidays = require('./festivos');

function montaTareas(ctx) {
  const { express, leer, mutar, router, sendError } = ctx;

  /* ---------- Tareas sin fecha ---------- */
  router.get('/tasks', async (req, res) => {
    try {
      const d = await leer(req.user);
      const tasks = d.events.filter(e => e.kind === 'task' && !e.start).sort((a, b) => a.createdAt - b.createdAt);
      res.json({ tasks });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Festivos ---------- */
  router.get('/holidays', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ enabled: !!d.holidays.enabled, region: d.holidays.region || '', regions: holidays.lista() });
    } catch (err) { sendError(res, err); }
  });
  router.put('/holidays', express.json(), async (req, res) => {
    try {
      const out = await mutar(req.user, (d) => {
        if (req.body.region !== undefined) d.holidays.region = holidays.regionValida(String(req.body.region));
        if (req.body.enabled !== undefined) d.holidays.enabled = !!req.body.enabled && !!d.holidays.region;
        return { enabled: d.holidays.enabled, region: d.holidays.region };
      });
      res.json({ ok: true, ...out });
    } catch (err) { sendError(res, err); }
  });

  return {  };
}

module.exports = { montaTareas };
