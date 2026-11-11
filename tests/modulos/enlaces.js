'use strict';
// Pruebas de humo de los enlaces de descarga: URL corta, caducidad configurable, cambio de caducidad y QR.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
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
    igual((await req('POST', `/api/sharelinks/${a.j.link.id}/qr`, {})).s, 200);
    igual((await req('POST', '/api/sharelinks/noexiste1234/qr', {})).s, 404);
    igual((await req('GET', `/api/public/share/${a.j.link.id}`)).s, 200, 'API pública con el id corto');
    const pag = await fetch(BASE + '/' + a.j.link.id); igual(pag.status, 200); cierto((await pag.text()).includes('share.js'), 'la URL corta sirve la página de descarga');
    cierto(!(await fetch(BASE + '/abcdefghij12', { redirect: 'manual' })).url.includes('share'), 'un id inexistente no sirve la página de descarga');
  });
};
