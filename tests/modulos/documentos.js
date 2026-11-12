'use strict';
// Pruebas de humo de Documentos: crear/leer/guardar, saneado del HTML (scripts, on*, javascript:, estilos), columnas y tablas,
// conflicto entre dispositivos, salvavidas, papelera, exportar, lectura dañada, escritura concurrente, valor vacío, sesión y logros.
const fs = require('fs'), path = require('path');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  const dir = path.join(DATA, '.kcc', 'documentos');
  const put = (id, cuerpo, cliente) => fetch(BASE + '/api/documentos/' + id, { method: 'PUT', headers: { Cookie: cookie(), 'Content-Type': 'application/json', 'X-KCC-Client': cliente || 'A' }, body: JSON.stringify(cuerpo) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  const lee = async (id) => (await req('GET', '/api/documentos/' + id)).j.documento;
  const marca = 'ornitorrinco' + Date.now().toString(36);

  await prueba('documentos: crear, guardar, leer y listar; título vacío y cuerpo vacío', async () => {
    const c = await req('POST', '/api/documentos', { title: 'Informe ' + marca });
    igual(c.s, 200, JSON.stringify(c.j));
    const id = c.j.documento.id; igual(c.j.documento.title, 'Informe ' + marca); igual(c.j.documento.pagina, 'a4');
    const g = await put(id, { html: '<h1>Hola</h1><p>Texto con <b>negrita</b> y ' + marca + '</p><ul><li>uno</li></ul>', pagina: 'carta' });
    igual(g.s, 200, JSON.stringify(g.j)); cierto(g.j.palabras >= 6, 'palabras: ' + g.j.palabras);
    const d = await lee(id); igual(d.pagina, 'carta'); cierto(d.html.includes('<b>negrita</b>') && d.titulos && d.listas, JSON.stringify(d));
    const l = (await req('GET', '/api/documentos')).j; cierto(l.documentos.some(x => x.id === id && x.palabras >= 6), 'en la lista'); cierto(l.plantillas.length >= 5, 'plantillas');
    igual((await put(id, { title: '   ' })).s, 200); igual((await lee(id)).title, 'Documento sin título', 'título vacío');
    const v = await put(id, { html: '' }); igual(v.s, 200); igual((await lee(id)).palabras, 0, 'cuerpo vacío permitido');
  });

  await prueba('documentos: el HTML se sanea (scripts, on*, javascript:, estilos peligrosos) y se conservan columnas y tablas', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Seguridad' })).j.documento.id;
    const sucio = '<p onclick="alert(1)" style="text-align:center;background:url(javascript:x);color:red">Hola<script>alert(1)</script></p><a href="javascript:alert(1)">mal</a><a href="https://ok.es/x?a=1">bien</a><img src=x onerror=alert(1)><iframe src="//evil"></iframe><div class="dc-cols evil" data-n="3"><div class="dc-col">a</div><div class="dc-col">b</div><div class="dc-col">c</div></div><table><tr><td colspan="2">x</td></tr></table>';
    igual((await put(id, { html: sucio })).s, 200);
    const h = (await lee(id)).html;
    cierto(!/script|onclick|onerror|javascript:|iframe|<img|url\(/i.test(h), 'peligros fuera: ' + h);
    cierto(h.includes('text-align:center') && h.includes('color:red'), 'estilos buenos se quedan: ' + h);
    cierto(h.includes('href="https://ok.es/x?a=1"') && h.includes('rel="noopener noreferrer"'), 'enlace bueno');
    cierto(h.includes('class="dc-cols" data-n="3"') && (h.match(/class="dc-col"/g) || []).length === 3, 'columnas');
    cierto(h.includes('colspan="2"'), 'tabla');
    const d = await lee(id); cierto(d.cols && d.tablas && d.enlaces, 'derivados: ' + JSON.stringify(d));
    const etiquetaSinCerrar = await put(id, { html: '<p><b>abierto<div>sin cerrar' }); igual(etiquetaSinCerrar.s, 200);
    const t = (await lee(id)).html; cierto((t.match(/<b>/g) || []).length === (t.match(/<\/b>/g) || []).length, 'equilibrado: ' + t);
  });

  await prueba('documentos: demasiado grande se rechaza (sin recortar) y los ids inválidos no existen', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Grande' })).j.documento.id;
    const r = await put(id, { html: '<p>' + 'a'.repeat(2100000) + '</p>' }); igual(r.s, 400, JSON.stringify(r.j).slice(0, 120));
    cierto(/demasiado grande/.test(r.j.error || ''), 'aviso claro');
    igual((await req('GET', '/api/documentos/zzzz')).s, 404); igual((await req('GET', '/api/documentos/' + '0'.repeat(16))).s, 404);
    igual((await put('..%2f..%2fx', { html: '<p>x</p>' })).s, 404, 'sin salir de la carpeta');
    igual((await req('DELETE', '/api/documentos/' + '1'.repeat(16))).s, 404);
  });

  await prueba('documentos: conflicto entre dispositivos (409) y guardar igualmente sin base', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Conflicto' })).j.documento.id;
    const abierta = (await lee(id)).updatedAt;
    await new Promise(r => setTimeout(r, 5));
    igual((await put(id, { html: '<p>cambio del móvil</p>' }, 'MOVIL')).s, 200);
    const c = await put(id, { html: '<p>cambio del portátil</p>', base: abierta }, 'PORTATIL');
    igual(c.s, 409, JSON.stringify(c.j));
    cierto((await lee(id)).html.includes('móvil'), 'no se pisó lo ajeno');
    igual((await put(id, { html: '<p>cambio del portátil</p>' }, 'PORTATIL')).s, 200, 'sin base se puede forzar');
    const propio = (await lee(id)).updatedAt;
    igual((await put(id, { html: '<p>otra vez</p>', base: propio }, 'PORTATIL')).s, 200, 'el mismo dispositivo no choca consigo');
  });

  await prueba('documentos: salvavidas cuando un guardado deja el texto casi vacío, y restaurar', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Salva' })).j.documento.id;
    const largo = '<p>' + 'Texto importante que no se debe perder. '.repeat(10) + '</p>';
    await put(id, { html: largo }); await put(id, { html: '<p>x</p>' });
    const s = (await req('GET', `/api/documentos/${id}/salvavidas`)).j; igual(s.copias.length, 1, JSON.stringify(s));
    igual((await req('POST', `/api/documentos/${id}/restaura`, { nombre: '../../x.json' })).s, 400, 'nombre raro');
    const r = await req('POST', `/api/documentos/${id}/restaura`, { nombre: s.copias[0].nombre }); igual(r.s, 200, JSON.stringify(r.j));
    cierto((await lee(id)).html.includes('Texto importante'), 'texto recuperado');
    // Lo actual solo se aparta si es largo: con 1 carácter no hace falta
    await put(id, { html: '<p>' + 'Otro texto largo que tampoco debe perderse nunca. '.repeat(8) + '</p>' });
    const antes = (await req('GET', `/api/documentos/${id}/salvavidas`)).j.copias;
    await req('POST', `/api/documentos/${id}/restaura`, { nombre: antes[antes.length - 1].nombre });
    cierto((await req('GET', `/api/documentos/${id}/salvavidas`)).j.copias.length > antes.length, 'lo de antes de restaurar también se guarda');
  });

  await prueba('documentos: duplicar, borrar a la papelera y restaurar', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Original ' + marca, html: '<p>contenido ' + marca + '</p>' })).j.documento.id;
    const cp = await req('POST', `/api/documentos/${id}/duplicar`); igual(cp.s, 200); cierto(/^Copia de/.test(cp.j.documento.title), 'título de copia');
    igual((await req('DELETE', '/api/documentos/' + id)).s, 200); igual((await req('GET', '/api/documentos/' + id)).s, 404, 'ya no está');
    const p = (await req('GET', '/api/documentos/papelera')).j.documentos.find(x => x.id === id); cierto(p, 'en la papelera');
    igual((await req('POST', '/api/documentos/papelera/restaura', { nombre: '../x' })).s, 400);
    igual((await req('POST', '/api/documentos/papelera/restaura', { nombre: p.nombre })).s, 200);
    cierto((await lee(id)).html.includes(marca), 'restaurado con su texto');
  });

  await prueba('documentos: plantillas (columnas) y exportar HTML, Markdown y texto', async () => {
    const c = (await req('POST', '/api/documentos', { plantilla: 'curriculum' })).j.documento; cierto(c.cols && /dc-cols/.test(c.html), 'currículum con columnas');
    const e = async (f) => fetch(BASE + `/api/documentos/${c.id}/export?format=${f}`, { headers: { Cookie: cookie() } });
    const h = await e('html'); igual(h.status, 200); cierto(/text\/html/.test(h.headers.get('content-type')) && /attachment/.test(h.headers.get('content-disposition')) && h.headers.get('x-content-type-options') === 'nosniff', 'cabeceras html');
    const ht = await h.text(); cierto(ht.includes('<style>') && ht.includes('dc-cols') && !/<script/i.test(ht), 'html completo');
    const m = await (await e('md')).text(); cierto(/^# /m.test(m) && !/<div/.test(m), 'markdown: ' + m.slice(0, 80));
    const t = await (await e('txt')).text(); cierto(!/</.test(t) && /Experiencia/.test(t), 'texto');
  });

  await prueba('documentos: lectura dañada (se repone de la copia), escritura concurrente y sin sesión', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Dañado' })).j.documento.id;
    await put(id, { html: '<p>versión uno</p>' }); await put(id, { html: '<p>versión dos</p>' });
    fs.writeFileSync(path.join(dir, id + '.json'), '{rota');
    const g = await req('GET', '/api/documentos/' + id); igual(g.s, 200, JSON.stringify(g.j)); cierto(/versi/.test(g.j.documento.html), 'repuesto desde la copia');
    const tandas = await Promise.all(Array.from({ length: 6 }, (_, i) => put(id, { title: 'T' + i }, 'C' + i)));
    cierto(tandas.every(x => x.s === 200), JSON.stringify(tandas.map(x => x.s)));
    JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
    igual((await fetch(BASE + '/api/documentos')).status, 401); igual((await fetch(BASE + '/api/documentos/' + id)).status, 401);
    igual((await fetch(BASE + '/api/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const a = await Promise.all(Array.from({ length: 5 }, (_, i) => req('POST', '/api/documentos', { title: 'Par ' + i })));
    cierto(a.every(x => x.s === 200) && new Set(a.map(x => x.j.documento.id)).size === 5, 'cinco altas a la vez');
  });

  await prueba('documentos: aparecen en la búsqueda global y dan logros', async () => {
    const id = (await req('POST', '/api/documentos', { title: 'Buscable', html: '<p>El ' + marca + 'raro vive en Australia</p>' })).j.documento.id;
    const r = (await req('GET', '/api/busqueda?q=' + marca + 'raro')).j; cierto(r.resultados.some(x => x.fuente === 'documentos' && x.id === id), 'búsqueda: ' + JSON.stringify(r.fuentes));
    const g = JSON.stringify((await req('GET', '/api/game')).j); cierto(g.includes('Papelería') && g.includes('Pluma incansable'), 'logros de Documentos');
    const ex = await req('GET', '/api/export/documentos'); igual(ex.s, 200); cierto(JSON.stringify(ex.j).includes(marca), 'exportación de datos');
  });
};
