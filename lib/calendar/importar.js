'use strict';
// Importar eventos ya interpretados desde un .ics.
const store = require('../nucleo/store');
const { newId, HttpError, cleanColor, cleanStr } = store;
const { limpiaEvento } = require('./evento');

function montaImportar(ctx) {
  const { calExiste, express, mutar, registrarActividad, router, sendError } = ctx;

  /* ---------- Importar (los eventos llegan ya interpretados desde un .ics) ---------- */
  router.post('/import', express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const { calendar, events } = req.body || {};
      if (!Array.isArray(events) || events.length > 1000) throw new HttpError(400, 'Importa como máximo 1000 eventos por petición');
      const r = await mutar(req.user, (d) => {
        let calId = 'personal';
        if (calendar && calendar.id && calExiste(d, calendar.id)) calId = calendar.id;
        else if (calendar && calendar.name) {
          if (d.calendars.length >= 40) throw new HttpError(400, 'Demasiados calendarios');
          const c = { id: newId(), name: cleanStr(calendar.name, 60).trim() || 'Importado', color: cleanColor(calendar.color, '#14b8a6'), visible: true, system: false };
          d.calendars.push(c); calId = c.id;
        }
        // Reimportar el mismo archivo no duplica: los eventos con el mismo UID se saltan
        const uids = new Set(d.events.filter(e => e.calendarId === calId && e.uid).map(e => e.uid));
        let creados = 0, omitidos = 0, errores = 0;
        for (const raw of events) {
          if (d.events.length >= 50000) break;
          try {
            if (raw.uid && uids.has(raw.uid)) { omitidos++; continue; }
            const ev = limpiaEvento({ ...raw, __recorta: true, calendarId: calId }, null);
            ev.id = newId(); ev.createdAt = ev.updatedAt = Date.now();
            d.events.push(ev); if (ev.uid) uids.add(ev.uid); creados++;
          } catch { errores++; }
        }
        return { calendarId: calId, creados, omitidos, errores };
      });
      registrarActividad(req, 'calendario_importado', { creados: r.creados });
      res.json({ ok: true, ...r });
    } catch (err) { sendError(res, err); }
  });

  return {  };
}

module.exports = { montaImportar };
