'use strict';
// Versiones de archivos de texto: antes de sobrescribir uno (editor de la web o WebDAV) se
// guarda una copia de lo que había. Las copias viven en <usuario>/.kcc/versions/<hash de la ruta>/
// y se pueden ver, comparar y restaurar (restaurar también guarda lo actual, así se puede deshacer).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { kccDir, readJson, writeJson, HttpError } = require('./store');

const KEEP = Math.max(Number(process.env.VERSIONS_KEEP || 30), 3);          // versiones por archivo
const DAYS = Number(process.env.VERSIONS_DAYS || 180);                       // antigüedad máxima
const MAX_BYTES = Number(process.env.VERSIONS_MAX_BYTES || 5 * 1024 * 1024); // no se versionan archivos mayores

const limpia = (rel) => String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const hash = (rel) => crypto.createHash('sha1').update(limpia(rel)).digest('hex');
const idOk = (id) => /^\d{10,15}$/.test(String(id));

function createVersions({ express, auth, userRoot, resolveFor, sendError, textMax }) {
  const router = express.Router();
  const raiz = (user) => kccDir(userRoot(user), 'versions');
  const dirDe = (user, rel) => path.join(raiz(user), hash(rel));

  async function lista(user, rel) {
    const dir = dirDe(user, rel);
    let nombres = [];
    try { nombres = (await fsp.readdir(dir)).filter(n => n.endsWith('.v')); } catch { return []; }
    const out = [];
    for (const n of nombres) {
      try {
        const st = await fsp.stat(path.join(dir, n));
        out.push({ id: n.slice(0, -2), at: Number(n.slice(0, -2)), size: st.size, mtime: st.mtimeMs });
      } catch { /* borrada a mitad */ }
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async function poda(user, rel) {
    const todas = await lista(user, rel);
    const corte = Date.now() - DAYS * 86400000;
    // Siempre se conservan las 3 más recientes; el resto, hasta KEEP y dentro de la antigüedad máxima
    const sobran = todas.filter((v, i) => i >= 3 && (i >= KEEP || v.at < corte));
    for (const v of sobran) await fsp.rm(path.join(dirDe(user, rel), v.id + '.v'), { force: true });
  }

  // Guarda lo que hay ahora en `abs` como una versión (si cambió respecto a la última)
  async function snapshot(user, rel, abs) {
    try {
      const st = await fsp.stat(abs);
      if (!st.isFile() || st.size > MAX_BYTES) return false;
      const dir = dirDe(user, rel);
      await fsp.mkdir(dir, { recursive: true });
      const previas = await lista(user, rel);
      const actual = await fsp.readFile(abs);
      if (previas[0]) {
        try { if (Buffer.compare(await fsp.readFile(path.join(dir, previas[0].id + '.v')), actual) === 0) return false; } catch {}
      }
      let id = Date.now();
      if (previas[0] && id <= previas[0].at) id = previas[0].at + 1;     // ids siempre crecientes
      await fsp.writeFile(path.join(dir, id + '.v'), actual);
      await writeJson(path.join(dir, 'meta.json'), { path: limpia(rel) });
      await poda(user, rel);
      return true;
    } catch { return false; }
  }

  // Un archivo o carpeta cambió de sitio: sus versiones se van con él
  async function mueve(user, desde, hacia) {
    try {
      const a = limpia(desde), b = limpia(hacia);
      if (!a || !b || a === b) return;
      const base = raiz(user);
      for (const d of await fsp.readdir(base)) {
        const meta = await readJson(path.join(base, d, 'meta.json'), null);
        if (!meta || !meta.path) continue;
        if (meta.path === a || meta.path.startsWith(a + '/')) {
          const nueva = b + meta.path.slice(a.length);
          const destino = path.join(base, hash(nueva));
          await fsp.rm(destino, { recursive: true, force: true });
          await fsp.rename(path.join(base, d), destino);
          await writeJson(path.join(destino, 'meta.json'), { path: nueva });
        }
      }
    } catch { /* sin versiones que mover */ }
  }

  const archivo = (req) => {
    const rel = limpia(req.query.path);
    if (!rel) throw new HttpError(400, 'Falta la ruta');
    return { rel, abs: resolveFor(req.user, rel) };
  };

  router.get('/versions', auth, async (req, res) => {
    try { const { rel } = archivo(req); res.json({ versions: await lista(req.user, rel), keep: KEEP }); }
    catch (err) { sendError(res, err); }
  });

  router.get('/versions/:id', auth, async (req, res) => {
    try {
      const { rel } = archivo(req);
      if (!idOk(req.params.id)) throw new HttpError(400, 'Versión no válida');
      const f = path.join(dirDe(req.user, rel), req.params.id + '.v');
      if (req.query.download === '1') {
        const nombre = `${path.basename(rel, path.extname(rel))} (${new Date(+req.params.id).toISOString().slice(0, 19).replace(/[:T]/g, '-')})${path.extname(rel)}`;
        return res.download(f, nombre, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Versión no encontrada' }); });
      }
      const st = await fsp.stat(f).catch(() => null);
      if (!st) throw new HttpError(404, 'Versión no encontrada');
      const leer = Math.min(st.size, textMax);
      const fh = await fsp.open(f, 'r'); const buf = Buffer.alloc(leer);
      try { await fh.read(buf, 0, leer, 0); } finally { await fh.close(); }
      res.json({ text: buf.toString('utf8'), truncated: st.size > textMax, size: st.size, at: +req.params.id });
    } catch (err) { sendError(res, err); }
  });

  router.post('/versions/:id/restore', auth, async (req, res) => {
    try {
      const { rel, abs } = archivo(req);
      if (!idOk(req.params.id)) throw new HttpError(400, 'Versión no válida');
      const f = path.join(dirDe(req.user, rel), req.params.id + '.v');
      if (!(await fsp.stat(f).catch(() => null))) throw new HttpError(404, 'Versión no encontrada');
      await snapshot(req.user, rel, abs);          // lo de ahora no se pierde: queda como versión
      await fsp.copyFile(f, abs);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/versions/:id', auth, async (req, res) => {
    try {
      const { rel } = archivo(req);
      if (!idOk(req.params.id)) throw new HttpError(400, 'Versión no válida');
      await fsp.rm(path.join(dirDe(req.user, rel), req.params.id + '.v'), { force: true });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return { router, snapshot, mueve, lista };
}

module.exports = createVersions;
