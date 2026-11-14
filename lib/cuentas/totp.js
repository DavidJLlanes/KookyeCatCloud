'use strict';
const crypto = require('crypto');

/* ---------------- TOTP (RFC 6238), para la verificación en dos pasos ----------------
   Implementado a mano para no añadir una dependencia solo por esto: son
   40 líneas de base32 y HMAC-SHA1, ambos ya presentes en Node. */
function base32Encode(buf) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '', salida = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) salida += alfabeto[parseInt(bits.slice(i, i + 5), 2)];
  const resto = bits.length % 5;
  if (resto) salida += alfabeto[parseInt(bits.slice(-resto).padEnd(5, '0'), 2)];
  while (salida.length % 8) salida += '=';
  return salida;
}
function base32Decode(str) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpio = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of limpio) {
    const v = alfabeto.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpEn(secretBuf, contador) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codigo = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 |
                  (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return String(codigo).padStart(6, '0');
}
// Ventana de ±1 paso (30 s): cubre el desfase de reloj típico entre servidor y móvil.
// Devuelve el paso (contador de 30 s) al que corresponde el código, o 0 si no vale: quien llama puede guardar el último
// paso usado y rechazar uno igual o anterior, para que un código visto por encima del hombro no sirva otra vez.
function totpPaso(secretB32, token) {
  if (!token) return 0;
  const secretBuf = base32Decode(secretB32);
  const contador = Math.floor(Date.now() / 30000);
  const dado = Buffer.from(String(token).trim());
  for (let e = -1; e <= 1; e++) {
    const bueno = Buffer.from(totpEn(secretBuf, contador + e));
    if (dado.length === bueno.length && crypto.timingSafeEqual(dado, bueno)) return contador + e;
  }
  return 0;
}
const totpVerificar = (secretB32, token) => totpPaso(secretB32, token) > 0;

module.exports = { base32Encode, base32Decode, totpEn, totpVerificar, totpPaso };
