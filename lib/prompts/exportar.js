'use strict';
// Exportar una selección, y exportar/importar todo.
const store = require('../store');
const path = require('path');
const { kccDir, readJson, newId, HttpError, cleanStr } = store;
const { MAX_PROMPTS } = require('./constantes');

function montaExportar(ctx) {
  const { expande, express, guarda, indice, labels, leeMeta, limpia, mapaFragmentos, mutaMeta, registrarActividad, router, sendError, userRoot } = ctx;

  /* ---------- Exportar una selección ----------
     json: reimportable. md: documento legible. ci: instrucciones listas para pegar en las "Instrucciones personalizadas"
     de ChatGPT, un Proyecto de Claude, un GPT o un Gem (usa el mensaje de sistema si existe, y si no el propio texto). */
  const nombreArchivo = (n) => String(n || 'prompts').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'prompts';
  router.post('/export', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const formato = ['json', 'md', 'ci'].includes(req.body.format) ? req.body.format : 'json';
      let elegidos = [];
      if (Array.isArray(req.body.ids) && req.body.ids.length) elegidos = req.body.ids.map(id => items.get(String(id))).filter(p => p && !p.deletedAt);
      else if (req.body.list) elegidos = [...items.values()].filter(p => !p.deletedAt && p.lists.includes(String(req.body.list)));
      else elegidos = [...items.values()].filter(p => !p.deletedAt);
      if (!elegidos.length) throw new HttpError(400, 'No hay prompts que exportar');
      elegidos.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      const frags = await mapaFragmentos(req.user);
      const catName = Object.fromEntries(meta.categories.map(c => [c.id, c.name]));
      registrarActividad(req, 'prompts_exportados', { n: elegidos.length, formato });
      if (formato === 'json') {
        const lbl = await readJson(path.join(kccDir(userRoot(req.user)), 'labels.json'), { labels: [] });
        const lblName = Object.fromEntries(lbl.labels.map(l => [l.id, l.name]));
        res.setHeader('Content-Disposition', 'attachment; filename="prompts-seleccion.json"');
        return res.json({ version: 1, prompts: elegidos.map(p => ({
          title: p.title, body: p.body, system: p.system || '', negative: p.negative, notes: p.notes, kind: p.kind, status: p.status,
          model: p.model, tool: p.tool, language: p.language, source: p.source, rating: p.rating, favorite: p.favorite,
          category: catName[p.category] || '', labels: p.labels.map(l => lblName[l]).filter(Boolean), params: p.params,
          outputs: (p.outputs || []).map(({ input, text, model, rating, best }) => ({ input, text, model, rating, best })), createdAt: p.createdAt,
        })) });
      }
      const fence = (t) => { const r = String(t).match(/`{3,}/g) || []; const m = '`'.repeat(Math.max(3, ...r.map(x => x.length + 1))); return m + '\n' + String(t) + '\n' + m; };
      let texto = '';
      if (formato === 'md') {
        texto = elegidos.map((p) => {
          const cab = [p.kind, p.model, p.tool, p.status].filter(Boolean).join(' · ');
          let b = `## ${p.title}\n\n${cab ? `*${cab}*\n\n` : ''}`;
          if (p.system) b += `**Mensaje de sistema**\n\n${fence(expande(p.system, frags))}\n\n`;
          if (p.body) b += `**${p.system ? 'Mensaje de usuario' : 'Prompt'}**\n\n${fence(expande(p.body, frags))}\n\n`;
          if (p.negative) b += `**Prompt negativo**\n\n${fence(expande(p.negative, frags))}\n\n`;
          const ps = Object.entries(p.params || {});
          if (ps.length) b += `**Parámetros**\n\n${ps.map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n`;
          if (p.notes) b += `**Notas**\n\n${p.notes}\n\n`;
          return b.trimEnd();
        }).join('\n\n---\n\n') + '\n';
      } else {
        texto = elegidos.map(p => `# ${p.title}\n\n${expande(p.system || p.body, frags)}`.trimEnd()).join('\n\n---\n\n') + '\n';
      }
      const nombre = nombreArchivo(elegidos.length === 1 ? elegidos[0].title : 'prompts') + (formato === 'ci' ? '-instrucciones' : '') + '.md';
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.send(texto);
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Importar y exportar ---------- */
  router.get('/export/all', async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const lbl = await readJson(path.join(kccDir(userRoot(req.user)), 'labels.json'), { labels: [] });
      const catName = Object.fromEntries(meta.categories.map(c => [c.id, c.name]));
      const lblName = Object.fromEntries(lbl.labels.map(l => [l.id, l.name]));
      const out = [...items.values()].filter(p => !p.deletedAt).map(p => ({
        title: p.title, body: p.body, negative: p.negative, notes: p.notes, kind: p.kind, status: p.status,
        model: p.model, tool: p.tool, language: p.language, source: p.source, rating: p.rating, favorite: p.favorite,
        category: catName[p.category] || '', labels: p.labels.map(l => lblName[l]).filter(Boolean),
        params: p.params, createdAt: p.createdAt,
      }));
      res.setHeader('Content-Disposition', 'attachment; filename="prompts.json"');
      res.json({ version: 1, prompts: out });
    } catch (err) { sendError(res, err); }
  });

  router.post('/import', express.json({ limit: '30mb' }), async (req, res) => {
    try {
      const lista = req.body && req.body.prompts;
      if (!Array.isArray(lista) || lista.length > 5000) throw new HttpError(400, 'Formato no válido (máximo 5000 por importación)');
      const items = await indice(req.user);
      let meta = await leeMeta(req.user);
      let creados = 0;
      for (const raw of lista) {
        if (items.size >= MAX_PROMPTS) break;
        if (!raw || typeof raw !== 'object' || !(raw.body || raw.title)) continue;
        // Categoría y etiquetas llegan por nombre: se crean si no existen
        let catId = '';
        const catNombre = cleanStr(raw.category, 60).trim();
        if (catNombre) {
          let c = meta.categories.find(x => x.name.toLowerCase() === catNombre.toLowerCase());
          if (!c) {
            c = await mutaMeta(req.user, (m) => {
              const e = { id: newId(), name: catNombre, emoji: '', color: '#6366f1', parent: '' };
              m.categories.push(e);
              return e;
            });
            meta = await leeMeta(req.user);
          }
          catId = c.id;
        }
        const labelIds = await labels.asegurar(req.user, (Array.isArray(raw.labels) ? raw.labels : []).slice(0, 20));
        const p = limpia({ ...raw, __recorta: true, category: catId, labels: labelIds, chain: [] }, null, meta);
        p.id = newId();
        p.createdAt = Number.isFinite(+raw.createdAt) && +raw.createdAt > 0 ? +raw.createdAt : Date.now();
        p.updatedAt = Date.now();
        await guarda(req.user, p);
        creados++;
      }
      res.json({ ok: true, created: creados });
    } catch (err) { sendError(res, err); }
  });

  return { nombreArchivo };
}

module.exports = { montaExportar };
