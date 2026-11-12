'use strict';
// Búsqueda · índice invertido en memoria con puntuación BM25. Se construye con una lista de documentos
// { fuente, id, sub, titulo, texto, fecha } y responde consultas con prefijos (la última palabra) y tolerancia a erratas.
const { palabras, plano, cercana, fragmento } = require('./texto');

const K1 = 1.2, B = 0.75, PESO_TITULO = 4;

class Indice {
  constructor(docs) {
    this.docs = docs;
    this.post = new Map();     // palabra -> Map(docIdx -> frecuencia ponderada)
    this.largo = new Float64Array(docs.length);
    let suma = 0;
    docs.forEach((d, i) => {
      const f = new Map();
      for (const p of palabras(d.titulo)) f.set(p, (f.get(p) || 0) + PESO_TITULO);
      for (const p of palabras(d.texto)) f.set(p, (f.get(p) || 0) + 1);
      let l = 0;
      for (const [p, n] of f) { l += n; let m = this.post.get(p); if (!m) this.post.set(p, (m = new Map())); m.set(i, n); }
      this.largo[i] = l; suma += l;
      d.planoTitulo = plano(d.titulo);
    });
    this.medio = docs.length ? suma / docs.length || 1 : 1;
    this.vocab = [...this.post.keys()];
  }

  // Palabras del índice que encajan con una palabra de la consulta: exacta, prefijo (si es la última) o parecida
  _terminos(p, ultima) {
    if (this.post.has(p)) return [p];
    const out = [];
    if (ultima && p.length >= 2) for (const v of this.vocab) { if (v.startsWith(p)) { out.push(v); if (out.length >= 25) break; } }
    if (!out.length && p.length >= 5) for (const v of this.vocab) { if (v[0] === p[0] && cercana(p, v)) { out.push(v); if (out.length >= 8) break; } }
    return out;
  }

  /** Devuelve [{ doc, puntos, terminos }] ordenado. `fuentes` (Set) limita los módulos. */
  busca(consulta, { fuentes = null, limite = 60 } = {}) {
    const q = palabras(consulta);
    if (!q.length || !this.docs.length) return [];
    const N = this.docs.length;
    const puntos = new Map(), cubre = new Map(), usados = new Set();
    q.forEach((p, qi) => {
      const ts = this._terminos(p, qi === q.length - 1);
      const vistos = new Set();
      for (const t of ts) {
        usados.add(t);
        const m = this.post.get(t);
        const idf = Math.log(1 + (N - m.size + 0.5) / (m.size + 0.5));
        const peso = t === p ? 1 : 0.7;
        for (const [i, f] of m) {
          if (fuentes && !fuentes.has(this.docs[i].fuente)) continue;
          const s = idf * peso * (f * (K1 + 1)) / (f + K1 * (1 - B + B * this.largo[i] / this.medio));
          puntos.set(i, (puntos.get(i) || 0) + s);
          if (!vistos.has(i)) { vistos.add(i); cubre.set(i, (cubre.get(i) || 0) + 1); }
        }
      }
    });
    const minimo = Math.ceil(q.length / 2);
    const frase = plano(consulta).trim();
    const res = [];
    for (const [i, s] of puntos) {
      const c = cubre.get(i) || 0;
      if (c < minimo) continue;
      const d = this.docs[i];
      let v = s * (0.5 + 0.5 * c / q.length);
      if (frase.length > 2 && d.planoTitulo.includes(frase)) v *= 1.6;
      res.push({ doc: d, puntos: v });
    }
    res.sort((a, b) => b.puntos - a.puntos || (b.doc.fecha || 0) - (a.doc.fecha || 0));
    const terminos = [...usados];
    return res.slice(0, limite).map(r => ({ ...r, terminos }));
  }

  resultado(r) {
    const d = r.doc;
    const planoQ = r.terminos;
    return {
      fuente: d.fuente, id: d.id, sub: d.sub || null, titulo: d.titulo || '(sin título)', fecha: d.fecha || 0,
      puntos: Math.round(r.puntos * 100) / 100, ...{ extracto: fragmento(d.texto, planoQ), titulo_marcas: fragmento(d.titulo, planoQ, 200).marcas },
    };
  }
}

module.exports = { Indice };
