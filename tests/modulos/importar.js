'use strict';
// Pruebas de humo de los importadores (Notion, Evernote, Google Docs, Apple Notes y CSV con asignación de columnas):
// conversión por formato, adjuntos, límites y rutas peligrosas, CSV a base nueva / base existente / contactos,
// sin sesión, token caducado o ajeno, concurrencia y logros.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { zipSync, strToU8 } = require('fflate');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

module.exports = async ({ req, prueba, igual, cierto, DATA, BASE, cookie }) => {
  const sube = async (nombre, buf, fuente = '') => {
    const fd = new FormData(); fd.append('fuente', fuente); fd.append('archivo', new Blob([buf]), nombre);
    const r = await fetch(BASE + '/api/importar/analizar', { method: 'POST', headers: { Cookie: cookie() }, body: fd });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  };
  const ejecuta = (cuerpo) => req('POST', '/api/importar/ejecutar', cuerpo);
  const nota = async (id) => (await req('GET', '/api/notes/' + id)).j.body;
  const items = async () => (await req('GET', '/api/notes')).j.items;
  const raizDe = async (nombre) => (await items()).find(i => i.type === 'folder' && i.title.startsWith('Importado de ' + nombre));

  await prueba('importar: Evernote (.enex) con imagen, tarea, etiquetas y fechas', async () => {
    const hash = crypto.createHash('md5').update(PNG).digest('hex');
    const enex = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export><note><title>Compra &amp; viaje</title><created>20240105T101500Z</created><updated>20240106T101500Z</updated><tag>viajes</tag>
<content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Hola <b>mundo</b></div><div><en-todo checked="true"/>pan</div><div><en-todo/>leche</div><en-media type="image/png" hash="${hash}"/></en-note>]]></content>
<resource><data encoding="base64">${PNG.toString('base64')}</data><mime>image/png</mime><resource-attributes><file-name>foto.png</file-name></resource-attributes></resource></note></en-export>`;
    const a = await sube('mis notas.enex', Buffer.from(enex));
    igual(a.s, 200, JSON.stringify(a.j));
    igual(a.j.fuente, 'evernote'); igual(a.j.notas, 1); igual(a.j.adjuntos, 1);
    const antes = (await items()).length;
    igual((await items()).length, antes, 'analizar no escribe');
    const r = await ejecuta({ token: a.j.token, destino: '', notas: true, tablas: [] });
    igual(r.s, 200, JSON.stringify(r.j));
    igual(r.j.notas.notas, 1); igual(r.j.notas.adjuntos, 1);
    const raiz = await raizDe('Evernote'); cierto(raiz, 'carpeta raíz');
    const n = (await items()).find(i => i.type === 'note' && i.title === 'Compra & viaje'); cierto(n, 'nota creada');
    const cuerpo = await nota(n.id);
    cierto(cuerpo.includes('**mundo**'), 'negrita: ' + cuerpo);
    cierto(/\[x\] pan/.test(cuerpo) && /\[ \] leche/.test(cuerpo), 'tareas: ' + cuerpo);
    cierto(cuerpo.includes('#viajes'), 'etiquetas');
    cierto(/kcc:file\/Adjuntos(%20| )de(%20| )notas/.test(cuerpo), 'imagen enlazada: ' + cuerpo);
    cierto(fs.readdirSync(path.join(DATA, 'Adjuntos de notas')).some(f => /^foto/.test(f)), 'archivo en Adjuntos de notas');
    igual((await ejecuta({ token: a.j.token, destino: '' })).s, 404, 'el análisis ya no sirve tras importar');
  });

  await prueba('importar: Notion (ZIP con ids, aside, imagen y CSV de base de datos)', async () => {
    const zip = zipSync({
      'Export/Proyecto abc123def4567890abc123def4567890.md': strToU8('# Proyecto\n\n<aside>\n💡 Idea clave\n</aside>\n\n![logo](Proyecto%20abc123def4567890abc123def4567890/logo.png)\n\n[Otra](Otra%2011111111111111111111111111111111.md)\n'),
      'Export/Proyecto abc123def4567890abc123def4567890/logo.png': new Uint8Array(PNG),
      'Export/Otra 11111111111111111111111111111111.md': strToU8('# Otra\n\ntexto'),
      'Export/Tareas 22222222222222222222222222222222.csv': strToU8('Nombre,Hecho\nA,Yes\nB,No\nC,Yes\n'),
    });
    const a = await sube('notion.zip', Buffer.from(zip));
    igual(a.s, 200, JSON.stringify(a.j));
    igual(a.j.fuente, 'notion'); igual(a.j.notas, 2); igual(a.j.tablas.length, 1);
    cierto(a.j.arbol.every(n => !/[0-9a-f]{32}/.test(n.titulo)), 'títulos sin ids: ' + JSON.stringify(a.j.arbol));
    const r = await ejecuta({ token: a.j.token, destino: '', notas: true, tablas: [] });
    igual(r.s, 200, JSON.stringify(r.j)); igual(r.j.notas.notas, 2); igual(r.j.notas.adjuntos, 1);
    const n = (await items()).find(i => i.title === 'Proyecto'); cierto(n, 'nota Proyecto');
    const c = await nota(n.id);
    cierto(!/<aside>/.test(c) && c.includes('Idea clave'), 'aside convertido: ' + c);
  });

  await prueba('importar: Google Docs (.docx generado), Apple Notes (carpeta Markdown) y .html con estilos', async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'word/styles.xml': strToU8(`<w:styles ${W}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`),
      'word/document.xml': strToU8(`<w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Informe</w:t></w:r></w:p><w:p><w:r><w:t>Hola </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>fuerte</w:t></w:r></w:p></w:body></w:document>`),
    });
    const a = await sube('informe.docx', Buffer.from(docx));
    igual(a.s, 200, JSON.stringify(a.j)); igual(a.j.fuente, 'docs'); igual(a.j.notas, 1);
    const r = await ejecuta({ token: a.j.token, destino: '' }); igual(r.s, 200, JSON.stringify(r.j));
    const n = (await items()).find(i => i.type === 'note' && i.title === 'Informe'); cierto(n, 'nota Informe');
    cierto((await nota(n.id)).includes('**fuerte**'), 'negrita docx');

    const apple = zipSync({ 'Notas/Casa/Lista.md': strToU8('# Lista\n\n- uno\n- dos'), 'Notas/Diario.txt': strToU8('hoy\nfue bien'), '__MACOSX/x': strToU8('basura') });
    const b = await sube('apple.zip', Buffer.from(apple), 'apple');
    igual(b.s, 200, JSON.stringify(b.j)); igual(b.j.notas, 2);
    const html = '<html><head><style>.c1{font-weight:700}</style></head><body><p>Texto <span class="c1">negro</span></p><script>alert(1)</script></body></html>';
    const c = await sube('doc.html', Buffer.from(html));
    igual(c.s, 200, JSON.stringify(c.j));
    const rc = await ejecuta({ token: c.j.token, destino: '' }); igual(rc.s, 200);
    const nh = (await items()).find(i => i.type === 'note' && i.title === 'doc'); cierto(nh, 'nota html');
    const ch = await nota(nh.id); cierto(ch.includes('**negro**') && !/alert/.test(ch), 'clases y scripts: ' + ch);
  });

  await prueba('importar: seguridad (formato, ZIP vacío, rutas con .., adjunto peligroso, token ajeno)', async () => {
    igual((await sube('virus.exe', Buffer.from('MZ'))).s, 400);
    igual((await sube('vacio.zip', Buffer.from(zipSync({ 'a.bin': new Uint8Array([1, 2, 3]) })))).s, 400, 'sin nada importable');
    const mal = zipSync({ '../../fuera.md': strToU8('# fuera'), 'ok/dentro.md': strToU8('![x](img.svg)\n\n![y](img.png)\n\ntexto'), 'ok/img.svg': strToU8('<svg onload="alert(1)"/>'), 'ok/img.png': new Uint8Array(PNG) });
    const a = await sube('mal.zip', Buffer.from(mal), 'apple');
    igual(a.s, 200, JSON.stringify(a.j));
    const r = await ejecuta({ token: a.j.token, destino: '' }); igual(r.s, 200, JSON.stringify(r.j));
    cierto(!fs.existsSync(path.join(DATA, '..', 'fuera.md')) && !fs.existsSync(path.join(DATA, 'fuera.md')), 'nada fuera de su sitio');
    cierto(!fs.existsSync(path.join(DATA, 'Adjuntos de notas', 'img.svg')), 'svg no se copia');
    igual((await ejecuta({ token: 'x'.repeat(32) })).s, 404, 'token inventado');
    igual((await ejecuta({})).s, 404, 'sin token');
    const sin = await fetch(BASE + '/api/importar/ejecutar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    igual(sin.status, 401, 'sin sesión');
    const fd = new FormData(); fd.append('archivo', new Blob(['a']), 'a.md');
    igual((await fetch(BASE + '/api/importar/analizar', { method: 'POST', body: fd })).status, 401, 'analizar sin sesión');
  });

  await prueba('importar: CSV → base nueva con tipos, base existente y contactos', async () => {
    const csv = 'Nombre;Edad;Alta;Activo;Estado\nAna;31;03/02/2024;Sí;Abierto\nLuis;27;15/03/2024;No;Cerrado\nEva;40;01/12/2023;Sí;Abierto\nIgor;x;mal;No;Abierto\n';
    const a = await sube('personas.csv', Buffer.from(csv, 'latin1'));
    igual(a.s, 200, JSON.stringify(a.j)); igual(a.j.fuente, 'csv');
    const t = a.j.tablasDetalle[0];
    igual(t.separador, ';'); igual(t.total, 4); igual(t.tipos[3], 'checkbox'); igual(t.tipos[4], 'select');
    const cols = t.cabecera.map((c, k) => ({ col: k, nombre: c, tipo: t.tipos[k] }));
    cols[1].tipo = 'number'; cols[2].tipo = 'date';   // con un valor raro la sugerencia prudente es texto: aquí se fuerza
    const r = await ejecuta({ token: a.j.token, notas: false, tablas: [{ tabla: 0, destino: 'nueva', nombre: 'Personas ' + Date.now(), columnas: cols }] });
    igual(r.s, 200, JSON.stringify(r.j)); igual(r.j.tablas[0].filas, 4);
    cierto(r.j.tablas[0].avisos.some(x => /no se entendieron/.test(x)), 'avisa de valores raros: ' + JSON.stringify(r.j.tablas[0].avisos));
    const b = (await req('GET', '/api/bases/' + r.j.tablas[0].baseId)).j;
    igual(b.rows.length, 4); igual(b.columns.find(c => c.nombre === 'Edad').tipo, 'number'); igual(b.columns.find(c => c.nombre === 'Estado').tipo, 'select');
    const ana = b.rows.find(f => Object.values(f.c).includes('Ana')); cierto(Object.values(ana.c).includes(31) && Object.values(ana.c).includes('2024-02-03') && Object.values(ana.c).includes(true), 'valores tipados: ' + JSON.stringify(ana.c));

    // a una base que ya existe, emparejando columnas
    const a2 = await sube('mas.csv', Buffer.from('Nombre,Edad\nNora,22\nPablo,33\n'));
    const info = a2.j.bases.find(x => x.id === r.j.tablas[0].baseId); cierto(info, 'la base aparece como destino');
    const iN = info.columnas.find(c => c.nombre === 'Nombre').i, iE = info.columnas.find(c => c.nombre === 'Edad').i;
    const r2 = await ejecuta({ token: a2.j.token, notas: false, tablas: [{ tabla: 0, destino: 'base', baseId: info.id, destinoCols: [iN, iE] }] });
    igual(r2.s, 200, JSON.stringify(r2.j)); igual(r2.j.tablas[0].filas, 2);
    igual((await req('GET', '/api/bases/' + info.id)).j.rows.length, 6);
    igual((await ejecuta({ token: a2.j.token, notas: false, tablas: [] })).s, 404, 'el token se gasta al importar');

    // a contactos (cabeceras de Google) y sin duplicar al repetir
    const vcf = 'First Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Labels\nMarta,Quiroga,marta@example.com,600111222,Amigos ::: Trabajo\nJuan,Mora,,600333444,\n';
    const a3 = await sube('contactos.csv', Buffer.from(vcf));
    const campos = a3.j.tablasDetalle[0].campos; igual(campos[0], 'first'); igual(campos[2], 'email');
    const r3 = await ejecuta({ token: a3.j.token, notas: false, tablas: [{ tabla: 0, destino: 'contactos', campos }] });
    igual(r3.s, 200, JSON.stringify(r3.j)); igual(r3.j.tablas[0].filas, 2);
    const a4 = await sube('contactos.csv', Buffer.from(vcf));
    const r4 = await ejecuta({ token: a4.j.token, notas: false, tablas: [{ tabla: 0, destino: 'contactos', campos }] });
    igual(r4.j.tablas[0].filas, 0); igual(r4.j.tablas[0].duplicados, 2, 'no duplica');
    const lista = (await req('GET', '/api/contacts')).j; cierto(JSON.stringify(lista).includes('Quiroga'), 'contacto creado');
  });

  await prueba('importar: valor vacío, CSV dañado/vacío, mapeo sin columnas y subidas simultáneas', async () => {
    igual((await sube('vacio.csv', Buffer.from(''))).s, 400);
    igual((await sube('cabecera.csv', Buffer.from('a,b\n'))).s, 400, 'solo cabecera');
    const a = await sube('x.csv', Buffer.from('a,b\n1,2\n3,4\n'));
    const r = await ejecuta({ token: a.j.token, notas: false, tablas: [{ tabla: 0, destino: 'nueva', columnas: [{ col: 0, ignora: true }, { col: 1, ignora: true }] }] });
    igual(r.s, 200); cierto(r.j.errores.length === 1 && !r.j.tablas.length, 'todas ignoradas: ' + JSON.stringify(r.j));
    const r2 = await ejecuta({ token: a.j.token, notas: false, tablas: [{ tabla: 0, destino: 'contactos', campos: ['', ''] }] });
    cierto(r2.j.errores.length === 1, 'contactos sin campos');
    const antes = (await items()).length;
    const tandas = await Promise.all([1, 2, 3].map(i => sube(`n${i}.md`, Buffer.from('# Nota ' + i + '\n\ncuerpo')).then(x => ejecuta({ token: x.j.token, destino: '' }))));
    cierto(tandas.every(x => x.s === 200 && x.j.notas && x.j.notas.notas === 1), JSON.stringify(tandas.map(x => x.j)));
    igual((await items()).length, antes + 3 * 2, 'tres importaciones a la vez: 3 carpetas raíz + 3 notas, sin pisarse');
    const raices = (await items()).filter(i => i.type === 'folder' && i.title.startsWith('Importado de'));
    cierto(new Set(raices.map(x => x.id)).size === raices.length, 'ids únicos');
  });

  await prueba('importar: destino de notas inexistente, índice de notas dañado y logros', async () => {
    const a = await sube('d.md', Buffer.from('hola'));
    const r = await ejecuta({ token: a.j.token, destino: 'noexiste' });
    igual(r.s, 200); cierto(r.j.errores.length === 1 && !r.j.notas, 'destino inválido: ' + JSON.stringify(r.j));
    const idx = path.join(DATA, '.notes', 'index.json'), orig = fs.readFileSync(idx), bak = fs.existsSync(idx + '.bak') ? fs.readFileSync(idx + '.bak') : null;
    fs.writeFileSync(idx, '{rota'); if (bak) fs.writeFileSync(idx + '.bak', '{rota');
    const r2 = await ejecuta({ token: a.j.token, destino: '' });
    cierto(r2.j.errores.length === 1 && !r2.j.notas, 'no se importa sobre un índice dañado: ' + JSON.stringify(r2.j));
    fs.writeFileSync(idx, orig); if (bak) fs.writeFileSync(idx + '.bak', bak);
    const g = (await req('GET', '/api/game')).j;
    cierto(JSON.stringify(g).includes('Trasvase de notas') || JSON.stringify(g).includes('im_notas'), 'logros de Importar presentes');
  });
};
