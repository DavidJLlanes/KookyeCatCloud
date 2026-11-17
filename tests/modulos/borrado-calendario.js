'use strict';
// Al borrar algo con evento en el calendario o con recordatorio pendiente se pregunta qué hacer con ellos:
// /api/calendar/dependientes dice qué cuelga y /api/calendar/desvincula los deja sueltos si se conservan.
module.exports = async ({ req, prueba, igual, cierto }) => {
  const eventos = async () => (await req('GET', '/api/calendar/events?from=2027-03-01&to=2027-03-31')).j.events || [];

  await prueba('borrado con calendario: dependientes de un juego con evento y de una nota con recordatorio pendiente', async () => {
    const g = (await req('POST', '/api/games', { title: 'BC-juego', status: 'proximo', released: '2027-03-10', calendar: { date: '2027-03-10' } })).j;
    cierto(g.id, 'juego creado');
    const a = await req('POST', '/api/calendar/dependientes', { items: [{ type: 'game', ref: g.id }] });
    igual(a.s, 200); igual(a.j.items.length, 1, 'el evento del juego'); igual(a.j.items[0].titulo, 'BC-juego');
    const r = await req('POST', '/api/recordatorios', { titulo: 'BC-aviso', fecha: '2027-03-12', hora: '09:00', vinculo: { tipo: 'note', ref: 'bc-nota', titulo: 'Nota' } });
    igual(r.s, 200);
    const b = await req('POST', '/api/calendar/dependientes', { items: [{ type: 'note', ref: 'bc-nota' }] });
    igual(b.j.items.filter(x => x.tipo === 'recordatorio').length, 1, 'recordatorio pendiente');
    igual((await req('POST', '/api/calendar/dependientes', { items: [{ type: 'note', ref: 'otra-nota' }] })).j.items.length, 0, 'nada cuelga de otra nota');
    igual((await req('POST', '/api/calendar/dependientes', { items: 'no' })).s, 400, 'entrada mal formada');
    await req('DELETE', '/api/games/' + g.id); await req('DELETE', '/api/recordatorios/' + r.j.recordatorio.id);
  });

  await prueba('borrado con calendario: conservar deja el evento y el recordatorio sueltos; borrar sin conservar los quita', async () => {
    const g = (await req('POST', '/api/games', { title: 'BC-conservar', status: 'proximo', calendar: { date: '2027-03-15' } })).j;
    igual((await req('POST', '/api/calendar/desvincula', { items: [{ type: 'game', ref: g.id }] })).s, 200);
    igual((await req('DELETE', '/api/games/' + g.id)).s, 200);
    const ev = (await eventos()).find(e => e.title === 'BC-conservar');
    cierto(ev, 'el evento sigue en el calendario'); cierto(!ev.source, 'pero ya no apunta al juego borrado');
    await req('DELETE', '/api/calendar/events/' + ev.id);

    const r = await req('POST', '/api/recordatorios', { titulo: 'BC-suelto', fecha: '2027-03-20', vinculo: { tipo: 'contact', ref: 'bc-contacto', titulo: 'C' } });
    igual((await req('POST', '/api/calendar/desvincula', { items: [{ type: 'contact', ref: 'bc-contacto' }] })).s, 200);
    const lista = (await req('GET', '/api/recordatorios')).j.recordatorios;
    const x = lista.find(y => y.id === r.j.recordatorio.id);
    cierto(x && !x.vinculo, 'el recordatorio sigue, sin vínculo');
    await req('DELETE', '/api/recordatorios/' + x.id);

    const g2 = (await req('POST', '/api/games', { title: 'BC-borrar', status: 'proximo', calendar: { date: '2027-03-16' } })).j;
    igual((await req('DELETE', '/api/games/' + g2.id)).s, 200);
    cierto(!(await eventos()).some(e => e.title === 'BC-borrar'), 'sin conservar, el evento se va con el juego');
  });
};
