'use strict';
// Caja fuerte: carpeta cifrada con una contraseña distinta a la de la cuenta.
//
// Modelo de claves
//   contraseña --scrypt(sal)--> KEK --AES-256-GCM--> envuelve una clave de datos aleatoria (DEK)
//   DEK cifra el índice (nombres, carpetas, tamaños) y cada archivo.
//   Cambiar la contraseña solo vuelve a envolver la DEK: no hay que recifrar los archivos.
//
// (Una contraseña de la caja incorrecta devuelve 403 y no 401: la app trata todo 401 como sesión caducada.)
// La DEK solo existe en memoria del servidor, ligada a la sesión, mientras la caja está
// desbloqueada; se descarta al bloquear, al cerrar sesión o tras un rato sin usarla. Si se
// pierde la contraseña, NO hay forma de recuperar los datos (ni siquiera para el admin).
//
// Formato de archivo cifrado (.bin): "KCV1" + registros [longitud u32][iv 12][cifrado][tag 16],
// de 1 MiB de texto claro cada uno (el último, menos). Cada registro lleva como dato asociado
// "<id>:<nº de registro>", así que no se pueden reordenar, truncar ni cambiar de archivo.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { newId, HttpError, cleanStr } = require('./store');

const MAGIC = Buffer.from('KCV1');
const CHUNK = 1024 * 1024;
const REG_FIJO = 4 + 12 + CHUNK + 16;
const KDF = { N: 1 << 15, r: 8, p: 1 };
const IDLE_MS = Math.max(Number(process.env.VAULT_IDLE_MIN || 15), 0.02) * 60000;
const MAX_ITEMS = 20000;
const MIN_PASS = 10;

const MIME_SEGURO = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8',
  json: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
};
const extDe = (n) => String(n).split('.').pop().toLowerCase();

const scrypt = (pass, salt) => new Promise((res, rej) =>
  crypto.scrypt(pass.normalize('NFC'), salt, 32, { ...KDF, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

function sellar(clave, datos, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function abrir(clave, blob, aad) {
  const iv = blob.subarray(0, 12), tag = blob.subarray(12, 28), ct = blob.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// Cifra un flujo en registros de CHUNK bytes
class CifraChunks extends Transform {
  constructor(dek, id) {
    super();
    this.dek = dek; this.id = id; this.parts = []; this.len = 0; this.idx = 0; this.total = 0;
    this.push(MAGIC);
  }
  registro(plano) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.dek, iv);
    c.setAAD(Buffer.from(`${this.id}:${this.idx++}`));
    const ct = Buffer.concat([c.update(plano), c.final()]);
    const cab = Buffer.alloc(4); cab.writeUInt32BE(ct.length);
    this.push(Buffer.concat([cab, iv, ct, c.getAuthTag()]));
  }
  _transform(trozo, _e, cb) {
    this.total += trozo.length; this.parts.push(trozo); this.len += trozo.length;
    while (this.len >= CHUNK) {
      const todo = Buffer.concat(this.parts);
      this.registro(todo.subarray(0, CHUNK));
      const resto = todo.subarray(CHUNK); this.parts = [resto]; this.len = resto.length;
    }
    cb();
  }
  _flush(cb) { if (this.len > 0 || this.idx === 0) this.registro(Buffer.concat(this.parts)); cb(); }
}

function createVault({ express, auth, multer, sharp, userRoot, resolveFor, sendError, registrarActividad, alRetirar, maxUpload }) {
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
  async function guardaIndice(user, dek, idx) {
    const tmp = indexFile(user) + '.tmp';
    await fsp.writeFile(tmp, sellar(dek, Buffer.from(JSON.stringify(idx)), 'index'));
    await fsp.rename(tmp, indexFile(user));
  }
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

  /* ---------- Estado, alta, desbloqueo ---------- */
  router.get('/vault', auth, (req, res) => {
    try {
      const s = abiertas.get(sesionKey(req));
      const vivo = s && Date.now() - s.last <= IDLE_MS;
      res.json({ exists: existe(req.user), unlocked: !!vivo, idleMin: IDLE_MS / 60000, minPass: MIN_PASS });
    } catch (err) { sendError(res, err); }
  });

  async function creaMeta(pass, dek) {
    const salt = crypto.randomBytes(16);
    const kek = await scrypt(pass, salt);
    return { v: 1, kdf: { ...KDF, salt: salt.toString('base64') }, wrapped: sellar(kek, dek, 'dek').toString('base64'), createdAt: Date.now() };
  }
  async function abreConPass(user, pass) {
    const meta = JSON.parse(await fsp.readFile(metaFile(user), 'utf8'));
    const kek = await scrypt(pass, Buffer.from(meta.kdf.salt, 'base64'));
    try { return { dek: abrir(kek, Buffer.from(meta.wrapped, 'base64'), 'dek'), meta }; }
    catch { return null; }
  }
  const validaPass = (p) => {
    const t = String(p || '');
    if (t.length < MIN_PASS) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASS} caracteres`);
    if (t.length > 200) throw new HttpError(400, 'Contraseña demasiado larga');
    return t;
  };

  router.post('/vault/setup', auth, express.json(), async (req, res) => {
    try {
      if (existe(req.user)) throw new HttpError(409, 'Ya tienes una caja fuerte');
      const pass = validaPass(req.body.password);
      const dek = crypto.randomBytes(32);
      await fsp.writeFile(metaFile(req.user), JSON.stringify(await creaMeta(pass, dek)), { mode: 0o600 });
      await guardaIndice(req.user, dek, { items: [] });
      abiertas.set(sesionKey(req), { dek, last: Date.now() });
      registrarActividad(req, 'caja_creada', {});
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.post('/vault/unlock', auth, express.json(), async (req, res) => {
    try {
      if (!existe(req.user)) throw new HttpError(404, 'Aún no tienes una caja fuerte');
      const k = req.user.username, it = intentos.get(k) || { n: 0, hasta: 0 };
      if (Date.now() < it.hasta) throw new HttpError(429, `Demasiados intentos. Prueba en ${Math.ceil((it.hasta - Date.now()) / 60000)} min`);
      const r = await abreConPass(req.user, String(req.body.password || ''));
      if (!r) {
        it.n++; if (it.n >= 5) { it.hasta = Date.now() + 5 * 60000; it.n = 0; }
        intentos.set(k, it);
        throw new HttpError(403, 'Contraseña de la caja fuerte incorrecta');
      }
      intentos.delete(k);
      abiertas.set(sesionKey(req), { dek: r.dek, last: Date.now() });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.post('/vault/lock', auth, (req, res) => { abiertas.delete(sesionKey(req)); res.json({ ok: true }); });

  router.post('/vault/password', auth, express.json(), async (req, res) => {
    try {
      const nueva = validaPass(req.body.newPassword);
      const r = await abreConPass(req.user, String(req.body.password || ''));
      if (!r) throw new HttpError(403, 'La contraseña actual no es correcta');
      await fsp.writeFile(metaFile(req.user), JSON.stringify({ ...(await creaMeta(nueva, r.dek)), createdAt: r.meta.createdAt }), { mode: 0o600 });
      registrarActividad(req, 'caja_clave_cambiada', {});
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // Borrar la caja entera (con su contraseña): no hay marcha atrás
  router.delete('/vault', auth, express.json(), async (req, res) => {
    try {
      if (!(await abreConPass(req.user, String(req.body.password || '')))) throw new HttpError(403, 'Contraseña incorrecta');
      abiertas.delete(sesionKey(req));
      await fsp.rm(dirVault(req.user), { recursive: true, force: true });
      registrarActividad(req, 'caja_borrada', {});
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Contenido ---------- */
  router.get('/vault/items', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const idx = await leeIndice(req.user, dek);
      res.json({ items: idx.items });
    } catch (err) { errorVault(res, err); }
  });

  router.post('/vault/folders', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const item = await mutaIndice(req.user, dek, (idx) => {
        if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
        const parent = String(req.body.parent || '');
        if (!padreValido(idx, parent)) throw new HttpError(400, 'Carpeta no válida');
        const it = { id: newId(), type: 'folder', name: nombreLibre(idx, parent, nombreOk(req.body.name)), parent, createdAt: Date.now(), modifiedAt: Date.now() };
        idx.items.push(it);
        return it;
      });
      res.json({ ok: true, item });
    } catch (err) { errorVault(res, err); }
  });

  router.put('/vault/items/:id', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const item = await mutaIndice(req.user, dek, (idx) => {
        const it = idx.items.find(i => i.id === req.params.id);
        if (!it) throw new HttpError(404, 'No encontrado');
        if (req.body.parent !== undefined) {
          const p = String(req.body.parent || '');
          if (!padreValido(idx, p)) throw new HttpError(400, 'Carpeta no válida');
          if (p === it.id || descendientes(idx, it.id).some(d => d.id === p)) throw new HttpError(400, 'No puedes mover una carpeta dentro de sí misma');
          it.parent = p;
        }
        if (req.body.name !== undefined) it.name = nombreOk(req.body.name);
        const otros = idx.items.filter(o => o.id !== it.id && o.parent === it.parent && o.name.toLowerCase() === it.name.toLowerCase());
        if (otros.length) it.name = nombreLibre({ items: idx.items.filter(o => o.id !== it.id) }, it.parent, it.name);
        it.modifiedAt = Date.now();
        return it;
      });
      res.json({ ok: true, item });
    } catch (err) { errorVault(res, err); }
  });

  async function quitaDatos(user, ids) {
    for (const id of ids) { await fsp.rm(binFile(user, id), { force: true }); await fsp.rm(thumbFile(user, id), { force: true }); }
  }
  router.delete('/vault/items/:id', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const quitados = await mutaIndice(req.user, dek, (idx) => {
        const it = idx.items.find(i => i.id === req.params.id);
        if (!it) return [];
        const ids = new Set([it.id, ...descendientes(idx, it.id).map(d => d.id)]);
        const sueltos = idx.items.filter(i => ids.has(i.id));
        idx.items = idx.items.filter(i => !ids.has(i.id));
        return sueltos.filter(i => i.type === 'file').map(i => i.id);
      });
      await quitaDatos(req.user, quitados);
      res.json({ ok: true, removed: quitados.length });
    } catch (err) { errorVault(res, err); }
  });

  /* ---------- Subida cifrada ---------- */
  // Almacenamiento de multer propio: el archivo se cifra al vuelo, nunca toca el disco en claro
  const almacen = {
    _handleFile(req, file, cb) {
      try {
        const id = newId();
        const cif = new CifraChunks(req.vaultDek, id);
        const esImg = /^image\//.test(file.mimetype) && !/svg/.test(file.mimetype) && !!sharp;
        const copia = []; let copiaLen = 0;
        if (esImg) file.stream.on('data', (c) => { if (copiaLen <= 25 * 1024 * 1024) { copia.push(c); copiaLen += c.length; } });
        const out = fs.createWriteStream(binFile(req.vaultUser, id), { mode: 0o600 });
        pipeline(file.stream, cif, out).then(async () => {
          let thumb = false;
          if (esImg && copiaLen <= 25 * 1024 * 1024) {
            try {
              const mini = await sharp(Buffer.concat(copia), { limitInputPixels: 64e6, failOn: 'none' }).rotate()
                .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
              await fsp.writeFile(thumbFile(req.vaultUser, id), sellar(req.vaultDek, mini, `t:${id}`), { mode: 0o600 });
              thumb = true;
            } catch { /* sin miniatura */ }
          }
          cb(null, { id, size: cif.total, thumb });
        }).catch((e) => { fsp.rm(binFile(req.vaultUser, id), { force: true }).catch(() => {}); cb(e); });
      } catch (e) { cb(e); }
    },
    _removeFile(req, file, cb) { fsp.rm(binFile(req.vaultUser, file.id), { force: true }).then(() => cb(null), cb); },
  };
  const subida = multer({ storage: almacen, limits: { fileSize: maxUpload } });

  router.post('/vault/upload', auth, (req, res, next) => {
    try { req.vaultDek = exigeAbierta(req); req.vaultUser = req.user; next(); } catch (err) { errorVault(res, err); }
  }, (req, res) => {
    subida.array('files')(req, res, async (err) => {
      if (err) return sendError(res, err);
      try {
        const parent = String(req.query.parent || '');
        const items = await mutaIndice(req.user, req.vaultDek, (idx) => {
          if (!padreValido(idx, parent)) throw new HttpError(400, 'Carpeta no válida');
          const nuevos = [];
          for (const f of req.files || []) {
            if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
            const orig = Buffer.from(f.originalname, 'latin1').toString('utf8');
            const it = { id: f.id, type: 'file', name: nombreLibre(idx, parent, nombreOk(path.basename(orig))), parent, size: f.size, thumb: !!f.thumb, createdAt: Date.now(), modifiedAt: Date.now() };
            idx.items.push(it); nuevos.push(it);
          }
          return nuevos;
        });
        registrarActividad(req, 'caja_subida', { n: items.length });
        res.json({ ok: true, items });
      } catch (e) {
        for (const f of req.files || []) { await quitaDatos(req.user, [f.id]); }
        errorVault(res, e);
      }
    });
  });

  /* ---------- Lectura (descarga, vista previa, miniatura) ---------- */
  async function leeRegistro(fh, id, dek, i, tam) {
    const largo = Math.min(CHUNK, Math.max(tam - i * CHUNK, 0));
    const off = 4 + i * REG_FIJO;
    const buf = Buffer.alloc(4 + 12 + largo + 16);
    const { bytesRead } = await fh.read(buf, 0, buf.length, off);
    if (bytesRead !== buf.length) throw new Error('Archivo cifrado truncado');
    if (buf.readUInt32BE(0) !== largo) throw new Error('Registro corrupto');
    const d = crypto.createDecipheriv('aes-256-gcm', dek, buf.subarray(4, 16));
    d.setAAD(Buffer.from(`${id}:${i}`));
    d.setAuthTag(buf.subarray(4 + 12 + largo));
    return Buffer.concat([d.update(buf.subarray(16, 16 + largo)), d.final()]);
  }

  router.get('/vault/items/:id/file', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const it = (await leeIndice(req.user, dek)).items.find(i => i.id === req.params.id && i.type === 'file');
      if (!it) throw new HttpError(404, 'No encontrado');
      const mime = MIME_SEGURO[extDe(it.name)];
      const adj = req.query.download === '1' || !mime;
      const nombre = it.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.setHeader('Content-Type', adj ? 'application/octet-stream' : mime);
      res.setHeader('Content-Disposition', `${adj ? 'attachment' : 'inline'}; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(it.name)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const tam = it.size;
      let ini = 0, fin = Math.max(tam - 1, 0);
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && tam > 0) {
        if (m[1] !== '') { ini = +m[1]; if (m[2] !== '') fin = Math.min(+m[2], tam - 1); }
        else if (m[2] !== '') { ini = Math.max(tam - +m[2], 0); }
        if (ini > fin || ini >= tam) { res.status(416).setHeader('Content-Range', `bytes */${tam}`); return res.end(); }
        res.status(206).setHeader('Content-Range', `bytes ${ini}-${fin}/${tam}`);
      }
      res.setHeader('Content-Length', tam === 0 ? 0 : fin - ini + 1);
      if (tam === 0) return res.end();
      const fh = await fsp.open(binFile(req.user, it.id), 'r');
      try {
        for (let i = Math.floor(ini / CHUNK); i <= Math.floor(fin / CHUNK); i++) {
          const plano = await leeRegistro(fh, it.id, dek, i, tam);
          const a = Math.max(ini - i * CHUNK, 0), b = Math.min(fin - i * CHUNK + 1, plano.length);
          if (!res.write(plano.subarray(a, b))) await new Promise(r => res.once('drain', r));
          if (res.destroyed) break;
        }
        res.end();
      } catch (e) { res.destroy(); } finally { await fh.close(); }
    } catch (err) { if (!res.headersSent) errorVault(res, err); else res.destroy(); }
  });

  router.get('/vault/items/:id/thumb', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      if (!/^[a-f0-9]{16}$/.test(req.params.id)) throw new HttpError(400, 'No válido');
      const blob = await fsp.readFile(thumbFile(req.user, req.params.id)).catch(() => null);
      if (!blob) throw new HttpError(404, 'Sin miniatura');
      res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'private, no-store');
      res.send(abrir(dek, blob, `t:${req.params.id}`));
    } catch (err) { errorVault(res, err); }
  });

  /* ---------- Mover entre tus archivos y la caja ---------- */
  async function cifraArchivo(user, dek, abs, id) {
    const cif = new CifraChunks(dek, id);
    await pipeline(fs.createReadStream(abs), cif, fs.createWriteStream(binFile(user, id), { mode: 0o600 }));
    return cif.total;
  }

  router.post('/vault/import', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const rutas = Array.isArray(req.body.paths) ? req.body.paths.slice(0, 500) : [];
      if (!rutas.length) throw new HttpError(400, 'No hay nada seleccionado');
      const destino = String(req.body.parent || '');
      let movidos = 0;
      const retirados = [];
      await mutaIndice(req.user, dek, async (idx) => {
        if (!padreValido(idx, destino)) throw new HttpError(400, 'Carpeta no válida');
        // Copia cifrando; el original solo se borra cuando todo lo de esa ruta quedó cifrado
        const sube = async (abs, nombre, parent) => {
          const st = await fsp.stat(abs);
          if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
          if (st.isDirectory()) {
            const carpeta = { id: newId(), type: 'folder', name: nombreLibre(idx, parent, nombreOk(nombre)), parent, createdAt: Date.now(), modifiedAt: Date.now() };
            idx.items.push(carpeta);
            for (const h of await fsp.readdir(abs, { withFileTypes: true })) { if (!h.name.startsWith('.')) await sube(path.join(abs, h.name), h.name, carpeta.id); }
          } else {
            const id = newId();
            const tam = await cifraArchivo(req.user, dek, abs, id);
            let thumb = false;
            if (sharp && /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(nombre) && st.size <= 25 * 1024 * 1024) {
              try {
                const mini = await sharp(abs, { limitInputPixels: 64e6, failOn: 'none' }).rotate().resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
                await fsp.writeFile(thumbFile(req.user, id), sellar(dek, mini, `t:${id}`), { mode: 0o600 }); thumb = true;
              } catch { /* sin miniatura */ }
            }
            idx.items.push({ id, type: 'file', name: nombreLibre(idx, parent, nombreOk(nombre)), parent, size: tam, thumb, createdAt: Date.now(), modifiedAt: Date.now() });
          }
        };
        for (const rel of rutas) {
          const abs = resolveFor(req.user, rel);
          if (abs === userRoot(req.user)) continue;
          await sube(abs, path.basename(abs), destino);
          retirados.push({ rel: String(rel), abs });
          movidos++;
        }
      });
      // Ahora que el índice ya está guardado, se borran los originales
      for (const r of retirados) { await fsp.rm(r.abs, { recursive: true, force: true }); if (alRetirar) { try { await alRetirar(req.user, r.rel); } catch {} } }
      registrarActividad(req, 'caja_importar', { n: movidos });
      res.json({ ok: true, moved: movidos });
    } catch (err) { errorVault(res, err); }
  });

  // Sacar de la caja a tus archivos (descifra). Con move=true se quita de la caja.
  router.post('/vault/export', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 500) : [];
      const destRel = String(req.body.dest || '');
      const destAbs = resolveFor(req.user, destRel);
      await fsp.mkdir(destAbs, { recursive: true });
      const idx = await leeIndice(req.user, dek);
      let n = 0;
      const libre = async (dir, nombre) => {
        const ext = path.extname(nombre), base = path.basename(nombre, ext); let obj = path.join(dir, nombre), k = 1;
        while (await fsp.access(obj).then(() => true, () => false)) obj = path.join(dir, `${base} (${k++})${ext}`);
        return obj;
      };
      const saca = async (it, dir) => {
        if (it.type === 'folder') {
          const carpeta = await libre(dir, it.name); await fsp.mkdir(carpeta);
          for (const h of hijos(idx, it.id)) await saca(h, carpeta);
          return;
        }
        const obj = await libre(dir, it.name);
        const fh = await fsp.open(binFile(req.user, it.id), 'r');
        const out = fs.createWriteStream(obj);
        try {
          const nChunks = Math.max(Math.ceil(it.size / CHUNK), 1);
          for (let i = 0; i < nChunks; i++) { const p = await leeRegistro(fh, it.id, dek, i, it.size); if (!out.write(p)) await new Promise(r => out.once('drain', r)); }
          await new Promise((r, j) => { out.end(); out.on('finish', r); out.on('error', j); });
        } finally { await fh.close(); }
        n++;
      };
      for (const id of ids) { const it = idx.items.find(i => i.id === id); if (it) await saca(it, destAbs); }
      if (req.body.move) {
        const quitar = [];
        await mutaIndice(req.user, dek, (ix) => {
          const fuera = new Set();
          for (const id of ids) { const it = ix.items.find(i => i.id === id); if (it) { fuera.add(it.id); descendientes(ix, it.id).forEach(d => fuera.add(d.id)); } }
          ix.items.filter(i => fuera.has(i.id) && i.type === 'file').forEach(i => quitar.push(i.id));
          ix.items = ix.items.filter(i => !fuera.has(i.id));
        });
        await quitaDatos(req.user, quitar);
      }
      registrarActividad(req, 'caja_exportar', { n });
      res.json({ ok: true, exported: n });
    } catch (err) { errorVault(res, err); }
  });

  return {
    router,
    cierraSesion: (jti) => abiertas.delete(jti),
    // Solo pruebas / diagnóstico
    estaAbierta: (jti) => abiertas.has(jti),
  };
}

module.exports = createVault;
