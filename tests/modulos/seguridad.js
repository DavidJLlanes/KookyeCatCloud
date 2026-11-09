'use strict';
// Pruebas de humo de seguridad general: errores sin rutas del servidor, archivos internos no servidos,
// contraseñas y nombres de usuario, y cierre de sesión.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  await prueba('seguridad: los errores del sistema no enseñan rutas del servidor', async () => {
    for (const u of ['/api/files?path=%FF%FE', '/api/files?path=noexiste', '/api/download?path=' + 'a'.repeat(5000)]) {
      const r = await req('GET', u); const t = JSON.stringify(r.j);
      cierto(r.s >= 400 && r.s < 500, u.slice(0, 40) + ' → ' + r.s);
      cierto(!/\/tmp\/|\/home\/|node_modules|ENOENT|scandir|\bat .*:\d+:\d+/.test(t), 'fuga: ' + t.slice(0, 120));
    }
  });
  await prueba('seguridad: archivos internos no se sirven por la web', async () => {
    for (const r of ['/.env', '/.jwt-secret', '/users.json', '/vapid.json', '/sessions.json', '/server.js', '/package.json', '/lib/store.js', '/tests/smoke.js', '/.git/config', '/%2e%2e/server.js', '/js/../../server.js']) {
      const x = await fetch(BASE + r, { headers: { Cookie: cookie() }, redirect: 'manual' }); const t = await x.text();
      cierto(!(x.status === 200 && !/<!doctype html/i.test(t.slice(0, 200))), r + ' se está sirviendo');
    }
  });
  await prueba('seguridad: contraseñas (8-72) y usuarios sin distinguir mayúsculas', async () => {
    igual((await req('POST', '/api/users', { username: 'corta2', password: '1234567' })).s, 400, '7 caracteres');
    igual((await req('POST', '/api/users', { username: 'larga2', password: 'x'.repeat(73) })).s, 400, 'más de 72 bytes');
    igual((await req('POST', '/api/users', { username: 'acentos', password: 'ñ'.repeat(37) })).s, 400, '74 bytes con tildes');
    igual((await req('POST', '/api/users', { username: 'ADMIN', password: 'clave-larga-1' })).s, 400, 'Admin ≠ admin');
    igual((await req('POST', '/api/users', { username: 'Mario', password: 'clave-larga-1' })).s, 200);
    igual((await req('POST', '/api/users', { username: 'mario', password: 'clave-larga-1' })).s, 400, 'mario = Mario');
    igual((await req('DELETE', '/api/users/Mario')).s, 200);
  });
  await prueba('seguridad: inicio de sesión asíncrono (varios a la vez no se atascan) y el cierre invalida el token', async () => {
    await req('POST', '/api/users', { username: 'lola', password: 'clave-larga-1' });
    const entra = (u, p) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const t0 = Date.now(), rs = await Promise.all(Array.from({ length: 4 }, () => entra('lola', 'clave-larga-1')));
    cierto(rs.every(r => r.status === 200), 'todos entran'); cierto(Date.now() - t0 < 8000, 'sin atascos');
    const ck = rs[0].headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
    igual((await fetch(BASE + '/api/me', { headers: { Cookie: ck } })).status, 200);
    await fetch(BASE + '/api/logout', { method: 'POST', headers: { Cookie: ck } });
    igual((await fetch(BASE + '/api/me', { headers: { Cookie: ck } })).status, 401, 'el token no vale tras cerrar sesión');
    await req('DELETE', '/api/users/lola');
  });
};
