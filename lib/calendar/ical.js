'use strict';
// Suscripción iCal de solo lectura (token).
const crypto = require('crypto');
const store = require('../store');
const { updateJson, HttpError, cleanIds } = store;

function montaIcal(ctx) {
  const { express, icalIndexFile, leer, mutar, router, sendError } = ctx;

  /* ---------- Suscripción iCal de solo lectura ---------- */
  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const indiceToken = (fn) => updateJson(icalIndexFile, {}, fn);
  const estadoIcal = (d) => ({ enabled: !!d.ical.token, token: d.ical.token || '', exclude: d.ical.exclude || [], holidays: d.ical.holidays !== false });

  router.get('/ical', async (req, res) => {
    try { res.json(estadoIcal((await leer(req.user)))); }
    catch (err) { sendError(res, err); }
  });
  router.post('/ical', express.json(), async (req, res) => {
    try {
      if (!icalIndexFile) throw new HttpError(501, 'La suscripción no está disponible');
      const accion = String(req.body.action || '');
      const out = await mutar(req.user, async (d) => {
        const quitar = d.ical.token ? hashToken(d.ical.token) : null;
        if (accion === 'enable' || accion === 'rotate') {
          const token = crypto.randomBytes(32).toString('hex');
          await indiceToken((idx) => { if (quitar) delete idx[quitar]; idx[hashToken(token)] = { username: req.user.username, role: req.user.role }; });
          d.ical.token = token;
        } else if (accion === 'disable') {
          if (quitar) await indiceToken((idx) => { delete idx[quitar]; });
          delete d.ical.token;
        } else if (accion === 'settings') {
          if (Array.isArray(req.body.exclude)) d.ical.exclude = cleanIds(req.body.exclude, 60);
          if (req.body.holidays !== undefined) d.ical.holidays = !!req.body.holidays;
        } else throw new HttpError(400, 'Acción no válida');
        return estadoIcal(d);
      });
      res.json({ ok: true, ...out });
    } catch (err) { sendError(res, err); }
  });

  return { hashToken, indiceToken, estadoIcal };
}

module.exports = { montaIcal };
