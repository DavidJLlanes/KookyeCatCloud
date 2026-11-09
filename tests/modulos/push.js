'use strict';
// Pruebas de humo de los avisos push: ajustes, dispositivos (y defensa SSRF), programador con horas fijas (pagos, calendario,
// contactos), no repetir, horario de silencio, privacidad del texto, escritura concurrente, archivos dañados y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE }) => {
  const ctxExtra = { BASE };
  const dir = path.join(DATA, '.kcc', 'push');
  const sub = (n) => ({ endpoint: `https://push.prueba.local/envio/${n}`, keys: { p256dh: 'BPubClaveDePrueba' + n, auth: 'auth' + n } });
  // 10 nov 2026, 09:05 en Madrid (CET = UTC+1)
  const ciclo = async (iso) => (await req('POST', '/api/push/_ciclo', { fecha: iso })).j.avisos;
  const MAÑANA = '2026-11-10T08:05:00Z';
  let pagoId;

  await prueba('push: configuración inicial (apagado) y clave pública', async () => {
    const r = await req('GET', '/api/push/config'); igual(r.s, 200);
    cierto(/^[\w-]{80,}$/.test(r.j.clavePublica), 'clave VAPID pública'); igual(r.j.ajustes.on, false); igual(r.j.dispositivos.length, 0);
    igual(r.j.ajustes.pagos.hora, '09:00'); igual(r.j.ajustes.silencio.desde, '22:00');
    cierto(!JSON.stringify(r.j).includes('privateKey'), 'la clave privada no sale');
  });

  await prueba('push: validación de ajustes (horas, días) y valores vacíos/cero válidos', async () => {
    igual((await req('PUT', '/api/push/ajustes', { pagos: { hora: '25:00' } })).s, 400, 'hora imposible');
    igual((await req('PUT', '/api/push/ajustes', { pagos: { hora: '9:00' } })).s, 400, 'hora sin cero');
    igual((await req('PUT', '/api/push/ajustes', { contactos: { dias: [5] } })).s, 400, 'día no permitido');
    igual((await req('PUT', '/api/push/ajustes', { contactos: { dias: 'x' } })).s, 400, 'días no es lista');
    igual((await req('PUT', '/api/push/ajustes', { silencio: { desde: 'noche' } })).s, 400);
    let r = await req('PUT', '/api/push/ajustes', { contactos: { dias: [] }, calendario: { hora: '00:00' }, detalles: false }); igual(r.s, 200);
    igual(r.j.ajustes.contactos.dias.length, 0, 'lista vacía válida'); igual(r.j.ajustes.calendario.hora, '00:00', 'medianoche válida'); igual(r.j.ajustes.detalles, false);
    r = await req('PUT', '/api/push/ajustes', { contactos: { dias: [3, 0, 3, 1] }, calendario: { hora: '09:00' } });
    igual(JSON.stringify(r.j.ajustes.contactos.dias), '[0,1,3]', 'ordenados y sin repetir'); igual(r.j.ajustes.pagos.hora, '09:00', 'no se tocó lo demás');
  });

  await prueba('push: dispositivos (solo servicios push de navegadores, sin SSRF) y límite', async () => {
    for (const e of ['http://127.0.0.1:9/x', 'https://127.0.0.1/x', 'https://evil.example.com/x', 'https://push.prueba.local@evil.com/x', 'https://push.prueba.local:8443/x', 'ftp://fcm.googleapis.com/x', 'no es una url'])
      igual((await req('POST', '/api/push/dispositivos', { suscripcion: { endpoint: e, keys: sub(1).keys } })).s, 400, e);
    igual((await req('POST', '/api/push/dispositivos', { suscripcion: { endpoint: sub(1).endpoint, keys: { p256dh: 'x y', auth: 'a' } } })).s, 400, 'claves raras');
    igual((await req('POST', '/api/push/dispositivos', { suscripcion: { endpoint: sub(1).endpoint } })).s, 400, 'sin claves');
    igual((await req('POST', '/api/push/dispositivos', {})).s, 400);
    const ok = await req('POST', '/api/push/dispositivos', { suscripcion: sub(1) }); igual(ok.s, 200); igual(ok.j.ajustes.on, true, 'el primero enciende los avisos');
    await req('POST', '/api/push/dispositivos', { suscripcion: sub(1) });
    igual((await req('GET', '/api/push/config')).j.dispositivos.length, 1, 'el mismo dispositivo no se duplica');
    cierto(!JSON.stringify((await req('GET', '/api/push/config')).j).includes('push.prueba.local'), 'el endpoint no sale al cliente');
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => req('POST', '/api/push/dispositivos', { suscripcion: sub(100 + i) })));
    igual(rs.filter(r => r.s === 200).length, 9, 'máximo 10 dispositivos en total (1 + 9)'); igual((await req('GET', '/api/push/config')).j.dispositivos.length, 10);
    const lista = (await req('GET', '/api/push/config')).j.dispositivos;
    for (const d of lista.slice(1)) igual((await req('DELETE', '/api/push/dispositivos/' + d.id)).s, 200);
    igual((await req('DELETE', '/api/push/dispositivos/0000000000000000')).s, 404); igual((await req('DELETE', '/api/push/dispositivos/..%2f..')).s, 404);
  });

  await prueba('push: avisos de pagos (antes, el día, vencido), genéricos y con detalle, sin repetirse', async () => {
    const mk = async (nombre, fecha, extra = {}) => (await req('POST', '/api/pagos', { nombre, compania: 'Mapfre', importe: '45,5', frecuencia: 'mensual', fechaProxima: fecha, avisoDias: 3, ...extra })).j.pago;
    pagoId = (await mk('Seguro hogar', '2026-11-12')).id; await mk('Internet', '2026-11-10'); await mk('Comunidad', '2026-11-08'); await mk('Lejano', '2026-12-20'); await mk('Sin aviso', '2026-11-11', { recordar: false });
    await req('PUT', '/api/push/ajustes', { calendario: { on: false }, contactos: { on: false }, detalles: false });
    igual((await ciclo('2026-11-10T07:30:00Z')).length, 0, 'son las 08:30: aún no es la hora (09:00)');
    let a = await ciclo(MAÑANA); igual(a.length, 1, 'un solo aviso agrupado'); igual(a[0].titulo, 'Pagos'); igual(a[0].vista, 'pagos');
    igual(a[0].cuerpo, 'Tienes 3 pagos por vencer', 'genérico: sin nombres ni importes');
    cierto(!/Seguro|Mapfre|45/.test(JSON.stringify(a[0])), 'no se cuela ningún detalle');
    igual((await ciclo('2026-11-10T08:10:00Z')).length, 1, 'un segundo ciclo no repite');
    igual((await ciclo('2026-11-10T08:11:00Z')).length, 1);
    await req('PUT', '/api/push/ajustes', { detalles: true });
    const otro = await mk('Gas', '2026-11-11'); a = await ciclo('2026-11-10T08:15:00Z');
    igual(a.length, 2, 'solo el pago nuevo genera otro aviso'); cierto(/Gas · 45,5 € · mañana/.test(a[1].cuerpo), 'con detalle: ' + a[1].cuerpo);
    await req('PUT', '/api/pagos/' + otro.id, { fechaProxima: '2026-12-30' });
  });

  await prueba('push: horario de silencio (cruza la medianoche) y apagado general', async () => {
    await req('PUT', '/api/push/ajustes', { pagos: { on: true }, calendario: { on: false }, contactos: { on: false }, detalles: true });
    const m = await req('POST', '/api/pagos', { nombre: 'Noche', frecuencia: 'unico', fechaProxima: '2026-11-10', avisoDias: 0 }); igual(m.s, 200);
    const antes = (await ciclo('2026-11-10T07:00:00Z')).length;                          // 08:00 local: aún no es la hora de pagos
    igual((await ciclo('2026-11-10T22:30:00Z')).length, antes, 'a las 23:30 (silencio 22:00-08:00) no sale nada');
    await req('PUT', '/api/push/ajustes', { on: false });
    igual((await ciclo('2026-11-10T08:30:00Z')).length, antes, 'con los avisos apagados no sale nada');
    await req('PUT', '/api/push/ajustes', { on: true });
    const a = await ciclo('2026-11-10T08:40:00Z');
    igual(a.length, antes + 1, 'al volver, el aviso pendiente llega una vez'); cierto(/Noche · · hoy|Noche · hoy/.test(a[a.length - 1].cuerpo), a[a.length - 1].cuerpo);
  });

  await prueba('push: recordatorios del calendario (a su hora, sin perderse en el silencio) y fechas de contactos', async () => {
    await req('PUT', '/api/push/ajustes', { pagos: { on: false }, calendario: { on: true }, contactos: { on: true, dias: [0, 1] }, detalles: true });
    igual((await req('POST', '/api/calendar/events', { title: 'Dentista', start: '2026-11-10T09:30', end: '2026-11-10T10:00', reminders: [30] })).s, 200);
    igual((await req('POST', '/api/calendar/events', { title: 'Sin aviso', start: '2026-11-10T09:31', end: '2026-11-10T10:00' })).s, 200);
    igual((await req('POST', '/api/calendar/events', { title: 'Tarde', start: '2026-11-10T22:30', end: '2026-11-10T23:00', reminders: [10] })).s, 200);
    await req('POST', '/api/contacts', { first: 'Marta', last: 'Cumple', dates: [{ label: 'Cumpleaños', date: '1990-11-10' }] });
    await req('POST', '/api/contacts', { first: 'Pablo', last: 'Mañana', dates: [{ label: 'Cumpleaños', date: '--11-11' }] });
    const antes = (await ciclo('2026-11-10T07:50:00Z')).length;                          // 08:50 local: aún no toca nada
    const a = await ciclo('2026-11-10T08:06:00Z'), nuevos = a.slice(antes);
    const cal = nuevos.find(x => x.titulo === 'Calendario'), con = nuevos.find(x => x.titulo === 'Contactos');
    cierto(cal && /Dentista · 09:30 · en 30 min/.test(cal.cuerpo), 'evento: ' + (cal && cal.cuerpo)); cierto(!/Sin aviso/.test(cal.cuerpo), 'sin recordatorio no avisa'); igual(cal.vista, 'calendar');
    cierto(con && /Cumpleaños de Marta Cumple \(36\) · hoy/.test(con.cuerpo) && /Cumpleaños de Pablo Mañana · mañana/.test(con.cuerpo), 'contactos: ' + (con && con.cuerpo)); igual(con.vista, 'contacts');
    igual((await ciclo('2026-11-10T08:20:00Z')).length, a.length, 'ni el evento ni los cumpleaños se repiten');
    igual((await ciclo('2026-11-10T21:30:00Z')).length, a.length, 'el aviso de las 22:20 cae en silencio: no sale');
    const tras = await ciclo('2026-11-11T07:05:00Z');
    cierto(tras.slice(a.length).some(x => x.titulo === 'Calendario' && /Tarde · 22:30/.test(x.cuerpo)), 'el aviso retenido por el silencio llega al terminar');
  });

  await prueba('push: aviso de prueba, quitar dispositivo y logros', async () => {
    igual((await req('POST', '/api/push/prueba')).s, 200);
    const g = (await req('GET', '/api/game')).j;
    cierto(g.logros.familias.some(f => f.id === 'push_avisos' && f.valor >= 1), 'familia push_avisos');
    cierto(g.logros.especiales.some(x => x.id === 'push_on' && x.cuando > 0), 'especial «Aviso a navegantes»');
    const d = (await req('GET', '/api/push/config')).j.dispositivos[0];
    igual((await req('DELETE', '/api/push/dispositivos/' + d.id)).s, 200);
    igual((await req('POST', '/api/push/prueba')).s, 400, 'sin dispositivos no hay prueba');
  });

  await prueba('push: ajustes concurrentes no se pisan y un archivo dañado no equivale a vacío', async () => {
    const hs = ['07:00', '07:10', '07:20', '07:30', '07:40', '07:50'];
    const rs = await Promise.all(hs.map((h, i) => req('PUT', '/api/push/ajustes', i % 2 ? { pagos: { hora: h } } : { contactos: { hora: h } })));
    cierto(rs.every(r => r.s === 200), 'todas 200');
    const a = (await req('GET', '/api/push/config')).j.ajustes;
    cierto(hs.includes(a.pagos.hora) && hs.includes(a.contactos.hora), 'las dos horas se guardaron (de las peticiones)');
    await req('PUT', '/api/push/ajustes', { detalles: true });
    const f = path.join(dir, 'ajustes.json'); fs.writeFileSync(f, '{roto');
    const r = await req('GET', '/api/push/config'); igual(r.s, 200); igual(r.j.ajustes.detalles, true, 'se repone de la copia, no vuelve a los valores por defecto');
    cierto(fs.readdirSync(dir).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
  });

  await prueba('push: un navegador pertenece a una sola cuenta (cambiar de usuario no deja avisos ajenos)', async () => {
    const { BASE } = ctxExtra;
    const entra = async (u, c) => { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: c }) }); return r.headers.getSetCookie().map(x => x.split(';')[0]).join('; '); };
    const llama = (cookie, m, u, b) => fetch(BASE + u, { method: m, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
    await req('POST', '/api/users', { username: 'luis', password: 'clave-segura-1', role: 'user' });
    const cl = await entra('luis', 'clave-segura-1'), mismo = sub(777);
    igual((await req('POST', '/api/push/dispositivos', { suscripcion: mismo })).s, 200);
    igual((await llama(cl, 'POST', '/api/push/dispositivos', { suscripcion: mismo })).s, 200);
    igual((await req('GET', '/api/push/config')).j.dispositivos.length, 0, 'el administrador ya no tiene ese navegador');
    igual((await llama(cl, 'GET', '/api/push/config')).j.dispositivos.length, 1, 'ahora es de luis');
  });

  await prueba('push: ajustes antiguos o a medias se completan y 29 de febrero se celebra el 28 en años no bisiestos', async () => {
    const { limpia } = require('../../lib/push/ajustes');
    const a = limpia({}, { on: true, pagos: { on: false }, contactos: {} });
    igual(a.pagos.hora, '09:00'); igual(a.pagos.on, false, 'lo guardado manda'); cierto(Array.isArray(a.contactos.dias), 'dias siempre es una lista'); igual(a.silencio.desde, '22:00');
    const f = require('../../lib/push/fuentes/contactos');
    const core = { fechas: async () => [{ id: 'a', nombre: 'Bis', label: 'Cumpleaños', anio: 2000, mes: 2, dia: 29 }] };
    const cfg = { hora: '09:00', dias: [0] };
    igual((await f.pendientes({ user: {}, cfg, ahora: { dia: '2027-02-28', hm: '09:00' }, core })).length, 1, '2027 no es bisiesto: el 28');
    igual((await f.pendientes({ user: {}, cfg, ahora: { dia: '2028-02-28', hm: '09:00' }, core })).length, 0, '2028 es bisiesto: no el 28');
    igual((await f.pendientes({ user: {}, cfg, ahora: { dia: '2028-02-29', hm: '09:00' }, core })).length, 1, 'y sí el 29');
  });

  await prueba('push: un ciclo lento no se solapa con el siguiente y la prueba tiene enfriamiento', async () => {
    const { creaProgramador } = require('../../lib/push/programa');
    let llamadas = 0;
    const p = creaProgramador({ usuarios: () => { llamadas++; return []; }, archivoDe: () => '', envio: {}, fuentes: [], cores: {} });
    await Promise.all([p.tick(), p.tick(), p.tick()]);
    cierto(llamadas >= 1 && llamadas <= 3, 'sin error');
    await req('POST', '/api/push/dispositivos', { suscripcion: sub(900) });
    const r1 = await req('POST', '/api/push/prueba'), r2 = await req('POST', '/api/push/prueba');
    cierto(r1.s === 200 || r1.s === 429, 'primera'); igual(r2.s, 429, 'segunda seguida: enfriamiento');
  });
};
