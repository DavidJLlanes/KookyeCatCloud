'use strict';
// base: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const path = require('path');
const fs = require('fs');
const { HttpError, cleanStr } = require('../store');
const fsp = fs.promises;
const crypto = require('crypto');
const { IDLE_MS, abrir, sellar } = require('./constantes');

function monta(ctx) {
  const { express, sendError, userRoot } = ctx;

  const router = express.Router();
  const abiertas = new Map();        // clave de sesión -> { dek, last }
  const intentos = new Map();        // usuario -> { n, hasta }
  const colas = new Map();           // usuario -> promesa (serializa cambios del índice)

  setInterval(() => { const ahora = Date.now(); for (const [k, v] of abiertas) if (ahora - v.last > IDLE_MS) abiertas.delete(k); }, 30000).unref();

  const dirVault = (user) => { const d = path.join(userRoot(user), '.vault'); fs.mkdirSync(path.join(d, 'data'), { recursive: true }); return d; };
  const metaFile = (user) => path.join(dirVault(user), 'vault.json');
  const indexFile = (user) => path.join(dirVault(user), 'index.enc');
  const binFile = (user, id) => path.join(dirVault(user), 'data', id + '.bin');
  const thumbFile = (user, id) => path.join(dirVault(user), 'data', id + '.t');
  const sesionKey = (req) => req.user.jti || ('u:' + req.user.username);

  const existe = (user) => fs.existsSync(metaFile(user));
  const cola = (user, fn) => {
    const k = user.username;
    const sig = (colas.get(k) || Promise.resolve()).catch(() => {}).then(fn);
    colas.set(k, sig);
    sig.finally(() => { if (colas.get(k) === sig) colas.delete(k); }).catch(() => {});
    return sig;
  };

  function exigeAbierta(req) {
    const s = abiertas.get(sesionKey(req));
    if (!s) { const e = new HttpError(423, 'La caja fuerte está bloqueada'); e.locked = true; throw e; }
    if (Date.now() - s.last > IDLE_MS) { abiertas.delete(sesionKey(req)); const e = new HttpError(423, 'La caja fuerte se bloqueó por inactividad'); e.locked = true; throw e; }
    s.last = Date.now();
    return s.dek;
  }
  const errorVault = (res, err) => (err.locked ? res.status(423).json({ error: err.message, locked: true }) : sendError(res, err));

  async function leeIndice(user, dek) {
    try { return JSON.parse(abrir(dek, await fsp.readFile(indexFile(user)), 'index').toString('utf8')); }
    catch (e) { if (e.code === 'ENOENT') return { items: [] }; throw new HttpError(500, 'No se pudo leer el índice de la caja fuerte'); }
  }
  // Los metadatos (clave envuelta) y el índice se escriben atómicos y con .bak: un corte a mitad dejaría la caja fuerte ilegible para siempre
  async function escribeAtomico(file, contenido) {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fsp.writeFile(tmp, contenido, { mode: 0o600 });
      await fsp.copyFile(file, `${file}.bak`).catch(() => {});
      await fsp.rename(tmp, file);
    } catch (e) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
  }
  async function guardaIndice(user, dek, idx) { await escribeAtomico(indexFile(user), sellar(dek, Buffer.from(JSON.stringify(idx)), 'index')); }
  const mutaIndice = (user, dek, fn) => cola(user, async () => { const idx = await leeIndice(user, dek); const r = await fn(idx); await guardaIndice(user, dek, idx); return r; });

  const nombreOk = (n) => {
    const t = cleanStr(n, 200).replace(/[\\/\u0000-\u001f]/g, '_').trim();
    if (!t || t === '.' || t === '..') throw new HttpError(400, 'Nombre no válido');
    return t;
  };
  const hijos = (idx, id) => idx.items.filter(i => i.parent === id);
  const descendientes = (idx, id) => hijos(idx, id).flatMap(h => [h, ...descendientes(idx, h.id)]);
  const padreValido = (idx, p) => !p || (idx.items.find(i => i.id === p) || {}).type === 'folder';
  const nombreLibre = (idx, parent, nombre) => {
    const ocupados = new Set(hijos(idx, parent).map(i => i.name.toLowerCase()));
    if (!ocupados.has(nombre.toLowerCase())) return nombre;
    const ext = path.extname(nombre), base = path.basename(nombre, ext);
    let n = 1; while (ocupados.has(`${base} (${n})${ext}`.toLowerCase())) n++;
    return `${base} (${n})${ext}`;
  };


  return { router, abiertas, intentos, colas, dirVault, metaFile, indexFile, binFile, thumbFile, sesionKey, existe, cola, exigeAbierta, errorVault, leeIndice, escribeAtomico, guardaIndice, mutaIndice, nombreOk, hijos, descendientes, padreValido, nombreLibre };
}

module.exports = monta;
