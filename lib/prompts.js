'use strict';
// Módulo de prompts de IA. Cada prompt es un JSON propio (items/<id>.json) y se mantiene un
// índice en memoria por usuario, de modo que buscar y filtrar miles de prompts es instantáneo
// sin reescribir nunca un archivo gigante. Las imágenes de muestra se convierten a WebP.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanColor, cleanStr, cleanIds } = require('./store');
const { leePromptCompleto } = require('./comfy');

const MAX_IMAGENES = 10;
const IMG_MAX = 1600;        // lado mayor de la imagen guardada
const THUMB_MAX = 480;       // lado mayor de la miniatura
// Las subidas se procesan en memoria: 10 imágenes de 15 MB son 150 MB como máximo por petición
const IMG_MAX_BYTES = 15 * 1024 * 1024;
const IMG_MAX_PIXELS = 64e6;     // tope contra imágenes "bomba" (poco peso, gigantescas al descomprimir)
const MAX_PROMPTS = 100000;
const BODY_MAX = 100000;

const TIPOS = ['imagen', 'texto', 'codigo', 'video', 'audio', 'agente', 'fragmento', 'otro'];
const TIPOS_BASE = [
  ['imagen', 'Imagen', 'i-image'], ['texto', 'Texto', 'i-doc'], ['codigo', 'Código', 'i-bars'],
  ['video', 'Vídeo', 'i-play'], ['audio', 'Audio', 'i-music'], ['agente', 'Agente', 'i-sparkle'],
  ['fragmento', 'Fragmento', 'i-tag'], ['otro', 'Otro', 'i-stack'],
].map(([id, name, icon]) => ({ id, name, icon }));
const ICONOS_TIPO = new Set(['i-image', 'i-doc', 'i-bars', 'i-play', 'i-music', 'i-sparkle', 'i-tag', 'i-stack',
  'i-folder', 'i-note', 'i-server', 'i-monitor', 'i-globe', 'i-mail', 'i-calendar', 'i-palette', 'i-activity',
  'i-cloud', 'i-key', 'i-link', 'i-shield', 'i-user', 'i-users', 'i-zip', 'i-check', 'i-star', 'i-pin', 'i-cart']);
const normalizaTipos = (definiciones) => TIPOS_BASE.map(base => {
  const guardado = Array.isArray(definiciones) ? definiciones.find(x => x && x.id === base.id) : null;
  const nombre = guardado && typeof guardado.name === 'string' ? cleanStr(guardado.name, 60).trim() : '';
  const nombreValido = nombre && !/^(?:false|true|null|undefined)$/i.test(nombre) ? nombre : base.name;
  return { ...base, name: nombreValido,
    icon: ICONOS_TIPO.has(guardado && guardado.icon) ? guardado.icon : base.icon };
});
const MAX_SALIDAS = 30;
const MAX_CADENA = 20;
const MAX_VISTAS = 40;
const ESTADOS = ['borrador', 'probando', 'final', 'archivado'];
const MODELOS_BASE = ['ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'DALL·E', 'Stable Diffusion', 'FLUX',
  'Sora', 'Veo', 'Runway', 'Kling', 'Suno', 'Llama', 'Mistral', 'DeepSeek', 'Grok', 'Copilot', 'Otro'];
const HERRAMIENTAS_BASE = ['ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'ComfyUI', 'Automatic1111', 'Leonardo', 'Ideogram',
  'Runway', 'Sora', 'Suno', 'Cursor', 'Copilot', 'API', 'Otra'];
const CATEGORIAS_BASE = [
  ['Retratos', '🧑‍🎨', '#ec4899'], ['Paisajes', '🏞️', '#22c55e'], ['Arte y estilos', '🎨', '#8b5cf6'],
  ['Diseño y logos', '✏️', '#3b82f6'], ['Programación', '💻', '#06b6d4'], ['Escritura', '📝', '#f59e0b'],
  ['Marketing', '📣', '#ef4444'], ['Productividad', '⚡', '#14b8a6'],
];

function createPrompts({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar, labels, papeleraDias }) {
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
    lists: [], kinds: normalizaTipos(),
    views: [],
    models: [],
    tools: [],
  });
  // Primera vez: se siembran categorías de ejemplo, que se pueden renombrar o borrar
  const leeMeta = async (user) => {
    const m = await readJson(metaFile(user), null);
    if (m) { m.models = Array.isArray(m.models) ? m.models : []; m.tools = Array.isArray(m.tools) ? m.tools : []; m.kinds = normalizaTipos(m.kinds); return m; }
    await updateJson(metaFile(user), metaBase, () => {});
    return readJson(metaFile(user), metaBase);
  };
  const mutaMeta = (user, fn) => updateJson(metaFile(user), metaBase, fn);

  /* ---------- Limpieza de entrada ---------- */
  // Resultados guardados con el prompt (respuesta de un modelo, con su valoración). Los ids ya existentes se respetan.
  function limpiaSalidas(lista, previas) {
    const conocidos = new Set((previas || []).map(x => x.id));
    const out = [];
    for (const x of (Array.isArray(lista) ? lista : []).slice(0, MAX_SALIDAS)) {
      if (!x || typeof x !== 'object') continue;
      const text = cleanStr(x.text, 30000);
      const input = cleanStr(x.input, 5000);
      if (!text.trim() && !input.trim()) continue;
      out.push({
        id: conocidos.has(x.id) ? x.id : newId(),
        input, text, model: cleanStr(x.model, 60).trim(),
        rating: Math.min(Math.max(parseInt(x.rating, 10) || 0, 0), 5),
        best: !!x.best, at: Number.isFinite(+x.at) && +x.at > 0 ? +x.at : Date.now(),
      });
    }
    // Solo un resultado puede ser "el mejor"
    let visto = false;
    for (const x of out) { if (x.best && visto) x.best = false; if (x.best) visto = true; }
    return out;
  }

  function limpia(b, prev, meta) {
    const o = prev ? { ...prev } : { images: [], versions: [], uses: 0, favorite: false, pinned: false, rating: 0 };
    if (b.title !== undefined || !prev) o.title = cleanStr(b.title, 200).trim() || 'Prompt sin título';
    if (b.body !== undefined) o.body = cleanStr(b.body, BODY_MAX);
    if (b.negative !== undefined) o.negative = cleanStr(b.negative, 20000);
    if (b.notes !== undefined) o.notes = cleanStr(b.notes, 20000);
    if (b.system !== undefined) o.system = cleanStr(b.system, 20000);
    if (b.chain !== undefined) o.chain = [...new Set(cleanIds(b.chain))].filter(id => idOk(id) && (!prev || id !== prev.id)).slice(0, MAX_CADENA);
    if (b.outputs !== undefined) o.outputs = limpiaSalidas(b.outputs, o.outputs);
    if (b.kind !== undefined) o.kind = TIPOS.includes(b.kind) ? b.kind : 'otro';
    if (b.status !== undefined) o.status = ESTADOS.includes(b.status) ? b.status : 'borrador';
    if (b.model !== undefined) o.model = cleanStr(b.model, 60).trim();
    if (b.tool !== undefined) o.tool = cleanStr(b.tool, 60).trim();
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
    o.system = o.system || '';
    o.chain = o.chain || [];
    o.outputs = o.outputs || [];
    o.kind = o.kind || 'imagen';
    o.status = o.status || 'borrador';
    o.model = o.model || '';
    o.tool = o.tool || '';
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
    id: p.id, title: p.title, snippet: p.body.slice(0, 260), kind: p.kind, status: p.status, model: p.model, tool: p.tool,
    category: p.category, labels: p.labels, lists: p.lists, rating: p.rating, favorite: p.favorite,
    pinned: p.pinned, color: p.color, uses: p.uses, createdAt: p.createdAt, updatedAt: p.updatedAt,
    cal: p.cal || null, deletedAt: p.deletedAt || null,
    images: p.images.map(i => ({ id: i.id, w: i.w, h: i.h })), cover: p.cover || (p.images[0] && p.images[0].id) || '',
    hasNegative: !!p.negative, hasSystem: !!p.system, outputs: (p.outputs || []).length, chain: (p.chain || []).length, vars: (p.body.match(/\{\{[^{}\n]{1,120}\}\}/g) || []).length,
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
        if (q.tool && p.tool !== q.tool) continue;
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
      const modelos = [...new Set([...MODELOS_BASE, ...meta.models, ...Object.keys(f.model)])];
      const herramientas = [...new Set([...HERRAMIENTAS_BASE, ...meta.tools, ...Object.keys(f.tool)])];
      res.json({ categories: meta.categories, lists: meta.lists, facets: f, kinds: TIPOS, kindDefs: meta.kinds, statuses: ESTADOS, models: modelos, tools: herramientas,
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

  // Opciones del usuario: quedan disponibles aunque se borre el prompt donde se usaron.
  router.post('/options', async (req, res) => {
    try {
      const add = (arr, value, defaults) => {
        const v = cleanStr(value, 60).trim();
        if (!v || [...defaults, ...arr].some(x => String(x).toLocaleLowerCase() === v.toLocaleLowerCase())) return;
        if (arr.length < 100) arr.push(v);
      };
      const meta = await mutaMeta(req.user, m => {
        m.models = Array.isArray(m.models) ? m.models : [];
        m.tools = Array.isArray(m.tools) ? m.tools : [];
        add(m.models, req.body?.model, MODELOS_BASE);
        add(m.tools, req.body?.tool, HERRAMIENTAS_BASE);
        return { models: m.models, tools: m.tools };
      });
      res.json(meta);
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
      const fence = (t) => '```\n' + String(t).replace(/```/g, '``​`') + '\n```';
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
      if (p.title !== prev.title || p.body !== prev.body || p.negative !== prev.negative || (p.system || '') !== (prev.system || '')) {
        p.versions = [{ at: prev.updatedAt, title: prev.title, body: prev.body, negative: prev.negative, system: prev.system || '' }, ...(prev.versions || [])].slice(0, 30);
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

  /* ---------- Imágenes de muestra ---------- */
  // Convierte las imágenes subidas a WebP (grande + miniatura) y las deja en la carpeta del prompt
  async function procesaImagenes(user, p, archivos) {
    const carpeta = imgDir(user, p.id);
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
    return { nuevas, fallos };
  }

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
      const { nuevas, fallos } = await procesaImagenes(req.user, p, archivos);
      p.images.push(...nuevas);
      if (!p.cover && p.images[0]) p.cover = p.images[0].id;
      p.updatedAt = Date.now();
      await guarda(req.user, p);
      res.json({ ok: true, images: p.images, cover: p.cover, failed: fallos });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Enviar a ComfyUI (opcional) ----------
     Solo si el servidor define COMFY_URL (p. ej. http://127.0.0.1:8188) y llega hasta ese ComfyUI. Cada usuario guarda
     una vez su workflow en formato API con marcadores: %PROMPT%, %NEGATIVE%, %SEED% y %P:nombre% (un parámetro del
     prompt). Al enviar se rellena, se encola, se espera la primera imagen y se añade como muestra del prompt. */
  const COMFY_URL = String(process.env.COMFY_URL || '').replace(/\/+$/, '');
  const COMFY_ESPERA_MS = Number(process.env.COMFY_TIMEOUT_S || 240) * 1000;
  const comfyFile = (user) => path.join(dir(user), 'comfy-workflow.txt');
  router.get('/comfy/config', async (req, res) => {
    try {
      let workflow = '';
      try { workflow = await fsp.readFile(comfyFile(req.user), 'utf8'); } catch { /* sin workflow */ }
      res.json({ enabled: !!COMFY_URL, workflow });
    } catch (err) { sendError(res, err); }
  });
  router.put('/comfy/config', express.json({ limit: '600kb' }), async (req, res) => {
    try {
      const texto = String((req.body || {}).workflow || '').trim();
      if (texto) { try { JSON.parse(texto); } catch { throw new HttpError(400, 'El workflow no es un JSON válido (usa «Save (API format)» en ComfyUI)'); } }
      if (texto) { await fsp.mkdir(dir(req.user), { recursive: true }); await fsp.writeFile(comfyFile(req.user), texto, { mode: 0o600 }); }
      else await fsp.rm(comfyFile(req.user), { force: true });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });
  function rellenaWorkflow(nodo, v) {
    if (typeof nodo === 'string') {
      if (nodo === '%SEED%') return v.seed;
      const exacto = nodo.match(/^%P:([^%]{1,40})%$/);
      if (exacto && v.params[exacto[1]] !== undefined) { const n = Number(v.params[exacto[1]]); return Number.isFinite(n) && String(v.params[exacto[1]]).trim() !== '' ? n : v.params[exacto[1]]; }
      return nodo.replace(/%(PROMPT|NEGATIVE)%/g, (m, k) => v[k.toLowerCase()]).replace(/%P:([^%]{1,40})%/g, (m, k) => (v.params[k] !== undefined ? v.params[k] : m));
    }
    if (Array.isArray(nodo)) return nodo.map(x => rellenaWorkflow(x, v));
    if (nodo && typeof nodo === 'object') { const o = {}; for (const [k, x] of Object.entries(nodo)) o[k] = rellenaWorkflow(x, v); return o; }
    return nodo;
  }
  router.post('/:id/comfy', express.json({ limit: '300kb' }), async (req, res) => {
    try {
      if (!COMFY_URL) throw new HttpError(501, 'Este servidor no tiene COMFY_URL configurado');
      if (!sharp) throw new HttpError(501, 'El servidor no tiene "sharp": no puede guardar la imagen');
      const p = (await indice(req.user)).get(req.params.id);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      if (p.images.length >= MAX_IMAGENES) throw new HttpError(400, `El prompt ya tiene ${MAX_IMAGENES} imágenes: quita alguna antes`);
      let plantilla = '';
      try { plantilla = await fsp.readFile(comfyFile(req.user), 'utf8'); } catch { /* sin workflow */ }
      if (!plantilla) throw new HttpError(400, 'Guarda primero tu workflow de ComfyUI (formato API) con los marcadores %PROMPT% y %NEGATIVE%');
      const frags = await mapaFragmentos(req.user);
      const texto = cleanStr(req.body.text !== undefined ? req.body.text : expande(p.body, frags), 100000);
      const negativo = cleanStr(req.body.negative !== undefined ? req.body.negative : expande(p.negative, frags), 20000);
      const seedParam = parseInt((p.params || {}).seed, 10);
      const seed = Number.isFinite(seedParam) && !req.body.randomSeed ? seedParam : Math.floor(Math.random() * 2 ** 31);
      const wf = rellenaWorkflow(JSON.parse(plantilla), { prompt: texto, negative: negativo, seed, params: p.params || {} });
      const clientId = newId();
      const post = await fetch(`${COMFY_URL}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: clientId }), signal: AbortSignal.timeout(15000) })
        .catch(() => { throw new HttpError(502, 'No se pudo conectar con ComfyUI'); });
      const enviado = await post.json().catch(() => ({}));
      if (!post.ok || !enviado.prompt_id) throw new HttpError(502, `ComfyUI rechazó el workflow${enviado.error && enviado.error.message ? ': ' + enviado.error.message : ''}`);
      let imagen = null;
      const limite = Date.now() + COMFY_ESPERA_MS;
      while (!imagen && Date.now() < limite) {
        await new Promise(r => setTimeout(r, 1500));
        const h = await fetch(`${COMFY_URL}/history/${enviado.prompt_id}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
        const entrada = h && h[enviado.prompt_id];
        if (!entrada) continue;
        if (entrada.status && entrada.status.status_str === 'error') throw new HttpError(502, 'ComfyUI falló al generar la imagen');
        for (const nodo of Object.values(entrada.outputs || {})) { if (nodo.images && nodo.images[0]) { imagen = nodo.images[0]; break; } }
      }
      if (!imagen) throw new HttpError(504, 'ComfyUI tardó demasiado en generar la imagen');
      const q = new URLSearchParams({ filename: imagen.filename, subfolder: imagen.subfolder || '', type: imagen.type || 'output' });
      const bin = await fetch(`${COMFY_URL}/view?${q}`, { signal: AbortSignal.timeout(30000) });
      if (!bin.ok) throw new HttpError(502, 'No se pudo descargar la imagen de ComfyUI');
      const buffer = Buffer.from(await bin.arrayBuffer());
      const { nuevas, fallos } = await procesaImagenes(req.user, p, [{ buffer, originalname: imagen.filename }]);
      if (!nuevas.length) throw new HttpError(500, `No se pudo procesar la imagen${fallos.length ? ' (' + fallos[0] + ')' : ''}`);
      nuevas[0].caption = `ComfyUI · seed ${seed}`;
      p.images.push(...nuevas);
      if (!p.cover) p.cover = p.images[0].id;
      p.updatedAt = Date.now();
      await guarda(req.user, p);
      registrarActividad(req, 'prompt_comfy', { id: p.id });
      res.json({ ok: true, image: nuevas[0], seed });
    } catch (err) { sendError(res, err); }
  });

  /* ---------- Crear prompts desde imágenes de ComfyUI / Automatic1111 ----------
     Cada PNG lleva dentro el workflow o los parámetros con los que se generó: se lee y se crea un prompt
     con su texto, negativo, modelo, semilla y demás, y la propia imagen como muestra. */
  const subidaMeta = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMG_MAX_BYTES, files: 20 },
    fileFilter: (req, file, cb) => cb(/^image\//.test(file.mimetype) || /\.png$/i.test(file.originalname) ? null : new HttpError(400, 'Solo se admiten imágenes'), true),
  });
  router.post('/read-image-metadata', (req, res, next) => {
    subidaMeta.single('image')(req, res, (err) => {
      if (err) return sendError(res, err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'Imagen demasiado grande (máx. 15 MB)') : err);
      if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen compatible' });
      next();
    });
  }, async (req, res) => {
    try {
      const metadata = await leePromptCompleto(req.file.buffer);
      res.json({ ok: true, metadata: metadata && !metadata.error ? metadata : null });
    } catch (err) { sendError(res, err); }
  });
  router.post('/from-image', (req, res, next) => {
    if (!sharp) return res.status(501).json({ error: 'El servidor no tiene "sharp" instalado: no puede convertir imágenes a WebP' });
    subidaMeta.array('images', 20)(req, res, (err) => {
      if (err) return sendError(res, err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'Imagen demasiado grande (máx. 15 MB)')
        : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT' ? new HttpError(400, 'Máximo 20 imágenes por vez') : err);
      next();
    });
  }, async (req, res) => {
    try {
      const items = await indice(req.user);
      const meta = await leeMeta(req.user);
      const creados = [], sinDatos = [], fallos = [];
      const modelosImportados = new Set(), herramientasImportadas = new Set();
      for (const f of req.files || []) {
        const nombre = cleanStr(Buffer.from(f.originalname, 'latin1').toString('utf8'), 120);
        if (items.size >= MAX_PROMPTS) { fallos.push(nombre); continue; }
        const d = await leePromptCompleto(f.buffer);
        if (!d || d.error) { sinDatos.push(nombre); continue; }
        const titulo = (d.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || nombre.replace(/\.[^.]+$/, '');
        const p = limpia({ title: titulo, body: d.body, negative: d.negative, kind: 'imagen', status: 'borrador',
          tool: d.tool, model: d.model, source: nombre, params: d.params }, null, meta);
        if (p.model) modelosImportados.add(p.model);
        if (p.tool) herramientasImportadas.add(p.tool);
        p.id = newId();
        p.createdAt = p.updatedAt = Date.now();
        const { nuevas } = await procesaImagenes(req.user, p, [f]);
        p.images.push(...nuevas);
        if (p.images[0]) p.cover = p.images[0].id;
        await guarda(req.user, p);
        creados.push({ id: p.id, title: p.title });
      }
      if (modelosImportados.size || herramientasImportadas.size) await mutaMeta(req.user, m => {
        m.models = Array.isArray(m.models) ? m.models : []; m.tools = Array.isArray(m.tools) ? m.tools : [];
        const add = (arr, values, defaults) => values.forEach(v => {
          if (arr.length < 100 && ![...defaults, ...arr].some(x => String(x).toLocaleLowerCase() === v.toLocaleLowerCase())) arr.push(v);
        });
        add(m.models, modelosImportados, MODELOS_BASE); add(m.tools, herramientasImportadas, HERRAMIENTAS_BASE);
        return null;
      });
      if (creados.length) registrarActividad(req, 'prompt_creado', { desde: 'imagen', n: creados.length });
      res.json({ ok: true, created: creados, noMetadata: sinDatos, failed: fallos });
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
        const p = limpia({ ...raw, category: catId, labels: labelIds, chain: [] }, null, meta);
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
    // Para el enlace público de solo lectura: los prompts pedidos, con los fragmentos ya sustituidos
    async paraCompartir(user, ids) {
      const items = await indice(user);
      const frags = await mapaFragmentos(user);
      return ids.map(id => items.get(String(id))).filter(p => p && !p.deletedAt).map(p => ({
        id: p.id, title: p.title, kind: p.kind, model: p.model, tool: p.tool,
        system: expande(p.system || '', frags), body: expande(p.body || '', frags), negative: expande(p.negative || '', frags),
        notes: p.notes || '', params: p.params || {},
      }));
    },
    async limpiaPapelera(user) {
      // Los días los elige cada usuario (0 = nunca); sin ese dato se usa el valor por defecto del servidor
      const dias = papeleraDias ? await papeleraDias(user) : ttl / 86400000;
      if (!dias) return;
      for (const p of [...(await indice(user)).values()]) if (p.deletedAt && Date.now() - p.deletedAt > dias * 86400000) await borraDefinitivo(user, p);
    },
  };

  return { router, core };
}

module.exports = createPrompts;
