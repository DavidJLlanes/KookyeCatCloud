'use strict';
const crypto = require('crypto');
const store = require('./store');

/* ---------------- Sesiones ----------------
   El JWT sigue siendo la cookie, pero ya no basta por sí solo: cada uno lleva
   un jti que apunta a un registro aquí. Cerrar una sesión en remoto borra su
   registro, y el siguiente uso de ese token cae con 401 aunque no haya caducado. */
function createSesiones({ SESSIONS_FILE, cierraCaja }) {
  const sessions = store.leeJsonSync(SESSIONS_FILE, {});
  let sucio = false;
  const guarda = () => store.escribeJsonSync(SESSIONS_FILE, sessions, 0o600);
  setInterval(() => { if (sucio) { sucio = false; guarda(); } }, 5000).unref();

  function creaSesion(username, req) {
    const jti = crypto.randomBytes(16).toString('hex');
    sessions[jti] = {
      jti, username,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      ip: req.ip,
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
    };
    sucio = true;
    return jti;
  }
  function revocaSesion(jti) {
    if (!sessions[jti]) return false;
    delete sessions[jti];
    if (cierraCaja) cierraCaja(jti);               // la caja fuerte de esa sesión se vuelve a bloquear
    sucio = true;
    return true;
  }
  // Marca la sesión como vista ahora; false si ya no existe (cerrada en remoto)
  function toca(jti) {
    const s = sessions[jti];
    if (!s) return false;
    s.lastSeenAt = Date.now();
    sucio = true;
    return true;
  }
  return { sessions, creaSesion, revocaSesion, toca, marcaSucias: () => { sucio = true; } };
}

module.exports = createSesiones;
