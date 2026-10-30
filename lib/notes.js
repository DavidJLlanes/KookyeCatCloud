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
  async function readNotes(user) {
    try { return JSON.parse(await fsp.readFile(path.join(notesRoot(user), 'index.json'), 'utf8')); }
    catch { return { items: [] }; }
  }
  async function writeNotes(user, data) {
    const file = path.join(notesRoot(user), 'index.json');
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsp.rename(tmp, file);
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
          .replace(/!\[([^\]]*)\]\(kcc:file\/[^)\s]+\)/g, (_, alt) => `*[imagen no incluida${alt ? ': ' + alt : ''}]*`)
          .replace(/\[([^\]]*)\]\(kcc:[^)\s]+\)/g, '$1');
        out.push({ ruta: nombre, buf: Buffer.from(`# ${it.title || 'Sin título'}\n\n${md}\n`, 'utf8') });
      }
      return out;
    },
    // Quita las notas (y las carpetas con su contenido); el cuerpo se aparta a «stg» hasta que caduque el deshacer
    async quita(user, ids, stg) {
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
    },
    async restaura(user, snap, stg) {
      for (const it of snap) if (it.type === 'note') await fsp.rename(path.join(stg, it.id + '.md'), notaFile(user, it.id)).catch(() => {});
      const data = await readNotes(user);
      const ya = new Set(data.items.map(i => i.id));
      data.items.push(...snap.filter(i => !ya.has(i.id)));
      await writeNotes(user, data);
    },
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
        try { body = await fsp.readFile(notaFile(req.user, item.id), 'utf8'); } catch {}
      }
      res.json({ ...item, body });
    } catch (err) { sendError(res, err); }
  });

  router.post('/notes', auth, async (req, res) => {
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
      if (type === 'note') item.links = extraeLinks(req.body.body);
      if (req.body.calendar && req.body.calendar.date) item.cal = { date: req.body.calendar.date, time: req.body.calendar.time || '' };
      data.items.push(item);
      if (type === 'note') await fsp.writeFile(notaFile(req.user, item.id), String(req.body.body || '').slice(0, NOTE_MAX_CHARS));
      if (item.cal) await calendar().sincronizaOrigen(req.user, 'note', item.id, item.title, req.body.calendar);
      await writeNotes(req.user, data);
      res.json({ ok: true, item });
    } catch (err) { sendError(res, err); }
  });

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
        await fsp.writeFile(notaFile(req.user, item.id), String(body));
        item.chars = String(body).length;
        item.links = extraeLinks(body);
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

  router.put('/notes/:id', auth, notesBody, actualizarNota);
  // Alias en POST: sendBeacon (el guardado al cerrar la pestaña) solo sabe hacer POST
  router.post('/notes/:id', auth, notesBody, actualizarNota);

  // Los .md de las notas eliminadas se guardan aparte hasta que caduquen
  const notaTrashFile = (user, id) => path.join(notesRoot(user), 'trash', `${id}.md`);

  // Borra (a la papelera) varias notas o carpetas de golpe: { ids: [...] }
  router.post('/notes-bulk-delete', auth, express.json({ limit: '1mb' }), async (req, res) => {
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
  });

  router.delete('/notes/:id', auth, async (req, res) => {
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
  });

  async function purgarNotasCaducadas(user) {
    const data = await readNotes(user);
    const dias = await papeleraDias(user);
    if (!dias) return data;
    const corte = Date.now() - dias * 86400000;
    const caducadas = (data.trash || []).filter(t => t.deletedAt < corte);
    if (!caducadas.length) return data;
    for (const t of caducadas) {
      if (t.type === 'note') { await fsp.rm(notaTrashFile(user, t.id), { force: true }); await calendar().quitaVinculos(user, 'note', t.id).catch(() => {}); }
    }
    data.trash = (data.trash || []).filter(t => t.deletedAt >= corte);
    await writeNotes(user, data);
    return data;
  }

  router.get('/notes-trash', auth, async (req, res) => {
    try {
      const data = await purgarNotasCaducadas(req.user);
      res.json({ items: data.trash || [], ttlDays: await papeleraDias(req.user) });
    } catch (err) { sendError(res, err); }
  });

  router.post('/notes-trash/restore', auth, async (req, res) => {
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
  });

  router.delete('/notes-trash/:id', auth, async (req, res) => {
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
  });

  router.delete('/notes-trash', auth, async (req, res) => {
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
  });

  return {
    router,
    core: { readNotes, writeNotes, notaFile, descendientes, notasFuente, purgarNotasCaducadas },
  };
}

module.exports = createNotes;
module.exports.NOTES_DIR = NOTES_DIR;
