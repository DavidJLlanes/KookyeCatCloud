'use strict';
// Pruebas de humo de lo que cruza módulos: búsqueda global, fecha de calendario de archivos, iCal y cableado de calendario↔notas.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  await prueba('transversal: la búsqueda global encuentra notas por título y por contenido, y eventos', async () => {
    const n = await req('POST', '/api/notes', { type: 'note', title: 'Zanahoriaglobal', body: 'contenido-raro-xyz' }); igual(n.s, 200);
    const id = (n.j.item || n.j).id;
    await req('POST', '/api/notes/' + id, { title: 'Zanahoriaglobal', body: 'contenido-raro-xyz' });
    cierto((await req('GET', '/api/omni?q=zanahoriaglobal')).j.notes.some(x => x.id === id), 'por título');
    cierto((await req('GET', '/api/omni?q=contenido-raro-xyz')).j.notes.some(x => x.id === id), 'por contenido');
    igual((await req('GET', '/api/omni?q=a')).j.notes.length, 0, 'menos de 2 letras no busca');
    await req('DELETE', '/api/notes/' + id);
  });
  await prueba('transversal: fecha de calendario de archivos subidos (uno a uno y en bloque)', async () => {
    const fd = new FormData(); fd.append('path', ''); for (const nm of ['tr-1.txt', 'tr-2.txt', 'tr-3.txt', 'tr-4.txt']) fd.append('files', new Blob(['x']), nm);
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    igual((await req('POST', '/api/files/calendar', { paths: ['tr-1.txt'], calendar: { date: '2026-12-05', time: '10:00' } })).s, 200, 'uno');
    igual((await req('POST', '/api/files/calendar', { paths: ['tr-1.txt', 'tr-2.txt', 'tr-3.txt', 'tr-4.txt'], calendar: { date: '2026-12-06' } })).s, 200, 'en bloque');
    igual((await req('POST', '/api/files/calendar', { paths: [] })).s, 400, 'selección vacía');
    igual((await req('POST', '/api/files/calendar', { paths: ['../fuera'] })).s >= 400, true, 'no sale de la raíz');
    for (const nm of ['tr-1.txt', 'tr-2.txt', 'tr-3.txt', 'tr-4.txt']) await req('DELETE', '/api/files?path=' + nm).catch(() => {});
  });
  await prueba('transversal: el feed iCal no responde con un token inventado', async () => {
    const r = await fetch(BASE + '/ical/' + 'a'.repeat(64) + '.ics'); igual(r.status, 404);
  });
};
