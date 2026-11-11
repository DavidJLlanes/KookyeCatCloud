'use strict';
// Pruebas de humo del calendario: calendarios, eventos (rango, repetición, edición, borrado), tareas, festivos, importar, iCal y búsqueda.
module.exports = async ({ req, prueba, igual, cierto, BASE }) => {
  let ev;
  await prueba('calendario: calendarios (crear, editar, borrar) y listado', async () => {
    const c = await req('POST', '/api/calendar/calendars', { name: 'CAL-prueba', color: '#10b981' }); igual(c.s, 200);
    const id = (c.j.calendar || c.j).id; cierto(id, 'id del calendario');
    igual((await req('PUT', '/api/calendar/calendars/' + id, { name: 'CAL-renombrado', color: '#ef4444' })).s, 200);
    const g = await req('GET', '/api/calendar'); igual(g.s, 200);
    cierto(JSON.stringify(g.j).includes('CAL-renombrado'), 'aparece con el nombre nuevo');
    igual((await req('DELETE', '/api/calendar/calendars/' + id)).s, 200);
    igual((await req('DELETE', '/api/calendar/calendars/personal')).s >= 400, true, 'el personal no se borra');
  });
  await prueba('calendario: eventos por rango, repetición semanal, edición y borrado', async () => {
    const c = await req('POST', '/api/calendar/events', { title: 'CAL-semanal', start: '2026-12-07T09:00', end: '2026-12-07T10:00', repeat: { freq: 'weekly', interval: 1, until: '2026-12-31' } });
    igual(c.s, 200); ev = (c.j.event || c.j);
    const r = await req('GET', '/api/calendar/events?from=2026-12-01&to=2026-12-31'); igual(r.s, 200);
    const n = (r.j.events || r.j).filter(e => e.title === 'CAL-semanal').length; cierto(n >= 4, 'ocurrencias semanales: ' + n);
    igual((await req('PUT', '/api/calendar/events/' + ev.id, { ...ev, title: 'CAL-editado' })).s, 200);
    igual((await req('GET', '/api/calendar/events/' + ev.id)).j.title || (await req('GET', '/api/calendar/events/' + ev.id)).j.event.title, 'CAL-editado');
    igual((await req('POST', '/api/calendar/events', { title: 'x', start: 'mañana' })).s >= 400, true, 'fecha inválida');
    const b = await req('GET', '/api/calendar/search?q=CAL-editado'.toLowerCase()); igual(b.s, 200);
    igual((await req('DELETE', '/api/calendar/events/' + ev.id)).s, 200);
    igual((await req('GET', '/api/calendar/events/' + ev.id)).s, 404);
  });
  await prueba('calendario: tareas sin fecha, festivos e importar', async () => {
    const t = await req('POST', '/api/calendar/events', { title: 'CAL-tarea', task: true }); cierto(t.s < 500, 'tarea ' + t.s);
    igual((await req('GET', '/api/calendar/tasks')).s, 200);
    igual((await req('GET', '/api/calendar/holidays')).s, 200);
    const i = await req('POST', '/api/calendar/import', { calendar: { name: 'CAL-importado' }, events: [{ title: 'CAL-imp-1', start: '2026-12-10', end: '2026-12-10', allDay: true }] });
    igual(i.s, 200);
    igual((await req('POST', '/api/calendar/import', { events: 'no' })).s, 400, 'importación inválida');
  });
  await prueba('calendario: suscripción iCal (activar, leer feed público, desactivar)', async () => {
    const on = await req('POST', '/api/calendar/ical', { action: 'enable' }); igual(on.s, 200); cierto(/^[a-f0-9]{64}$/.test(on.j.token), 'token');
    const feed = await fetch(BASE + '/ical/' + on.j.token + '.ics'); igual(feed.status, 200);
    cierto((await feed.text()).includes('BEGIN:VCALENDAR'), 'feed iCal');
    igual((await req('POST', '/api/calendar/ical', { action: 'disable' })).s, 200);
    igual((await fetch(BASE + '/ical/' + on.j.token + '.ics')).status, 404, 'tras desactivar ya no responde');
    igual((await req('POST', '/api/calendar/ical', { action: 'tonteria' })).s, 400);
  });
};
