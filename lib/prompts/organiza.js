'use strict';
// Categorías y listas, fragmentos {{@nombre}} y vistas guardadas.
const store = require('../store');
const { newId, HttpError, cleanColor, cleanStr, cleanIds } = store;
const { MAX_VISTAS } = require('./constantes');

function montaOrganiza(ctx) {
  const { descendientesCat, express, guarda, indice, mutaMeta, router, sendError } = ctx;

  /* ---------- Categorías y listas ---------- */
  function crudMeta(clave, plural, conPadre) {
    router.post(`/${plural}`, express.json(), async (req, res) => {
      try {
        const name = cleanStr(req.body.name, 60).trim();
        if (!name) throw new HttpError(400, 'Falta el nombre');
        const r = await mutaMeta(req.user, (m) => {
          if (m[clave].length >= 300) throw new HttpError(400, 'Demasiados elementos');
          const e = { id: newId(), name, emoji: cleanStr(req.body.emoji, 8), color: cleanColor(req.body.color, '#6366f1') };
          if (conPadre) e.parent = m.categories.some(c => c.id === req.body.parent) ? req.body.parent : '';
          m[clave].push(e);
          return e;
        });
        res.json({ ok: true, item: r });
      } catch (err) { sendError(res, err); }
    });
    router.put(`/${plural}/:id`, express.json(), async (req, res) => {
      try {
        const r = await mutaMeta(req.user, (m) => {
          const e = m[clave].find(x => x.id === req.params.id);
          if (!e) throw new HttpError(404, 'No encontrado');
          if (req.body.name !== undefined) e.name = cleanStr(req.body.name, 60).trim() || e.name;
          if (req.body.emoji !== undefined) e.emoji = cleanStr(req.body.emoji, 8);
          if (req.body.color !== undefined) e.color = cleanColor(req.body.color, e.color);
          if (conPadre && req.body.parent !== undefined) {
            const nuevo = req.body.parent || '';
            // Un padre no puede ser la propia categoría ni uno de sus descendientes
            if (nuevo && (nuevo === e.id || descendientesCat(m, e.id).has(nuevo))) throw new HttpError(400, 'Padre no válido');
            e.parent = m.categories.some(c => c.id === nuevo) ? nuevo : '';
          }
          return e;
        });
        res.json({ ok: true, item: r });
      } catch (err) { sendError(res, err); }
    });
    router.delete(`/${plural}/:id`, async (req, res) => {
      try {
        let heredero = '';
        await mutaMeta(req.user, (m) => {
          if (conPadre) {
            // Las subcategorías y los prompts suben un nivel en vez de quedarse huérfanos
            heredero = (m.categories.find(c => c.id === req.params.id) || {}).parent || '';
            m.categories.forEach(c => { if (c.parent === req.params.id) c.parent = heredero; });
          }
          m[clave] = m[clave].filter(x => x.id !== req.params.id);
        });
        for (const p of (await indice(req.user)).values()) {
          if (conPadre && p.category === req.params.id) p.category = heredero;
          else if (!conPadre && p.lists.includes(req.params.id)) p.lists = p.lists.filter(l => l !== req.params.id);
          else continue;
          await guarda(req.user, p);
        }
        res.json({ ok: true });
      } catch (err) { sendError(res, err); }
    });
  }
  crudMeta('categories', 'categories', true);
  crudMeta('lists', 'lists', false);

  /* ---------- Fragmentos: {{@nombre}} ----------
     Un prompt de tipo "fragmento" (un rol, un formato de salida, un estilo…) se inserta en otros con {{@titulo-en-minusculas}}.
     Al copiar, exportar o compartir se sustituye por su texto actual, así que editar el fragmento actualiza todos los usos. */
  const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const RE_FRAG = /\{\{@([a-z0-9-]{1,60})\}\}/g;
  async function mapaFragmentos(user) {
    const m = new Map();
    for (const p of (await indice(user)).values()) if (!p.deletedAt && p.kind === 'fragmento') { const k = slug(p.title); if (k && !m.has(k)) m.set(k, p.body || ''); }
    return m;
  }
  function expande(texto, frags, nivel = 0) {
    if (!texto || nivel > 3) return texto || '';
    return String(texto).replace(RE_FRAG, (m, k) => (frags.has(k) ? expande(frags.get(k), frags, nivel + 1) : m));
  }
  router.get('/fragments', async (req, res) => {
    try {
      const out = [];
      for (const p of (await indice(req.user)).values()) if (!p.deletedAt && p.kind === 'fragmento') out.push({ id: p.id, title: p.title, slug: slug(p.title), body: p.body || '' });
      out.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      res.json({ items: out });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Vistas guardadas (combinaciones de filtros con nombre) ---------- */
  router.post('/views', express.json({ limit: '20kb' }), async (req, res) => {
    try {
      const name = cleanStr(req.body.name, 60).trim();
      if (!name) throw new HttpError(400, 'Falta el nombre');
      const q = req.body.q && typeof req.body.q === 'object' ? req.body.q : {};
      const guardado = JSON.parse(JSON.stringify(q));
      if (JSON.stringify(guardado).length > 4000) throw new HttpError(400, 'Vista demasiado grande');
      const v = await mutaMeta(req.user, (m) => {
        m.views = m.views || [];
        if (m.views.length >= MAX_VISTAS) throw new HttpError(400, 'Demasiadas vistas guardadas');
        const e = { id: newId(), name, q: guardado, labels: cleanIds(req.body.labels) };
        m.views.push(e);
        return e;
      });
      res.json({ ok: true, view: v });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/views/:id', async (req, res) => {
    try {
      await mutaMeta(req.user, (m) => { m.views = (m.views || []).filter(v => v.id !== req.params.id); });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return { crudMeta, slug, RE_FRAG, mapaFragmentos, expande };
}

module.exports = { montaOrganiza };
