'use strict';
// Papelera de archivos: lo borrado se mueve a <usuario>/.trash con un índice y se vacía solo pasados
// N días (ajuste por usuario en .kcc/prefs.json). Fábrica como el resto: createPapelera({...}) →
// { router, core }. El router se monta en /api (rutas /trash…). shares, calendar, freeName y
// barridoUsuario se piden al usarlos porque se definen más abajo en server.js.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { readJson, updateJson, kccDir } = require('./store');

const TRASH_DIR = '.trash';                                    // dentro de la carpeta de cada usuario
const TRASH_TTL_DAYS = Number(process.env.TRASH_TTL_DAYS || 30);
const TRASH_SWEEP_HOURS = Number(process.env.TRASH_SWEEP_HOURS || 6);   // cada cuánto se revisan las papeleras de todos
// Días que aguanta cada usuario lo que borra (0 = nunca se vacía sola). Lo elige él en Papelera.
const PAPELERA_OPCIONES = [0, 7, 14, 30, 60, 90, 180];

function createPapelera({ express, auth, userRoot, resolveFor, shares, calendar, freeName, barridoUsuario, sendError, registrarActividad }) {
  const router = express.Router();

  function trashRoot(user) {
    const dir = path.join(userRoot(user), TRASH_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // Índice de la papelera: ilegible NO es «vacío» (el siguiente guardado habría dejado todo lo borrado huérfano en .trash).
  // Se prueba la copia anterior y, si tampoco sirve, se avisa con un error.
  async function readTrash(user) {
    const file = path.join(trashRoot(user), 'index.json');
    let hay = false;
    for (const f of [file, `${file}.bak`]) {
      let txt;
      try { txt = await fsp.readFile(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      hay = true;
      try {
        const d = JSON.parse(txt);
        if (Array.isArray(d)) {
          if (f !== file) { await fsp.rename(file, `${file}.dañado-${Date.now()}`).catch(() => {}); await fsp.copyFile(f, file).catch(() => {}); }
          return d;
        }
      } catch { /* se prueba la siguiente */ }
    }
    if (hay) { const e = new Error('El índice de la papelera está dañado. Los archivos siguen en la carpeta .trash del servidor.'); e.status = 500; throw e; }
    return [];
  }
  async function writeTrash(user, entries) {
    const file = path.join(trashRoot(user), 'index.json');
    const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fsp.writeFile(tmp, JSON.stringify(entries, null, 2));
      await fsp.copyFile(file, `${file}.bak`).catch(() => {});
      await fsp.rename(tmp, file);
    } catch (e) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
  }
  // Mueve a la papelera en lugar de borrar: un rm -rf recursivo sin vuelta atrás
  // es demasiado fácil de disparar por accidente desde el móvil.
  // El índice de la papelera es un único JSON por usuario: toda lectura-modificación-escritura va en cola. Antes, varios
  // borrados a la vez (selección múltiple, un cliente WebDAV sincronizando) se pisaban el índice y lo borrado quedaba en
  // la carpeta de la papelera pero invisible: no se podía restaurar ni se vaciaba nunca.
  const colasIndice = new Map();
  function enCola(user, fn) {
    const k = userRoot(user);
    const sig = (colasIndice.get(k) || Promise.resolve()).catch(() => {}).then(fn);
    colasIndice.set(k, sig);
    sig.finally(() => { if (colasIndice.get(k) === sig) colasIndice.delete(k); }).catch(() => {});
    return sig;
  }
  async function trashItem(user, relPath) {
    // Borrar dentro de una carpeta compartida con permiso de edición: va a la papelera de su dueño
    const comp = shares().parse(relPath);
    if (comp) {
      const r = shares().resolver(user, comp, true);
      if (!comp.resto) { const e = new Error('No puedes borrar la carpeta compartida entera: pídeselo a su dueño o deja de verla'); e.status = 403; throw e; }
      return trashItem(r.owner, r.ownerRel);
    }
    const target = resolveFor(user, relPath);
    if (target === userRoot(user)) {
      const err = new Error('No puedes borrar la carpeta raíz');
      err.status = 400;
      throw err;
    }
    const stat = await fsp.stat(target);
    const id = crypto.randomBytes(8).toString('hex');
    await fsp.rename(target, path.join(trashRoot(user), id));
    const clean = String(relPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const from = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : '';
    calendar().quitaOrigenArchivo(user, clean).catch(() => {});
    shares().quita(user.username, clean);                                // lo que se borra deja de estar compartido   // un archivo en la papelera no ocupa el calendario
    await enCola(user, async () => {
      const entries = await readTrash(user);
      entries.unshift({
        id,
        name: path.basename(target),
        from,
        isDir: stat.isDirectory(),
        size: stat.isDirectory() ? 0 : stat.size,
        deletedAt: Date.now(),
      });
      await writeTrash(user, entries);
    });
  }
  const prefsFile = (user) => path.join(kccDir(userRoot(user)), 'prefs.json');
  async function papeleraDias(user) {
    const p = await readJson(prefsFile(user), {});
    return PAPELERA_OPCIONES.includes(p.trashDays) ? p.trashDays : TRASH_TTL_DAYS;
  }
  function purgeExpired(user) { return enCola(user, () => purga(user)); }
  async function purga(user) {
    const entries = await readTrash(user);
    const dias = await papeleraDias(user);
    if (!dias) return entries;
    const cutoff = Date.now() - dias * 86400000;
    const expired = entries.filter(e => e.deletedAt < cutoff);
    if (!expired.length) return entries;
    const fuera = new Set(expired);
    const kept = entries.filter(e => !fuera.has(e));   // una entrada sin fecha no desaparece del índice
    await writeTrash(user, kept);
    // Primero el índice y después el borrado de las carpetas caducadas, en segundo plano: quien abre la papelera
    // no tiene que esperar a que se eliminen árboles enteros
    Promise.all(expired.map(e => fsp.rm(path.join(trashRoot(user), e.id), { recursive: true, force: true }))).catch(() => {});
    return kept;
  }

  router.get('/trash', auth, async (req, res) => {
    try {
      const entries = await purgeExpired(req.user);
      res.json({ items: entries, ttlDays: await papeleraDias(req.user) });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Cuántos días se conserva lo borrado antes de vaciarse solo (papelera de archivos, notas y prompts)
  router.get('/trash/settings', auth, async (req, res) => {
    try { res.json({ days: await papeleraDias(req.user), options: PAPELERA_OPCIONES, sweepHours: TRASH_SWEEP_HOURS }); }
    catch (err) { sendError(res, err); }
  });
  router.put('/trash/settings', auth, async (req, res) => {
    try {
      const days = Number(req.body && req.body.days);
      if (!PAPELERA_OPCIONES.includes(days)) return res.status(400).json({ error: 'Valor no válido' });
      await updateJson(prefsFile(req.user), {}, (p) => { p.trashDays = days; });
      registrarActividad(req, 'papelera_ajuste', { days });
      // Se aplica ya, sin esperar al siguiente barrido
      await barridoUsuario()(req.user);
      res.json({ ok: true, days });
    } catch (err) { sendError(res, err); }
  });

  router.post('/trash/restore', auth, async (req, res) => {
    try { await enCola(req.user, async () => {
      const { id } = req.body || {};
      const entries = await readTrash(req.user);
      const entry = entries.find(e => e.id === id);
      if (!entry) return res.status(404).json({ error: 'No está en la papelera' });

      const destDir = resolveFor(req.user, entry.from);
      await fsp.mkdir(destDir, { recursive: true });
      const target = await freeName(destDir, entry.name);
      await fsp.rename(path.join(trashRoot(req.user), entry.id), target);
      await writeTrash(req.user, entries.filter(e => e.id !== id));
      registrarActividad(req, 'restaurado_papelera', { name: entry.name });
      res.json({ ok: true, restoredAs: path.basename(target) });
    }); } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/trash/:id', auth, async (req, res) => {
    try { await enCola(req.user, async () => {
      const entries = await readTrash(req.user);
      const entry = entries.find(e => e.id === req.params.id);
      if (!entry) return res.status(404).json({ error: 'No está en la papelera' });
      await fsp.rm(path.join(trashRoot(req.user), entry.id), { recursive: true, force: true });
      await writeTrash(req.user, entries.filter(e => e.id !== entry.id));
      res.json({ ok: true });
    }); } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/trash', auth, async (req, res) => {
    try {
      // Primero el índice (en cola) y después las carpetas, en segundo plano
      const entries = await enCola(req.user, async () => { const e = await readTrash(req.user); await writeTrash(req.user, []); return e; });
      Promise.all(entries.map(e => fsp.rm(path.join(trashRoot(req.user), e.id), { recursive: true, force: true }))).catch(() => {});
      res.json({ ok: true, removed: entries.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  return { router, core: { trashItem, papeleraDias, purgeExpired } };
}

createPapelera.TRASH_DIR = TRASH_DIR;
createPapelera.TRASH_SWEEP_HOURS = TRASH_SWEEP_HOURS;
module.exports = createPapelera;
