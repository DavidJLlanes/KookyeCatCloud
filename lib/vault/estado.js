'use strict';
// estado: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const { HttpError } = require('../nucleo/store');
const { IDLE_MS, KDF, MIN_PASS, abrir, scrypt, sellar } = require('./constantes');

function monta(ctx) {
  const { abiertas, auth, dirVault, escribeAtomico, existe, express, guardaIndice, intentos, metaFile, registrarActividad, router, sendError, sesionKey } = ctx;

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
      await escribeAtomico(metaFile(req.user), JSON.stringify(await creaMeta(pass, dek)));
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
      await escribeAtomico(metaFile(req.user), JSON.stringify({ ...(await creaMeta(nueva, r.dek)), createdAt: r.meta.createdAt }));
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


  return { creaMeta, abreConPass, validaPass };
}

module.exports = monta;
