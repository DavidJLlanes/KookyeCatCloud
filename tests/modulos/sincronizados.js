'use strict';
// Pruebas de humo de los bloques sincronizados y de los bloques ricos de las notas: CRUD, validación, conflicto entre
// dispositivos, escritura concurrente, lectura dañada, borrado con copia, cuenta de bloques y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA }) => {
  const nuevo = (texto = 'Hola<br>mundo') => req('POST', '/api/sincronizados', { texto });
  let id, v0;

  await prueba('sincronizados: crear, leer, listar y validar', async () => {
    const a = await nuevo(); igual(a.s, 200); id = a.j.bloque.id; v0 = a.j.bloque.updatedAt;
    cierto(/^[a-f0-9]{16}$/.test(id), 'id'); igual(a.j.bloque.texto, 'Hola<br>mundo');
    igual((await req('GET', '/api/sincronizados/' + id)).j.bloque.texto, 'Hola<br>mundo');
    cierto((await req('GET', '/api/sincronizados')).j.bloques.some(b => b.id === id), 'sale en la lista');
    igual((await req('GET', '/api/sincronizados/zzzz')).s, 404, 'id con otra forma');
    igual((await req('GET', '/api/sincronizados/0123456789abcdef')).s, 404, 'no existe');
    igual((await req('POST', '/api/sincronizados', { texto: 5 })).s, 400, 'texto que no es texto');
    igual((await nuevo('x'.repeat(20001))).s, 400, 'demasiado largo: se rechaza, no se recorta');
    igual((await nuevo('')).s, 200, 'vacío es válido (bloque recién creado)');
  });

  await prueba('sincronizados: editar (varias veces) y otro dispositivo (409)', async () => {
    const o = await req('PUT', '/api/sincronizados/' + id, { texto: 'Cambiado fuera' }, { headers: { 'X-KCC-Client': 'otro' } }); igual(o.s, 200);
    igual(o.j.bloque.ediciones, 1);
    igual((await req('PUT', '/api/sincronizados/' + id, { texto: 'Vieja', base: v0 })).s, 409, 'no pisa un cambio ajeno más nuevo');
    igual((await req('GET', '/api/sincronizados/' + id)).j.bloque.texto, 'Cambiado fuera');
    const ok = await req('PUT', '/api/sincronizados/' + id, { texto: 'Con base actual', base: o.j.bloque.updatedAt }, { headers: { 'X-KCC-Client': 'otro' } }); igual(ok.s, 200);
    igual((await req('PUT', '/api/sincronizados/' + id, { texto: '' })).j.bloque.texto, '', 'se puede dejar vacío a propósito');
  });

  await prueba('sincronizados: 15 altas a la vez no se pisan y un archivo dañado no equivale a vacío', async () => {
    const antes = (await req('GET', '/api/sincronizados')).j.bloques.length;
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => nuevo('Conc ' + i))); cierto(rs.every(r => r.s === 200), 'todas 200');
    igual((await req('GET', '/api/sincronizados')).j.bloques.length, antes + 15);
    const f = path.join(DATA, '.kcc', 'sincronizados', 'data.json'); fs.writeFileSync(f, '{roto');
    const r = await req('GET', '/api/sincronizados'); igual(r.s, 200); cierto(r.j.bloques.length > 0, 'se repone de la copia');
    cierto(fs.readdirSync(path.dirname(f)).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
  });

  await prueba('sincronizados: borrar deja copia 30 días', async () => {
    igual((await req('DELETE', '/api/sincronizados/' + id)).s, 200);
    igual((await req('GET', '/api/sincronizados/' + id)).s, 404);
    const dir = path.join(DATA, '.kcc', 'borrados', 'sincronizados'); cierto(fs.existsSync(dir) && fs.readdirSync(dir).length >= 1, 'copia del bloque');
    igual((await req('DELETE', '/api/sincronizados/' + id)).s, 404, 'ya no existe');
  });

  await prueba('notas: se cuentan los bloques ricos y los logros salen', async () => {
    const { cuentaBloques } = require('../../lib/notes/bloques');
    const md = ':::toggle A\nx\n:::\n\n:::columns\na\n:::col\nb\n:::\n\n::toc\n\n$$\nx^2\n$$\n\n$$y$$\n\n```mermaid\nA-->B\n```\n\n```js\n::toc\n```\n\n::embed geo:1,2,3\n\n::base 0123456789abcdef\n\n::sync 0123456789abcdef';
    const n = cuentaBloques(md);
    igual(n.toggle, 1); igual(n.columns, 1); igual(n.toc, 1, 'lo de dentro de un código no cuenta'); igual(n.eq, 2); igual(n.mermaid, 1); igual(n.embed, 1); igual(n.base, 1); igual(n.sync, 1);
    const c = await req('POST', '/api/notes', { type: 'note', title: 'Ricos', body: md }); igual(c.s, 200);
    const g = (await req('GET', '/api/game')).j;
    const fam = (idf) => g.logros.familias.find(f => f.id === idf);
    cierto(fam('nb_estructura') && fam('nb_estructura').valor >= 3, 'maquetador'); cierto(fam('nb_ciencia').valor >= 3, 'académico'); cierto(fam('nb_incrusta').valor >= 2, 'mundo en una nota');
    cierto(fam('sy_total').valor >= 1, 'fuente única'); cierto(g.logros.especiales.some(e => e.id === 'nb_maestro'), 'especial definido');
    await req('DELETE', '/api/notes/' + c.j.item.id);
  });
};
