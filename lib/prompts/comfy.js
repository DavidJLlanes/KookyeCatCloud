'use strict';
// Enviar a ComfyUI y crear prompts desde imágenes de ComfyUI / Automatic1111.
const store = require('../store');
const fsp = require('fs').promises;
const path = require('path');
const { leePromptCompleto } = require('../comfy');
const { newId, HttpError, cleanStr } = store;
const { MAX_IMAGENES, IMG_MAX_BYTES, MAX_PROMPTS } = require('./constantes');

function montaComfy(ctx) {
  const { dir, expande, express, guarda, indice, leeMeta, limpia, mapaFragmentos, multer, procesaImagenes, registrarActividad, router, sendError, sharp } = ctx;

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
      for (const f of req.files || []) {
        const nombre = cleanStr(Buffer.from(f.originalname, 'latin1').toString('utf8'), 120);
        if (items.size >= MAX_PROMPTS) { fallos.push(nombre); continue; }
        const d = await leePromptCompleto(f.buffer);
        if (!d || d.error) { sinDatos.push(nombre); continue; }
        const titulo = (d.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || nombre.replace(/\.[^.]+$/, '');
        const p = limpia({ __recorta: true, title: titulo, body: d.body, negative: d.negative, kind: 'imagen', status: 'borrador',
          tool: d.tool, model: d.model, source: nombre, params: d.params }, null, meta);
        p.id = newId();
        p.createdAt = p.updatedAt = Date.now();
        const { nuevas } = await procesaImagenes(req.user, p, [f]);
        p.images.push(...nuevas);
        if (p.images[0]) p.cover = p.images[0].id;
        await guarda(req.user, p);
        creados.push({ id: p.id, title: p.title });
      }
      if (creados.length) registrarActividad(req, 'prompt_creado', { desde: 'imagen', n: creados.length });
      res.json({ ok: true, created: creados, noMetadata: sinDatos, failed: fallos });
    } catch (err) { sendError(res, err); }
  });

  return { COMFY_URL, COMFY_ESPERA_MS, comfyFile, rellenaWorkflow, subidaMeta };
}

module.exports = { montaComfy };
