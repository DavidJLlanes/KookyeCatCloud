'use strict';
// Pruebas de humo del módulo Código: carpetas, mover, borrar, versiones (crear, leer, restaurar, borrar), rutas peligrosas y contadores.
module.exports = async ({ req, prueba, igual, cierto }) => {
  let id;
  await prueba('codigo: crear proyecto y archivos en carpetas', async () => {
    const c = await req('POST', '/api/codigo', { nombre: 'CD proyecto' }); igual(c.s, 200); id = c.j.id; cierto(id, 'id');
    igual((await req('POST', `/api/codigo/${id}/carpeta`, { ruta: 'src/util' })).s, 200);
    igual((await req('PUT', `/api/codigo/${id}/archivo`, { ruta: 'src/util/a.js', contenido: 'let a = 1;\n' })).s, 200);
    igual((await req('PUT', `/api/codigo/${id}/archivo`, { ruta: 'LEEME.md', contenido: '# hola' })).s, 200);
    const d = await req('GET', `/api/codigo/${id}`); igual(d.s, 200);
    cierto(d.j.archivos['src/util/a.js'] && d.j.archivos['LEEME.md'], 'archivos en el detalle'); cierto(d.j.carpetas.includes('src/util'), 'carpeta');
  });
  await prueba('codigo: rutas peligrosas se rechazan', async () => {
    for (const ruta of ['../fuera.txt', 'a/../../b.txt', 'x\0y', '__proto__/x']) cierto((await req('PUT', `/api/codigo/${id}/archivo`, { ruta, contenido: 'x' })).s >= 400, 'rechaza ' + JSON.stringify(ruta));
    // una ruta absoluta se normaliza a relativa dentro del proyecto, nunca sale de él
    igual((await req('PUT', `/api/codigo/${id}/archivo`, { ruta: '/abs.txt', contenido: 'x' })).s, 200);
    cierto((await req('GET', `/api/codigo/${id}`)).j.archivos['abs.txt'], 'queda como abs.txt');
  });
  await prueba('codigo: mover y borrar rutas', async () => {
    igual((await req('POST', `/api/codigo/${id}/mover`, { desde: 'src/util/a.js', hacia: 'lib/a.js' })).s, 200);
    let d = (await req('GET', `/api/codigo/${id}`)).j; cierto(d.archivos['lib/a.js'] && !d.archivos['src/util/a.js'], 'movido');
    igual((await req('DELETE', `/api/codigo/${id}/ruta?ruta=lib`)).s, 200);
    d = (await req('GET', `/api/codigo/${id}`)).j; cierto(!d.archivos['lib/a.js'], 'carpeta borrada con su contenido');
    igual((await req('DELETE', `/api/codigo/${id}/ruta?ruta=no/existe`)).s, 404);
  });
  await prueba('codigo: versiones — crear, leer, restaurar y borrar', async () => {
    igual((await req('PUT', `/api/codigo/${id}/archivo`, { ruta: 'v.txt', contenido: 'uno' })).s, 200);
    const v1 = await req('POST', `/api/codigo/${id}/versiones`, { mensaje: 'primera' }); igual(v1.s, 200);
    const vid = v1.j.versiones[v1.j.versiones.length - 1].id; cierto(vid, 'id de versión');
    igual((await req('PUT', `/api/codigo/${id}/archivo`, { ruta: 'v.txt', contenido: 'dos' })).s, 200);
    const lee = await req('GET', `/api/codigo/${id}/versiones/${vid}`); igual(lee.s, 200); cierto(lee.j.archivos['v.txt'], 'archivo en la versión');
    igual((await req('POST', `/api/codigo/${id}/versiones/${vid}/restaurar`, {})).s, 200);
    const t = await req('GET', `/api/codigo/${id}/texto?ruta=v.txt`); igual(t.s, 200); cierto(JSON.stringify(t.j).includes('uno'), 'contenido restaurado');
    igual((await req('DELETE', `/api/codigo/${id}/versiones/${vid}`)).s, 200);
    igual((await req('GET', `/api/codigo/${id}/versiones/${vid}`)).s, 404, 'versión borrada');
  });
  await prueba('codigo: proyecto inexistente, id inválido y borrado', async () => {
    igual((await req('GET', '/api/codigo/0000000000000000')).s, 404);
    cierto((await req('GET', '/api/codigo/no-es-un-id')).s >= 400, 'id inválido');
    igual((await req('DELETE', `/api/codigo/${id}`)).s, 200);
    igual((await req('GET', `/api/codigo/${id}`)).s, 404, 'borrado');
  });
};
