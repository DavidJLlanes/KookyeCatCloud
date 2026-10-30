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
  async function readTrash(user) {
    try { return JSON.parse(await fsp.readFile(path.join(trashRoot(user), 'index.json'), 'utf8')); }
    catch { return []; }
  }
  async function writeTrash(user, entries) {
    const file = path.join(trashRoot(user), 'index.json');
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(entries, null, 2));
    await fsp.rename(tmp, file);
  }
  // Mueve a la papelera en lugar de borrar: un rm -rf recursivo sin vuelta atrás
  // es demasiado fácil de disparar por accidente desde el móvil.
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
  }
  const prefsFile = (user) => path.join(kccDir(userRoot(user)), 'prefs.json');
  async function papeleraDias(user) {
    const p = await readJson(prefsFile(user), {});
    return PAPELERA_OPCIONES.includes(p.trashDays) ? p.trashDays : TRASH_TTL_DAYS;
  }
  async function purgeExpired(user) {
    const entries = await readTrash(user);
    const dias = await papeleraDias(user);
    if (!dias) return entries;
    const cutoff = Date.now() - dias * 86400000;
    const expired = entries.filter(e => e.deletedAt < cutoff);
    if (!expired.length) return entries;
    for (const e of expired) {
      await fsp.rm(path.join(trashRoot(user), e.id), { recursive: true, force: true });
    }
    const kept = entries.filter(e => e.deletedAt >= cutoff);
    await writeTrash(user, kept);
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
    try {
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
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/trash/:id', auth, async (req, res) => {
    try {
      const entries = await readTrash(req.user);
      const entry = entries.find(e => e.id === req.params.id);
      if (!entry) return res.status(404).json({ error: 'No está en la papelera' });
      await fsp.rm(path.join(trashRoot(req.user), entry.id), { recursive: true, force: true });
      await writeTrash(req.user, entries.filter(e => e.id !== entry.id));
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/trash', auth, async (req, res) => {
    try {
      const entries = await readTrash(req.user);
      for (const e of entries) {
        await fsp.rm(path.join(trashRoot(req.user), e.id), { recursive: true, force: true });
      }
      await writeTrash(req.user, []);
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
