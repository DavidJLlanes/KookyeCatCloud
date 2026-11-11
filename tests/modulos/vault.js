'use strict';
// Pruebas de humo de la caja fuerte (cifrado en reposo): estado, bloqueo/desbloqueo, carpetas, subida, descarga, renombrar/mover,
// borrado, exportación, cambio de contraseña y que nada sale sin desbloquear. Reutiliza la caja creada en smoke.js.
const fs = require('fs'), path = require('path');
module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  const PASS = 'clave-de-la-caja-1';
  const sube = async (nombre, contenido, parent = '') => {
    const fd = new FormData(); fd.append('files', new Blob([contenido]), nombre);
    const r = await fetch(BASE + '/api/vault/upload?parent=' + encodeURIComponent(parent), { method: 'POST', headers: { Cookie: cookie() }, body: fd });
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  const bajar = async (id, extra = '') => { const r = await fetch(BASE + `/api/vault/items/${id}/file${extra}`, { headers: { Cookie: cookie() } }); return { s: r.status, h: r.headers, b: Buffer.from(await r.arrayBuffer()) }; };
  let carpeta, archivo;
  await prueba('caja: bloquear impide ver y descargar; contraseña errónea se rechaza; la correcta abre', async () => {
    cierto((await req('GET', '/api/vault')).j.exists !== false, 'estado');
    igual((await req('POST', '/api/vault/lock', {})).s, 200);
    cierto((await req('GET', '/api/vault/items')).s >= 400, 'bloqueada: sin listado');
    igual((await req('POST', '/api/vault/unlock', { password: 'incorrecta-123' })).s, 403);
    igual((await req('POST', '/api/vault/unlock', { password: PASS })).s, 200);
    igual((await req('GET', '/api/vault/items')).s, 200);
  });
  await prueba('caja: crear carpeta, subir cifrado, leer igual, descargar como adjunto', async () => {
    const f = await req('POST', '/api/vault/folders', { name: 'VT carpeta', parent: '' }); igual(f.s, 200); carpeta = f.j.item.id;
    const contenido = Buffer.from('contenido secreto ' + 'x'.repeat(5000));
    const u = await sube('vt.txt', contenido, carpeta); igual(u.s, 200); archivo = u.j.items[0].id;
    const r = await bajar(archivo); igual(r.s, 200); cierto(r.b.equals(contenido), 'mismo contenido tras cifrar y descifrar');
    cierto(/attachment/.test((await bajar(archivo, '?download=1')).h.get('content-disposition')), 'descarga como adjunto');
    // en disco no está en claro
    const todos = []; (function rec(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else todos.push(p); } })(path.join(DATA, '.kcc'));
    cierto(!todos.some(p => { try { return fs.statSync(p).size < 2e6 && fs.readFileSync(p).includes('contenido secreto'); } catch { return false; } }), 'el contenido no aparece en claro en disco');
  });
  await prueba('caja: renombrar, mover, no meter una carpeta en sí misma, ids inexistentes', async () => {
    igual((await req('PUT', `/api/vault/items/${archivo}`, { name: 'vt2.txt' })).s, 200);
    const it = (await req('GET', '/api/vault/items')).j.items.find(i => i.id === archivo); igual(it.name, 'vt2.txt');
    igual((await req('PUT', `/api/vault/items/${archivo}`, { parent: '' })).s, 200);
    igual((await req('PUT', `/api/vault/items/${carpeta}`, { parent: carpeta })).s, 400, 'carpeta dentro de sí misma');
    igual((await req('PUT', `/api/vault/items/${archivo}`, { parent: 'no-existe' })).s, 400, 'padre inexistente');
    igual((await req('PUT', '/api/vault/items/0000000000000000', { name: 'x' })).s, 404);
    igual((await bajar('0000000000000000')).s, 404);
  });
  await prueba('caja: cambiar contraseña (y volver) y exportar a archivos', async () => {
    igual((await req('POST', '/api/vault/password', { password: 'mala-actual-1', newPassword: 'otra-clave-larga-2' })).s, 403);
    igual((await req('POST', '/api/vault/password', { password: PASS, newPassword: 'otra-clave-larga-2' })).s, 200);
    igual((await req('POST', '/api/vault/password', { password: 'otra-clave-larga-2', newPassword: PASS })).s, 200);
    igual((await req('POST', '/api/vault/unlock', { password: PASS })).s, 200);
    const e = await req('POST', '/api/vault/export', { ids: [archivo], dest: '' }); igual(e.s, 200);
    cierto(fs.existsSync(path.join(DATA, 'vt2.txt')), 'exportado a la nube');
  });
  await prueba('caja: borrar elementos y que sin sesión no se accede', async () => {
    igual((await req('DELETE', `/api/vault/items/${archivo}`)).s, 200);
    igual((await req('DELETE', `/api/vault/items/${carpeta}`)).s, 200);
    const ids = (await req('GET', '/api/vault/items')).j.items.map(i => i.id); cierto(!ids.includes(archivo) && !ids.includes(carpeta), 'borrados');
    const sin = await fetch(BASE + '/api/vault/items'); cierto(sin.status === 401 || sin.status === 403, 'sin cookie: ' + sin.status);
  });
};
