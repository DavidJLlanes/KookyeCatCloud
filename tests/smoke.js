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
  srv = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'smoke-test-1', INSECURE_COOKIES: '1', BASE_PATH: '', THUMBS_DIR: path.join(TMP, 'thumbs') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/version')).ok) break; } catch { /* aún no */ } await dormir(250); }

  console.log('Pruebas de humo en', BASE);
  await prueba('versión pública', async () => { igual((await req('GET', '/api/version')).s, 200); });
  await prueba('página principal y service worker', async () => {
    const a = await req('GET', '/'); igual(a.s, 200); cierto(a.t.includes('docexport.js'), 'index sin docexport.js');
    igual((await req('GET', '/sw.js')).s, 200); igual((await req('GET', '/js/docexport.js')).s, 200);
  });
  await prueba('todos los <script> del index existen y están en el service worker', async () => {
    const html = (await req('GET', '/')).t, sw = (await req('GET', '/sw.js')).t;
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].replace(/^\/?/, '/'));
    cierto(srcs.length > 30, 'pocos scripts: ' + srcs.length);
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
  await prueba('usuarios (admin)', async () => { igual((await req('GET', '/api/users')).s, 200); });
  await prueba('cierre de sesión', async () => { cierto((await req('POST', '/api/logout')).s < 400, 'logout'); });

  srv.kill();
  await dormir(300);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${total - fallos}/${total} pruebas correctas`);
  if (fallos) { console.log('--- registro del servidor ---\n' + log.split('\n').slice(-15).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
