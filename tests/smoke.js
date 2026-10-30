'use strict';
/* Pruebas de humo: arrancan la app en una copia temporal (con datos y users.json propios, sin tocar los del repo)
   y recorren las rutas principales. Se ejecutan con `npm test`. Sirven de red de seguridad al reorganizar código. */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kcc-smoke-'));
const APP = path.join(TMP, 'app'), DATA = path.join(TMP, 'data');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let cookie = '', fallos = 0, total = 0, srv;

function copia() {
  fs.mkdirSync(APP); fs.mkdirSync(DATA);
  for (const f of ['server.js', 'webdav.js', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(APP, f));
  execFileSync('cp', ['-r', path.join(ROOT, 'lib'), path.join(ROOT, 'public'), APP]);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(APP, 'node_modules'));
}
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function req(metodo, url, cuerpo, extra = {}) {
  const h = { Cookie: cookie, ...(extra.headers || {}) };
  let body;
  if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
  const r = await fetch(BASE + url, { method: metodo, headers: h, body, redirect: 'manual' });
  const set = r.headers.get('set-cookie'); if (set && /token=/.test(set)) cookie = set.split(';')[0];
  const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch { /* no es JSON */ }
  return { s: r.status, j: json, t: txt };
}
async function prueba(nombre, fn) {
  total++;
  try { await fn(); console.log('  ok  ', nombre); }
  catch (e) { fallos++; console.log('  FALLA', nombre, '→', e.message); }
}
const igual = (a, b, m) => { if (a !== b) throw new Error(`${m || 'valor'}: esperado ${b}, recibido ${a}`); };
const cierto = (v, m) => { if (!v) throw new Error(m || 'condición falsa'); };

(async () => {
  copia();
  srv = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'smoke-test-1', INSECURE_COOKIES: '1', TEXT_MAX: '512KB   # comentario al final, como en un .env de systemd', OFFICE_TIMEOUT: '90000    # ms', BASE_PATH: '', THUMBS_DIR: path.join(TMP, 'thumbs') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/version')).ok) break; } catch { /* aún no */ } await dormir(250); }

  console.log('Pruebas de humo en', BASE);
  await prueba('versión pública', async () => { igual((await req('GET', '/api/version')).s, 200); });
  await prueba('página principal y service worker', async () => {
    const a = await req('GET', '/'); igual(a.s, 200); cierto(a.t.includes('docexport.js'), 'index sin docexport.js');
    igual((await req('GET', '/sw.js')).s, 200); igual((await req('GET', '/js/docexport.js')).s, 200);
  });
  await prueba('todos los <script> y hojas de estilo del index existen y están en el service worker', async () => {
    const html = (await req('GET', '/')).t, sw = (await req('GET', '/sw.js')).t;
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].replace(/^\/?/, '/'));
    cierto(srcs.length > 30, 'pocos scripts: ' + srcs.length);
    srcs.push(...[...html.matchAll(/<link rel="stylesheet" href="(\/[^"]+)"/g)].map(m => m[1]));
    for (const u of srcs) { igual((await req('GET', u)).s, 200, u); cierto(sw.includes("'" + u + "'"), 'falta en sw.js: ' + u); }
  });
  await prueba('sin sesión no se accede', async () => { igual((await req('GET', '/api/files')).s, 401); });
  await prueba('login con clave errónea', async () => { igual((await req('POST', '/api/login', { username: 'admin', password: 'mal' })).s, 401); });
  await prueba('login correcto', async () => { const r = await req('POST', '/api/login', { username: 'admin', password: 'smoke-test-1' }); igual(r.s, 200); cierto(cookie, 'sin cookie'); });
  await prueba('/api/me', async () => { const r = await req('GET', '/api/me'); igual(r.s, 200); igual(r.j.username || (r.j.user && r.j.user.username), 'admin'); });

  await prueba('archivos: crear carpeta y listar', async () => {
    cierto([200, 201].includes((await req('POST', '/api/mkdir', { path: '', name: 'Prueba' })).s), 'mkdir');
    const l = await req('GET', '/api/files?path='); igual(l.s, 200); cierto(JSON.stringify(l.j).includes('Prueba'), 'carpeta no listada');
  });
  let notaId;
  await prueba('notas: crear, leer, guardar, borrar', async () => {
    const c = await req('POST', '/api/notes', { type: 'note', title: 'Humo' }); igual(c.s, 200);
    notaId = (c.j.item || c.j.note || c.j).id; cierto(notaId, 'sin id');
    const g = await req('POST', '/api/notes/' + notaId, { title: 'Humo', body: '# Hola\n\ntexto' }); cierto(g.s < 300, 'guardar ' + g.s);
    const l = await req('GET', '/api/notes/' + notaId); igual(l.s, 200); cierto(JSON.stringify(l.j).includes('Hola'), 'cuerpo no guardado');
    cierto((await req('GET', '/api/notes/' + notaId + '/export')).s === 200, 'export md');
    cierto((await req('DELETE', '/api/notes/' + notaId)).s < 300, 'borrar');
  });
  await prueba('notas: carpeta, papelera, restaurar y borrado múltiple', async () => {
    const f = await req('POST', '/api/notes', { type: 'folder', title: 'Carpeta' }); igual(f.s, 200);
    const n = await req('POST', '/api/notes', { type: 'note', title: 'Dentro', parent: f.j.item.id, body: 'palabraunica' }); igual(n.s, 200);
    igual((await req('DELETE', '/api/notes/' + f.j.item.id)).j.borrados, 2);
    const t = await req('GET', '/api/notes-trash'); cierto(t.j.items.filter(x => x.grupo === f.j.item.id).length === 2, 'rama en papelera');
    igual((await req('POST', '/api/notes-trash/restore', { id: f.j.item.id })).j.restaurados, 2);
    cierto((await req('GET', '/api/notes/' + n.j.item.id)).j.body === 'palabraunica', 'cuerpo restaurado');
    igual((await req('POST', '/api/notes-bulk-delete', { ids: [f.j.item.id] })).j.borrados, 2);
    igual((await req('DELETE', '/api/notes-trash')).s, 200);
    igual((await req('GET', '/api/notes-trash')).j.items.length, 0, 'papelera vacía');
  });
  await prueba('contactos: crear y listar', async () => {
    igual((await req('POST', '/api/contacts', { first: 'Ana', last: 'Prueba', emails: [{ value: 'a@b.es' }] })).s, 200);
    cierto(JSON.stringify((await req('GET', '/api/contacts')).j).includes('Prueba'), 'no aparece');
    cierto((await req('GET', '/api/contacts/export')).t.includes('BEGIN:VCARD'), 'vcf');
  });
  await prueba('calendario: crear evento', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    igual((await req('POST', '/api/calendar/events', { title: 'Cita', start: hoy + 'T10:00', end: hoy + 'T11:00' })).s, 200);
  });
  await prueba('compra: producto y entrada', async () => {
    const p = await req('POST', '/api/shopping/products', { name: 'Pan', unit: 'ud', quantity: 1 }); igual(p.s, 200);
    igual((await req('POST', '/api/shopping/entries', { productId: (p.j.product || p.j).id, quantity: 1 })).s, 200);
  });
  await prueba('juegos: crear', async () => { igual((await req('POST', '/api/games', { title: 'Tetris', status: 'jugado' })).s, 200); });
  await prueba('bases: crear y añadir fila', async () => {
    const b = await req('POST', '/api/bases', { nombre: 'Libros', plantilla: 'lectura' }); igual(b.s, 200);
    igual((await req('POST', `/api/bases/${b.j.id}/rows`, { c: {} })).s, 200);
    cierto((await req('GET', `/api/bases/${b.j.id}/export?format=csv`)).s === 200, 'csv');
  });
  let proyecto, prompt;
  await prueba('código: crear proyecto y leer archivo', async () => {
    const c = await req('POST', '/api/codigo', { nombre: 'Web', plantilla: 'web' }); igual(c.s, 200); proyecto = c.j.id;
    igual((await req('GET', `/api/codigo/${proyecto}/texto?ruta=index.html`)).j.binario, false);
  });
  await prueba('prompts: crear prompt de código', async () => {
    const r = await req('POST', '/api/prompts', { title: 'Haz una web', body: 'texto', kind: 'codigo' }); cierto(r.s < 300, 'crear ' + r.s + ' ' + r.t.slice(0, 80));
    prompt = (r.j.item || r.j.prompt || r.j).id; cierto(prompt, 'sin id');
  });
  await prueba('vínculos prompt ↔ código en los dos sentidos', async () => {
    igual((await req('POST', '/api/vinculos/codigo', { promptId: prompt, proyectoId: proyecto })).s, 200);
    igual((await req('GET', '/api/vinculos/codigo/prompt/' + prompt)).j.proyectos.length, 1);
    igual((await req('GET', '/api/vinculos/codigo/proyecto/' + proyecto)).j.prompts.length, 1);
    igual((await req('POST', '/api/vinculos/codigo/quitar', { promptId: prompt, proyectoId: proyecto })).s, 200);
    igual((await req('GET', '/api/vinculos/codigo/prompt/' + prompt)).j.proyectos.length, 0);
  });
  await prueba('prompts: exportar a Markdown', async () => {
    const r = await req('POST', '/api/prompts/export', { format: 'md' }); igual(r.s, 200); cierto(r.t.includes('Haz una web'), 'sin el prompt');
  });
  await prueba('logros', async () => { cierto((await req('GET', '/api/game')).s < 500, 'game'); });
  await prueba('exportar JSON de una sección y de todo', async () => {
    cierto((await req('GET', '/api/export/contactos')).s < 500, 'sección');
    cierto((await req('GET', '/api/admin/export-all')).s === 200, 'todo');
  });
  await prueba('favoritos y álbumes (con ZIP)', async () => {
    for (const n of ['a.txt', 'b.txt']) {
      const fd = new FormData(); fd.append('files', new Blob(['hola ' + n]), n);
      const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd });
      igual(up.status, 200, 'subida ' + n);
    }
    igual((await req('POST', '/api/favorites', { path: 'a.txt' })).s, 200);
    igual((await req('GET', '/api/favorites')).j.items.join(), 'a.txt');
    await req('POST', '/api/favorites', { path: 'no-existe.txt' });
    igual((await req('GET', '/api/favorites')).j.items.join(), 'a.txt', 'los favoritos inexistentes se depuran al leer');
    igual((await req('DELETE', '/api/favorites?path=a.txt')).s, 200);
    igual((await req('GET', '/api/favorites')).j.items.length, 0);
    const c = await req('POST', '/api/albums', { title: 'Mi álbum', paths: ['a.txt'] }); igual(c.s, 200);
    const id = c.j.album.id;
    igual((await req('POST', `/api/albums/${id}/items`, { paths: ['b.txt', 'a.txt'] })).j.count, 2);
    igual((await req('GET', `/api/albums/${id}`)).j.items.length, 2);
    igual((await req('PUT', `/api/albums/${id}`, { title: 'Renombrado' })).s, 200);
    const z = await fetch(BASE + `/api/albums/${id}/zip`, { headers: { Cookie: cookie } });
    igual(z.status, 200); cierto((await z.arrayBuffer()).byteLength > 100, 'zip vacío');
    const enl = await req('POST', '/api/sharelinks', { album: id, days: 1 }); igual(enl.s, 200, 'enlace del álbum');
    const lista = await fetch(BASE + `/api/public/share/${enl.j.link.id}/list`);
    igual(lista.status, 200, 'galería pública del álbum');
    igual((await lista.json()).items.length, 2, 'fotos del álbum público');
    igual((await req('DELETE', `/api/albums/${id}/items?path=a.txt`)).s, 200);
    igual((await req('GET', '/api/albums')).j.items[0].count, 1);
    igual((await req('DELETE', `/api/albums/${id}`)).s, 200);
    igual((await req('GET', '/api/albums')).j.items.length, 0);
  });
  await prueba('papelera de archivos: borrar, restaurar, vaciar y ajuste', async () => {
    for (const n of ['p1.txt', 'p2.txt']) {
      const fd = new FormData(); fd.append('files', new Blob(['x ' + n]), n);
      igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd })).status, 200);
    }
    igual((await req('DELETE', '/api/files?path=p1.txt')).s, 200);
    igual((await req('DELETE', '/api/files?path=p2.txt')).s, 200);
    let t = (await req('GET', '/api/trash')).j; cierto(t.items.some(i => i.name === 'p1.txt'), 'p1 en la papelera');
    const id = t.items.find(i => i.name === 'p1.txt').id;
    igual((await req('POST', '/api/trash/restore', { id })).s, 200);
    cierto((await req('GET', '/api/files?path=')).t.includes('p1.txt'), 'p1 restaurado');
    const id2 = (await req('GET', '/api/trash')).j.items.find(i => i.name === 'p2.txt').id;
    igual((await req('DELETE', '/api/trash/' + id2)).s, 200);
    const aj = await req('GET', '/api/trash/settings'); igual(aj.s, 200);
    igual((await req('PUT', '/api/trash/settings', { days: 7 })).j.days, 7);
    igual((await req('GET', '/api/trash')).j.ttlDays, 7);
    igual((await req('PUT', '/api/trash/settings', { days: 5 })).s, 400);
    await req('DELETE', '/api/files?path=p1.txt');
    cierto((await req('DELETE', '/api/trash')).j.removed >= 1, 'vaciar');
    igual((await req('GET', '/api/trash')).j.items.length, 0);
  });
  await prueba('fotos: exif, metadatos, mapa e índice', async () => {
    const sharp = require('sharp');
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } }).jpeg().toBuffer();
    const fd = new FormData(); fd.append('files', new Blob([jpg], { type: 'image/jpeg' }), 'foto1.jpg');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd })).status, 200);
    const ex = await req('GET', '/api/exif?path=foto1.jpg'); igual(ex.s, 200); igual(ex.j.nombre, 'foto1.jpg');
    igual((await req('GET', '/api/exif?path=a.txt')).s, 415, 'EXIF de un texto');
    cierto('foto1.jpg' in (await req('GET', '/api/photometa?path=')).j.fotos, 'photometa');
    const m = await req('GET', '/api/photomap'); igual(m.s, 200); cierto(m.j.total >= 1, 'photomap total');
    const ix = await req('GET', '/api/photoindex'); igual(ix.s, 200); cierto(ix.j.fotos.some(f => f.name === 'foto1.jpg'), 'photoindex');
  });
  await prueba('visor de hojas de cálculo y de Office', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Datos');
    ws.addRow(['Nombre', 'Cantidad']); ws.addRow(['Café', 42]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const fd = new FormData(); fd.append('files', new Blob([buf]), 'hoja.xlsx');
    igual((await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd })).status, 200);
    const h = await req('GET', '/api/sheet?path=hoja.xlsx'); igual(h.s, 200);
    igual(h.j.hojas[0].nombre, 'Datos'); igual(h.j.hojas[0].filas[1][1].t, '42'); igual(h.j.hojas[0].filas[1][1].n, true);
    igual((await req('GET', '/api/sheet?path=a.txt')).s, 415, 'no es hoja');
    igual((await req('GET', '/api/office?path=a.txt')).s, 415, 'no es Office');
    const fd2 = new FormData(); fd2.append('files', new Blob(['no es un docx']), 'roto.docx');
    await fetch(BASE + '/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd2 });
    cierto([200, 500, 501].includes((await req('GET', '/api/office?path=roto.docx')).s), 'office responde');
  });
  const subeArchivo = async (nombre, contenido, carpeta = '') => {
    const fd = new FormData(); fd.append('files', new Blob([contenido]), nombre);
    return fetch(BASE + '/api/upload?path=' + encodeURIComponent(carpeta), { method: 'POST', headers: { Cookie: cookie }, body: fd });
  };
  const publico = async (m, u, body) => { const r = await fetch(BASE + u, { method: m, body }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* no JSON */ } return { s: r.status, j, t }; };
  await prueba('enlace público de un archivo (con contraseña)', async () => {
    const c = await req('POST', '/api/sharelinks', { path: 'a.txt', days: 1, password: 'pw-1234' }); igual(c.s, 200);
    const id = c.j.link.id; cierto(!('passwordHash' in c.j.link) || c.j.link.passwordHash === undefined, 'no filtra el hash');
    const info = await publico('GET', '/api/public/share/' + id); igual(info.s, 200); igual(info.j.protegido, true);
    cierto(!('path' in info.j) && !('owner' in info.j), 'la ficha pública no revela ruta ni dueño');
    igual((await publico('GET', `/api/public/share/${id}/download`)).s, 401, 'sin contraseña');
    igual((await publico('GET', `/api/public/share/${id}/download?pw=mala`)).s, 401, 'contraseña mala');
    const d = await publico('GET', `/api/public/share/${id}/download?pw=pw-1234`); igual(d.s, 200); igual(d.t, 'hola a.txt');
    igual((await publico('GET', '/s/' + id)).s, 200, 'página pública');
    igual((await publico('GET', '/api/public/share/no-existe')).s, 404);
    const lista = (await req('GET', '/api/uploadlinks?kind=share')).j; cierto(JSON.stringify(lista).includes(id), 'sale en la lista del dueño');
  });
  await prueba('enlace público de una carpeta: galería sin salirse de ella', async () => {
    await req('POST', '/api/mkdir', { path: '', name: 'Pub' });
    igual((await subeArchivo('dentro.txt', 'dentro', 'Pub')).status, 200);
    igual((await subeArchivo('fuera.txt', 'fuera', '')).status, 200);
    const id = (await req('POST', '/api/sharelinks', { path: 'Pub', days: 1 })).j.link.id;
    const l = await publico('GET', `/api/public/share/${id}/list`); igual(l.s, 200);
    cierto(l.j.items.some(i => i.name === 'dentro.txt') && !l.j.items.some(i => i.name === 'fuera.txt'), 'solo lo de la carpeta');
    cierto((await publico('GET', `/api/public/share/${id}/list?sub=${encodeURIComponent('..')}`)).s >= 400, 'no sube por encima');
    cierto((await publico('GET', `/api/public/share/${id}/file?sub=${encodeURIComponent('../fuera.txt')}`)).s >= 400, 'no descarga fuera');
    const f = await publico('GET', `/api/public/share/${id}/file?sub=dentro.txt`); igual(f.s, 200); igual(f.t, 'dentro');
    igual((await publico('GET', `/api/public/share/${id}/view?sub=dentro.txt`)).s, 415, 'un texto no se previsualiza');
    const z = await fetch(BASE + `/api/public/share/${id}/download`); igual(z.status, 200); igual(z.headers.get('content-type'), 'application/zip');
    const jpg = await require('sharp')({ create: { width: 40, height: 30, channels: 3, background: '#39c' } }).jpeg().toBuffer();
    igual((await subeArchivo('pic.jpg', jpg, 'Pub')).status, 200);
    const l2 = await publico('GET', `/api/public/share/${id}/list`);
    cierto(l2.j.items.find(i => i.name === 'pic.jpg').viewable === true, 'la foto es visible en la galería');
    const th = await fetch(BASE + `/api/public/share/${id}/thumb?sub=pic.jpg`); igual(th.status, 200); igual(th.headers.get('content-type'), 'image/webp');
    const vw = await fetch(BASE + `/api/public/share/${id}/view?sub=pic.jpg`); igual(vw.status, 200); igual(vw.headers.get('content-type'), 'image/jpeg');
  });
  await prueba('enlace de subida: crear, usar sin sesión y borrar', async () => {
    const c = await req('POST', '/api/uploadlinks', { path: 'Pub', label: 'Entrega', days: 1 }); igual(c.s, 200);
    const id = c.j.link.id;
    const info = await publico('GET', '/api/public/link/' + id); igual(info.s, 200); igual(info.j.label, 'Entrega');
    cierto(!('path' in info.j) && !('owner' in info.j), 'no revela ruta ni dueño');
    const fd = new FormData(); fd.append('files', new Blob(['subido por un invitado']), 'invitado.txt');
    const up = await fetch(BASE + `/api/public/link/${id}/upload`, { method: 'POST', body: fd }); igual(up.status, 200);
    cierto((await req('GET', '/api/files?path=Pub')).t.includes('invitado.txt'), 'el archivo llegó a la carpeta');
    igual((await publico('GET', '/api/public/link/' + id)).j.files, 1);
    igual((await req('POST', '/api/uploadlinks', { path: 'no-existe', label: 'x' })).s >= 400, true, 'carpeta inexistente');
    igual((await publico('GET', '/u/' + id)).s, 200, 'página pública');
    igual((await req('DELETE', '/api/uploadlinks/' + id)).s, 200);
    igual((await publico('GET', '/api/public/link/' + id)).s, 404, 'borrado');
    igual((await req('DELETE', '/api/uploadlinks/' + id)).s, 404);
  });
  await prueba('prompts compartidos por enlace público', async () => {
    igual((await req('POST', '/api/prompts-share', { ids: [] })).s, 400);
    const c = await req('POST', '/api/prompts-share', { ids: [prompt], days: 1 }); igual(c.s, 200);
    const p = await publico('GET', '/api/public/prompts/' + c.j.link.id); igual(p.s, 200);
    igual(p.j.prompts.length, 1); cierto(!('id' in p.j.prompts[0]), 'no revela ids internos');
    igual((await publico('GET', '/p/' + c.j.link.id)).s, 200, 'página pública');
    igual((await publico('GET', '/api/public/prompts/no-existe')).s, 404);
  });
  await prueba('leer un .txt con TEXT_MAX="512KB # comentario" (antes daba NaN)', async () => {
    const t = await req('GET', '/api/text?path=a.txt'); igual(t.s, 200); igual(t.j.text, 'hola a.txt');
    igual((await req('GET', '/api/capabilities')).j.textMax, 512 * 1024);
  });
  await prueba('valores: la normalización une variantes y no mezcla lo distinto', async () => {
    const V = require(path.join(ROOT, 'public/js/valores-clave.js'));
    for (const [a, b] of [['Claude Sonnet 5,5', 'claude  sonnet 5.5'], ['CLAUDE-SONNET 5.5', 'Claude Sonnet 5.5'], ['Atención', 'atencion'], ['Node.js', 'NodeJS'], ['GPT 4o', 'gpt-4o']]) igual(V.clave(a), V.clave(b), `${a} = ${b}`);
    for (const [a, b] of [['Claude Sonnet 4.5', 'Claude Sonnet 5.5'], ['C++', 'C'], ['C#', 'C'], ['PS4', 'PS5'], ['5 5', '55'], ['Opus', 'Opus 4']]) cierto(V.clave(a) !== V.clave(b), `${a} ≠ ${b}`);
    cierto(V.sonParecidos(V.clave('claude sonet 5,5'), V.clave('Claude Sonnet 5.5')), 'errata de una letra');
    for (const [a, b] of [['Claude Sonnet 4.5', 'Claude Sonnet 5.5'], ['PS4', 'PS5'], ['Midjourney v6', 'Midjourney v7']]) cierto(!V.sonParecidos(V.clave(a), V.clave(b)), `no sugerir ${a} → ${b}`);
    igual(V.limpia('  Claude   Sonnet 5,5 '), 'Claude Sonnet 5.5');
  });
  await prueba('valores: los prompts guardan una sola grafía y se pueden unir', async () => {
    const mk = async (model, extra = {}) => { const r = await req('POST', '/api/prompts', { title: 'v ' + model, body: 'x', kind: 'texto', model, ...extra }); cierto(r.s < 300, 'crear ' + r.s); return r.j; };
    const a = await mk('Claude Sonnet 5.5');
    const b = await mk('claude  sonnet 5,5');
    const c = await mk('CLAUDE-SONNET 5.5', { tool: 'Cursor', language: 'es' });
    for (const x of [a, b, c]) igual((x.prompt || x).model, 'Claude Sonnet 5.5', 'grafía única');
    const f = await req('GET', '/api/valores/prompts.model'); igual(f.s, 200);
    igual(f.j.valores.filter(v => v.v.toLowerCase().includes('sonnet')).length, 1, 'un solo valor');
    igual((await req('GET', '/api/valores/prompts.language')).j.valores.some(v => v.v === 'es'), true);
    // filtrar por una variante encuentra todos
    const l = await req('GET', '/api/prompts?model=' + encodeURIComponent('claude sonnet 5,5'));
    igual(l.s, 200); cierto(JSON.stringify(l.j).split('Claude Sonnet 5.5').length >= 4, 'filtro por clave');
    // un valor en uso no se borra; uno nuevo sí
    igual((await req('DELETE', '/api/valores/prompts.model?v=' + encodeURIComponent('Claude Sonnet 5.5'))).s, 409);
    igual((await req('POST', '/api/valores/prompts.model', { valor: 'Modelo temporal' })).s, 200);
    igual((await req('DELETE', '/api/valores/prompts.model?v=' + encodeURIComponent('Modelo temporal'))).s, 200);
    // unir y renombrar cambia los prompts que lo usan
    const u = await req('POST', '/api/valores/prompts.model/fusionar', { de: ['Claude Sonnet 5.5'], a: 'Claude Sonnet 5.6' });
    igual(u.s, 200); cierto(u.j.cambiados >= 3, 'cambiados ' + u.j.cambiados);
    igual((await req('GET', '/api/valores/nope.campo')).s, 404);
  });
  await prueba('valores: los juegos unifican plataformas, géneros, estudio y etiquetas', async () => {
    const a = await req('POST', '/api/games', { title: 'Juego A', status: 'jugado', platforms: ['PlayStation 5'], genres: ['Acción'], developer: 'FromSoftware', tags: ['Souls'], store: 'Steam' });
    cierto(a.s < 300, 'crear A ' + a.s);
    const b = await req('POST', '/api/games', { title: 'Juego B', status: 'jugado', platforms: ['playstation  5', 'PC'], genres: ['accion'], developer: 'fromsoftware', tags: ['souls', 'SOULS'], store: 'steam' });
    cierto(b.s < 300, 'crear B ' + b.s);
    igual(b.j.platforms[0], 'PlayStation 5'); igual(b.j.genres[0], 'Acción'); igual(b.j.developer, 'FromSoftware'); igual(b.j.store, 'Steam');
    igual(b.j.tags.length, 1); igual(b.j.tags[0], 'Souls');
    const f = await req('GET', '/api/valores/games.developer'); igual(f.s, 200);
    igual(f.j.valores.filter(v => v.v.toLowerCase() === 'fromsoftware').length, 1);
    igual(f.j.valores.find(v => v.v === 'FromSoftware').n, 2, 'uso');
    const u = await req('POST', '/api/valores/games.platforms/fusionar', { de: ['PC'], a: 'PC (Windows)' });
    igual(u.s, 200); igual(u.j.cambiados, 1);
  });
  await prueba('valores: los contactos unifican empresa, cargo y país de las direcciones', async () => {
    const a = await req('POST', '/api/contacts', { first: 'Ana', company: 'Sapientum Studio', title: 'Diseñadora', addresses: [{ label: 'Casa', city: 'León', country: 'España' }] });
    cierto(a.s < 300, 'crear ' + a.s);
    const b = await req('POST', '/api/contacts', { first: 'Luis', company: 'sapientum  studio', title: 'diseñadora', addresses: [{ label: 'Casa', city: 'leon', country: 'espana' }] });
    cierto(b.s < 300, 'crear ' + b.s);
    igual(b.j.contact.company, 'Sapientum Studio'); igual(b.j.contact.title, 'Diseñadora');
    igual(b.j.contact.addresses[0].city, 'León'); igual(b.j.contact.addresses[0].country, 'España');
    const f = await req('GET', '/api/valores/contacts.company'); igual(f.s, 200);
    igual(f.j.valores.find(v => v.v === 'Sapientum Studio').n, 2);
    const r = await req('POST', '/api/valores/contacts.country/fusionar', { de: ['España'], a: 'Spain' });
    igual(r.s, 200); igual(r.j.cambiados, 2);
  });
  await prueba('valores: las etiquetas de código se unifican', async () => {
    const a = await req('POST', '/api/codigo', { nombre: 'Proyecto etq A', etiquetas: ['Diseño-Web', 'react'] });
    cierto(a.s < 300, 'crear ' + a.s);
    const b = await req('POST', '/api/codigo', { nombre: 'Proyecto etq B', etiquetas: ['diseno web', 'React'] });
    cierto(b.s < 300, 'crear ' + b.s);
    igual(b.j.etiquetas[0], a.j.etiquetas[0], 'misma etiqueta'); igual(b.j.etiquetas.length, 2);
    const f = await req('GET', '/api/valores/codigo.etiquetas'); igual(f.s, 200);
    igual(f.j.valores.length, 2);
  });
  await prueba('usuarios (admin)', async () => { igual((await req('GET', '/api/users')).s, 200); });

  // --- Cuentas: usuarios, contraseñas, sesiones, tokens de app y 2FA ---
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const totp = (secreto, paso = 0) => {
    let bits = ''; for (const ch of secreto.replace(/=+$/, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
    const clave = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
    const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + paso));
    const h = require('crypto').createHmac('sha1', clave).update(c).digest(); const o = h[19] & 15;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
  };
  // Cliente independiente (su propia cookie), para no pisar la sesión del administrador
  const cliente = () => {
    const jar = {};
    const f = async (m, u, cuerpo) => {
      const h = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
      if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(BASE + u, { method: m, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), redirect: 'manual' });
      for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v) jar[kv.slice(0, i)] = v; else delete jar[kv.slice(0, i)]; }
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* no JSON */ }
      return { s: r.status, j, t };
    };
    f.jar = jar; return f;
  };
  await prueba('cuentas: crear, validar, cambiar contraseña y borrar usuarios', async () => {
    igual((await req('POST', '/api/users', { username: 'ana', password: 'clave-segura-1', role: 'user' })).s, 200);
    igual((await req('POST', '/api/users', { username: 'ana', password: 'clave-segura-1' })).s, 400, 'duplicado');
    igual((await req('POST', '/api/users', { username: 'x y', password: 'clave-segura-1' })).s, 400, 'nombre inválido');
    igual((await req('POST', '/api/users', { username: 'corta', password: '1' })).s, 400, 'contraseña corta');
    cierto((await req('GET', '/api/users')).j.some(u => u.username === 'ana'), 'ana en la lista');
    const ana = cliente();
    igual((await ana('POST', '/api/login', { username: 'ana', password: 'clave-segura-1' })).s, 200);
    igual((await ana('GET', '/api/me')).j.role, 'user');
    igual((await ana('GET', '/api/users')).s, 403, 'un usuario normal no lista usuarios');
    igual((await ana('POST', '/api/users/admin/password', { password: 'intento-malo-1' })).s, 403, 'no cambia la de otro');
    igual((await ana('POST', '/api/users/ana/password', { password: 'otra-clave-123' })).s, 200);
    igual((await cliente()('POST', '/api/login', { username: 'ana', password: 'clave-segura-1' })).s, 401, 'la antigua ya no vale');
    igual((await cliente()('POST', '/api/login', { username: 'ana', password: 'otra-clave-123' })).s, 200);
    igual((await req('DELETE', '/api/users/admin')).s, 400, 'admin no se borra');
    igual((await req('DELETE', '/api/users/ana')).s, 200);
    igual((await cliente()('POST', '/api/login', { username: 'ana', password: 'otra-clave-123' })).s, 401, 'borrada');
  });
  await prueba('cuentas: sesiones abiertas y cierre remoto', async () => {
    const otra = cliente(); igual((await otra('POST', '/api/login', { username: 'admin', password: 'smoke-test-1' })).s, 200);
    const l = (await req('GET', '/api/sessions')).j; cierto(l.length >= 2, 'dos sesiones'); cierto(l.some(x => x.current), 'marca la actual');
    igual((await otra('GET', '/api/me')).s, 200);
    const n = (await req('DELETE', '/api/sessions')).j.removed; cierto(n >= 1, 'cierra las demás');
    igual((await otra('GET', '/api/me')).s, 401, 'la otra sesión ya no vale');
    igual((await req('GET', '/api/me')).s, 200, 'la actual sigue');
    igual((await req('DELETE', '/api/sessions/no-existe')).s, 404);
  });
  await prueba('cuentas: tokens de aplicación', async () => {
    const c = await req('POST', '/api/apptokens', { name: 'script' }); igual(c.s, 200); cierto(c.j.token && c.j.id, 'token');
    const l = (await req('GET', '/api/apptokens')).j; igual(l.length, 1); cierto(!('hash' in l[0]), 'el listado no incluye el hash');
    cierto(!JSON.stringify(l).includes(c.j.token), 'el listado no revela el token');
    igual((await req('DELETE', '/api/apptokens/' + c.j.id)).s, 200);
    igual((await req('DELETE', '/api/apptokens/' + c.j.id)).s, 404);
  });
  await prueba('cuentas: verificación en dos pasos (activar, entrar con código, desactivar)', async () => {
    igual((await req('POST', '/api/users', { username: 'bea', password: 'clave-segura-2' })).s, 200);
    const bea = cliente(); igual((await bea('POST', '/api/login', { username: 'bea', password: 'clave-segura-2' })).s, 200);
    igual((await bea('GET', '/api/2fa/status')).j.enabled, false);
    const su = await bea('POST', '/api/2fa/setup'); cierto(su.j.secret && su.j.uri.startsWith('otpauth://'), 'setup');
    igual((await bea('POST', '/api/2fa/confirm', { code: '000000' })).s, 400, 'código malo');
    igual((await bea('POST', '/api/2fa/confirm', { code: totp(su.j.secret) })).s, 200);
    igual((await bea('GET', '/api/2fa/status')).j.enabled, true);
    await bea('POST', '/api/logout');
    const b2 = cliente(); const l1 = await b2('POST', '/api/login', { username: 'bea', password: 'clave-segura-2' });
    igual(l1.s, 200); igual(l1.j.need2fa, true); igual(b2.jar.token, undefined, 'aún sin sesión');
    igual((await b2('GET', '/api/me')).s, 401);
    igual((await b2('POST', '/api/login/2fa', { code: '000000' })).s, 401);
    igual((await b2('POST', '/api/login/2fa', { code: totp(su.j.secret) })).s, 200);
    igual((await b2('GET', '/api/me')).j.username, 'bea');
    igual((await b2('POST', '/api/2fa/disable', { password: 'mala' })).s, 401);
    igual((await b2('POST', '/api/2fa/disable', { password: 'clave-segura-2' })).s, 200);
    igual((await b2('GET', '/api/2fa/status')).j.enabled, false);
    igual((await req('DELETE', '/api/users/bea')).s, 200);
  });
  await prueba('cierre de sesión', async () => { cierto((await req('POST', '/api/logout')).s < 400, 'logout'); });

  srv.kill();
  await dormir(300);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${total - fallos}/${total} pruebas correctas`);
  if (fallos) { console.log('--- registro del servidor ---\n' + log.split('\n').slice(-15).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
