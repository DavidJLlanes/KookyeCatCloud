'use strict';
// Prompts parecidos (similitud de Jaccard sobre palabras).
const store = require('../store');
const { HttpError } = store;

function montaParecidos(ctx) {
  const { express, indice, router, sendError } = ctx;

  /* ---------- Parecidos ----------
     Similitud de Jaccard sobre las palabras (3+ letras) del título y el texto. Sirve para avisar al guardar un prompt
     casi idéntico a otro. Con decenas de miles de prompts sigue siendo cuestión de milisegundos. */
  const palabrasDe = (t) => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9ñ]{3,}/g) || []);
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let n = 0; const [c, g] = a.size < b.size ? [a, b] : [b, a];
    for (const x of c) if (g.has(x)) n++;
    return n / (a.size + b.size - n);
  }
  router.post('/similar', express.json({ limit: '300kb' }), async (req, res) => {
    try {
      const mio = palabrasDe(`${req.body.title || ''} ${req.body.body || ''}`);
      const min = Math.min(Math.max(Number(req.body.min) || 0.6, 0.3), 1);
      const excl = String(req.body.excludeId || '');
      const out = [];
      if (mio.size >= 4) {
        for (const p of (await indice(req.user)).values()) {
          if (p.deletedAt || p.id === excl) continue;
          const sc = jaccard(mio, palabrasDe(`${p.title} ${p.body}`));
          if (sc >= min) out.push({ id: p.id, title: p.title, score: Math.round(sc * 100), kind: p.kind });
        }
      }
      out.sort((a, b) => b.score - a.score);
      res.json({ items: out.slice(0, 5) });
    } catch (err) { sendError(res, err); }
  });
  // Los parecidos de un prompt concreto, para la ficha: se buscan con un umbral más bajo
  router.get('/:id/similar', async (req, res) => {
    try {
      const items = await indice(req.user);
      const p = items.get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      const mio = palabrasDe(`${p.title} ${p.body}`);
      const out = [];
      for (const o of items.values()) {
        if (o.deletedAt || o.id === p.id) continue;
        const sc = jaccard(mio, palabrasDe(`${o.title} ${o.body}`));
        if (sc >= 0.45) out.push({ id: o.id, title: o.title, score: Math.round(sc * 100), kind: o.kind });
      }
      out.sort((a, b) => b.score - a.score);
      res.json({ items: out.slice(0, 6) });
    } catch (err) { sendError(res, err); }
  });

  return { palabrasDe, jaccard };
}

module.exports = { montaParecidos };
