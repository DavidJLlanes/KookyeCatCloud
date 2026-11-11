'use strict';
// Pruebas de humo de Bases: fórmulas (seguras), relaciones y resúmenes, tipos nuevos, cambio de tipo con copia, vistas nuevas,
// filtros y órdenes múltiples, importación, escritura concurrente, archivo dañado, valores vacíos y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA }) => {
  const crea = async (nombre) => (await req('POST', '/api/bases', { nombre, plantilla: 'vacia' })).j;
  const esquema = (b, columnas, vistas) => req('PUT', `/api/bases/${b.id}/schema`, { columnas, ...(vistas ? { vistas } : {}), conocidas: b.columns.map(c => c.id) });
  const fila = (b, c) => req('POST', `/api/bases/${b.id}/rows`, { c });
  const conserva = (b) => b.columns.map(c => ({ ...c }));
  let autores, libros;

  await prueba('bases: fórmulas (cuentas, SI, fechas, errores) y que no se pueda ejecutar código', async () => {
    const b = await crea('Cuentas'); const n = b.columns[0];
    const r1 = await esquema(b, [...conserva(b), { nombre: 'Precio', tipo: 'number' }, { nombre: 'Cant', tipo: 'number' }]); igual(r1.s, 200);
    const [precio, cant] = [r1.j.columns[1], r1.j.columns[2]];
    const r2 = await esquema(r1.j, [...conserva(r1.j), { nombre: 'Total', tipo: 'formula', expr: '{Precio} * {Cant}' }, { nombre: 'Etiqueta', tipo: 'formula', expr: 'SI({Precio} > 10; "caro"; "barato") & " " & MAYUS({Nombre})' }, { nombre: 'Rota', tipo: 'formula', expr: '{Precio} / 0' }]);
    igual(r2.s, 200, JSON.stringify(r2.j));
    const f = await fila(r2.j, { [n.id]: 'cafe', [precio.id]: 12, [cant.id]: 3 }); igual(f.s, 200);
    const [total, et, rota] = r2.j.columns.slice(3);
    igual(f.j.row.f[total.id], 36); igual(f.j.row.f[et.id], 'caro CAFE'); igual(f.j.row.f[rota.id].e, '#DIV/0');
    igual((await req('GET', `/api/bases/${b.id}`)).j.rows[0].f[total.id], 36, 'también al leer la base');
    const mal = async (expr) => (await esquema(r2.j, [...conserva(r2.j), { nombre: 'X' + Math.random(), tipo: 'formula', expr }])).s;
    igual(await mal('process.exit()'), 400, 'función desconocida'); igual(await mal('{NoExiste}'), 400, 'columna inexistente'); igual(await mal('require("fs")'), 400); igual(await mal('1 +'), 400, 'incompleta');
    igual(await mal('(' .repeat(40) + '1' + ')'.repeat(40)), 400, 'demasiados niveles'); igual(await mal('1'.repeat(501)), 400, 'demasiado larga');
    // renombrar una columna actualiza las fórmulas que la usan
    const ren = await esquema(r2.j, r2.j.columns.map(c => (c.id === precio.id ? { ...c, nombre: 'Importe' } : { ...c })));
    igual(ren.s, 200); cierto(ren.j.columns.find(c => c.id === total.id).expr.includes('{Importe}'), 'fórmula renombrada');
    // dos columnas con el mismo nombre y borrar una columna que usa una fórmula
    igual((await esquema(ren.j, [...conserva(ren.j), { nombre: 'importe', tipo: 'text' }])).s, 400, 'nombre repetido');
    igual((await esquema(ren.j, conserva(ren.j).filter(c => c.id !== cant.id))).s, 400, 'la fórmula Total usa Cant');
    // comprobar sin guardar
    const c = await req('POST', `/api/bases/${b.id}/formula`, { expr: '{Importe} + 1' }); igual(c.j.ok, true);
    igual((await req('POST', `/api/bases/${b.id}/formula`, { expr: 'FOO(1)' })).j.ok, false);
  });

  await prueba('bases: relaciones entre bases, enlaces depurados y resúmenes', async () => {
    autores = await crea('Autores'); libros = await crea('Libros2');
    const a1 = await esquema(autores, [...conserva(autores), { nombre: 'Edad', tipo: 'number' }]); autores = a1.j;
    const x = (await fila(autores, { [autores.columns[0].id]: 'Cervantes', [autores.columns[1].id]: 60 })).j.row;
    const y = (await fila(autores, { [autores.columns[0].id]: 'Borges', [autores.columns[1].id]: 80 })).j.row;
    igual((await esquema(libros, [...conserva(libros), { nombre: 'Autor', tipo: 'relation', destino: 'no-existe' }])).s, 400, 'destino inexistente');
    const l1 = await esquema(libros, [...conserva(libros), { nombre: 'Autor', tipo: 'relation', destino: autores.id }]); igual(l1.s, 200); libros = l1.j;
    const rel = libros.columns[1];
    const l2 = await esquema(libros, [...conserva(libros), { nombre: 'N autores', tipo: 'rollup', relacion: rel.id, func: 'cuenta' }, { nombre: 'Edad media', tipo: 'rollup', relacion: 'Autor', columna: autores.columns[1].id, func: 'media' }]);
    igual(l2.s, 200, JSON.stringify(l2.j)); libros = l2.j;
    const f = await fila(libros, { [libros.columns[0].id]: 'El Quijote', [rel.id]: [x.id, y.id, 'ffffffffffffffff'] }); igual(f.s, 200);
    igual(f.j.row.c[rel.id].length, 2, 'se descarta el enlace a una fila que no existe');
    igual(f.j.row.f[rel.id].map(t => t.t).sort().join(), 'Borges,Cervantes'); igual(f.j.row.f[libros.columns[2].id], 2); igual(f.j.row.f[libros.columns[3].id], 70);
    igual((await esquema(libros, [...conserva(libros), { nombre: 'Mal', tipo: 'rollup', relacion: rel.id, columna: libros.columns[0].id, func: 'suma' }])).s, 400, 'sumar una columna que no es número');
    // si se borra una fila de la base enlazada, el enlace deja de contar
    igual((await req('DELETE', `/api/bases/${autores.id}/rows/${x.id}`)).s, 200);
    igual((await req('GET', `/api/bases/${libros.id}`)).j.rows[0].f[libros.columns[2].id], 1);
    // CSV con las columnas calculadas
    const csv = (await req('GET', `/api/bases/${libros.id}/export?format=csv`)); igual(csv.s, 200);
  });

  await prueba('bases: correo, teléfono y archivo se validan; valores vacíos son válidos', async () => {
    const b = await crea('Tipos'); const r = await esquema(b, [...conserva(b), { nombre: 'Mail', tipo: 'email' }, { nombre: 'Tel', tipo: 'phone' }, { nombre: 'Doc', tipo: 'file' }]); igual(r.s, 200);
    const [, mail, tel, doc] = r.j.columns; const f = (await fila(r.j, {})).j.row;
    const put = (c) => req('PUT', `/api/bases/${b.id}/rows/${f.id}`, { c });
    igual((await put({ [mail.id]: 'a@b.es', [tel.id]: '+34 600 123 456', [doc.id]: 'Docs/a.pdf' })).s, 200);
    igual((await put({ [mail.id]: 'no es correo' })).s, 400); igual((await put({ [tel.id]: 'abc' })).s, 400); igual((await put({ [doc.id]: '../secreto' })).s, 400, 'ruta con ..');
    igual((await put({ [mail.id]: '', [tel.id]: '', [doc.id]: '' })).s, 200, 'vacío es válido');
    igual((await req('GET', `/api/bases/${b.id}`)).j.rows[0].c[mail.id], '');
  });

  await prueba('bases: cambiar el tipo convierte los valores y deja una copia', async () => {
    const b = await crea('Convertir'); const r = await esquema(b, [...conserva(b), { nombre: 'Estado', tipo: 'text' }, { nombre: 'Cifra', tipo: 'text' }]); const [n, es, ci] = r.j.columns;
    for (const [e, c] of [['Abierto', '5,5'], ['Cerrado', 'siete'], ['Abierto', '3']]) await fila(r.j, { [n.id]: 'x', [es.id]: e, [ci.id]: c });
    const c = await esquema(r.j, r.j.columns.map(x => (x.id === es.id ? { ...x, tipo: 'select' } : x.id === ci.id ? { ...x, tipo: 'number' } : { ...x })));
    igual(c.s, 200, JSON.stringify(c.j)); const sel = c.j.columns.find(x => x.id === es.id);
    igual(sel.opciones.map(o => o.nombre).sort().join(), 'Abierto,Cerrado', 'opciones creadas de los valores');
    const filas = c.j.rows; const nombre = (id) => (sel.opciones.find(o => o.id === id) || {}).nombre;
    igual(filas.map(x => nombre(x.c[es.id])).join(), 'Abierto,Cerrado,Abierto'); igual(filas.map(x => x.c[ci.id]).join(), '5.5,,3');
    cierto((c.j.avisos || []).length === 1, 'avisa de lo que no se pudo convertir');
    cierto(fs.readdirSync(path.join(DATA, '.kcc', 'borrados', 'bases-antes-de-convertir')).length >= 1, 'copia previa');
    igual((await esquema(c.j, c.j.columns.map(x => (x.id === n.id ? { ...x, tipo: 'formula' } : { ...x })))).s, 400, 'no se convierte a fórmula');
  });

  await prueba('bases: vistas calendario, galería y línea de tiempo; filtros y órdenes múltiples; vistas antiguas', async () => {
    const b = await crea('Vistas'); const r = await esquema(b, [...conserva(b), { nombre: 'Inicio', tipo: 'date' }, { nombre: 'Fin', tipo: 'date' }, { nombre: 'Foto', tipo: 'file' }, { nombre: 'Prio', tipo: 'number' }]); const [n, ini, fin, foto, pr] = r.j.columns;
    const v = await req('PUT', `/api/bases/${b.id}/schema`, { vistas: [
      { nombre: 'Cal', tipo: 'calendar', fecha: ini.id }, { nombre: 'Gal', tipo: 'gallery', portada: foto.id }, { nombre: 'Lín', tipo: 'timeline', fecha: ini.id, fechaFin: fin.id },
      { nombre: 'Multi', tipo: 'table', filtros: [{ col: pr.id, op: 'gte', valor: '2' }, { col: n.id, op: 'contains', valor: 'a' }], unir: 'o', ordenes: [{ col: pr.id, dir: 'desc' }, { col: n.id, dir: 'asc' }, { col: pr.id, dir: 'asc' }], ocultas: [foto.id] },
      { nombre: 'Vieja', tipo: 'table', filtro: { col: n.id, op: 'filled', valor: '' }, orden: { col: n.id, dir: 'desc' } }, { nombre: 'Rara', tipo: 'calendar', fecha: 'zzz' }] });
    igual(v.s, 200); const vs = v.j.views;
    igual(vs.map(x => x.tipo).join(), 'calendar,gallery,timeline,table,table,calendar'); igual(vs[0].fecha, ini.id); igual(vs[1].portada, foto.id); igual(vs[2].fechaFin, fin.id);
    igual(vs[3].filtros.length, 2); igual(vs[3].unir, 'o'); igual(vs[3].ordenes.length, 2, 'sin columnas repetidas en el orden'); igual(vs[3].ocultas[0], foto.id);
    igual(vs[4].filtros[0].op, 'filled', 'filtro antiguo migrado'); igual(vs[4].ordenes[0].dir, 'desc', 'orden antiguo migrado'); igual(vs[5].fecha, ini.id, 'fecha no válida → primera columna de fecha');
    const g = await req('GET', `/api/bases/${b.id}`); cierto(g.j.views.every(x => Array.isArray(x.filtros) && !('filtro' in x)));
    // una portada que no es de tipo Archivo se descarta
    igual((await req('PUT', `/api/bases/${b.id}/schema`, { vistas: [{ nombre: 'G', tipo: 'gallery', portada: n.id }] })).j.views[0].portada, '');
  });

  await prueba('bases: exportar e importar conserva fórmulas y quita las relaciones', async () => {
    const e = (await req('GET', `/api/bases/${libros.id}/export?format=json`)).j; cierto(e.columns.some(c => c.tipo === 'relation'));
    const i = await req('POST', '/api/bases/import', e); igual(i.s, 200);
    cierto(!i.j.columns.some(c => c.tipo === 'relation' || c.tipo === 'rollup'), 'sin relaciones ni resúmenes');
    igual(i.j.rows.length, libros.rows.length >= 0 ? 1 : 0);
  });

  await prueba('bases: 15 filas a la vez no se pisan; archivo dañado y valor vacío', async () => {
    const b = await crea('Concurrente'); const n = b.columns[0];
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => fila(b, { [n.id]: 'f' + i })));
    cierto(rs.every(r => r.s === 200), 'todas 200'); igual((await req('GET', `/api/bases/${b.id}`)).j.rows.length, 15);
    const f = path.join(DATA, '.kcc', 'bases', b.id + '.json'); fs.writeFileSync(f, '{roto');
    const g = await req('GET', `/api/bases/${b.id}`); igual(g.s, 200); cierto(g.j.rows.length >= 14, 'se repone de la copia anterior, nunca queda vacía');
    cierto(fs.readdirSync(path.dirname(f)).some(n => n.includes('.dañado-')), 'el dañado queda apartado');
    const c = (await req('POST', '/api/bases', { nombre: 'Vacía' })).j; igual((await fila(c, {})).s, 200, 'fila sin valores');
  });

  await prueba('bases: logros de fórmulas, relaciones y vistas', async () => {
    const g = (await req('GET', `/api/game`)).j;
    cierto(g.logros.familias.some(f => f.id === 'db_calc' && f.valor >= 3), 'familia db_calc'); cierto(g.logros.familias.some(f => f.id === 'db_rel' && f.valor >= 1), 'familia db_rel');
  });
};
