'use strict';
// Constantes y utilidades puras del módulo.
const crypto = require('crypto');
const { Transform } = require('stream');

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

module.exports = { MAGIC, CHUNK, REG_FIJO, KDF, IDLE_MS, MAX_ITEMS, MIN_PASS, MIME_SEGURO, extDe, scrypt, sellar, abrir, CifraChunks };
