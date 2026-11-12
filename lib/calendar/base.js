'use strict';
// Estado: archivo por usuario, calendarios del sistema, rangos y festivos virtuales.
const path = require('path');
const holidays = require('./festivos');
const store = require('../nucleo/store');
const { kccDir, updateJson, readJson, HttpError } = store;
const { DAY, RE_DIA, msDe } = require('./fechas');
const { CALENDARIOS_BASE } = require('./evento');

function montaBase(ctx) {
  const { userRoot } = ctx;

  const archivo = (user) => path.join(kccDir(userRoot(user)), 'calendar.json');
  const base = () => ({ calendars: CALENDARIOS_BASE.map(c => ({ ...c })), events: [] });

  // Garantiza que existan los calendarios del sistema aunque el archivo sea antiguo
  const normaliza = (d) => {
    if (!Array.isArray(d.calendars)) d.calendars = [];
    if (!Array.isArray(d.events)) d.events = [];
    if (!d.holidays) d.holidays = { enabled: false, region: '', visible: true, color: '#ef4444' };
    if (!d.ical) d.ical = {};
    for (const c of CALENDARIOS_BASE) if (!d.calendars.some(x => x.id === c.id)) d.calendars.push({ ...c });
    return d;
  };
  const leer = async (user) => normaliza(await readJson(archivo(user), base));
  const mutar = (user, fn) => updateJson(archivo(user), base, (d) => fn(normaliza(d)));
  const calExiste = (d, id) => d.calendars.some(c => c.id === id);
  const rangoOk = (desde, hasta) => {
    if (!RE_DIA.test(desde || '') || !RE_DIA.test(hasta || '')) throw new HttpError(400, 'Rango no válido');
    if (msDe(hasta) - msDe(desde) > 400 * DAY) throw new HttpError(400, 'Rango demasiado grande');
  };

  // El calendario de festivos es virtual: no guarda eventos, se calcula al pedir un rango
  const calFestivos = (d) => ({
    id: 'festivos', name: `Festivos · ${(holidays.REGIONES[d.holidays.region] || {}).name || 'España'}`,
    color: d.holidays.color || '#ef4444', visible: d.holidays.visible !== false, system: true, virtual: true,
  });
  const listaCalendarios = (d) => [...d.calendars, ...(d.holidays.enabled ? [calFestivos(d)] : [])];
  const eventosFestivos = (d, desde, hasta) => (!d.holidays.enabled ? [] : holidays.entre(desde, hasta, d.holidays.region).map(h => ({
    id: 'hol:' + h.date, title: h.title, start: h.date, end: h.date, allDay: true, calendarId: 'festivos', kind: 'event',
    holiday: true, readonly: true, scope: h.scope, occurrence: h.date, recurring: false, labels: [], reminders: [],
  })));

  return { archivo, base, normaliza, leer, mutar, calExiste, rangoOk, calFestivos, listaCalendarios, eventosFestivos };
}

module.exports = { montaBase };
