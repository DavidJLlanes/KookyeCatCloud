'use strict';
// Pruebas de humo del análisis de espacio: estadísticas por tipo y por módulo, espacio por carpeta y duplicados.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  const sube = async (nombre, contenido) => {
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob([contenido]), nombre);
    return (await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status;
  };
  await prueba('análisis: estadísticas con archivos por tipo y datos de la app por módulo', async () => {
    igual(await sube('an-a.txt', 'x'.repeat(5000)), 200);
    igual(await sube('an-b.txt', 'x'.repeat(5000)), 200);
    const r = await req('GET', '/api/stats'); igual(r.s, 200);
    cierto(r.j.byType.doc.bytes >= 10000, 'documentos contados');
    cierto(Array.isArray(r.j.app) && r.j.app.some(d => d.id === 'pagos') && r.j.app.some(d => d.id === 'codigo'), 'módulos en el reparto de la app');
    igual(r.j.totalBytes, r.j.filesBytes + r.j.appBytes, 'el total suma archivos y datos de la app');
  });
  await prueba('análisis: espacio por carpeta (incluye los datos de la app en la raíz)', async () => {
    const r = await req('GET', '/api/diskusage'); igual(r.s, 200);
    cierto(r.j.items.some(i => i.name === 'an-a.txt' && i.size === 5000), 'archivo con su tamaño');
    cierto(r.j.items.every(i => !i.name.startsWith('.')), 'sin carpetas internas');
    igual((await req('GET', '/api/diskusage?path=../..')).s >= 400, true, 'no sale de la raíz');
  });
  await prueba('análisis: buscador de duplicados agrupa por contenido', async () => {
    const r = await req('GET', '/api/duplicates'); igual(r.s, 200);
    const g = r.j.grupos.find(x => x.some(f => f.name === 'an-a.txt'));
    cierto(g && g.some(f => f.name === 'an-b.txt'), 'las dos copias salen juntas');
    cierto(r.j.espacioRecuperable >= 5000, 'espacio recuperable');
  });
  for (const n of ['an-a.txt', 'an-b.txt']) await req('DELETE', '/api/files', { path: n }).catch(() => {});
};
