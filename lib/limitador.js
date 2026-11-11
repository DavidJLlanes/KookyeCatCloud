'use strict';
// --- Limitador de intentos de login (en memoria) ---
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // clave -> { count, expires }

function isBlocked(key) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (Date.now() > entry.expires) { attempts.delete(key); return 0; }
  if (entry.count < MAX_ATTEMPTS) return 0;
  return Math.ceil((entry.expires - Date.now()) / 1000);
}
function registerFailure(key) {
  const entry = attempts.get(key);
  if (entry && Date.now() <= entry.expires) {
    entry.count++;
    entry.expires = Date.now() + LOCK_MS;
  } else {
    attempts.set(key, { count: 1, expires: Date.now() + LOCK_MS });
  }
}
function clearFailures(key) { attempts.delete(key); }
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (now > entry.expires) attempts.delete(key);
}, 5 * 60 * 1000).unref();

module.exports = { isBlocked, registerFailure, clearFailures };
