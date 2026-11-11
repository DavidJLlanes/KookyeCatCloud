'use strict';
/* calendar/estado.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});

  const HH = 48;                       // altura de una hora en px (vistas semana y día)
  const SNAP = 15;                     // minutos al arrastrar
  const REMS = [[0, 'En el momento'], [5, '5 minutos antes'], [10, '10 minutos antes'], [15, '15 minutos antes'],
    [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 día antes'], [2880, '2 días antes'], [10080, '1 semana antes']];
  const remLabel = (m) => (REMS.find(r => r[0] === m) || [m, `${m} min antes`])[1];

  const S = {
    built: false, view: 'month', cursor: K.d.day(new Date()), events: [], range: null,
    hidden: new Set(), labelFilter: new Set(), query: '', dirty: true, loading: 0,
    tasks: [],        // tareas sin fecha (lista lateral)
    drag: null,       // lo que se está arrastrando: { id, occ, recurring, kind, undated }
  };
  try { S.view = localStorage.getItem('kcc-cal-view') || 'month'; } catch {}
  const R = {};   // referencias al DOM

  const evColor = (e) => e.color || (K.cals.by[e.calendarId] && K.cals.by[e.calendarId].color) || '#3b82f6';
  const evStart = (e) => K.d.parse(e.start);
  const evEnd = (e) => K.d.parse(e.end);
  const timeTxt = (e) => (e.allDay ? '' : K.d.hm(evStart(e)));
  const rangeTxt = (e) => {
    const a = evStart(e), b = evEnd(e);
    if (e.allDay) return K.d.same(a, b) ? K.d.long(a) : `${K.d.short(a)} – ${K.d.short(b)}`;
    return K.d.same(a, b) ? `${K.d.long(a)} · ${K.d.hm(a)} – ${K.d.hm(b)}` : `${K.d.short(a)} ${K.d.hm(a)} – ${K.d.short(b)} ${K.d.hm(b)}`;
  };
  const isSpan = (e) => e.allDay || !K.d.same(evStart(e), evEnd(e));


  Object.assign(C, { HH, SNAP, REMS, remLabel, S, R, evColor, evStart, evEnd, timeTxt, rangeTxt, isSpan });
})();
