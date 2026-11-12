'use strict';
// Pruebas de humo de los enlaces: URL corta, caducidad configurable, cambio de caducidad, QR y la gestión desde la zona «Enlaces».
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  await prueba('enlaces: URL corta de 12 caracteres, caducidad, QR y página pública', async () => {
    const nombre = 'enlace-corto-' + Date.now() + '.txt';
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob(['hola']), nombre);
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    const ruta = nombre;
    const a = await req('POST', '/api/sharelinks', { path: ruta, days: 0 });
    igual(a.s, 200, JSON.stringify(a.j));
    cierto(/^[a-z0-9]{12}$/.test(a.j.link.id) && /[0-9]/.test(a.j.link.id) && /[a-z]/.test(a.j.link.id), 'id corto: ' + a.j.link.id);
    igual(a.j.link.expiresAt, null, 'sin caducidad');
    const b = await req('POST', '/api/sharelinks', { path: ruta, days: 0.0417 });
    cierto(b.j.link.expiresAt - Date.now() < 3700000 && b.j.link.expiresAt - Date.now() > 3400000, 'una hora');
    igual((await req('POST', '/api/sharelinks', { path: ruta, days: 99999 })).j.link.expiresAt <= Date.now() + 3651 * 86400000, true, 'tope de 10 años');
    // el cambio de caducidad y el QR son solo del dueño
    igual((await req('PUT', `/api/sharelinks/${b.j.link.id}/caducidad`, { days: 0 })).s, 200);
    igual((await req('GET', '/api/uploadlinks?kind=share')).j.find(l => l.id === b.j.link.id).expiresAt, null, 'ya no caduca');
    igual((await req('PUT', '/api/sharelinks/noexiste1234/caducidad', { days: 3 })).s, 404);
    igual((await req('PUT', `/api/sharelinks/${b.j.link.id}/caducidad`, { days: 'abc' })).s, 400, 'un plazo no válido no quita la caducidad');
    igual((await req('PUT', `/api/sharelinks/${b.j.link.id}/caducidad`, { days: -2 })).s, 400, 'plazo negativo');
    igual((await req('POST', `/api/sharelinks/${a.j.link.id}/qr`, {})).s, 200);
    igual((await req('POST', '/api/sharelinks/noexiste1234/qr', {})).s, 404);
    igual((await req('GET', `/api/public/share/${a.j.link.id}`)).s, 200, 'API pública con el id corto');
    const pag = await fetch(BASE + '/' + a.j.link.id); igual(pag.status, 200); cierto((await pag.text()).includes('share.js'), 'la URL corta sirve la página de descarga');
    cierto(!(await fetch(BASE + '/abcdefghij12', { redirect: 'manual' })).url.includes('share'), 'un id inexistente no sirve la página de descarga');
  });
  await prueba('enlaces: gestión (caducidad de cualquier tipo, contraseña, nombre, revocar con copia, limpiar caducados, stats dañadas)', async () => {
    const nombre = 'gestion-' + Date.now() + '.txt';
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob(['datos']), nombre);
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    const sh = (await req('POST', '/api/sharelinks', { path: nombre, days: 0 })).j.link;
    const up = (await req('POST', '/api/uploadlinks', { path: '', label: 'Subida de prueba', days: 7 })).j.link || (await req('GET', '/api/uploadlinks?kind=upload')).j[0];
    cierto(up && up.id, 'enlace de subida creado');
    // sin sesión nada de esto se puede tocar
    for (const [m, u] of [['PUT', `/api/links/${sh.id}/caducidad`], ['PUT', `/api/links/${sh.id}/clave`], ['PUT', `/api/links/${sh.id}/etiqueta`], ['DELETE', `/api/links/${sh.id}`], ['POST', '/api/links/limpiar-caducados']]) {
      igual((await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'DELETE' ? undefined : '{}' })).status, 401, 'sin sesión ' + m + ' ' + u);
    }
    // caducidad: también en los de subida; un plazo no válido se rechaza
    igual((await req('PUT', `/api/links/${up.id}/caducidad`, { days: 0 })).j.expiresAt, null, 'el de subida deja de caducar');
    igual((await req('PUT', `/api/links/${up.id}/caducidad`, { days: 'abc' })).s, 400);
    igual((await req('PUT', '/api/links/noexiste1234/caducidad', { days: 1 })).s, 404);
    // contraseña: se pone, se exige y se quita (valor vacío = quitarla)
    igual((await req('PUT', `/api/links/${sh.id}/clave`, { password: 'secreta-1' })).j.protegido, true);
    igual((await fetch(BASE + `/api/public/share/${sh.id}/download`)).status, 401, 'pide contraseña');
    igual((await fetch(BASE + `/api/public/share/${sh.id}/download`, { headers: { 'X-Clave': 'secreta-1' } })).status, 200, 'con la contraseña descarga');
    igual((await req('PUT', `/api/links/${sh.id}/clave`, { password: '' })).j.protegido, false);
    igual((await fetch(BASE + `/api/public/share/${sh.id}/download`)).status, 200, 'sin contraseña descarga');
    igual((await req('PUT', `/api/links/${up.id}/clave`, { password: 'x' })).s, 404, 'la contraseña solo es de los de descarga');
    igual((await req('PUT', `/api/links/${sh.id}/clave`, { password: 123 })).s, 400);
    // nombre: vacío no vale
    igual((await req('PUT', `/api/links/${sh.id}/etiqueta`, { label: 'Informe final' })).j.label, 'Informe final');
    igual((await req('PUT', `/api/links/${sh.id}/etiqueta`, { label: '   ' })).s, 400, 'nombre vacío');
    // limpiar caducados: uno con plazo de un par de segundos
    const corto = (await req('POST', '/api/sharelinks', { path: nombre, days: 0.00002 })).j.link;
    await new Promise(r => setTimeout(r, 2500));
    const lim = await req('POST', '/api/links/limpiar-caducados', {}); igual(lim.s, 200); cierto(lim.j.quitados >= 1, 'quita los caducados');
    const lista = (await req('GET', '/api/uploadlinks')).j;
    cierto(!lista.some(l => l.id === corto.id), 'el caducado ya no está'); cierto(lista.some(l => l.id === sh.id), 'el vigente sigue');
    // revocar: concurrente, con copia de 30 días y contadores para los logros
    const extra = []; for (let i = 0; i < 4; i++) extra.push((await req('POST', '/api/sharelinks', { path: nombre, days: 0 })).j.link.id);
    const rs = await Promise.all(extra.map(id => req('DELETE', `/api/links/${id}`)));
    cierto(rs.every(r => r.s === 200), 'revocaciones simultáneas');
    igual((await req('DELETE', `/api/links/${extra[0]}`)).s, 404, 'ya revocado');
    igual((await req('DELETE', `/api/uploadlinks/${up.id}`)).s, 200, 'la ruta de siempre también revoca');
    const dirB = path.join(DATA, '.kcc', 'borrados', 'enlaces'); cierto(fs.existsSync(dirB) && fs.readdirSync(dirB).length >= 5, 'copia de los enlaces revocados');
    const st = JSON.parse(fs.readFileSync(path.join(DATA, '.kcc', 'enlaces', 'stats.json'), 'utf8')); cierto(st.revocados >= 6, 'contador de revocados: ' + st.revocados);
    const g = (await req('GET', '/api/game')).j; cierto(g.logros.familias.find(f => f.id === 'en_revocados').valor >= 6, 'logro Puertas cerradas');
    // lectura dañada: el archivo de contadores corrupto no rompe nada y se aparta
    fs.writeFileSync(path.join(DATA, '.kcc', 'enlaces', 'stats.json'), '{roto');
    fs.rmSync(path.join(DATA, '.kcc', 'enlaces', 'stats.json.bak'), { force: true });
    igual((await req('GET', '/api/game')).s, 200, 'la gamificación sigue funcionando con los contadores dañados');
    const l2 = (await req('POST', '/api/sharelinks', { path: nombre, days: 0 })).j.link; igual((await req('DELETE', `/api/links/${l2.id}`)).s, 200, 'se puede revocar tras el daño');
  });
};
