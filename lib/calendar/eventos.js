'use strict';
// Crear, leer, editar y borrar eventos; avisos a los módulos de origen.
const store = require('../nucleo/store');
const { newId, HttpError, cleanStr } = store;
const { RE_DIA } = require('./fechas');
const { CAL_POR_ORIGEN, TIPOS_ORIGEN, limpiaEvento } = require('./evento');

function montaEventos(ctx) {
  const { calExiste, express, leer, mutar, registrarActividad, router, sendError, userRoot } = ctx;

  // Cada módulo con eventos propios (prompts, notas) se entera cuando se mueve o borra el
  // evento desde el calendario, para que su ficha enseñe siempre la fecha buena.
  const ganchos = {};
  const avisaOrigen = async (user, ev, nuevoEv) => {
    const g = ev && ev.source && ganchos[ev.source.type];
    if (g) { try { await g(user, ev.source.ref, nuevoEv); } catch { /* el origen ya no existe */ } }
  };

  async function crearEvento(user, body) {
    return mutar(user, (d) => {
      if (d.events.length >= 50000) throw new HttpError(400, 'Demasiados eventos');
      const ev = limpiaEvento(body, null);
      if (!calExiste(d, ev.calendarId)) ev.calendarId = 'personal';
      const s = body.source;
      if (s && TIPOS_ORIGEN.includes(s.type) && s.ref) {
        ev.source = { type: s.type, ref: cleanStr(s.ref, 600), title: cleanStr(s.title, 200) };
        if (!body.calendarId) ev.calendarId = CAL_POR_ORIGEN[s.type];
      }
      ev.id = newId();
      ev.createdAt = ev.updatedAt = Date.now();
      d.events.push(ev);
      return ev;
    });
  }

  router.get('/events/:id', async (req, res) => {
    try {
      const ev = (await leer(req.user)).events.find(e => e.id === req.params.id);
      if (!ev) throw new HttpError(404, 'Evento no encontrado');
      res.json({ event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.post('/events', express.json({ limit: '200kb' }), async (req, res) => {
    try {
      const ev = await crearEvento(req.user, req.body || {});
      registrarActividad(req, 'evento_creado', { id: ev.id });
      res.json({ ok: true, event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.put('/events/:id', express.json({ limit: '200kb' }), async (req, res) => {
    try {
      const scope = req.query.scope === 'one' ? 'one' : 'all';
      const ev = await mutar(req.user, (d) => {
        const i = d.events.findIndex(e => e.id === req.params.id);
        if (i < 0) throw new HttpError(404, 'Evento no encontrado');
        const orig = d.events[i];
        store.compruebaBase(orig, req);
        if (scope === 'one' && orig.repeat) {
          // Solo esta aparición: se oculta del original y nace un evento suelto con los cambios
          const fecha = RE_DIA.test(req.query.date || '') ? req.query.date : orig.start.slice(0, 10);
          orig.exdates = [...new Set([...(orig.exdates || []), fecha])];
          const suelto = { ...orig, repeat: null };
          delete suelto.exdates;
          const copia = limpiaEvento({ ...req.body, repeat: null }, suelto);
          if (copia.source) delete copia.source;
          copia.id = newId();
          copia.createdAt = copia.updatedAt = Date.now();
          d.events.push(copia);
          return copia;
        }
        const nuevo = limpiaEvento(req.body || {}, orig);
        if (!calExiste(d, nuevo.calendarId)) nuevo.calendarId = 'personal';
        nuevo.updatedAt = Date.now(); store.marcaEdicion(nuevo, req);
        d.events[i] = nuevo;
        return nuevo;
      });
      await avisaOrigen(req.user, ev, ev);
      res.json({ ok: true, event: ev });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/events/:id', async (req, res) => {
    try {
      const quitado = await mutar(req.user, (d) => {
        const i = d.events.findIndex(e => e.id === req.params.id);
        if (i < 0) return null;
        const ev = d.events[i];
        if (req.query.scope === 'one' && ev.repeat && RE_DIA.test(req.query.date || '')) {
          ev.exdates = [...new Set([...(ev.exdates || []), req.query.date])];
          return null;
        }
        d.events.splice(i, 1);
        return ev;
      });
      if (quitado) { await store.guardaBorrado(userRoot(req.user), 'calendario', quitado.id, quitado).catch(() => {}); await avisaOrigen(req.user, quitado, null); }
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return { ganchos, avisaOrigen, crearEvento };
}

module.exports = { montaEventos };
