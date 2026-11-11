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
  await prueba('seguridad: un ZIP con cabeceras falsas no se infla sin tope', async () => {
    const { zipSync } = require('fflate');
    const sube = async (id, buf) => { const fd = new FormData(); fd.append('z', new Blob([buf]), 'a.zip'); fd.append('descomprimir', '1'); return fetch(BASE + `/api/codigo/${id}/zip`, { method: 'POST', headers: { Cookie: cookie() }, body: fd }); };
    const c = await req('POST', '/api/codigo', { nombre: 'ZipFalso' }); igual(c.s, 200);
    const honesto = Buffer.from(zipSync({ 'ok.txt': new Uint8Array([104, 105]) }));
    igual((await sube(c.j.id, honesto)).status, 200, 'ZIP normal');
    const grande = Buffer.from(zipSync({ 'big.bin': new Uint8Array(12 * 1024 * 1024) }, { level: 9 }));
    igual((await sube(c.j.id, grande)).status, 400, 'honesto de 12 MB');
    // Falsea el tamaño declarado (cabecera local en 22, directorio central en 24) a 100 bytes
    const f = Buffer.from(grande);
    f.writeUInt32LE(100, f.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) + 22);
    f.writeUInt32LE(100, f.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
    const r = await sube(c.j.id, f); cierto(r.status === 400, 'cabecera falsa debe rechazarse: ' + r.status);
    await req('DELETE', `/api/codigo/${c.j.id}`);
  });
  await prueba('seguridad: la contraseña de un enlace compartido no se puede adivinar por fuerza bruta', async () => {
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob(['hola']), 'enlace-pw.txt');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    const c = await req('POST', '/api/sharelinks', { path: 'enlace-pw.txt', days: 1, password: 'pw-correcta-1' }); igual(c.s, 200);
    const id = c.j.link.id, d = (pw) => fetch(BASE + `/api/public/share/${id}/download?pw=${pw}`);
    igual((await d('pw-correcta-1')).status, 200, 'la correcta entra');
    for (let i = 0; i < 10; i++) igual((await d('mala' + i)).status, 401);
    igual((await d('pw-correcta-1')).status, 401, 'tras 10 fallos, bloqueado una hora');
  });
  await prueba('seguridad: WebDAV deja de aceptar la clave vieja al cambiar la contraseña o borrar al usuario', async () => {
    igual((await req('POST', '/api/users', { username: 'davu', password: 'clave-larga-1' })).s, 200);
    const dav = (clave) => fetch(BASE + '/dav/', { method: 'PROPFIND', headers: { Authorization: 'Basic ' + Buffer.from('davu:' + clave).toString('base64'), Depth: '0' } });
    igual((await dav('clave-larga-1')).status, 207);
    igual((await req('POST', '/api/users/davu/password', { password: 'clave-nueva-22' })).s, 200);
    igual((await dav('clave-larga-1')).status, 401, 'la clave vieja ya no vale aunque estuviera en caché');
    igual((await dav('clave-nueva-22')).status, 207);
    igual((await req('DELETE', '/api/users/davu')).s, 200);
    igual((await dav('clave-nueva-22')).status, 401, 'usuario borrado');
  });
  await prueba('seguridad: WebDAV limita los intentos de contraseña como el login', async () => {
    const dav = (clave) => fetch(BASE + '/dav/', { method: 'PROPFIND', headers: { Authorization: 'Basic ' + Buffer.from('admin:' + clave).toString('base64'), Depth: '0' } });
    const est = []; for (let i = 0; i < 7; i++) est.push((await dav('mala-' + i)).status);
    cierto(est.slice(0, 2).every(x => x === 401), 'primeros fallos 401: ' + est);   // la prueba anterior ya gastó algún intento
    igual(est[6], 429, 'bloqueado tras 5 fallos: ' + est);
    const l = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'nadie', password: 'x' }) });
    igual(l.status, 401, 'el bloqueo de WebDAV no bloquea el login web');
  });
  await prueba('seguridad: una ruta de la API inexistente da 404 en JSON (no la página de la app)', async () => {
    const r = await fetch(BASE + '/api/no-existe-esta-ruta', { headers: { Cookie: cookie() } });
    igual(r.status, 404); cierto(/json/.test(r.headers.get('content-type')), 'JSON');
  });

  await prueba('seguridad: rutas con byte nulo o repetidas (?path[]=), claves como __proto__ y cuerpos con objetos no dan 500', async () => {
    for (const u of ['/api/files?path=%00', '/api/files?path[]=a', '/api/download?path[]=a', '/api/preview?path[]=a', '/api/text?path=%00', '/api/diskusage?path=%00', '/api/photometa?path=%00']) {
      const r = await req('GET', u); igual(r.s, 400, u + ' → ' + r.s);
    }
    igual((await req('GET', '/api/export/__proto__')).s, 404); igual((await req('POST', '/api/game/arcade/__proto__', {})).s, 404); igual((await req('GET', '/api/export/constructor')).s, 404);
    for (const u of ['/api/sharelinks', '/api/uploadlinks']) { const r = await req('POST', u, { path: { x: 1 }, nombre: [1] }); cierto(r.s >= 400 && r.s < 500, u + ' → ' + r.s); }
  });
};
