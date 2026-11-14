'use strict';
// Pruebas de explotación de la auditoría 19 (escritas antes del arreglo: fallaban y ahora pasan).
const { totpEn, base32Decode } = require('../../lib/cuentas/totp');

module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  const PW = 'Clave-larga-de-prueba-1';
  const ip = (n) => ({ 'X-Forwarded-For': '10.19.0.' + n });
  const login = async (username, password, n = 1) => {
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ip(n) }, body: JSON.stringify({ username, password }) });
    const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]);
    return { s: r.status, j: await r.json().catch(() => ({})), token: cookies.find(c => c.startsWith('token=')) || '', pendiente: cookies.find(c => c.startsWith('pending2fa=')) || '' };
  };
  const como = (ck, ruta, m = 'GET', body, extra = {}) => fetch(BASE + ruta, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });

  await prueba('auditoría 19: un enlace de solo descarga no sirve para subir archivos', async () => {
    igual((await req('POST', '/api/mkdir', { path: '', name: 'a19-pub' })).s, 200);
    const sl = (await req('POST', '/api/sharelinks', { path: 'a19-pub', label: 'solo lectura' })).j.link;
    const fd = new FormData(); fd.append('files', new Blob(['INTRUSO']), 'intruso.txt');
    const r = await fetch(`${BASE}/api/public/link/${sl.id}/upload`, { method: 'POST', body: fd, headers: ip(40) });
    igual(r.status, 404, 'subir por un enlace de descarga');
    igual((await fetch(`${BASE}/api/public/link/${sl.id}`)).status, 404, 'tampoco se presenta como enlace de subida');
    const dentro = (await req('GET', '/api/files?path=a19-pub')).j.items.map(i => i.name);
    cierto(!dentro.includes('intruso.txt'), 'no ha entrado ningún archivo');
    // un enlace de subida de verdad sigue funcionando
    const ul = (await req('POST', '/api/uploadlinks', { path: 'a19-pub', label: 'sube' })).j.link;
    const fd2 = new FormData(); fd2.append('files', new Blob(['ok']), 'legitimo.txt');
    igual((await fetch(`${BASE}/api/public/link/${ul.id}/upload`, { method: 'POST', body: fd2, headers: ip(41) })).status, 200, 'enlace de subida');
  });

  await prueba('auditoría 19: WebDAV no sirve HTML ni SVG como página activa', async () => {
    const fd = new FormData(); fd.append('files', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'a19.html');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    const t = (await req('POST', '/api/apptokens', { name: 'a19' })).j.token;
    const r = await fetch(BASE + '/dav/a19.html', { headers: { Authorization: 'Basic ' + Buffer.from('admin:' + t).toString('base64'), ...ip(42) } });
    igual(r.status, 200); await r.arrayBuffer();
    igual(r.headers.get('x-content-type-options'), 'nosniff');
    cierto(/sandbox/.test(r.headers.get('content-security-policy') || ''), 'CSP con sandbox');
  });

  await prueba('auditoría 19: la verificación en dos pasos no admite repetir un código ni fuerza bruta desde varias IP', async () => {
    igual((await req('POST', '/api/users', { username: 'a19dosfa', password: PW, role: 'user' })).s, 200);
    const a = await login('a19dosfa', PW, 2);
    const s = await (await como(a.token, '/api/2fa/setup', 'POST', {})).json();
    const codigo = (d = 0) => totpEn(base32Decode(s.secret), Math.floor(Date.now() / 30000) + d);
    igual((await como(a.token, '/api/2fa/confirm', 'POST', { code: codigo() })).status, 200);
    // 1) un código ya usado no vale otra vez (quien lo vea por encima del hombro no puede reutilizarlo)
    const paso = async (code, n) => { const l = await login('a19dosfa', PW, n); return (await como(l.pendiente, '/api/login/2fa', 'POST', { code }, ip(n))).status; };
    const c = codigo(1);                       // el del paso siguiente: seguro que no se ha usado al confirmar
    igual(await paso(c, 3), 200, 'primer uso');
    igual(await paso(c, 4), 401, 'segundo uso del mismo código');
    // 2) códigos erróneos desde IP distintas: la cuenta se bloquea aunque cada IP lleve pocos fallos
    let ultimo = 0; for (let i = 0; i < 8; i++) ultimo = await paso('000000', 10 + i);
    igual(ultimo, 429, 'bloqueo por usuario');
    await req('DELETE', '/api/users/a19dosfa');
  });

  await prueba('auditoría 19: cambiar la contraseña no pisa cambios simultáneos en las cuentas', async () => {
    igual((await req('POST', '/api/users', { username: 'a19pw', password: PW, role: 'user' })).s, 200);
    const a = await login('a19pw', PW, 5);
    // a la vez: el usuario cambia su contraseña (tarda ~150 ms de bcrypt) y el administrador crea otra cuenta
    const [c, n] = await Promise.all([
      como(a.token, '/api/users/a19pw/password', 'POST', { password: 'Otra-clave-nueva-22', actual: PW }, ip(5)),
      (async () => { await new Promise(r => setTimeout(r, 40)); return req('POST', '/api/users', { username: 'a19nuevo', password: PW, role: 'user' }); })(),
    ]);
    igual(c.status, 200); igual(n.s, 200);
    const nombres = (await req('GET', '/api/users')).j.map(u => u.username);
    cierto(nombres.includes('a19nuevo'), 'la cuenta creada durante el cambio de contraseña sigue existiendo');
    igual((await login('a19pw', 'Otra-clave-nueva-22', 6)).s, 200, 'y la contraseña nueva vale');
    await req('DELETE', '/api/users/a19pw'); await req('DELETE', '/api/users/a19nuevo');
  });

  await prueba('auditoría 19: al borrar un usuario se van sus enlaces públicos (no los hereda otro con el mismo nombre)', async () => {
    igual((await req('POST', '/api/users', { username: 'a19link', password: PW, role: 'user' })).s, 200);
    const a = await login('a19link', PW, 7);
    await como(a.token, '/api/mkdir', 'POST', { path: '', name: 'c' });
    const l = await (await como(a.token, '/api/uploadlinks', 'POST', { path: 'c', label: 'x' })).json();
    igual((await fetch(`${BASE}/api/public/link/${l.link.id}`)).status, 200);
    igual((await req('DELETE', '/api/users/a19link')).s, 200);
    igual((await req('POST', '/api/users', { username: 'a19link', password: PW, role: 'user' })).s, 200);
    igual((await fetch(`${BASE}/api/public/link/${l.link.id}`)).status, 404, 'el enlace del usuario anterior ya no existe');
    await req('DELETE', '/api/users/a19link');
  });

  await prueba('auditoría 19: entradas mal formadas dan 400, no un error interno', async () => {
    igual((await req('POST', '/api/mkdir', { path: ['..'], name: 'x' })).s, 400, 'ruta que no es texto');
    const r = (await req('POST', '/api/recordatorios', { titulo: 'a19' })).j; const id = (r.recordatorio || r).id;
    igual((await req('PUT', '/api/recordatorios/' + id, { fecha: '9999-99-99' })).s, 400, 'fecha imposible');
    await req('DELETE', '/api/recordatorios/' + id);
  });

  await prueba('auditoría 19: el buscador (y la IA) del administrador no incluye los archivos de otras cuentas', async () => {
    igual((await req('POST', '/api/users', { username: 'a19priv', password: PW, role: 'user' })).s, 200);
    const a = await login('a19priv', PW, 8);
    const fd = new FormData(); fd.append('files', new Blob(['contenido zxqprivado de otra cuenta']), 'zxqajeno.txt');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: a.token }, body: fd })).status, 200);
    const fd2 = new FormData(); fd2.append('files', new Blob(['contenido zxqprivado del administrador']), 'zxqmio.txt');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd2 })).status, 200);
    await req('POST', '/api/busqueda/reindexar');
    const r = (await req('GET', '/api/busqueda?q=zxqprivado&m=archivos')).j;
    cierto(r.resultados.some(x => x.titulo === 'zxqmio.txt'), 'lo suyo sí sale');
    cierto(!r.resultados.some(x => /zxqajeno/.test(x.titulo) || /^users\//.test(x.id)), 'lo de otra cuenta no');
    igual((await (await como(a.token, '/api/busqueda?q=zxqprivado')).json()).total, 1, 'cada cuenta sigue encontrando lo suyo');
    await req('DELETE', '/api/users/a19priv');
  });

  await prueba('auditoría 19: el calendario público (iCal) de una cuenta borrada deja de servirse', async () => {
    igual((await req('POST', '/api/users', { username: 'a19ical', password: PW, role: 'user' })).s, 200);
    const a = await login('a19ical', PW, 9);
    const r = await (await como(a.token, '/api/calendar/ical', 'POST', { action: 'enable' })).json();
    const token = r.token || (r.ical && r.ical.token); cierto(/^[a-f0-9]{64}$/.test(token || ''), 'token: ' + JSON.stringify(r).slice(0, 120));
    igual((await fetch(`${BASE}/ical/${token}.ics`)).status, 200, 'con la cuenta viva');
    igual((await req('DELETE', '/api/users/a19ical')).s, 200);
    igual((await fetch(`${BASE}/ical/${token}.ics`)).status, 404, 'con la cuenta borrada');
  });
};
