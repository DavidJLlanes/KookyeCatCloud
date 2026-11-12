'use strict';
// Pruebas de humo de la subida de archivos (auditoría 18): nombres con acentos intactos, sin caracteres de control y recortados.
const fs = require('fs'), path = require('path');

module.exports = async ({ prueba, igual, cierto, DATA, BASE, cookie }) => {
  const sube = async (nombre) => {
    const fd = new FormData(); fd.append('files', new Blob(['hola']), nombre);
    const r = await fetch(BASE + '/api/upload?path=', { method: 'POST', headers: { Cookie: cookie() }, body: fd });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  };
  await prueba('subidas: nombres con acentos, control y muy largos', async () => {
    const a = await sube('ñandú café.txt'); igual(a.s, 200, JSON.stringify(a.j));
    igual(a.j.uploaded[0], 'ñandú café.txt', 'el nombre UTF-8 llega intacto');
    cierto(fs.existsSync(path.join(DATA, 'ñandú café.txt')), 'en disco con su nombre');
    const b = await sube('raro\u0007\u001bnombre.txt');
    cierto(b.s === 400 || !/[\u0000-\u001f]/.test(b.j.uploaded[0]), 'sin caracteres de control (o rechazado)');
    const c = await sube('é'.repeat(300) + '.txt'); igual(c.s, 200);
    cierto(Buffer.byteLength(c.j.uploaded[0]) <= 200 && c.j.uploaded[0].endsWith('.txt'), 'recortado a 200 bytes con su extensión');
    for (const n of [a, b, c]) if (n.j.uploaded) fs.rmSync(path.join(DATA, n.j.uploaded[0]), { force: true });
  });
};
