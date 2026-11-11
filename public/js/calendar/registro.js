'use strict';
/* calendar/registro.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { S } = C;
  const arrancaAvisos = (...a) => C.arrancaAvisos(...a);
  const build = (...a) => C.build(...a);
  const cargaProximos = (...a) => C.cargaProximos(...a);
  const goto = (...a) => C.goto(...a);
  const load = (...a) => C.load(...a);
  const openEvent = (...a) => C.openEvent(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Registro ---------- */
  K.registerView('calendar', {
    async open() {
      if (!S.built) build();
      await K.loadCalendars().catch(() => {}); await K.loadLabels().catch(() => {});
      K.cals.list.forEach(c => { if (c.visible === false) S.hidden.add(c.id); });
      load();
    },
    close() {},
  });
  const invalida = () => { S.dirty = true; cargaProximos(); if (S.built && !$('view-calendar').hidden) load(); };
  ['calendar', 'prompts', 'notes', 'files'].forEach(ev => K.bus.on(ev, invalida));
  K.bus.on('labels', () => { if (S.built && !$('view-calendar').hidden) render(); });

  K.openers.event = async (id) => {
    switchTab('calendar');
    try {
      const r = await K.get('/api/calendar/events/' + id);
      if (r.event.start) goto(K.d.parse(r.event.start), 'month');
      openEvent({ ...r.event, occurrence: (r.event.start || '').slice(0, 10), recurring: !!r.event.repeat });
    } catch (e) { K.fail(e); }
  };
  K.calendar = {
    newEvent: (opts) => { switchTab('calendar'); openEvent(null, opts || {}); },
    goto,
    reload: () => { S.dirty = true; if (S.built) load(); },
    hide: (id) => S.hidden.add(id),
  };

  // Al iniciar sesión (preload) arrancan también los avisos
  const preloadOrig = K.preload;
  K.preload = function () { preloadOrig(); arrancaAvisos(); };

  Object.assign(C, { invalida, preloadOrig });
})();
