'use strict';
// Resincronizar juegos con RAWG (un RAWG de mentira, ver tests/smoke.js): detecta cambios de fecha de salida, propone y solo aplica lo aceptado,
// moviendo si se pide el evento del calendario.
module.exports = async ({ req, prueba, igual, cierto, rawgMock }) => {
  const eventos = async () => (await req('GET', '/api/calendar/events?from=2027-04-01&to=2027-06-30')).j.events || [];
  let a, b, c;

  await prueba('juegos RAWG: revisa y propone solo los que han cambiado de fecha', async () => {
    a = (await req('POST', '/api/games', { title: 'RW-con-evento', status: 'proximo', released: '2027-04-10', rawgId: 910001, calendar: { date: '2027-04-10', time: '18:00' } })).j;
    b = (await req('POST', '/api/games', { title: 'RW-igual', status: 'proximo', released: '2027-05-01', rawgId: 910002 })).j;
    c = (await req('POST', '/api/games', { title: 'RW-manual', status: 'deseado' })).j;
    cierto(a.id && b.id && c.id, 'juegos creados');
    rawgMock.fechas = { 910001: '2027-06-02', 910002: '2027-05-01' };
    const r = await req('POST', '/api/games/resync/revisa', {});
    igual(r.s, 200); igual(r.j.cambios.length, 1, 'solo uno ha cambiado'); igual(r.j.cambios[0].id, a.id);
    igual(r.j.cambios[0].antes, '2027-04-10'); igual(r.j.cambios[0].despues, '2027-06-02');
    igual(r.j.cambios[0].calendario.date, '2027-04-10', 'avisa de que tiene evento');
    cierto(r.j.sinRawg >= 1, 'cuenta los no vinculados');
    igual((await req('GET', '/api/games')).j.items.find(g => g.id === a.id).released, '2027-04-10', 'revisar no cambia nada');
    igual((await req('POST', '/api/games/resync/revisa', { ids: [c.id] })).s, 400, 'un juego sin RAWG da aviso claro');
  });

  await prueba('juegos RAWG: aplicar cambia la fecha y mueve el evento (con su hora) solo si se pide', async () => {
    igual((await req('POST', '/api/games/resync/aplica', { cambios: [{ id: a.id, released: '2027-06-02', calendario: false }] })).j.aplicados, 1);
    igual((await req('GET', '/api/games')).j.items.find(g => g.id === a.id).released, '2027-06-02');
    cierto((await eventos()).some(e => e.title === 'RW-con-evento' && e.start.startsWith('2027-04-10')), 'el evento no se movió');
    const m = await req('POST', '/api/games/resync/aplica', { cambios: [{ id: a.id, released: '2027-06-02', calendario: true }] });
    igual(m.j.movidos, 1);
    const ev = (await eventos()).find(e => e.title === 'RW-con-evento');
    igual(ev.start, '2027-06-02T18:00', 'evento movido conservando la hora');
    igual((await req('GET', '/api/games')).j.items.find(g => g.id === a.id).cal.date, '2027-06-02');
    igual((await req('POST', '/api/games/resync/aplica', { cambios: [{ id: a.id, released: '02/06/2027' }, { id: c.id, released: '2027-07-01' }] })).j.aplicados, 0, 'fecha mal formada o juego sin RAWG: se ignoran');
  });

  await prueba('juegos RAWG: si RAWG limita las peticiones se avisa y no se pierde nada', async () => {
    rawgMock.falla = true;
    const r = await req('POST', '/api/games/resync/revisa', {});
    igual(r.s, 429);
    rawgMock.falla = false;
    for (const g of [a, b, c]) await req('DELETE', '/api/games/' + g.id);
  });
};
