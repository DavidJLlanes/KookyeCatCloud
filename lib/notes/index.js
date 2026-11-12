'use strict';
// Bloc de notas: índice con la estructura (lista plana con punteros al padre, que admite cualquier
// anidamiento) y el cuerpo de cada nota en su propio .md, para que una nota larga no engorde el índice
// y siga siendo texto recuperable a mano. Papelera con restauración por ramas.
// Fábrica como el resto de módulos: createNotes({...}) → { router, core }. El router se monta en /api
// y sus rutas son /notes, /notes-bulk-delete y /notes-trash. Las extensiones (enlaces, exportar,
// plantillas) viven en lib/notes-extra.js, que usa el `core` de aquí.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { cuentaBloques } = require('./bloques');

const NOTES_DIR = '.notes';
const NOTES_LIMIT = Number(process.env.NOTES_LIMIT || 5000);
const NOTE_MAX_CHARS = Number(process.env.NOTE_MAX_CHARS || 500000);

// calendar() y extraeLinks se piden al usarlos: el calendario y las extensiones de notas se crean después
function createNotes({ express, auth, userRoot, sendError, papeleraDias, calendar, extraeLinks }) {
  const router = express.Router();

  function notesRoot(user) {
    const dir = path.join(userRoot(user), NOTES_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const indexFile = (user) => path.join(notesRoot(user), 'index.json');
  const fallo = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

  // Lee el índice. Un índice ilegible NO se toma por «no hay notas»: el siguiente guardado lo habría sobrescrito y todas
  // las notas habrían quedado huérfanas (el texto sigue en disco, pero invisible). Se prueba la copia anterior (.bak) y,
  // si tampoco sirve, se avisa con un error. `tolerante` (solo la recuperación de notas) devuelve un índice vacío.
  async function readNotes(user, { tolerante = false } = {}) {
    const file = indexFile(user);
    let hayIndice = false;
    for (const f of [file, file + '.bak']) {
      let txt;
      try { txt = await fsp.readFile(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      hayIndice = true;
      let d = null;
      try { d = JSON.parse(txt); } catch { /* ilegible: se prueba la siguiente */ }
      if (d && Array.isArray(d.items)) {
        if (f !== file) {                                   // el principal estaba dañado: se aparta y se repone desde la copia
          console.warn(`[notas] índice dañado de ${user.username}: repuesto desde la copia anterior`);
          await fsp.rename(file, `${file}.dañado-${Date.now()}`).catch(() => {});
          await fsp.copyFile(f, file).catch(() => {});
        }
        return d;
      }
    }
    if (hayIndice && !tolerante) throw fallo(500, 'El índice de notas está dañado. En la papelera de notas, pulsa «Buscar notas perdidas» para recuperarlas.');
    return { items: [] };
  }
  // Escritura atómica con nombre temporal propio (varias a la vez ya no se pisan el mismo .tmp) y copia del índice anterior
  async function writeNotes(user, data) {
    const file = indexFile(user);
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
      await fsp.copyFile(file, `${file}.bak`).catch(() => {});
      await fsp.rename(tmp, file);
    } catch (e) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
  }

  // Las modificaciones del índice (leer → cambiar → guardar) se hacen de una en una por usuario: dos guardados a la vez
  // leían el mismo índice y el segundo deshacía lo del primero
  const colas = new Map();
  function enCola(user, fn) {
    const k = user.username;
    const actual = (colas.get(k) || Promise.resolve()).catch(() => {}).then(fn);
    colas.set(k, actual);
    actual.finally(() => { if (colas.get(k) === actual) colas.delete(k); }).catch(() => {});
    return actual;
  }
  const serializa = (fn) => (req, res, next) => enCola(req.user, () => fn(req, res, next));

  // Texto de cada nota: escritura atómica y, si un guardado dejaría la nota vacía o casi vacía, se aparta antes lo que
  // había (salvavidas, últimas 5 por nota). Es la red de seguridad contra un editor que envíe un cuerpo vacío por error.
  const salvavidasDir = (user) => path.join(notesRoot(user), 'salvavidas');
  async function escribeCuerpo(user, id, texto) {
    const f = notaFile(user, id);
    let previo = '';
    try { previo = await fsp.readFile(f, 'utf8'); } catch { /* nota nueva */ }
    if (previo.trim().length >= 40 && texto.trim().length < previo.length / 2) {
      try {
        const dir = salvavidasDir(user);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, `${id}-${Date.now()}.md`), previo);
        const suyas = (await fsp.readdir(dir)).filter(n => n.startsWith(id + '-')).sort();
        for (const n of suyas.slice(0, -5)) await fsp.rm(path.join(dir, n), { force: true });
      } catch { /* sin salvavidas, pero se guarda igual */ }
    }
    const tmp = `${f}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try { await fsp.writeFile(tmp, texto); await fsp.rename(tmp, f); }
    catch (e) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
  }
  const notaFile = (user, id) => path.join(notesRoot(user), `${id}.md`);
  function descendientes(items, id) {
    const hijos = items.filter(i => i.parent === id);
    return hijos.reduce((acc, h) => acc.concat(h, descendientes(items, h.id)), []);
  }
  function padreValido(items, parent) {
    if (!parent) return true;                       // raíz
    const p = items.find(i => i.id === parent);
    return !!p && p.type === 'folder';
  }

  // Campos de presentación que comparten notas y carpetas: color, icono, etiquetas, fijada…
  const HEX6 = /^#[0-9a-f]{6}$/i;
  function aplicaDecoracion(item, b) {
    if (b.color !== undefined) item.color = HEX6.test(String(b.color)) ? String(b.color).toLowerCase() : '';
    if (b.icon !== undefined) item.icon = String(b.icon).slice(0, 8);
    if (b.pinned !== undefined) item.pinned = !!b.pinned;
    if (b.labels !== undefined) {
      item.labels = [...new Set((Array.isArray(b.labels) ? b.labels : []).map(x => String(x).slice(0, 40)))].slice(0, 30);
    }
  }

  // Notas como origen de «Enviar a…» (lib/transferir.js): cada nota va como .md; las imágenes no se incluyen
  const nombreNotaArchivo = (t) => String(t || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'sin título';
  function notasElegidas(data, ids) {
    const sel = [], vistos = new Set();
    for (const id of ids) {
      const it = data.items.find(i => i.id === id);
      if (!it) continue;
      const grupo = it.type === 'folder' ? [it, ...descendientes(data.items, it.id)] : [it];
      for (const g of grupo) if (!vistos.has(g.id)) { vistos.add(g.id); sel.push(g); }
    }
    return sel;
  }
  const notasFuente = {
    async exporta(user, ids) {
      const data = await readNotes(user);
      const sel = notasElegidas(data, ids);
      const vistos = new Set(sel.map(i => i.id));
      const usadas = new Set(), out = [];
      for (const it of sel.filter(i => i.type === 'note')) {
        // Carpetas de la selección por las que pasa la nota (relativas a lo enviado)
        const dirs = [];
        for (let p = it.parent; p && vistos.has(p);) {
          const f = data.items.find(x => x.id === p); if (!f) break;
          dirs.unshift(nombreNotaArchivo(f.title)); p = f.parent;
        }
        const pre = dirs.length ? dirs.join('/') + '/' : '';
        const base = nombreNotaArchivo(it.title);
        let nombre = `${pre}${base}.md`, k = 2;
        while (usadas.has(nombre.toLowerCase())) nombre = `${pre}${base} (${k++}).md`;
        usadas.add(nombre.toLowerCase());
        let body = '';
        try { body = await fsp.readFile(notaFile(user, it.id), 'utf8'); } catch { /* nota sin cuerpo */ }
        const md = body
          .replace(/!\[([^\][\n]*)\]\(kcc:file\/[^)\s[\]]+\)/g, (_, alt) => `*[imagen no incluida${alt ? ': ' + alt : ''}]*`)
          .replace(/\[([^\][\n]*)\]\(kcc:[^)\s[\]]+\)/g, '$1');
        out.push({ ruta: nombre, buf: Buffer.from(`# ${it.title || 'Sin título'}\n\n${md}\n`, 'utf8') });
      }
      return out;
    },
    // Quita las notas (y las carpetas con su contenido); el cuerpo se aparta a «stg» hasta que caduque el deshacer
    async quita(user, ids, stg) { return enCola(user, async () => {
      const data = await readNotes(user);
      const snap = notasElegidas(data, ids);
      for (const it of snap) {
        if (it.type === 'note') { await fsp.mkdir(stg, { recursive: true }); await fsp.rename(notaFile(user, it.id), path.join(stg, it.id + '.md')).catch(() => {}); }
        if (it.cal) await calendar().quitaOrigen(user, 'note', it.id).catch(() => {});
      }
      const quitar = new Set(snap.map(i => i.id));
      data.items = data.items.filter(i => !quitar.has(i.id));
      await writeNotes(user, data);
      return snap;
    }); },
    async restaura(user, snap, stg) { return enCola(user, async () => {
      for (const it of snap) if (it.type === 'note') await fsp.rename(path.join(stg, it.id + '.md'), notaFile(user, it.id)).catch(e => { if (e.code !== 'ENOENT') throw e; });   // deshacer no puede fallar en silencio: lo apartado se borraría al caducar
      const data = await readNotes(user);
      const ya = new Set(data.items.map(i => i.id));
      data.items.push(...snap.filter(i => !ya.has(i.id)));
      await writeNotes(user, data);
    }); },
  };


  router.get('/notes', auth, async (req, res) => {
    try { res.json(await readNotes(req.user)); }
    catch (err) { sendError(res, err); }
  });

  router.get('/notes/:id', auth, async (req, res) => {
    try {
      const data = await readNotes(req.user);
      const item = data.items.find(i => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrada' });
      let body = '';
      if (item.type === 'note') {
        // Un fallo al leer NO se convierte en una nota vacía: el editor la mostraría en blanco y el siguiente
        // autoguardado habría machacado el texto verdadero
        try { body = await fsp.readFile(notaFile(req.user, item.id), 'utf8'); }
        catch (e) {
          if (e.code !== 'ENOENT') throw fallo(500, 'No se pudo leer el contenido de la nota. Inténtalo de nuevo.');
          if (item.chars > 0) throw fallo(404, 'El texto de esta nota no está en el servidor. En la papelera de notas, «Buscar notas perdidas» puede recuperarlo.');
        }
      }
      res.json({ ...item, body });
    } catch (err) { sendError(res, err); }
  });

  router.post('/notes', auth, serializa(async (req, res) => {
    try {
      const { type, title, parent } = req.body || {};
      if (type !== 'note' && type !== 'folder') return res.status(400).json({ error: 'Tipo no válido' });
      const data = await readNotes(req.user);
      if (!padreValido(data.items, parent || '')) return res.status(400).json({ error: 'Carpeta padre no válida' });
      if (data.items.length >= NOTES_LIMIT) return res.status(400).json({ error: `Máximo ${NOTES_LIMIT} elementos` });

      const item = {
        id: crypto.randomBytes(8).toString('hex'),
        type,
        title: String(title || '').slice(0, 120) || (type === 'folder' ? 'Nueva carpeta' : 'Nota sin título'),
        parent: parent || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      aplicaDecoracion(item, req.body);
      if (type === 'note') { item.links = extraeLinks(req.body.body); item.bl = cuentaBloques(req.body.body); item.bodyAt = item.createdAt; item.bodyBy = String(req.get('X-KCC-Client') || '').slice(0, 64); }
      if (req.body.calendar && req.body.calendar.date) item.cal = { date: req.body.calendar.date, time: req.body.calendar.time || '' };
      data.items.push(item);
      if (type === 'note') await escribeCuerpo(req.user, item.id, String(req.body.body || '').slice(0, NOTE_MAX_CHARS));
      if (item.cal) await calendar().sincronizaOrigen(req.user, 'note', item.id, item.title, req.body.calendar);
      await writeNotes(req.user, data);
      res.json({ ok: true, item });
    } catch (err) { sendError(res, err); }
  }));

  // Cuerpo grande solo aquí: el resto de la API sigue con el tope de 100 kB
  const notesBody = express.json({ limit: '2mb' });

  async function actualizarNota(req, res) {
    try {
      const { title, body, parent } = req.body || {};
      const data = await readNotes(req.user);
      const item = data.items.find(i => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrada' });

      if (parent !== undefined) {
        if (!padreValido(data.items, parent)) return res.status(400).json({ error: 'Carpeta padre no válida' });
        // Mover una carpeta dentro de sí misma o de un hijo suyo dejaría el árbol suelto
        if (parent === item.id || descendientes(data.items, item.id).some(d => d.id === parent)) {
          return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma' });
        }
        item.parent = parent;
      }
      if (title !== undefined) item.title = String(title).slice(0, 120);
      if (body !== undefined && item.type === 'note') {
        if (String(body).length > NOTE_MAX_CHARS) return res.status(400).json({ error: 'Nota demasiado larga' });
        // Conflicto entre dispositivos: el cliente manda el «bodyAt» del texto que abrió. Si desde entonces OTRO cliente
        // (otra pestaña u otro dispositivo) guardó un texto distinto, no se sobrescribe: el cliente guarda el suyo como copia.
        const cid = String(req.get('X-KCC-Client') || '').slice(0, 64);
        const base = Number((req.body || {}).base);
        if (Number.isFinite(base) && base > 0 && item.bodyAt > base && item.bodyBy && item.bodyBy !== cid) {
          const actual = await fsp.readFile(notaFile(req.user, item.id), 'utf8').catch(() => null);
          if (actual !== null && actual !== String(body)) return res.status(409).json({ error: 'Esta nota se cambió en otro dispositivo', conflicto: true, bodyAt: item.bodyAt });
        }
        await escribeCuerpo(req.user, item.id, String(body));
        item.bodyAt = Date.now(); item.bodyBy = cid;
        item.chars = String(body).length;
        item.links = extraeLinks(body); item.bl = cuentaBloques(body);
      }
      aplicaDecoracion(item, req.body || {});
      const cal = (req.body || {}).calendar;
      if (cal !== undefined) item.cal = cal && cal.date ? { date: cal.date, time: cal.time || '' } : undefined;
      item.updatedAt = Date.now();
      await writeNotes(req.user, data);
      if (cal !== undefined) await calendar().sincronizaOrigen(req.user, 'note', item.id, item.title, cal);
      else if (title !== undefined && item.cal) await calendar().renombraOrigen(req.user, 'note', item.id, item.title);
      if (title !== undefined) await calendar().renombraVinculos(req.user, 'note', item.id, item.title).catch(() => {});
      res.json({ ok: true, item });
    } catch (err) { sendError(res, err); }
  }

  router.put('/notes/:id', auth, notesBody, serializa(actualizarNota));
  // Alias en POST: sendBeacon (el guardado al cerrar la pestaña) solo sabe hacer POST
  router.post('/notes/:id', auth, notesBody, serializa(actualizarNota));

  // Los .md de las notas eliminadas se guardan aparte hasta que caduquen
  const notaTrashFile = (user, id) => path.join(notesRoot(user), 'trash', `${id}.md`);

  // Borra (a la papelera) varias notas o carpetas de golpe: { ids: [...] }
  router.post('/notes-bulk-delete', auth, express.json({ limit: '1mb' }), serializa(async (req, res) => {
    try {
      const ids = (req.body || {}).ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 5000) return res.status(400).json({ error: 'Selección no válida' });
      const data = await readNotes(req.user);
      const pedidas = new Set(ids.map(String));
      const raices = data.items.filter(i => pedidas.has(i.id));
      if (!raices.length) return res.status(404).json({ error: 'No encontradas' });
      await fsp.mkdir(path.join(notesRoot(req.user), 'trash'), { recursive: true });
      const cuando = Date.now();
      data.trash = data.trash || [];
      const quitados = new Set();
      for (const raiz of raices) {
        if (quitados.has(raiz.id)) continue;       // ya salió con una carpeta padre
        for (const f of [raiz, ...descendientes(data.items, raiz.id)]) {
          if (quitados.has(f.id)) continue;
          quitados.add(f.id);
          if (f.type === 'note') {
            try { await fsp.rename(notaFile(req.user, f.id), notaTrashFile(req.user, f.id)); } catch {}
          }
          data.trash.unshift({ ...f, deletedAt: cuando, grupo: raiz.id });
          if (f.cal) await calendar().quitaOrigen(req.user, 'note', f.id);
        }
      }
      data.items = data.items.filter(i => !quitados.has(i.id));
      await writeNotes(req.user, data);
      res.json({ ok: true, borrados: quitados.size });
    } catch (err) { sendError(res, err); }
  }));

  router.delete('/notes/:id', auth, serializa(async (req, res) => {
    try {
      const data = await readNotes(req.user);
      const item = data.items.find(i => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrada' });

      const fuera = [item, ...descendientes(data.items, item.id)];
      await fsp.mkdir(path.join(notesRoot(req.user), 'trash'), { recursive: true });
      const cuando = Date.now();
      data.trash = data.trash || [];
      for (const f of fuera) {
        if (f.type === 'note') {
          try { await fsp.rename(notaFile(req.user, f.id), notaTrashFile(req.user, f.id)); } catch {}
        }
        // Se guarda el grupo entero para poder restaurar la rama completa de una vez
        data.trash.unshift({ ...f, deletedAt: cuando, grupo: item.id });
        if (f.cal) await calendar().quitaOrigen(req.user, 'note', f.id);
      }
      const ids = new Set(fuera.map(f => f.id));
      data.items = data.items.filter(i => !ids.has(i.id));
      await writeNotes(req.user, data);
      res.json({ ok: true, borrados: fuera.length });
    } catch (err) { sendError(res, err); }
  }));

  function purgarNotasCaducadas(user) { return enCola(user, () => purgaCaducadas(user)); }
  async function purgaCaducadas(user) {
    const data = await readNotes(user);
    const dias = await papeleraDias(user);
    if (!dias) return data;
    const corte = Date.now() - dias * 86400000;
    const caducadas = (data.trash || []).filter(t => t.deletedAt < corte);
    if (!caducadas.length) return data;
    for (const t of caducadas) {
      if (t.type === 'note') { await fsp.rm(notaTrashFile(user, t.id), { force: true }); await calendar().quitaVinculos(user, 'note', t.id).catch(() => {}); }
    }
    // Solo salen las caducadas: una entrada sin fecha no se descarta del índice (su .md quedaría huérfano)
    const fuera = new Set(caducadas);
    data.trash = (data.trash || []).filter(t => !fuera.has(t));
    await writeNotes(user, data);
    return data;
  }

  router.get('/notes-trash', auth, async (req, res) => {
    try {
      const data = await purgarNotasCaducadas(req.user);
      res.json({ items: data.trash || [], ttlDays: await papeleraDias(req.user) });
    } catch (err) { sendError(res, err); }
  });

  router.post('/notes-trash/restore', auth, serializa(async (req, res) => {
    try {
      const { id } = req.body || {};
      const data = await readNotes(req.user);
      const entrada = (data.trash || []).find(t => t.id === id);
      if (!entrada) return res.status(404).json({ error: 'No está en la papelera' });

      // Se restaura el grupo entero: una carpeta sin sus hijos no sirve de nada
      const grupo = (data.trash || []).filter(t => t.grupo === entrada.grupo);
      const idsVivos = new Set(data.items.map(i => i.id));
      for (const t of grupo) {
        if (t.type === 'note') {
          try { await fsp.rename(notaTrashFile(req.user, t.id), notaFile(req.user, t.id)); } catch {}
        }
        const { deletedAt, grupo: g, ...limpio } = t;
        // Si su carpeta padre ya no existe, vuelve a la raíz en vez de quedar huérfana
        if (limpio.parent && !idsVivos.has(limpio.parent) && !grupo.some(x => x.id === limpio.parent)) {
          limpio.parent = '';
        }
        data.items.push(limpio);
        idsVivos.add(limpio.id);
        if (limpio.cal) await calendar().sincronizaOrigen(req.user, 'note', limpio.id, limpio.title, limpio.cal);
      }
      const ids = new Set(grupo.map(t => t.id));
      data.trash = (data.trash || []).filter(t => !ids.has(t.id));
      await writeNotes(req.user, data);
      res.json({ ok: true, restaurados: grupo.length });
    } catch (err) { sendError(res, err); }
  }));

  router.delete('/notes-trash/:id', auth, serializa(async (req, res) => {
    try {
      const data = await readNotes(req.user);
      const entrada = (data.trash || []).find(t => t.id === req.params.id);
      if (!entrada) return res.status(404).json({ error: 'No está en la papelera' });
      const grupo = (data.trash || []).filter(t => t.grupo === entrada.grupo);
      for (const t of grupo) {
        if (t.type === 'note') { await fsp.rm(notaTrashFile(req.user, t.id), { force: true }); await calendar().quitaVinculos(req.user, 'note', t.id).catch(() => {}); }
      }
      const ids = new Set(grupo.map(t => t.id));
      data.trash = (data.trash || []).filter(t => !ids.has(t.id));
      await writeNotes(req.user, data);
      res.json({ ok: true, borrados: grupo.length });
    } catch (err) { sendError(res, err); }
  }));

  router.delete('/notes-trash', auth, serializa(async (req, res) => {
    try {
      const data = await readNotes(req.user);
      for (const t of data.trash || []) {
        if (t.type === 'note') { await fsp.rm(notaTrashFile(req.user, t.id), { force: true }); await calendar().quitaVinculos(req.user, 'note', t.id).catch(() => {}); }
      }
      const n = (data.trash || []).length;
      data.trash = [];
      await writeNotes(req.user, data);
      res.json({ ok: true, removed: n });
    } catch (err) { sendError(res, err); }
  }));


  // Recuperar notas perdidas: textos (.md) que están en disco pero que el índice no conoce (índice dañado, sobrescrito o una
  // nota que se quedó a medias). Se dan de alta en la carpeta «Notas recuperadas». También recoge los de la carpeta trash/ que
  // la papelera ya no lista. No borra ni cambia nada de lo que ya está en el índice.
  const RE_ID = /^([0-9a-f]{16})\.md$/;
  const tituloDe = (txt) => {
    const l = String(txt).split('\n').map(x => x.trim()).find(Boolean) || '';
    return l.replace(/^#+\s*/, '').replace(/^>\s*(\[![A-Z]+\]\s*)?/, '').replace(/[*_`\[\]]/g, '').slice(0, 80).trim() || 'Nota recuperada';
  };
  router.post('/notes-recover', auth, serializa(async (req, res) => {
    try {
      const data = await readNotes(req.user, { tolerante: true });
      const conocidos = new Set([...data.items.map(i => i.id), ...(data.trash || []).map(t => t.id)]);
      const dir = notesRoot(req.user), dirTrash = path.join(dir, 'trash');
      const huerfanas = [];
      for (const [d, enTrash] of [[dir, false], [dirTrash, true]]) {
        let nombres = []; try { nombres = await fsp.readdir(d); } catch { continue; }
        for (const n of nombres) {
          const m = RE_ID.exec(n);
          if (!m) continue;
          const enIndice = conocidos.has(m[1]);
          if (!enTrash && enIndice) continue;                                 // nota normal que ya conoce el índice
          if (enTrash && (data.trash || []).some(t => t.id === m[1])) continue; // papelera que sí está en el índice
          if (enTrash && data.items.some(i => i.id === m[1])) continue;
          huerfanas.push({ id: m[1], file: path.join(d, n), enTrash });
        }
      }
      if (!huerfanas.length) return res.json({ ok: true, recuperadas: 0 });

      let carpeta = data.items.find(i => i.type === 'folder' && i.title === 'Notas recuperadas' && !i.parent);
      if (!carpeta) {
        carpeta = { id: crypto.randomBytes(8).toString('hex'), type: 'folder', title: 'Notas recuperadas', parent: '', createdAt: Date.now(), updatedAt: Date.now() };
        data.items.push(carpeta);
      }
      for (const h of huerfanas) {
        let texto = '', st = null;
        try { texto = await fsp.readFile(h.file, 'utf8'); st = await fsp.stat(h.file); } catch { continue; }
        if (h.enTrash) await fsp.rename(h.file, notaFile(req.user, h.id)).catch(() => {});
        data.items.push({
          id: h.id, type: 'note', title: tituloDe(texto), parent: carpeta.id,
          createdAt: st ? Math.round(st.birthtimeMs || st.mtimeMs) : Date.now(), updatedAt: st ? Math.round(st.mtimeMs) : Date.now(),
          chars: texto.length, links: extraeLinks(texto),
        });
      }
      await writeNotes(req.user, data);
      res.json({ ok: true, recuperadas: huerfanas.length });
    } catch (err) { sendError(res, err); }
  }));

  return {
    router,
    core: { readNotes, writeNotes, notaFile, descendientes, notasFuente, purgarNotasCaducadas, enCola },
  };
}

module.exports = createNotes;
module.exports.NOTES_DIR = NOTES_DIR;
