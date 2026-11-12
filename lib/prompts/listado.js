'use strict';
// Listado con facetas, metadatos, tipos y estadísticas.
const store = require('../nucleo/store');
const path = require('path');
const Vc = require('../../public/js/valores/clave');
const { kccDir, readJson, HttpError, cleanStr, cleanIds } = store;
const { MAX_IMAGENES, IMG_MAX, TIPOS, TIPOS_BASE, ICONOS_TIPO, normalizaTipos, ESTADOS } = require('./constantes');

function montaListado(ctx) {
  const { descendientesCat, express, indice, leeMeta, ligero, mutaMeta, router, sendError, sharp, userRoot } = ctx;

  /* ---------- Listado y facetas ---------- */
  router.get('/', async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const q = req.query;
      const palabras = cleanStr(q.q, 200).toLowerCase().split(/\s+/).filter(Boolean);
      const etiquetas = cleanIds(String(q.labels || '').split(','));
      const cats = q.category === '__none' ? null : (q.category ? descendientesCat(meta, String(q.category)) : undefined);
      const papelera = q.trash === '1';
      if (papelera) await ctx.core.limpiaPapelera(req.user);
      const desde = q.from ? Date.parse(q.from) : 0;
      const hasta = q.to ? Date.parse(q.to) + 86400000 : Infinity;
      const minRating = parseInt(q.minRating, 10) || 0;

      let lista = [];
      for (const p of items.values()) {
        if (!!p.deletedAt !== papelera) continue;
        if (q.kind && p.kind !== q.kind) continue;
        if (q.status && p.status !== q.status) continue;
        if (q.model && Vc.clave(p.model) !== Vc.clave(q.model)) continue;
        if (q.tool && Vc.clave(p.tool) !== Vc.clave(q.tool)) continue;
        if (q.language && Vc.clave(p.language) !== Vc.clave(q.language)) continue;
        if (q.fav === '1' && !p.favorite) continue;
        if (q.list && !p.lists.includes(q.list)) continue;
        if (cats === null ? p.category : (cats && !cats.has(p.category))) continue;
        if (etiquetas.length && !etiquetas.every(l => p.labels.includes(l))) continue;
        if (minRating && p.rating < minRating) continue;
        if (q.images === '1' && !p.images.length) continue;
        if (q.images === '0' && p.images.length) continue;
        if (q.cal === '1' && !p.cal) continue;
        if (p.createdAt < desde || p.createdAt >= hasta) continue;
        if (palabras.length) {
          const pajar = `${p.title}\n${p.body}\n${p.system || ''}\n${p.negative}\n${p.notes}\n${p.model}\n${p.tool}\n${p.source}\n${(p.outputs || []).map(x => x.text).join('\n')}`.toLowerCase();
          if (!palabras.every(w => pajar.includes(w))) continue;
        }
        lista.push(p);
      }
      const orden = String(q.sort || 'updated');
      const cmp = {
        updated: (a, b) => b.updatedAt - a.updatedAt,
        created: (a, b) => b.createdAt - a.createdAt,
        oldest: (a, b) => a.createdAt - b.createdAt,
        title: (a, b) => a.title.localeCompare(b.title, 'es'),
        rating: (a, b) => b.rating - a.rating || b.updatedAt - a.updatedAt,
        uses: (a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt,
      }[orden] || ((a, b) => b.updatedAt - a.updatedAt);
      lista.sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
      const total = lista.length;
      const limit = Math.min(Math.max(parseInt(q.limit, 10) || 48, 1), 200);
      const page = Math.max(parseInt(q.page, 10) || 1, 1);
      lista = lista.slice((page - 1) * limit, page * limit);
      res.json({ items: lista.map(ligero), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
    } catch (err) { sendError(res, err); }
  });

  // Categorías, listas y cuántos prompts hay en cada cosa (para la barra lateral)
  router.get('/meta', async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const f = { total: 0, trash: 0, favorites: 0, noCategory: 0, withImages: 0, category: {}, kind: {}, status: {}, model: {}, tool: {}, label: {}, list: {} };
      const inc = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
      for (const p of items.values()) {
        if (p.deletedAt) { f.trash++; continue; }
        f.total++;
        if (p.favorite) f.favorites++;
        if (!p.category) f.noCategory++;
        if (p.images.length) f.withImages++;
        inc(f.category, p.category); inc(f.kind, p.kind); inc(f.status, p.status); inc(f.model, p.model); inc(f.tool, p.tool);
        p.labels.forEach(l => inc(f.label, l));
        p.lists.forEach(l => inc(f.list, l));
      }
      res.json({ categories: meta.categories, lists: meta.lists, facets: f, kinds: TIPOS, kindDefs: meta.kinds, statuses: ESTADOS,
        limits: { images: MAX_IMAGENES, imageMax: IMG_MAX }, canImages: !!sharp, views: meta.views || [], comfy: !!process.env.COMFY_URL });
    } catch (err) { sendError(res, err); }
  });

  // Los tipos conservan sus claves internas para no cambiar ni invalidar prompts guardados.
  router.put('/kinds', express.json(), async (req, res) => {
    try {
      if (!Array.isArray(req.body?.kinds)) throw new HttpError(400, 'Faltan los tipos');
      const entrantes = new Map(req.body.kinds.filter(x => x && typeof x === 'object').map(x => [x.id, x]));
      if (TIPOS_BASE.some(base => !entrantes.has(base.id))) throw new HttpError(400, 'La lista de tipos está incompleta');
      const nombres = new Set();
      const kinds = normalizaTipos(TIPOS_BASE.map(base => {
        const x = entrantes.get(base.id);
        const name = cleanStr(x.name, 60).trim();
        if (!name) throw new HttpError(400, 'Cada tipo necesita un nombre');
        const nombreNormalizado = name.toLocaleLowerCase('es');
        if (nombres.has(nombreNormalizado)) throw new HttpError(400, 'Los nombres de tipo deben ser distintos');
        nombres.add(nombreNormalizado);
        return { id: base.id, name, icon: ICONOS_TIPO.has(x.icon) ? x.icon : base.icon };
      }));
      await mutaMeta(req.user, m => { m.kinds = kinds; });
      res.json({ kinds });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Estadísticas ----------
     Se calculan sobre el índice en memoria: recorrer decenas de miles de prompts es cosa de milisegundos. */
  router.get('/stats', async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const lbl = await readJson(path.join(kccDir(userRoot(req.user)), 'labels.json'), { labels: [] });
      const nomCat = Object.fromEntries(meta.categories.map(c => [c.id, c.name]));
      const nomLista = Object.fromEntries(meta.lists.map(l => [l.id, l.name]));
      const nomLbl = Object.fromEntries((lbl.labels || []).map(l => [l.id, l.name]));
      const cuenta = () => new Map();
      const suma = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
      const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es')).slice(0, n)
        .map(([name, count]) => ({ name, count }));

      const t = { total: 0, trash: 0, favorites: 0, withImages: 0, unused: 0, rated: 0, ratingSum: 0, versions: 0, images: 0, imageBytes: 0, uses: 0 };
      const kind = cuenta(), status = cuenta(), model = cuenta(), tool = cuenta(), cat = cuenta(), label = cuenta(), list = cuenta();
      const mes = new Map();
      const activos = [];
      for (const p of items.values()) {
        if (p.deletedAt) { t.trash++; continue; }
        t.total++;
        activos.push(p);
        if (p.favorite) t.favorites++;
        if (p.images.length) t.withImages++;
        if (!p.uses) t.unused++;
        if (p.rating) { t.rated++; t.ratingSum += p.rating; }
        t.versions += (p.versions || []).length;
        t.uses += p.uses || 0;
        for (const im of p.images) { t.images++; t.imageBytes += im.bytes || 0; }
        suma(kind, p.kind); suma(status, p.status); suma(model, p.model); suma(tool, p.tool);
        suma(cat, nomCat[p.category]);
        p.labels.forEach(l => suma(label, nomLbl[l]));
        p.lists.forEach(l => suma(list, nomLista[l]));
        const d = new Date(p.createdAt);
        suma(mes, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      // Los últimos 12 meses, también los que están vacíos, para que la gráfica no salte
      const meses = [];
      const hoy = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        meses.push({ name: k, count: mes.get(k) || 0 });
      }
      const resumen = (p) => ({ id: p.id, title: p.title, uses: p.uses || 0, rating: p.rating || 0, cover: p.cover || (p.images[0] && p.images[0].id) || '' });
      res.json({
        totals: { ...t, avgRating: t.rated ? Math.round(t.ratingSum / t.rated * 10) / 10 : 0 },
        kind: top(kind), status: top(status), model: top(model, 8), tool: top(tool, 8), category: top(cat, 8),
        label: top(label, 10), list: top(list, 8), months: meses,
        mostUsed: activos.filter(p => p.uses).sort((a, b) => b.uses - a.uses).slice(0, 8).map(resumen),
        topRated: activos.filter(p => p.rating >= 4).sort((a, b) => b.rating - a.rating || b.uses - a.uses).slice(0, 8).map(resumen),
        stale: activos.filter(p => !p.uses && p.status !== 'archivado').sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 5).map(resumen),
      });
    } catch (err) { sendError(res, err); }
  });

}

module.exports = { montaListado };
