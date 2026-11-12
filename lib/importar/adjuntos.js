'use strict';
// Importar · adjuntos (imágenes y archivos que citan las notas). El texto lleva «@adj/<n>» y, al importar, se sustituye por la
// ruta real del archivo en «Adjuntos de notas». Se guardan una sola vez por contenido y solo si algún texto los cita.
const crypto = require('crypto');
const MAX_TOTAL = 200 * 1024 * 1024;

class Adjuntos {
  constructor() { this.porId = new Map(); this.porHash = new Map(); this.total = 0; this.rechazados = 0; }
  add(nombre, buf) {
    const h = crypto.createHash('sha1').update(buf).digest('hex');
    if (this.porHash.has(h)) return this.porHash.get(h);
    if (this.total + buf.length > MAX_TOTAL) { this.rechazados++; return null; }
    const id = '@adj/' + (this.porId.size + 1);
    this.porId.set(id, { nombre: String(nombre || 'adjunto'), buf }); this.porHash.set(h, id); this.total += buf.length;
    return id;
  }
  get(id) { return this.porId.get(id); }
  // Para pasar de un hilo a otro (lib/importar/hilo.js)
  exporta() { return { lista: [...this.porId.entries()], total: this.total, rechazados: this.rechazados }; }
  static desde(d, aBuffer) {
    const a = new Adjuntos();
    for (const [id, v] of d.lista) a.porId.set(id, { nombre: v.nombre, buf: aBuffer(v.buf) });
    a.total = d.total; a.rechazados = d.rechazados;
    return a;
  }
  /** Solo los citados en estos textos */
  citados(textos) {
    const usados = new Set();
    for (const t of textos) for (const m of String(t).matchAll(/@adj\/\d+/g)) usados.add(m[0]);
    return usados;
  }
}

module.exports = { Adjuntos };
