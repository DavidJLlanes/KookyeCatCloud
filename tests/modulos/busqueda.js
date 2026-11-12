'use strict';
// Pruebas de humo de la búsqueda global sin IA: índice sobre varios módulos, acentos, plurales, prefijos, erratas, filtros,
// sin sesión, consultas vacías, fuente dañada, peticiones simultáneas, historial y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  const marca = 'zorrillo' + Date.now().toString(36);
  const busca = async (q, m) => (await req('GET', `/api/busqueda?q=${encodeURIComponent(q)}${m ? '&m=' + m : ''}`)).j;

  await prueba('busqueda: encuentra en notas, prompts, contactos, pagos, marcadores, archivos y bases', async () => {
    const nota = await req('POST', '/api/notes', { type: 'note', title: 'Servidor de ' + marca, body: 'Configuré nginx en el VPS de IONOS para ' + marca });
    igual(nota.s, 200, JSON.stringify(nota.j));
    igual((await req('POST', '/api/prompts', { title: 'Prompt ' + marca, body: 'Escribe un poema sobre ' + marca })).s, 200);
    igual((await req('POST', '/api/contacts', { first: 'Elena', last: marca, company: 'Cerrajería' })).s, 200);
    igual((await req('POST', '/api/pagos', { nombre: 'Seguro ' + marca, compania: 'Mapfre', categoria: 'Seguros', importe: '12,50', frecuencia: 'mensual', fechaProxima: '2031-01-15' })).s, 200);
    igual((await req('POST', '/api/marcadores', { nombre: 'Web ' + marca, url: 'https://example.com/' + marca })).s, 200);
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob([`contenido del archivo con ${marca} dentro`]), `apuntes-${marca}.txt`);
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    const b = await req('POST', '/api/bases', { nombre: 'Base ' + marca });
    igual(b.s, 200, JSON.stringify(b.j));

    const r = await busca(marca);
    cierto(r.total >= 6, 'resultados: ' + r.total);
    for (const f of ['notas', 'prompts', 'contactos', 'pagos', 'marcadores', 'archivos', 'bases']) cierto(r.fuentes[f] >= 1, 'fuente ' + f + ' ' + JSON.stringify(r.fuentes));
    const n = r.resultados.find(x => x.fuente === 'notas');
    cierto(n && n.titulo.includes(marca) && n.extracto.texto.length > 0, 'extracto de la nota');
    cierto(n.extracto.marcas.length >= 1, 'marcas de coincidencia');
  });

  await prueba('busqueda: acentos, plurales, prefijos, erratas, filtro por módulo y consultas inútiles', async () => {
    cierto((await busca('configure')).resultados.some(x => x.fuente === 'notas' && x.titulo.includes(marca)), 'sin acento encuentra «Configuré»');
    cierto((await busca('servidores ' + marca)).resultados.some(x => x.fuente === 'notas'), 'plural → singular');
    cierto((await busca(marca.slice(0, 7))).resultados.length >= 1, 'prefijo');
    cierto((await busca('ngnix ' + marca)).resultados.some(x => x.fuente === 'notas'), 'errata («ngnix»)');
    const solo = await busca(marca, 'contactos');
    cierto(solo.resultados.length >= 1 && solo.resultados.every(x => x.fuente === 'contactos'), 'filtro por módulo');
    cierto(Object.keys(solo.fuentes).length > 1, 'las facetas siguen contando todos los módulos');
    igual((await busca('')).total, 0, 'consulta vacía');
    igual((await busca('a')).total, 0, 'una sola letra');
    igual((await busca('xyzqwv' + Date.now())).total, 0, 'sin coincidencias');
    igual((await busca(marca + 'y'.repeat(5000))).total, 0, 'consulta enorme se recorta sin romper');
    igual((await req('GET', '/api/busqueda?q=zzz&m=inventado')).s, 200, 'módulo desconocido ignorado');
  });

  await prueba('busqueda: exige sesión', async () => {
    igual((await fetch(BASE + '/api/busqueda?q=hola')).status, 401);
    igual((await fetch(BASE + '/api/busqueda/fuentes')).status, 401);
    igual((await fetch(BASE + '/api/busqueda/reindexar', { method: 'POST' })).status, 401);
  });

  await prueba('busqueda: peticiones simultáneas y un módulo dañado no la rompen', async () => {
    const todas = await Promise.all(Array.from({ length: 12 }, (_, i) => req('GET', `/api/busqueda?q=${encodeURIComponent(marca)}&guarda=${i % 2}`)));
    for (const r of todas) { igual(r.s, 200); cierto(r.j.total >= 6, 'cada petición ve el índice entero'); }
    const f = path.join(DATA, '.kcc', 'pagos', 'data.json');
    const hay = fs.existsSync(f);
    if (hay) {
      fs.writeFileSync(f + '.bak', 'no es json'); fs.writeFileSync(f, '{roto');
      igual((await req('POST', '/api/busqueda/reindexar')).s, 200, 'reindexar con un módulo dañado');
      const r = await busca(marca);
      cierto(r.total >= 5 && !r.fuentes.pagos, 'el resto de módulos sigue funcionando');
    }
  });

  await prueba('busqueda: historial reciente, fuentes y logro «Buscador»', async () => {
    await busca('historial-' + marca);
    const rec = (await req('GET', '/api/busqueda/recientes')).j.recientes;
    cierto(rec.includes('historial-' + marca), 'se guarda en el historial');
    igual(rec.filter(x => x === 'historial-' + marca).length, 1, 'sin duplicados');
    await req('GET', `/api/busqueda?q=oculta-${marca}&guarda=0`);
    cierto(!(await req('GET', '/api/busqueda/recientes')).j.recientes.includes('oculta-' + marca), 'guarda=0 no deja rastro');
    const f = (await req('GET', '/api/busqueda/fuentes')).j;
    cierto(f.fuentes.length >= 10 && f.total > 0, 'lista de fuentes');
    await new Promise(r => setTimeout(r, 300));
    const g = (await req('GET', '/api/game')).j;
    cierto(g.logros.familias.find(x => x.id === 'bu_busquedas').valor >= 5, 'logro Buscador cuenta las búsquedas');
    igual((await req('DELETE', '/api/busqueda/recientes')).s, 200);
    igual((await req('GET', '/api/busqueda/recientes')).j.recientes.length, 0, 'historial borrado');
  });

  await prueba('busqueda: la lista de la compra se encuentra (pendientes, resumen y recuento sin resúmenes)', async () => {
    const a = await req('POST', '/api/shopping/products', { name: 'Gambas ' + marca, unit: 'paquete', quantity: 2, category: 'Congelados' }); igual(a.s, 200, JSON.stringify(a.j));
    igual((await req('POST', '/api/shopping/products', { name: 'Arroz ' + marca, unit: 'kg', quantity: 1, addToList: false })).s, 200);
    const r = await busca(marca, 'compra');
    igual(r.resultados.filter(x => !/pendientes de comprar|todos los productos/.test(x.titulo)).length, 2, 'un resultado por producto (y los dos resúmenes también casan con el nombre)');
    const g = r.resultados.find(x => /Gambas/.test(x.titulo)); cierto(g && g.fuente === 'compra', 'producto pendiente');
    const lista = await busca('qué hay en la lista de la compra pendiente', 'compra');
    cierto(lista.resultados.some(x => /pendientes de comprar/.test(x.titulo)), 'el resumen de pendientes sale con una pregunta natural');
    const c = (await req('GET', '/api/busqueda/fuentes')).j.fuentes.find(f => f.id === 'compra');
    igual(c.documentos, (await req('GET', '/api/shopping')).j.products.length, 'el recuento cuenta productos, no resúmenes');
  });

  await prueba('busqueda: juegos, enlaces, colecciones, papelera, logros y archivos que no son de texto', async () => {
    igual((await req('POST', '/api/games', { title: 'Juego ' + marca, status: 'jugando', platforms: ['Switch'] })).s, 200);
    const fd = new FormData(); fd.append('path', ''); fd.append('files', new Blob([Buffer.from([137, 80, 78, 71, 1, 2, 3])]), 'foto-' + marca + '.png');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie() }, body: fd })).status, 200);
    igual((await req('POST', '/api/albums', { title: 'Álbum ' + marca, paths: ['foto-' + marca + '.png'] })).s, 200);
    igual((await req('POST', '/api/sharelinks', { path: 'foto-' + marca + '.png', label: 'Enlace ' + marca })).s, 200);
    const esperadas = { juegos: 'Juego ', enlaces: 'Enlace ', colecciones: 'Álbum: ', archivos: 'foto-' };
    for (const [m, ini] of Object.entries(esperadas)) { const r = await busca(marca, m); cierto(r.resultados.some(x => x.fuente === m && x.titulo.startsWith(ini)), m + ': sale con su filtro'); }
    const a = await busca('png ' + marca, 'archivos'); cierto(a.resultados.some(x => /foto-/.test(x.titulo)), 'un archivo que no es de texto sale por su nombre');
    igual((await req('DELETE', '/api/files?path=' + encodeURIComponent('foto-' + marca + '.png'))).s, 200, 'a la papelera');
    const p = await busca('foto ' + marca, 'papelera'); cierto(p.resultados.some(x => x.fuente === 'papelera'), 'lo borrado sale en la papelera');
    cierto(Array.isArray((await busca('nivel racha logros', 'logros')).resultados), 'logros: el filtro responde');
    const f = (await req('GET', '/api/busqueda/fuentes')).j.fuentes.map(x => x.id);
    for (const id of ['compra', 'juegos', 'enlaces', 'colecciones', 'logros', 'papelera']) cierto(f.includes(id), 'fuente ' + id);
  });
};
