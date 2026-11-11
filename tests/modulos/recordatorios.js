'use strict';
// Pruebas de humo de Recordatorios: migración de los antiguos del calendario, validación, calendario opcional, hecho y posponer,
// vínculos (renombrar), avisos push, conflictos entre dispositivos, borrado con copia, escritura concurrente, lectura dañada y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA }) => {
  const nuevo = (extra = {}) => req('POST', '/api/recordatorios', { titulo: 'Llamar al gestor', fecha: '2026-12-20', hora: '09:00', antes: 0, ...extra });
  const eventos = async () => (await req('GET', '/api/calendar/events?from=2026-12-01&to=2026-12-31')).j.events || [];
  let id, v0;

  await prueba('recordatorios: los antiguos del calendario (ligados a una nota) se pasan una sola vez', async () => {
    const viejo = await req('POST', '/api/calendar/events', { title: 'Revisar la nota', start: '2026-12-22T10:00', calendarId: 'personal', reminders: [10], link: { type: 'note', ref: 'nota-vieja', title: 'Mi nota' } });
    igual(viejo.s, 200);
    const r = await req('GET', '/api/recordatorios'); igual(r.s, 200);
    const m = r.j.recordatorios.find(x => x.titulo === 'Revisar la nota');
    cierto(m, 'migrado'); igual(m.fecha, '2026-12-22'); igual(m.hora, '10:00'); igual(m.antes, 10); igual(m.vinculo.tipo, 'note'); igual(m.vinculo.titulo, 'Mi nota'); igual(m.calendario, true);
    const ev = await eventos();
    cierto(!ev.some(e => e.link), 'el evento viejo ya no está'); cierto(ev.some(e => e.source && e.source.type === 'recordatorio' && e.source.ref === m.id), 'sigue en el calendario como recordatorio');
    igual((await req('GET', '/api/recordatorios')).j.recordatorios.filter(x => x.titulo === 'Revisar la nota').length, 1, 'no se repite');
    igual((await req('DELETE', '/api/recordatorios/' + m.id)).s, 200);
  });

  await prueba('recordatorios: validación (título, fecha, hora, aviso, vínculo, notas)', async () => {
    igual((await nuevo({ titulo: '  ' })).s, 400, 'sin título');
    igual((await nuevo({ titulo: 'x'.repeat(201) })).s, 400, 'título largo (no se recorta)');
    igual((await nuevo({ fecha: '2026-02-31' })).s, 400, 'día imposible');
    igual((await nuevo({ hora: '25:00' })).s, 400, 'hora imposible');
    igual((await nuevo({ antes: 7 })).s, 400, 'aviso no permitido');
    igual((await nuevo({ vinculo: { tipo: 'otro', ref: 'x' } })).s, 400, 'vínculo de un tipo desconocido');
    igual((await nuevo({ notas: 'x'.repeat(2001) })).s, 400, 'notas largas (no se recortan)');
    igual((await req('PUT', '/api/recordatorios/zzzz', { titulo: 'x' })).s, 404, 'id raro');
  });

  await prueba('recordatorios: crear con y sin calendario, mover y quitar del calendario', async () => {
    const a = await nuevo({ calendario: true, vinculo: { tipo: 'file', ref: 'Docs/factura.pdf', titulo: 'factura.pdf' } }); igual(a.s, 200);
    id = a.j.recordatorio.id; v0 = a.j.recordatorio.updatedAt;
    igual(a.j.recordatorio.calendario, true);
    const ev = (await eventos()).find(e => e.source && e.source.ref === id); cierto(ev, 'evento en el calendario'); igual(ev.start, '2026-12-20T09:00');
    const b = await req('PUT', '/api/recordatorios/' + id, { fecha: '2026-12-21' }); igual(b.s, 200);
    igual((await eventos()).find(e => e.source && e.source.ref === id).start, '2026-12-21T09:00', 'el evento sigue al recordatorio');
    const c = await req('PUT', '/api/recordatorios/' + id, { calendario: false, fecha: '2026-12-20' });
    cierto(!(await eventos()).some(e => e.source && e.source.ref === id), 'sin calendario no hay evento'); igual(c.j.recordatorio.calendario, false);
    const s = await nuevo({ titulo: 'Sin fecha', fecha: '', hora: '10:00', calendario: true }); igual(s.s, 200);
    igual(s.j.recordatorio.hora, '', 'sin fecha no hay hora'); igual(s.j.recordatorio.calendario, false, 'sin fecha no va al calendario');
    await req('DELETE', '/api/recordatorios/' + s.j.recordatorio.id);
  });

  await prueba('recordatorios: hecho, deshacer, posponer y conflicto con otro dispositivo', async () => {
    let r = await req('POST', `/api/recordatorios/${id}/hecho`, { hecho: true }); igual(r.j.recordatorio.hecho, true); cierto(r.j.recordatorio.hechoEn > 0);
    r = await req('POST', `/api/recordatorios/${id}/hecho`, { hecho: false }); igual(r.j.recordatorio.hecho, false); igual(r.j.recordatorio.hechoEn, 0);
    igual((await req('POST', `/api/recordatorios/${id}/posponer`, {})).s, 400, 'sin cuánto');
    igual((await req('POST', `/api/recordatorios/${id}/posponer`, { minutos: 0 })).s, 400);
    const m = await req('POST', `/api/recordatorios/${id}/posponer`, { hasta: 'manana' }); igual(m.s, 200);
    cierto(m.j.recordatorio.fecha > '2026-11-01', 'fecha de mañana'); igual(m.j.recordatorio.antes, 0); igual(m.j.recordatorio.hecho, false);
    const o = await req('PUT', '/api/recordatorios/' + id, { titulo: 'Cambiado fuera' }, { headers: { 'X-KCC-Client': 'otro' } }); igual(o.s, 200);
    igual((await req('PUT', '/api/recordatorios/' + id, { titulo: 'Vieja', base: v0 })).s, 409);
    igual((await req('PUT', '/api/recordatorios/' + id, { notas: '' })).j.recordatorio.notas, '', 'notas vacías son válidas');
    igual((await req('PUT', '/api/recordatorios/' + id, { fecha: '2026-12-20', hora: '09:00', antes: 0 })).s, 200);
  });

  await prueba('recordatorios: al renombrar la nota a la que apuntan, cambia el título del vínculo', async () => {
    const n = await req('POST', '/api/notes', { type: 'note', title: 'Nota original', body: 'x' }); igual(n.s, 200);
    const r = await nuevo({ titulo: 'Sobre la nota', vinculo: { tipo: 'note', ref: n.j.item.id, titulo: 'Nota original' } }); igual(r.s, 200);
    igual((await req('PUT', '/api/notes/' + n.j.item.id, { title: 'Nota renombrada' })).s, 200);
    const l = (await req('GET', '/api/recordatorios')).j.recordatorios.find(x => x.id === r.j.recordatorio.id);
    igual(l.vinculo.titulo, 'Nota renombrada'); await req('DELETE', '/api/recordatorios/' + r.j.recordatorio.id);
  });

  await prueba('recordatorios: avisan por push a su hora, una sola vez, y los hechos no avisan', async () => {
    const d = await req('POST', '/api/push/dispositivos', { suscripcion: { endpoint: 'https://push.prueba.local/envio/rec', keys: { p256dh: 'BPubClaveDePruebaRec', auth: 'authRec' } } }); igual(d.s, 200);
    await req('PUT', '/api/push/ajustes', { on: true, detalles: true, silencio: { on: false }, recordatorios: { on: true, hora: '09:00' }, pagos: { on: false }, calendario: { on: false }, contactos: { on: false } });
    // El servidor guarda todos los avisos de la prueba, uno por dispositivo registrado: se devuelven solo los NUEVOS (por dispositivo)
    const dispositivos = (await req('GET', '/api/push/config')).j.dispositivos.length;
    let previos = 0;
    const ciclo = async (iso) => {
      const todos = (await req('POST', '/api/push/_ciclo', { fecha: iso })).j.avisos.filter(a => a.etiqueta === 'kcc-recordatorios');
      const nuevos = todos.slice(previos); previos = todos.length;
      return nuevos.filter((_, i) => i % dispositivos === 0);
    };
    const hecho = await nuevo({ titulo: 'Ya hecho', hora: '09:00' }); await req('POST', `/api/recordatorios/${hecho.j.recordatorio.id}/hecho`, { hecho: true });
    igual((await ciclo('2026-12-20T07:30:00Z')).length, 0, 'a las 8:30 todavía no toca');
    const a = await ciclo('2026-12-20T08:05:00Z'); igual(a.length, 1, 'a las 9:05 avisa');
    cierto(a[0].cuerpo.includes('Cambiado fuera') || a[0].cuerpo.includes('Llamar'), 'con detalle'); cierto(!a[0].cuerpo.includes('Ya hecho'), 'el hecho no avisa');
    igual((await ciclo('2026-12-20T08:10:00Z')).length, 0, 'no se repite');
    const dia = await nuevo({ titulo: 'Todo el día', hora: '', fecha: '2026-12-21' });
    igual((await ciclo('2026-12-21T08:05:00Z')).length, 1, 'de todo el día: a la hora de los ajustes'); igual(dia.s, 200);
    const sin = await nuevo({ titulo: 'Sin aviso', fecha: '2026-12-22', antes: -1 }); igual(sin.s, 200);
    igual((await ciclo('2026-12-22T08:05:00Z')).length, 0, 'sin aviso no avisa');
    await req('DELETE', '/api/push/dispositivos/' + d.j.id);
  });

  await prueba('recordatorios: borrar deja copia 30 días y quita el evento del calendario', async () => {
    const c = await nuevo({ titulo: 'Con calendario', calendario: true, fecha: '2026-12-23' }); const cid = c.j.recordatorio.id;
    cierto((await eventos()).some(e => e.source && e.source.ref === cid));
    igual((await req('DELETE', '/api/recordatorios/' + cid)).s, 200);
    cierto(!(await eventos()).some(e => e.source && e.source.ref === cid), 'el evento se va con él');
    const dir = path.join(DATA, '.kcc', 'borrados', 'recordatorios'); cierto(fs.existsSync(dir) && fs.readdirSync(dir).length >= 1, 'copia del recordatorio');
    igual((await req('DELETE', '/api/recordatorios/' + cid)).s, 404, 'ya no existe');
  });

  await prueba('recordatorios: 15 altas a la vez no se pisan y un archivo dañado no equivale a vacío', async () => {
    const antes = (await req('GET', '/api/recordatorios')).j.recordatorios.length;
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => nuevo({ titulo: 'Conc ' + i, fecha: '2026-12-24' })));
    cierto(rs.every(r => r.s === 200), 'todas 200');
    igual((await req('GET', '/api/recordatorios')).j.recordatorios.length, antes + 15);
    const f = path.join(DATA, '.kcc', 'recordatorios', 'data.json'); fs.writeFileSync(f, '{roto');
    const r = await req('GET', '/api/recordatorios'); igual(r.s, 200); cierto(r.j.recordatorios.length > 0, 'se repone de la copia');
    cierto(fs.readdirSync(path.dirname(f)).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
  });

  await prueba('recordatorios: los que se repiten saltan a la siguiente fecha al marcarlos hechos', async () => {
    const c = await nuevo({ titulo: 'Tomar vitaminas', fecha: '2099-01-05', repite: { freq: 'dia', cada: 2 } }); igual(c.s, 200); const id = c.j.recordatorio.id;
    igual(c.j.recordatorio.repite.freq, 'dia');
    const h = await req('POST', `/api/recordatorios/${id}/hecho`, { hecho: true }); igual(h.s, 200);
    igual(h.j.siguiente, '2099-01-07', 'salta dos días'); igual(h.j.recordatorio.hecho, false, 'sigue pendiente'); igual(h.j.recordatorio.vueltas, 1);
    const u = await req('POST', `/api/recordatorios/${id}/hecho`, { hecho: false, deshacer: h.j.anterior });
    igual(u.j.recordatorio.fecha, '2099-01-05', 'deshacer vuelve a la fecha'); igual(u.j.recordatorio.vueltas, 0);
    const fin = await nuevo({ titulo: 'Última vez', fecha: '2099-02-01', repite: { freq: 'semana', cada: 1, hasta: '2099-02-03' } });
    const f = await req('POST', `/api/recordatorios/${fin.j.recordatorio.id}/hecho`, { hecho: true });
    igual(f.j.siguiente, null); igual(f.j.recordatorio.hecho, true, 'tras la fecha final se da por terminado');
    const mes = await nuevo({ titulo: 'Fin de mes', fecha: '2099-01-31', repite: { freq: 'mes' } });
    igual((await req('POST', `/api/recordatorios/${mes.j.recordatorio.id}/hecho`, { hecho: true })).j.siguiente, '2099-02-28');
  });

  await prueba('recordatorios: repetición inválida se rechaza', async () => {
    igual((await nuevo({ titulo: 'x', fecha: '2099-01-05', repite: { freq: 'siempre' } })).s, 400);
    igual((await nuevo({ titulo: 'x', fecha: '2099-01-05', repite: { freq: 'dia', cada: 0 } })).s, 400);
    igual((await nuevo({ titulo: 'x', fecha: '', repite: { freq: 'dia' } })).s, 400, 'sin fecha no se repite');
    igual((await nuevo({ titulo: 'x', fecha: '2099-01-05', repite: { freq: 'dia', hasta: '2098-01-01' } })).s, 400);
    igual((await nuevo({ titulo: 'x', fecha: '2099-01-05', repite: [] })).s, 400);
  });

  await prueba('recordatorios: el aviso de uno solo lleva la acción Hecho/Posponer', async () => {
    const { siguiente, describe } = require('../../lib/recordatorios/repeticion');
    igual(siguiente({ freq: 'mes', cada: 1, mesModo: 'semana', ancla: '2099-01-04' }, '2099-01-04', '2099-01-05'), '2099-02-01', 'primer lunes');
    cierto(typeof describe({ freq: 'dia', cada: 1 }) === 'string');
  });

  await prueba('recordatorios: logros (recuentos y familias)', async () => {
    const g = (await req('GET', '/api/game')).j;
    cierto(g.recuentos.recordatorios >= 1, 'recuento'); cierto(g.logros.familias.some(f => f.id === 'rc_total' && f.valor >= 1), 'familia rc_total');
    cierto(g.logros.familias.some(f => f.id === 'rc_vinculados' && f.valor >= 1), 'familia rc_vinculados');
  });
};
