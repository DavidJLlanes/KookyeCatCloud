'use strict';
// Pruebas de humo del explorador: listar, carpetas, subida, búsqueda, mover, lotes, borrar y salida de la raíz.
module.exports = async ({ req, prueba, igual, cierto, BASE, cookie }) => {
  const sube = async (nombres, ruta = '') => {
    const fd = new FormData(); for (const n of nombres) fd.append('files', new Blob(['dato-' + n]), n);
    const r = await fetch(BASE + '/api/upload?path=' + encodeURIComponent(ruta), { method: 'POST', headers: { Cookie: cookie() }, body: fd });
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  const lista = async (p = '') => (await req('GET', '/api/files?path=' + encodeURIComponent(p))).j.items.map(i => i.name);
  await prueba('explorador: carpetas, subida (renombra duplicados) y listado sin carpetas internas', async () => {
    igual((await req('POST', '/api/mkdir', { path: '', name: 'ex-dir' })).s, 200);
    igual((await req('POST', '/api/mkdir', { path: '', name: 'ex-dir' })).s, 409, 'duplicada');
    for (const mal of ['', '..', 'a/b', '.']) igual((await req('POST', '/api/mkdir', { path: '', name: mal })).s, 400, 'nombre inválido «' + mal + '»');
    igual((await sube(['ex-a.txt'])).j.uploaded[0], 'ex-a.txt');
    igual((await sube(['ex-a.txt'])).j.uploaded[0], 'ex-a_1.txt', 'no machaca');
    const l = await lista(); cierto(l.includes('ex-dir') && l.includes('ex-a.txt'), 'aparecen');
    cierto(l.every(n => !n.startsWith('.')), 'sin internos');
    igual((await req('GET', '/api/files?path=.trash')).s >= 400, true, 'no se entra en carpetas internas');
    igual((await req('GET', '/api/files?path=../..')).s >= 400, true, 'no sale de la raíz');
  });
  await prueba('explorador: búsqueda recursiva', async () => {
    await sube(['ex-profundo.txt'], 'ex-dir');
    const r = await req('GET', '/api/search?q=ex-profundo'); igual(r.s, 200);
    cierto(r.j.items.some(i => i.name === 'ex-profundo.txt' && i.dir === 'ex-dir'), 'encuentra dentro de la carpeta');
    igual((await req('GET', '/api/search?q=e')).j.items.length, 0, 'mínimo 2 letras');
  });
  await prueba('explorador: mover, renombrar y lotes (mover, renombrar con patrón y borrar a la papelera)', async () => {
    igual((await req('POST', '/api/move', { from: 'ex-a.txt', to: 'ex-b.txt' })).s, 200);
    igual((await req('POST', '/api/move', { from: 'ex-a_1.txt', to: 'ex-b.txt' })).s, 409, 'no pisa un destino existente');
    const m = await req('POST', '/api/batch', { op: 'move', paths: ['ex-b.txt', 'ex-a_1.txt'], dest: 'ex-dir' }); igual(m.j.done, 2);
    cierto((await lista('ex-dir')).includes('ex-b.txt'), 'movido');
    const mm = await req('POST', '/api/batch', { op: 'move', paths: ['ex-dir'], dest: 'ex-dir' }); cierto(mm.j.errors.length === 1, 'carpeta dentro de sí misma');
    const rn = await req('POST', '/api/batch', { op: 'rename', paths: ['ex-dir/ex-b.txt', 'ex-dir/ex-a_1.txt'], pattern: 'foto-{n}' });
    igual(rn.j.done, 2); cierto((await lista('ex-dir')).includes('foto-1.txt') && (await lista('ex-dir')).includes('foto-2.txt'), 'renombrados con número');
    igual((await req('POST', '/api/batch', { op: 'rename', paths: ['ex-dir/foto-1.txt'], pattern: '' })).s, 400, 'sin patrón');
    igual((await req('POST', '/api/batch', { op: 'nada', paths: ['x'] })).s, 400, 'operación no válida');
    const d = await req('POST', '/api/batch', { op: 'delete', paths: ['ex-dir'] }); igual(d.j.done, 1);
    cierto(!(await lista()).includes('ex-dir'), 'a la papelera');
    igual((await req('DELETE', '/api/files?path=ex-no-existe')).s >= 400, true, 'borrar lo inexistente falla');
  });
};
