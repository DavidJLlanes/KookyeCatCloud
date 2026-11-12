'use strict';
// Pruebas de humo de autenticación (auditoría 18): el paso intermedio de la verificación en dos pasos no sirve como sesión,
// un usuario borrado pierde sus sesiones, cambiar la contraseña propia pide la actual y cierra las demás sesiones,
// WebDAV no salta la verificación en dos pasos y las escrituras desde otro sitio (aunque sea un subdominio hermano) se rechazan.
const { totpEn, base32Decode } = require('../../lib/totp');

module.exports = async ({ req, prueba, igual, cierto, BASE }) => {
  const PW = 'Clave-larga-de-prueba-1';
  const login = async (username, password) => {
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).map(c => c.split(';')[0]);
    return { s: r.status, j: await r.json().catch(() => ({})), token: cookies.find(c => c.startsWith('token=')) || '', pendiente: cookies.find(c => c.startsWith('pending2fa=')) || '' };
  };
  const como = (cookie, ruta, m = 'GET', body, extra = {}) => fetch(BASE + ruta, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const codigo = (secreto) => totpEn(base32Decode(secreto), Math.floor(Date.now() / 30000));

  await prueba('autenticación: el paso pendiente de la verificación en dos pasos no abre sesión', async () => {
    igual((await req('POST', '/api/users', { username: 'dosfa', password: PW, role: 'user' })).s, 200);
    const a = await login('dosfa', PW); igual(a.s, 200);
    const s = await (await como(a.token, '/api/2fa/setup', 'POST', {})).json();
    igual((await como(a.token, '/api/2fa/confirm', 'POST', { code: codigo(s.secret) })).status, 200, 'activa 2FA');
    const b = await login('dosfa', PW);
    cierto(b.j.need2fa && b.pendiente && !b.token, 'pide el código');
    const jwtPendiente = b.pendiente.split('=')[1];
    igual((await como('', '/api/files', 'GET', null, { Authorization: 'Bearer ' + jwtPendiente })).status, 401, 'el JWT pendiente como Bearer no entra');
    igual((await como('token=' + jwtPendiente, '/api/files')).status, 401, 'ni como cookie de sesión');
    // WebDAV con la contraseña de la cuenta tampoco salta el segundo paso; con un token de aplicación sí funciona
    const basic = (u, p) => ({ Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64'), 'X-Forwarded-For': '10.18.0.' + (1 + (Date.now() % 200)) });   // IP propia: otra prueba deja bloqueada la de siempre
    igual((await fetch(BASE + '/dav/', { method: 'PROPFIND', headers: { Depth: '0', ...basic('dosfa', PW) } })).status, 401, 'WebDAV con contraseña y 2FA activa');
    const t = await (await como(a.token, '/api/apptokens', 'POST', { name: 'dav' })).json();
    igual((await fetch(BASE + '/dav/', { method: 'PROPFIND', headers: { Depth: '0', ...basic('dosfa', t.token) } })).status, 207, 'WebDAV con token de aplicación');
  });

  await prueba('autenticación: borrar un usuario cierra sus sesiones', async () => {
    igual((await req('POST', '/api/users', { username: 'borrame', password: PW, role: 'user' })).s, 200);
    const a = await login('borrame', PW); igual((await como(a.token, '/api/files')).status, 200);
    igual((await req('DELETE', '/api/users/borrame')).s, 200);
    igual((await como(a.token, '/api/files')).status, 401, 'el token del usuario borrado ya no entra');
  });

  await prueba('autenticación: cambiar la contraseña propia pide la actual y cierra las demás sesiones', async () => {
    igual((await req('POST', '/api/users', { username: 'cambia', password: PW, role: 'user' })).s, 200);
    const a = await login('cambia', PW), b = await login('cambia', PW);
    igual((await como(a.token, '/api/users/cambia/password', 'POST', { password: 'Otra-clave-nueva-22' })).status, 401, 'sin la actual no se cambia');
    igual((await como(a.token, '/api/users/cambia/password', 'POST', { password: 'Otra-clave-nueva-22', actual: 'mala' })).status, 401, 'con una actual errónea tampoco');
    igual((await como(a.token, '/api/users/cambia/password', 'POST', { password: 'Otra-clave-nueva-22', actual: PW })).status, 200);
    igual((await como(a.token, '/api/files')).status, 200, 'la sesión que la cambió sigue');
    igual((await como(b.token, '/api/files')).status, 401, 'las demás se cierran');
    igual((await login('cambia', 'Otra-clave-nueva-22')).s, 200, 'entra con la nueva');
    igual((await req('POST', '/api/users/cambia/password', { password: 'La-del-admin-333' })).s, 200, 'el administrador la cambia sin la actual');
    await req('DELETE', '/api/users/cambia'); await req('DELETE', '/api/users/dosfa');
  });

  await prueba('autenticación: escrituras desde otro sitio o subdominio hermano se rechazan (CSRF)', async () => {
    for (const sitio of ['cross-site', 'same-site']) {
      const r = await req('POST', '/api/mkdir', { path: '', name: 'csrf-' + sitio }, { headers: { 'Sec-Fetch-Site': sitio } });
      igual(r.s, 403, 'Sec-Fetch-Site: ' + sitio);
    }
    const ok = await req('POST', '/api/mkdir', { path: '', name: 'csrf-mismo' }, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    igual(ok.s, 200, 'mismo origen');
    igual((await req('GET', '/api/files', undefined, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).s, 200, 'las lecturas no se tocan');
    await req('DELETE', '/api/files', { path: 'csrf-mismo' }).catch(() => {});
  });
};
