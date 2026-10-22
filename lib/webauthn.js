'use strict';
// Passkeys (WebAuthn): entrar con Face ID, Touch ID, huella dactilar, Windows Hello o una llave
// de seguridad, sin escribir la contraseña. La contraseña sigue funcionando siempre.
//
// Se implementa con el módulo crypto de Node, sin dependencias: el servidor solo guarda la clave
// PÚBLICA de cada dispositivo; la clave privada y la biometría no salen nunca del móvil.
// Se pide siempre verificación de usuario (huella/cara/PIN del dispositivo), por lo que una
// passkey equivale a contraseña + segundo factor y no se vuelve a pedir el código TOTP.
const fs = require('fs');
const crypto = require('crypto');
const { HttpError, cleanStr, newId } = require('./store');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

/* ---------- CBOR mínimo (lo que usan attestationObject y las claves COSE) ---------- */
function cbor(buf, off = 0) {
  const ib = buf[off++]; const mayor = ib >> 5; let ai = ib & 31;
  const lee = (n) => { const v = n === 1 ? buf[off] : n === 2 ? buf.readUInt16BE(off) : n === 4 ? buf.readUInt32BE(off) : Number(buf.readBigUInt64BE(off)); off += n; return v; };
  if (ai === 24) ai = lee(1); else if (ai === 25) ai = lee(2); else if (ai === 26) ai = lee(4); else if (ai === 27) ai = lee(8);
  else if (ai > 27) throw new Error('CBOR no admitido');
  switch (mayor) {
    case 0: return [ai, off];
    case 1: return [-1 - ai, off];
    case 2: { const v = buf.subarray(off, off + ai); return [v, off + ai]; }
    case 3: { const v = buf.subarray(off, off + ai).toString('utf8'); return [v, off + ai]; }
    case 4: { const a = []; for (let i = 0; i < ai; i++) { const [v, o] = cbor(buf, off); a.push(v); off = o; } return [a, off]; }
    case 5: { const m = new Map(); for (let i = 0; i < ai; i++) { const [k, o1] = cbor(buf, off); const [v, o2] = cbor(buf, o1); m.set(k, v); off = o2; } return [m, off]; }
    case 7: return [ai === 20 ? false : ai === 21 ? true : null, off];
    default: throw new Error('CBOR no admitido');
  }
}

// Clave COSE -> JWK de Node. Se admiten ES256 (la habitual), RS256 y EdDSA.
function coseAJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7 && m.get(-1) === 1) return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg, jwk: { kty: 'RSA', n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  if (kty === 1 && alg === -8 && m.get(-1) === 6) return { alg, jwk: { kty: 'OKP', crv: 'Ed25519', x: b64u(m.get(-2)) } };
  throw new HttpError(400, 'Este dispositivo usa un tipo de clave no admitido');
}

function parseAuthData(ad) {
  if (ad.length < 37) throw new HttpError(400, 'Datos del autenticador no válidos');
  const r = { rpIdHash: ad.subarray(0, 32), flags: ad[32], counter: ad.readUInt32BE(33) };
  r.up = !!(r.flags & 1); r.uv = !!(r.flags & 4); r.at = !!(r.flags & 64);
  return r;
}

function createWebAuthn({ express, auth, file, loadUsers, abreSesion, isBlocked, registerFailure, clearFailures, sendError, registrarActividad }) {
  const router = express.Router();
  let data = { users: {} };
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); if (!data.users) data = { users: {} }; } catch { /* aún no hay passkeys */ }
  const guarda = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); };
  const de = (nombre) => { if (!data.users[nombre]) data.users[nombre] = { handle: b64u(crypto.randomBytes(32)), creds: [] }; return data.users[nombre]; };

  const rpIdDe = (req) => process.env.WEBAUTHN_RP_ID || req.hostname;
  const origenDe = (req) => process.env.WEBAUTHN_ORIGIN || `${req.protocol}://${req.get('host')}`;

  // Retos de un solo uso, 5 minutos de vida
  const retos = new Map();
  const nuevoReto = (extra) => {
    const ahora = Date.now();
    for (const [k, v] of retos) if (v.expira < ahora) retos.delete(k);
    if (retos.size > 5000) throw new HttpError(429, 'Demasiadas solicitudes');
    const id = b64u(crypto.randomBytes(16)); const challenge = b64u(crypto.randomBytes(32));
    retos.set(id, { challenge, expira: ahora + 5 * 60000, ...extra });
    return { id, challenge };
  };
  const consumeReto = (id, tipo) => {
    const r = retos.get(String(id)); retos.delete(String(id));
    if (!r || r.expira < Date.now() || r.tipo !== tipo) throw new HttpError(400, 'La solicitud caducó: vuelve a intentarlo');
    return r;
  };

  function validaClientData(raw, tipo, reto, req) {
    let cd;
    try { cd = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { throw new HttpError(400, 'Respuesta no válida'); }
    if (cd.type !== tipo) throw new HttpError(400, 'Tipo de operación incorrecto');
    if (cd.challenge !== reto.challenge) throw new HttpError(400, 'El reto no coincide');
    if (cd.origin !== origenDe(req)) throw new HttpError(400, 'El origen no coincide con esta web');
    if (cd.crossOrigin === true) throw new HttpError(400, 'Operación desde otro origen');
  }
  const comprueba = (ad, req) => {
    if (!crypto.timingSafeEqual(ad.rpIdHash, sha256(rpIdDe(req)))) throw new HttpError(400, 'El dominio del dispositivo no coincide con esta web');
    if (!ad.up) throw new HttpError(400, 'Falta la confirmación del usuario');
    if (!ad.uv) throw new HttpError(400, 'Hace falta verificar con huella, cara o PIN del dispositivo');
  };

  /* ---------- Alta de un dispositivo (hay que estar con sesión) ---------- */
  router.post('/passkeys/register/options', auth, (req, res) => {
    try {
      const u = de(req.user.username);
      if (u.creds.length >= 20) throw new HttpError(400, 'Demasiados dispositivos registrados');
      const r = nuevoReto({ tipo: 'reg', user: req.user.username });
      res.json({
        challengeId: r.id,
        publicKey: {
          challenge: r.challenge,
          rp: { name: 'KookyeCatCloud', id: rpIdDe(req) },
          user: { id: u.handle, name: req.user.username, displayName: req.user.username },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }, { type: 'public-key', alg: -8 }],
          authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
          excludeCredentials: u.creds.map(c => ({ type: 'public-key', id: c.id, transports: c.transports || undefined })),
          attestation: 'none', timeout: 120000,
        },
      });
    } catch (err) { sendError(res, err); }
  });

  router.post('/passkeys/register/verify', auth, express.json({ limit: '100kb' }), (req, res) => {
    try {
      const reto = consumeReto(req.body.challengeId, 'reg');
      if (reto.user !== req.user.username) throw new HttpError(403, 'Solicitud de otro usuario');
      const cred = req.body.credential || {};
      const resp = cred.response || {};
      validaClientData(resp.clientDataJSON, 'webauthn.create', reto, req);
      const [att] = cbor(Buffer.from(String(resp.attestationObject || ''), 'base64url'));
      const authData = att.get('authData');
      if (!Buffer.isBuffer(authData) && !(authData instanceof Uint8Array)) throw new HttpError(400, 'Datos del autenticador no válidos');
      const ad = parseAuthData(Buffer.from(authData));
      comprueba(ad, req);
      if (!ad.at) throw new HttpError(400, 'El dispositivo no envió su clave');
      const idLen = Buffer.from(authData).readUInt16BE(53);
      const credId = Buffer.from(authData).subarray(55, 55 + idLen);
      if (b64u(credId) !== cred.id) throw new HttpError(400, 'El identificador no coincide');
      const [cose] = cbor(Buffer.from(authData), 55 + idLen);
      const { alg, jwk } = coseAJwk(cose);
      crypto.createPublicKey({ key: jwk, format: 'jwk' });          // comprueba que la clave es válida
      for (const us of Object.values(data.users)) if (us.creds.some(c => c.id === cred.id)) throw new HttpError(409, 'Este dispositivo ya está registrado');
      const u = de(req.user.username);
      const nuevo = { id: cred.id, name: cleanStr(req.body.name, 60).trim() || 'Mi dispositivo', alg, jwk, counter: ad.counter,
        transports: Array.isArray(resp.transports) ? resp.transports.map(t => String(t).slice(0, 20)).slice(0, 5) : [], createdAt: Date.now(), lastUsedAt: 0 };
      u.creds.push(nuevo);
      guarda();
      registrarActividad(req, 'passkey_creada', { name: nuevo.name });
      res.json({ ok: true, passkey: { id: nuevo.id, name: nuevo.name, createdAt: nuevo.createdAt } });
    } catch (err) { sendError(res, err.status ? err : new HttpError(400, 'No se pudo registrar el dispositivo')); }
  });

  /* ---------- Gestión ---------- */
  const publica = (c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, transports: c.transports });
  router.get('/passkeys', auth, (req, res) => { try { res.json({ passkeys: de(req.user.username).creds.map(publica) }); } catch (err) { sendError(res, err); } });
  router.put('/passkeys/:id', auth, express.json(), (req, res) => {
    try {
      const c = de(req.user.username).creds.find(x => x.id === req.params.id);
      if (!c) throw new HttpError(404, 'No encontrado');
      c.name = cleanStr(req.body.name, 60).trim() || c.name; guarda();
      res.json({ ok: true, passkey: publica(c) });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/passkeys/:id', auth, (req, res) => {
    try {
      const u = de(req.user.username);
      u.creds = u.creds.filter(c => c.id !== req.params.id); guarda();
      registrarActividad(req, 'passkey_eliminada', {});
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Entrar con passkey (público) ---------- */
  router.post('/passkeys/login/options', (req, res) => {
    try {
      const wait = isBlocked(`ip:${req.ip}`);
      if (wait) return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(wait / 60)} min.` });
      const r = nuevoReto({ tipo: 'login' });
      res.json({ challengeId: r.id, publicKey: { challenge: r.challenge, rpId: rpIdDe(req), userVerification: 'required', timeout: 120000, allowCredentials: [] } });
    } catch (err) { sendError(res, err); }
  });

  router.post('/passkeys/login/verify', express.json({ limit: '100kb' }), (req, res) => {
    const ipKey = `ip:${req.ip}`;
    try {
      const wait = isBlocked(ipKey);
      if (wait) return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(wait / 60)} min.` });
      const reto = consumeReto(req.body.challengeId, 'login');
      const cred = req.body.credential || {};
      const resp = cred.response || {};
      let dueno = null, c = null;
      for (const [nombre, us] of Object.entries(data.users)) { const f = us.creds.find(x => x.id === cred.id); if (f) { dueno = nombre; c = f; break; } }
      if (!c) throw new HttpError(401, 'Este dispositivo no está registrado');
      validaClientData(resp.clientDataJSON, 'webauthn.get', reto, req);
      const authData = Buffer.from(String(resp.authenticatorData || ''), 'base64url');
      const ad = parseAuthData(authData);
      comprueba(ad, req);
      const firmado = Buffer.concat([authData, sha256(Buffer.from(String(resp.clientDataJSON), 'base64url'))]);
      const clave = crypto.createPublicKey({ key: c.jwk, format: 'jwk' });
      const sig = Buffer.from(String(resp.signature || ''), 'base64url');
      const bien = c.alg === -8 ? crypto.verify(null, firmado, clave, sig) : crypto.verify('sha256', firmado, clave, sig);
      if (!bien) throw new HttpError(401, 'La firma no es válida');
      // Un contador que no avanza indica una clave clonada
      if ((ad.counter !== 0 || c.counter !== 0) && ad.counter <= c.counter) throw new HttpError(401, 'El dispositivo parece clonado: acceso denegado');
      const user = loadUsers().find(u => u.username === dueno);
      if (!user) throw new HttpError(401, 'El usuario ya no existe');
      c.counter = ad.counter; c.lastUsedAt = Date.now(); guarda();
      clearFailures(ipKey);
      abreSesion(req, res, user, 'login_passkey');
      res.json({ ok: true, username: user.username, role: user.role });
    } catch (err) {
      registerFailure(ipKey);
      const e = err.status ? err : new HttpError(401, 'No se pudo verificar la passkey');
      res.status(e.status === 400 ? 401 : e.status).json({ error: e.message });
    }
  });

  return { router, quitaUsuario(nombre) { if (data.users[nombre]) { delete data.users[nombre]; guarda(); } }, b64u };
}

module.exports = createWebAuthn;
module.exports.cbor = cbor;
