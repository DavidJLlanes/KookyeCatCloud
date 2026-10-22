'use strict';
// Módulo de prompts de IA. Cada prompt es un JSON propio (items/<id>.json) y se mantiene un
// índice en memoria por usuario, de modo que buscar y filtrar miles de prompts es instantáneo
// sin reescribir nunca un archivo gigante. Las imágenes de muestra se convierten a WebP.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanColor, cleanStr, cleanIds } = require('./store');

const MAX_IMAGENES = 10;
const IMG_MAX = 1600;        // lado mayor de la imagen guardada
const THUMB_MAX = 480;       // lado mayor de la miniatura
// Las subidas se procesan en memoria: 10 imágenes de 15 MB son 150 MB como máximo por petición
const IMG_MAX_BYTES = 15 * 1024 * 1024;
const IMG_MAX_PIXELS = 64e6;     // tope contra imágenes "bomba" (poco peso, gigantescas al descomprimir)
const MAX_PROMPTS = 100000;
const BODY_MAX = 100000;

const TIPOS = ['imagen', 'texto', 'codigo', 'video', 'audio', 'agente', 'otro'];
const ESTADOS = ['borrador', 'probando', 'final', 'archivado'];
const MODELOS_BASE = ['ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'DALL·E', 'Stable Diffusion', 'FLUX',
  'Sora', 'Veo', 'Runway', 'Kling', 'Suno', 'Llama', 'Mistral', 'DeepSeek', 'Grok', 'Copilot', 'Otro'];
const CATEGORIAS_BASE = [
  ['Retratos', '🧑‍🎨', '#ec4899'], ['Paisajes', '🏞️', '#22c55e'], ['Arte y estilos', '🎨', '#8b5cf6'],
  ['Diseño y logos', '✏️', '#3b82f6'], ['Programación', '💻', '#06b6d4'], ['Escritura', '📝', '#f59e0b'],
  ['Marketing', '📣', '#ef4444'], ['Productividad', '⚡', '#14b8a6'],
];

function createPrompts({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar, labels }) {
  const router = express.Router();
  const cache = new Map();   // raíz del usuario -> { items: Map, cargado: Promise }

  const dir = (user, ...sub) => kccDir(userRoot(user), 'prompts', ...sub);
  const metaFile = (user) => path.join(dir(user), 'meta.json');
  const itemFile = (user, id) => path.join(dir(user, 'items'), `${id}.json`);
  const imgDir = (user, id) => dir(user, 'img', id);
  const idOk = (id) => /^[a-f0-9]{16}$/.test(String(id));

  async function indice(user) {
    const raiz = userRoot(user);
    let c = cache.get(raiz);
    if (!c) {
      c = { items: new Map() };
      c.cargado = (async () => {
        const carpeta = dir(user, 'items');
        const nombres = (await fsp.readdir(carpeta)).filter(n => n.endsWith('.json'));
        for (let i = 0; i < nombres.length; i += 200) {
          await Promise.all(nombres.slice(i, i + 200).map(async (n) => {
            const p = await readJson(path.join(carpeta, n), null);
            if (p && p.id) c.items.set(p.id, p);
          }));
        }
      })();
      cache.set(raiz, c);
    }
    await c.cargado;
    return c.items;
  }
  const guarda = async (user, p) => { (await indice(user)).set(p.id, p); await writeJson(itemFile(user, p.id), p); };

  const metaBase = () => ({
    categories: CATEGORIAS_BASE.map(([name, emoji, color]) => ({ id: newId(), name, emoji, color, parent: '' })),
    lists: [],
  });
  // Primera vez: se siembran categorías de ejemplo, que se pueden renombrar o borrar
  const leeMeta = async (user) => {
    const m = await readJson(metaFile(user), null);
    if (m) return m;
    await updateJson(metaFile(user), metaBase, () => {});
    return readJson(metaFile(user), metaBase);
  };
  const mutaMeta = (user, fn) => updateJson(metaFile(user), metaBase, fn);

  /* ---------- Limpieza de entrada ---------- */
  function limpia(b, prev, meta) {
    const o = prev ? { ...prev } : { images: [], versions: [], uses: 0, favorite: false, pinned: false, rating: 0 };
    if (b.title !== undefined || !prev) o.title = cleanStr(b.title, 200).trim() || 'Prompt sin título';
    if (b.body !== undefined) o.body = cleanStr(b.body, BODY_MAX);
    if (b.negative !== undefined) o.negative = cleanStr(b.negative, 20000);
    if (b.notes !== undefined) o.notes = cleanStr(b.notes, 20000);
    if (b.kind !== undefined) o.kind = TIPOS.includes(b.kind) ? b.kind : 'otro';
    if (b.status !== undefined) o.status = ESTADOS.includes(b.status) ? b.status : 'borrador';
    if (b.model !== undefined) o.model = cleanStr(b.model, 60).trim();
    if (b.language !== undefined) o.language = cleanStr(b.language, 30).trim();
    if (b.source !== undefined) o.source = cleanStr(b.source, 500).trim();
    if (b.color !== undefined) o.color = cleanColor(b.color, '');
    if (b.favorite !== undefined) o.favorite = !!b.favorite;
    if (b.pinned !== undefined) o.pinned = !!b.pinned;
    if (b.rating !== undefined) o.rating = Math.min(Math.max(parseInt(b.rating, 10) || 0, 0), 5);
    if (b.labels !== undefined) o.labels = cleanIds(b.labels);
    if (b.lists !== undefined) {
      o.lists = cleanIds(b.lists).filter(id => !meta || meta.lists.some(l => l.id === id));
    }
    if (b.category !== undefined) {
      const c = cleanStr(b.category, 40);
      o.category = (!c || !meta || meta.categories.some(x => x.id === c)) ? c : '';
    }
    if (b.params !== undefined) {
      const params = {};
      if (b.params && typeof b.params === 'object') {
        for (const [k, v] of Object.entries(b.params).slice(0, 30)) {
          const kk = cleanStr(k, 40).trim();
          if (kk) params[kk] = cleanStr(v, 200);
        }
      }
      o.params = params;
    }
    // Valores por defecto para que el cliente no tenga que comprobar si existen
    o.body = o.body || '';
    o.negative = o.negative || '';
    o.notes = o.notes || '';
    o.kind = o.kind || 'imagen';
    o.status = o.status || 'borrador';
    o.model = o.model || '';
    o.language = o.language || '';
    o.source = o.source || '';
    o.color = o.color || '';
    o.category = o.category || '';
    o.labels = o.labels || [];
    o.lists = o.lists || [];
    o.params = o.params || {};
    return o;
  }

  const ligero = (p) => ({
    id: p.id, title: p.title, snippet: p.body.slice(0, 260), kind: p.kind, status: p.status, model: p.model,
    category: p.category, labels: p.labels, lists: p.lists, rating: p.rating, favorite: p.favorite,
    pinned: p.pinned, color: p.color, uses: p.uses, createdAt: p.createdAt, updatedAt: p.updatedAt,
    cal: p.cal || null, deletedAt: p.deletedAt || null,
    images: p.images.map(i => ({ id: i.id, w: i.w, h: i.h })), cover: p.cover || (p.images[0] && p.images[0].id) || '',
    hasNegative: !!p.negative, vars: (p.body.match(/\{\{[^{}\n]{1,120}\}\}/g) || []).length,
  });

  function descendientesCat(meta, id) {
    const ids = new Set([id]);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const c of meta.categories) if (c.parent && ids.has(c.parent) && !ids.has(c.id)) { ids.add(c.id); crecio = true; }
    }
    return ids;
  }

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
      if (papelera) await core.limpiaPapelera(req.user);
      const desde = q.from ? Date.parse(q.from) : 0;
      const hasta = q.to ? Date.parse(q.to) + 86400000 : Infinity;
      const minRating = parseInt(q.minRating, 10) || 0;

      let lista = [];
      for (const p of items.values()) {
        if (!!p.deletedAt !== papelera) continue;
        if (q.kind && p.kind !== q.kind) continue;
        if (q.status && p.status !== q.status) continue;
        if (q.model && p.model !== q.model) continue;
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
          const pajar = `${p.title}\n${p.body}\n${p.negative}\n${p.notes}\n${p.model}\n${p.source}`.toLowerCase();
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
      const f = { total: 0, trash: 0, favorites: 0, noCategory: 0, withImages: 0, category: {}, kind: {}, status: {}, model: {}, label: {}, list: {} };
      const inc = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
      for (const p of items.values()) {
        if (p.deletedAt) { f.trash++; continue; }
        f.total++;
        if (p.favorite) f.favorites++;
        if (!p.category) f.noCategory++;
        if (p.images.length) f.withImages++;
        inc(f.category, p.category); inc(f.kind, p.kind); inc(f.status, p.status); inc(f.model, p.model);
        p.labels.forEach(l => inc(f.label, l));
        p.lists.forEach(l => inc(f.list, l));
      }
      const modelos = [...new Set([...MODELOS_BASE, ...Object.keys(f.model)])];
      res.json({ categories: meta.categories, lists: meta.lists, facets: f, kinds: TIPOS, statuses: ESTADOS, models: modelos,
        limits: { images: MAX_IMAGENES, imageMax: IMG_MAX }, canImages: !!sharp });
    } catch (err) { sendError(res, err); }
  });

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
      const meta = await leeMeta(req.user);
      const p = limpia(req.body || {}, prev, meta);
      // Historial: solo cuando cambia el texto, para poder volver atrás
      if (p.title !== prev.title || p.body !== prev.body || p.negative !== prev.negative) {
        p.versions = [{ at: prev.updatedAt, title: prev.title, body: prev.body, negative: prev.negative }, ...(prev.versions || [])].slice(0, 30);
      }
      p.updatedAt = Date.now();
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
      copia.uses = 0; copia.versions = []; copia.cal = null; copia.pinned = false; delete copia.deletedAt; delete copia.lastUsedAt;
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

  /* ---------- Imágenes de muestra ---------- */
  const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMG_MAX_BYTES, files: MAX_IMAGENES },
    fileFilter: (req, file, cb) => cb(/^image\//.test(file.mimetype) ? null : new HttpError(400, 'Solo se admiten imágenes'), true),
  });

  router.post('/:id/images', (req, res, next) => {
    if (!sharp) return res.status(501).json({ error: 'El servidor no tiene "sharp" instalado: no puede convertir imágenes a WebP' });
    subida.array('images', MAX_IMAGENES)(req, res, (err) => {
      if (err) return sendError(res, err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'Imagen demasiado grande (máx. 15 MB)') : err);
      next();
    });
  }, async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      const archivos = req.files || [];
      if (p.images.length + archivos.length > MAX_IMAGENES) {
        throw new HttpError(400, `Máximo ${MAX_IMAGENES} imágenes por prompt (ya tiene ${p.images.length})`);
      }
      const carpeta = imgDir(req.user, p.id);
      await fsp.mkdir(carpeta, { recursive: true });
      const nuevas = [];
      const fallos = [];
      for (const f of archivos) {
        try {
          const base = sharp(f.buffer, { limitInputPixels: IMG_MAX_PIXELS, failOn: 'none' }).rotate();
          const grande = await base.clone()
            .resize({ width: IMG_MAX, height: IMG_MAX, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
          const mini = await base.clone()
            .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 74 }).toBuffer();
          const id = newId();
          await fsp.writeFile(path.join(carpeta, `${id}.webp`), grande.data);
          await fsp.writeFile(path.join(carpeta, `${id}_t.webp`), mini);
          nuevas.push({ id, w: grande.info.width, h: grande.info.height, bytes: grande.data.length,
            name: cleanStr(Buffer.from(f.originalname, 'latin1').toString('utf8'), 120), caption: '' });
        } catch { fallos.push(f.originalname); }
      }
      p.images.push(...nuevas);
      if (!p.cover && p.images[0]) p.cover = p.images[0].id;
      p.updatedAt = Date.now();
      await guarda(req.user, p);
      res.json({ ok: true, images: p.images, cover: p.cover, failed: fallos });
    } catch (err) { sendError(res, err); }
  });

  // Orden, pies de foto y portada
  router.put('/:id/images', cuerpo, async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      const { order, captions, cover } = req.body || {};
      if (Array.isArray(order)) {
        const mapa = new Map(p.images.map(i => [i.id, i]));
        const nuevo = order.map(id => mapa.get(String(id))).filter(Boolean);
        p.images.forEach(i => { if (!nuevo.includes(i)) nuevo.push(i); });
        p.images = nuevo;
      }
      if (captions && typeof captions === 'object') {
        p.images.forEach(i => { if (captions[i.id] !== undefined) i.caption = cleanStr(captions[i.id], 300); });
      }
      if (cover !== undefined) p.cover = p.images.some(i => i.id === cover) ? cover : (p.images[0] ? p.images[0].id : '');
      p.updatedAt = Date.now();
      await guarda(req.user, p);
      res.json({ ok: true, images: p.images, cover: p.cover });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/:id/images/:imgId', async (req, res) => {
    try {
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      if (!idOk(req.params.imgId)) throw new HttpError(400, 'Imagen no válida');
      p.images = p.images.filter(i => i.id !== req.params.imgId);
      if (p.cover === req.params.imgId) p.cover = p.images[0] ? p.images[0].id : '';
      const carpeta = imgDir(req.user, p.id);
      await fsp.rm(path.join(carpeta, `${req.params.imgId}.webp`), { force: true });
      await fsp.rm(path.join(carpeta, `${req.params.imgId}_t.webp`), { force: true });
      p.updatedAt = Date.now();
      await guarda(req.user, p);
      res.json({ ok: true, images: p.images, cover: p.cover });
    } catch (err) { sendError(res, err); }
  });

  router.get('/:id/img/:imgId', async (req, res) => {
    try {
      if (!idOk(req.params.id) || !idOk(req.params.imgId)) throw new HttpError(400, 'Imagen no válida');
      const nombre = `${req.params.imgId}${req.query.thumb === '1' ? '_t' : ''}.webp`;
      const file = path.join(imgDir(req.user, req.params.id), nombre);
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.sendFile(file, { headers: { 'Content-Type': 'image/webp' } }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Imagen no encontrada' });
      });
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
        model: p.model, language: p.language, source: p.source, rating: p.rating, favorite: p.favorite,
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
        const p = limpia({ ...raw, category: catId, labels: labelIds }, null, meta);
        p.id = newId();
        p.createdAt = Number.isFinite(+raw.createdAt) && +raw.createdAt > 0 ? +raw.createdAt : Date.now();
        p.updatedAt = Date.now();
        await guarda(req.user, p);
        creados++;
      }
      res.json({ ok: true, created: creados });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Enganches con otros módulos ---------- */
  labels.registrarContador(async (user) => {
    const uso = {};
    for (const p of (await indice(user)).values()) if (!p.deletedAt) p.labels.forEach(l => { uso[l] = (uso[l] || 0) + 1; });
    return uso;
  });
  labels.registrarLimpieza(async (user, labelId) => {
    for (const p of (await indice(user)).values()) {
      if (p.labels.includes(labelId)) { p.labels = p.labels.filter(l => l !== labelId); await guarda(user, p); }
    }
  });

  // Papelera automática: lo que lleva más de TRASH_TTL_DAYS borrado se elimina del todo
  const ttl = Number(process.env.TRASH_TTL_DAYS || 30) * 86400000;
  const core = {
    async buscar(user, q) {
      const out = [];
      for (const p of (await indice(user)).values()) {
        if (p.deletedAt) continue;
        if (`${p.title}\n${p.body}`.toLowerCase().includes(q)) out.push(ligero(p));
        if (out.length >= 20) break;
      }
      return out;
    },
    // El evento del calendario cambió de fecha (o se borró): la ficha guarda la fecha vigente
    async setCal(user, id, ev) {
      const p = (await indice(user)).get(id);
      if (!p) return;
      p.cal = ev ? { date: ev.start.slice(0, 10), time: ev.allDay ? '' : ev.start.slice(11, 16) } : null;
      await guarda(user, p);
    },
    async obtener(user, id) { return (await indice(user)).get(id) || null; },
    async limpiaPapelera(user) {
      for (const p of [...(await indice(user)).values()]) if (p.deletedAt && Date.now() - p.deletedAt > ttl) await borraDefinitivo(user, p);
    },
  };

  return { router, core };
}

module.exports = createPrompts;
