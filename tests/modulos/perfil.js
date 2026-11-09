'use strict';
// Pruebas de humo de la foto de perfil: subida, procesado a WebP cuadrado, lectura, quitar con copia y permisos.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  let sharp = null; try { sharp = require('sharp'); } catch { /* sin sharp */ }
  const sube = async (buffer, nombre = 'foto.png') => {
    const fd = new FormData(); fd.append('foto', new Blob([buffer]), nombre);
    const r = await fetch(BASE + '/api/perfil/avatar', { method: 'PUT', headers: { Cookie: cookie() }, body: fd });
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  await prueba('perfil: sin foto al principio (404) y la lista de fotos solo la ve un administrador', async () => {
    const r = await fetch(BASE + '/api/perfil/avatar', { headers: { Cookie: cookie() } }); igual(r.status, 404);
    igual((await req('GET', '/api/perfil')).j.avatar, null);
    igual((await req('GET', '/api/perfil/avatares')).s, 200);
  });
  if (!sharp) { console.log('  (sin sharp: se omiten las pruebas de procesado de imagen)'); return; }
  await prueba('perfil: la foto se procesa a WebP cuadrado de 256 px, se sirve y deja un logro', async () => {
    const png = await sharp({ create: { width: 640, height: 320, channels: 3, background: '#3b82f6' } }).png().toBuffer();
    const r = await sube(png); igual(r.s, 200); cierto(r.j.avatar.v > 0, 'marca de versión');
    const img = await fetch(BASE + '/api/perfil/avatar', { headers: { Cookie: cookie() } }); igual(img.status, 200); igual(img.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata(); igual(meta.width, 256); igual(meta.height, 256);
    cierto(fs.existsSync(path.join(DATA, '.kcc', 'perfil', 'perfil.json')), 'JSON propio del perfil');
    const g = (await req('GET', '/api/game')).j; cierto(g.logros.especiales.some(e => e.id === 'perfil_foto' && e.cuando > 0), 'logro «Con cara y ojos»');
  });
  await prueba('perfil: archivos que no son imagen se rechazan y la foto anterior se conserva', async () => {
    const r = await sube(Buffer.from('esto no es una imagen'), 'x.png'); igual(r.s, 400);
    igual((await fetch(BASE + '/api/perfil/avatar', { headers: { Cookie: cookie() } })).status, 200, 'sigue la foto');
    igual((await sube(Buffer.alloc(13 * 1024 * 1024), 'grande.png')).s, 400, 'más de 12 MB');
  });
  await prueba('perfil: quitar la foto la aparta 30 días', async () => {
    igual((await req('DELETE', '/api/perfil/avatar')).s, 200);
    igual((await fetch(BASE + '/api/perfil/avatar', { headers: { Cookie: cookie() } })).status, 404);
    cierto(fs.readdirSync(path.join(DATA, '.kcc', 'borrados', 'perfil')).length >= 1, 'copia en borrados');
    igual((await req('DELETE', '/api/perfil/avatar')).s, 200, 'quitar otra vez no falla');
  });
};
