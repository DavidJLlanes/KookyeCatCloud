'use strict';
// Crear, leer, editar, duplicar, borrar (papelera), restaurar y operaciones en lote.
const fsp = require('fs').promises;
const path = require('path');
const store = require('../store');
const { newId, HttpError } = store;
const { MAX_PROMPTS } = require('./constantes');

function montaCrud(ctx) {
  const { calendar, express, guarda, imgDir, indice, itemFile, leeMeta, limpia, registrarActividad, router, sendError } = ctx;

  /* ---------- CRUD de prompts ---------- */
  router.get('/:id', async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      res.json(p);
    } catch (err) { sendError(res, err); }
  });

  const cuerpo = express.json({ limit: '1mb' });

  router.post('/', cuerpo, async (req, res) => {
    try {
      const items = await indice(req.user);
      if (items.size >= MAX_PROMPTS) throw new HttpError(400, 'Has alcanzado el máximo de prompts');
      const meta = await leeMeta(req.user);
      const p = limpia(req.body || {}, null, meta);
      p.id = newId();
      p.createdAt = p.updatedAt = Date.now();
      if (req.body.createdAt && Number.isFinite(+req.body.createdAt)) p.createdAt = +req.body.createdAt;
      await guarda(req.user, p);
      if (req.body.calendar) {
        p.cal = { date: req.body.calendar.date, time: req.body.calendar.time || '' };
        await calendar.sincronizaOrigen(req.user, 'prompt', p.id, p.title, req.body.calendar);
        await guarda(req.user, p);
      }
      registrarActividad(req, 'prompt_creado', { id: p.id });
      res.json({ ok: true, prompt: p });
    } catch (err) { sendError(res, err); }
  });

  router.put('/:id', cuerpo, async (req, res) => {
    try {
      const items = await indice(req.user);
      const prev = items.get(req.params.id);
      if (!prev) throw new HttpError(404, 'Prompt no encontrado');
      store.compruebaBase(prev, req);
      const meta = await leeMeta(req.user);
      const p = limpia(req.body || {}, prev, meta);
      // Historial: solo cuando cambia el texto, para poder volver atrás
      if (p.title !== prev.title || p.body !== prev.body || p.negative !== prev.negative || (p.system || '') !== (prev.system || '')) {
        p.versions = [{ at: prev.updatedAt, title: prev.title, body: prev.body, negative: prev.negative, system: prev.system || '' }, ...(prev.versions || [])].slice(0, 30);
      }
      p.updatedAt = Date.now(); store.marcaEdicion(p, req);
      const cal = req.body.calendar;
      if (cal !== undefined) p.cal = cal && cal.date ? { date: cal.date, time: cal.time || '' } : null;
      await guarda(req.user, p);
      if (cal !== undefined) await calendar.sincronizaOrigen(req.user, 'prompt', p.id, p.title, cal);
      else if (p.title !== prev.title && p.cal) await calendar.renombraOrigen(req.user, 'prompt', p.id, p.title);
      res.json({ ok: true, prompt: p });
    } catch (err) { sendError(res, err); }
  });

  // Marca uso (copiar) sin tocar updatedAt
  router.post('/:id/use', async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      p.uses = (p.uses || 0) + 1;
      p.lastUsedAt = Date.now();
      await guarda(req.user, p);
      res.json({ ok: true, uses: p.uses });
    } catch (err) { sendError(res, err); }
  });

  router.post('/:id/duplicate', async (req, res) => {
    try {
      const items = await indice(req.user);
      const orig = items.get(req.params.id);
      if (!orig) throw new HttpError(404, 'Prompt no encontrado');
      if (items.size >= MAX_PROMPTS) throw new HttpError(400, 'Has alcanzado el máximo de prompts');
      const copia = JSON.parse(JSON.stringify(orig));
      copia.id = newId();
      copia.title = `${orig.title} (copia)`.slice(0, 200);
      copia.createdAt = copia.updatedAt = Date.now();
      copia.uses = 0; copia.versions = []; copia.cal = null; copia.pinned = false; copia.codigo = []; delete copia.deletedAt; delete copia.lastUsedAt;
      // Las imágenes se copian: la copia no debe romperse si se borra el original
      const nuevas = [];
      for (const im of orig.images) {
        const id = newId();
        await fsp.mkdir(imgDir(req.user, copia.id), { recursive: true });
        await fsp.copyFile(path.join(imgDir(req.user, orig.id), `${im.id}.webp`), path.join(imgDir(req.user, copia.id), `${id}.webp`));
        await fsp.copyFile(path.join(imgDir(req.user, orig.id), `${im.id}_t.webp`), path.join(imgDir(req.user, copia.id), `${id}_t.webp`)).catch(() => {});
        nuevas.push({ ...im, id });
        if (orig.cover === im.id) copia.cover = id;
      }
      copia.images = nuevas;
      await guarda(req.user, copia);
      res.json({ ok: true, prompt: copia });
    } catch (err) { sendError(res, err); }
  });

  async function borraDefinitivo(user, p) {
    (await indice(user)).delete(p.id);
    await fsp.rm(itemFile(user, p.id), { force: true });
    await fsp.rm(imgDir(user, p.id), { recursive: true, force: true });
    await calendar.quitaOrigen(user, 'prompt', p.id);
  }

  router.delete('/:id', async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) return res.json({ ok: true });
      if (req.query.purge === '1' || p.deletedAt) await borraDefinitivo(req.user, p);
      else {
        p.deletedAt = Date.now();
        await guarda(req.user, p);
        await calendar.quitaOrigen(req.user, 'prompt', p.id);   // un prompt en la papelera no ocupa el calendario
      }
      registrarActividad(req, 'prompt_eliminado', { id: p.id });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.post('/:id/restore', async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      delete p.deletedAt;
      await guarda(req.user, p);
      if (p.cal) await calendar.sincronizaOrigen(req.user, 'prompt', p.id, p.title, p.cal);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/', async (req, res) => {       // vaciar papelera
    try {
      const items = await indice(req.user);
      let n = 0;
      for (const p of [...items.values()]) if (p.deletedAt) { await borraDefinitivo(req.user, p); n++; }
      res.json({ ok: true, removed: n });
    } catch (err) { sendError(res, err); }
  });

  // Operaciones en lote desde la selección múltiple
  router.post('/bulk', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const { ids, op, value } = req.body || {};
      if (!Array.isArray(ids) || ids.length > 1000) throw new HttpError(400, 'Selección no válida');
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      let n = 0;
      for (const id of ids) {
        const p = items.get(String(id));
        if (!p) continue;
        if (op === 'delete') {
          if (req.body.purge || p.deletedAt) await borraDefinitivo(req.user, p);
          else { p.deletedAt = Date.now(); await guarda(req.user, p); await calendar.quitaOrigen(req.user, 'prompt', p.id); }
        } else if (op === 'restore') {
          delete p.deletedAt; await guarda(req.user, p);
          if (p.cal) await calendar.sincronizaOrigen(req.user, 'prompt', p.id, p.title, p.cal);
        } else {
          const c = {
            category: { category: value },
            status: { status: value },
            kind: { kind: value },
            model: { model: value },
            tool: { tool: value },
            favorite: { favorite: !!value },
            addLabel: { labels: [...new Set([...p.labels, String(value)])] },
            removeLabel: { labels: p.labels.filter(l => l !== String(value)) },
            addList: { lists: [...new Set([...p.lists, String(value)])] },
            removeList: { lists: p.lists.filter(l => l !== String(value)) },
          }[op];
          if (!c) throw new HttpError(400, 'Operación no válida');
          const nuevo = limpia(c, p, meta);
          nuevo.updatedAt = Date.now();
          await guarda(req.user, nuevo);
        }
        n++;
      }
      res.json({ ok: true, changed: n });
    } catch (err) { sendError(res, err); }
  });

  return { cuerpo, borraDefinitivo };
}

module.exports = { montaCrud };
