'use strict';
// Rutas de calendarios y listado de eventos por rango.
const store = require('../store');
const { newId, HttpError, cleanColor, cleanStr } = store;
const { expande } = require('./recurrencia');

function montaCalendarios(ctx) {
  const { calFestivos, eventosFestivos, express, leer, listaCalendarios, mutar, rangoOk, router, sendError } = ctx;

  router.get('/', async (req, res) => {
    try {
      const d = await leer(req.user);
      res.json({ calendars: listaCalendarios(d) });
    } catch (err) { sendError(res, err); }
  });

  router.post('/calendars', express.json(), async (req, res) => {
    try {
      const name = cleanStr(req.body.name, 60).trim();
      if (!name) throw new HttpError(400, 'Falta el nombre');
      const cal = await mutar(req.user, (d) => {
        if (d.calendars.length >= 40) throw new HttpError(400, 'Demasiados calendarios');
        const c = { id: newId(), name, color: cleanColor(req.body.color, '#14b8a6'), visible: true, system: false };
        d.calendars.push(c);
        return c;
      });
      res.json({ ok: true, calendar: cal });
    } catch (err) { sendError(res, err); }
  });

  router.put('/calendars/:id', express.json(), async (req, res) => {
    try {
      const cal = await mutar(req.user, (d) => {
        if (req.params.id === 'festivos') {        // el calendario virtual solo guarda color y visibilidad
          if (req.body.color !== undefined) d.holidays.color = cleanColor(req.body.color, d.holidays.color);
          if (req.body.visible !== undefined) d.holidays.visible = !!req.body.visible;
          return calFestivos(d);
        }
        const c = d.calendars.find(x => x.id === req.params.id);
        if (!c) throw new HttpError(404, 'Calendario no encontrado');
        if (req.body.name !== undefined) c.name = cleanStr(req.body.name, 60).trim() || c.name;
        if (req.body.color !== undefined) c.color = cleanColor(req.body.color, c.color);
        if (req.body.visible !== undefined) c.visible = !!req.body.visible;
        return c;
      });
      res.json({ ok: true, calendar: cal });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/calendars/:id', async (req, res) => {
    try {
      await mutar(req.user, (d) => {
        const c = d.calendars.find(x => x.id === req.params.id);
        if (!c) throw new HttpError(404, 'Calendario no encontrado');
        if (c.system || c.id === 'personal') throw new HttpError(400, 'Este calendario no se puede borrar');
        d.calendars = d.calendars.filter(x => x.id !== c.id);
        // Sus eventos pasan a Personal, no se pierden
        d.events.forEach(e => { if (e.calendarId === c.id) e.calendarId = 'personal'; });
      });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.get('/events', async (req, res) => {
    try {
      const { from, to } = req.query;
      rangoOk(from, to);
      const d = await leer(req.user);
      const out = [];
      for (const ev of d.events) out.push(...expande(ev, from, to));
      out.push(...eventosFestivos(d, from, to));
      out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      res.json({ events: out });
    } catch (err) { sendError(res, err); }
  });

  return {  };
}

module.exports = { montaCalendarios };
