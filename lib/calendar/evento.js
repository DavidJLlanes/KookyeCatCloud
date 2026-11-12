'use strict';
// Modelo del evento: calendarios base, orígenes, vínculos, repetición y limpieza de entrada.
const store = require('../nucleo/store');
const { HttpError, cleanColor, cleanStr, cleanIds } = store;
const { RE_DIA, msDe, fechaDe, validaFecha } = require('./fechas');

const CALENDARIOS_BASE = [
  { id: 'personal', name: 'Personal', color: '#3b82f6', visible: true, system: false },
  { id: 'prompts', name: 'Prompts', color: '#8b5cf6', visible: true, system: true },
  { id: 'notas', name: 'Notas', color: '#f59e0b', visible: true, system: true },
  { id: 'archivos', name: 'Archivos', color: '#22c55e', visible: true, system: true },
  { id: 'juegos', name: 'Juegos', color: '#ec4899', visible: true, system: true },
  { id: 'pagos', name: 'Pagos', color: '#f97316', visible: true, system: true },
];
const CAL_POR_ORIGEN = Object.assign(Object.create(null), { prompt: 'prompts', note: 'notas', file: 'archivos', game: 'juegos', pago: 'pagos', recordatorio: 'personal' });
const TIPOS_ORIGEN = Object.keys(CAL_POR_ORIGEN);
// Recordatorios y tareas "colgados" de una nota o un contacto. A diferencia del origen (un único evento que
// es la fecha de la nota), una nota o un contacto puede tener tantos como haga falta.
const TIPOS_VINCULO = ['note', 'contact'];
function limpiaVinculo(l) {
  if (!l || typeof l !== 'object' || !TIPOS_VINCULO.includes(l.type) || !l.ref) return null;
  return { type: l.type, ref: cleanStr(l.ref, 200), title: cleanStr(l.title, 200) };
}

function limpiaRepeticion(r) {
  if (!r || typeof r !== 'object') return null;
  const freq = ['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq) ? r.freq : null;
  if (!freq) return null;
  const out = { freq, interval: Math.min(Math.max(parseInt(r.interval, 10) || 1, 1), 99) };
  if (freq === 'weekly' && Array.isArray(r.byday)) {
    out.byday = [...new Set(r.byday.map(Number).filter(n => n >= 0 && n <= 6))].sort();
    if (!out.byday.length) delete out.byday;
  }
  if (r.until && RE_DIA.test(r.until)) out.until = r.until;
  else if (r.count) out.count = Math.min(Math.max(parseInt(r.count, 10) || 1, 1), 1000);
  return out;
}

function limpiaEvento(b, prev) {
  const o = { ...(prev || {}) };
  if (b.title !== undefined || !prev) o.title = store.corto(b.title, 200, 'El título', b.__recorta) || 'Sin título';
  if (b.description !== undefined) o.description = store.textoLargo(b.description, 5000, 'La descripción', b.__recorta);
  if (b.location !== undefined) o.location = store.corto(b.location, 200, 'El lugar', b.__recorta);
  if (b.calendarId !== undefined) o.calendarId = cleanStr(b.calendarId, 40) || 'personal';
  if (b.color !== undefined) o.color = cleanColor(b.color, '');
  if (b.labels !== undefined) o.labels = cleanIds(b.labels);
  if (b.kind !== undefined) o.kind = b.kind === 'task' ? 'task' : 'event';
  if (b.link !== undefined) { const l = limpiaVinculo(b.link); if (l) o.link = l; else delete o.link; }
  if (b.done !== undefined) o.done = !!b.done;
  if (b.reminders !== undefined) {
    o.reminders = [...new Set((Array.isArray(b.reminders) ? b.reminders : [])
      .map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 60 * 24 * 30))].slice(0, 5);
  }
  if (b.allDay !== undefined) o.allDay = !!b.allDay;
  if (b.start !== undefined) o.start = b.start;
  if (b.end !== undefined) o.end = b.end;
  if (b.repeat !== undefined) o.repeat = limpiaRepeticion(b.repeat);
  if (b.exdates !== undefined) {
    o.exdates = [...new Set((Array.isArray(b.exdates) ? b.exdates : []).filter(x => RE_DIA.test(String(x))))].slice(0, 500);
  }

  o.allDay = !!o.allDay;
  if (b.uid !== undefined) o.uid = cleanStr(b.uid, 200);
  // Una tarea puede no tener fecha: vive en la lista "Tareas sin fecha" hasta que se arrastra a un hueco
  if (!o.start && o.kind === 'task') {
    o.start = ''; o.end = ''; o.allDay = false; o.repeat = null; o.exdates = [];
    if (!o.reminders) o.reminders = [];
    if (!o.labels) o.labels = [];
    if (!o.calendarId) o.calendarId = 'personal';
    return o;
  }
  if (!validaFecha(o.start || '')) throw new HttpError(400, 'Fecha de inicio no válida');
  // El tipo de la fecha debe cuadrar con allDay: se normaliza en vez de rechazar
  if (o.allDay) {
    o.start = o.start.slice(0, 10);
    if (!o.end) o.end = o.start;
    o.end = o.end.slice(0, 10);
    if (!validaFecha(o.end)) throw new HttpError(400, 'Fecha de fin no válida');
  } else {
    if (o.start.length === 10) o.start += 'T09:00';
    if (!o.end) o.end = fechaDe(msDe(o.start) + 60 * 60000);
    if (o.end.length === 10) o.end += 'T10:00';
    if (!validaFecha(o.end)) throw new HttpError(400, 'Fecha de fin no válida');
  }
  if (msDe(o.end) < msDe(o.start)) o.end = o.allDay ? o.start : fechaDe(msDe(o.start) + 60 * 60000);
  if (!o.reminders) o.reminders = [];
  if (!o.labels) o.labels = [];
  if (!o.calendarId) o.calendarId = 'personal';
  if (!o.kind) o.kind = 'event';
  return o;
}

module.exports = { CALENDARIOS_BASE, CAL_POR_ORIGEN, TIPOS_ORIGEN, TIPOS_VINCULO, limpiaVinculo, limpiaRepeticion, limpiaEvento };
