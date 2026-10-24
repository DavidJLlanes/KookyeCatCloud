'use strict';

// Lista y catálogo compartidos por las cuentas autenticadas de la instalación.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { readJson, updateJson, newId, cleanStr } = require('./store');

const MAX_ITEMS = 10000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const UNITS = new Set(['', 'ud', 'kg', 'g', 'l', 'ml', 'paquete', 'caja', 'docena']);

function createShopping({ express, multer, sharp, dataRoot, sendError, registrarActividad }) {
  const router = express.Router();
  const root = path.join(dataRoot, '.kcc', 'shopping');
  const images = path.join(root, 'images');
  const file = path.join(root, 'data.json');
  const empty = () => ({ products: [], entries: [], categories: [] });
  const validId = id => /^[a-f0-9]{16}$/.test(String(id));
  const cleanUnit = v => UNITS.has(String(v || '').trim().toLowerCase()) ? String(v || '').trim().toLowerCase() : '';
  const cleanQty = v => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 && n <= 100000 ? Math.round(n * 1000) / 1000 : 1;
  };
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
  async function state() {
    const s = await readJson(file, empty);
    s.products = Array.isArray(s.products) ? s.products : [];
    s.entries = Array.isArray(s.entries) ? s.entries : [];
    s.categories = Array.isArray(s.categories) ? s.categories : [];
    return s;
  }
  const mutate = async fn => {
    await fsp.mkdir(root, { recursive: true });
    return updateJson(file, empty, async s => {
    s.products = Array.isArray(s.products) ? s.products : [];
    s.entries = Array.isArray(s.entries) ? s.entries : [];
    s.categories = Array.isArray(s.categories) ? s.categories : [];
    return fn(s);
    });
  };
  const producto = (s, id) => s.products.find(p => p.id === id);
  function addEntry(s, p, quantity) {
    const existing = s.entries.find(e => e.productId === p.id && e.status === 'pending');
    if (existing) {
      existing.quantity = cleanQty(Number(existing.quantity || 0) + quantity);
      existing.updatedAt = Date.now();
      return existing;
    }
    const entry = { id: newId(), productId: p.id, quantity, status: 'pending', createdAt: Date.now(), updatedAt: Date.now(), boughtAt: null };
    s.entries.push(entry);
    return entry;
  }

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
  router.get('/', async (req, res) => { try { res.json(await state()); } catch (e) { sendError(res, e); } });

  router.post('/products', async (req, res) => {
    try {
      const name = cleanStr(req.body?.name, 120).trim();
      if (!name) return res.status(400).json({ error: 'Escribe el nombre del producto' });
      const result = await mutate(s => {
        if (s.products.length >= MAX_ITEMS) return { error: 'Has alcanzado el límite de productos' };
        const p = { id: newId(), name, unit: cleanUnit(req.body.unit), defaultQuantity: cleanQty(req.body.quantity), category: cleanStr(req.body.category, 60).trim(), createdAt: Date.now(), updatedAt: Date.now(), hasImage: false };
        s.products.push(p);
        const entry = req.body.addToList === false ? null : addEntry(s, p, p.defaultQuantity);
        return { product: p, entry };
      });
      if (result.error) return res.status(400).json({ error: result.error });
      registrarActividad(req, 'compra_producto_creado', { name: result.product.name });
      res.json(result);
    } catch (e) { sendError(res, e); }
  });

  router.put('/products/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
    try {
      const p = await mutate(s => {
        const item = producto(s, req.params.id); if (!item) return null;
        if (req.body.name !== undefined) { const name = cleanStr(req.body.name, 120).trim(); if (!name) return { error: 'El nombre no puede estar vacío' }; item.name = name; }
        if (req.body.unit !== undefined) item.unit = cleanUnit(req.body.unit);
        if (req.body.quantity !== undefined) item.defaultQuantity = cleanQty(req.body.quantity);
        if (req.body.category !== undefined) item.category = cleanStr(req.body.category, 60).trim();
        item.updatedAt = Date.now(); return item;
      });
      if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
      if (p.error) return res.status(400).json({ error: p.error });
      res.json({ product: p });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/products/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
    try {
      const removed = await mutate(s => {
        const i = s.products.findIndex(p => p.id === req.params.id); if (i < 0) return false;
        s.products.splice(i, 1); s.entries = s.entries.filter(e => e.productId !== req.params.id); return true;
      });
      if (!removed) return res.status(404).json({ error: 'Producto no encontrado' });
      await fsp.rm(path.join(images, `${req.params.id}.webp`), { force: true });
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.post('/products/:id/image', (req, res) => {
    if (!sharp) return res.status(501).json({ error: 'El servidor no tiene sharp para procesar imágenes' });
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
    upload.single('image')(req, res, async err => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen' });
      try {
        const s = await state(); if (!producto(s, req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
        const meta = await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: 40000000 }).metadata();
        if (!/^image\/(jpeg|png|webp|avif|heic|heif|tiff)$/.test(`image/${meta.format || ''}`)) return res.status(415).json({ error: 'Formato de imagen no compatible' });
        await fsp.mkdir(images, { recursive: true });
        const out = await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: 40000000 }).rotate().resize(300, 300, { fit: 'cover', position: 'attention' }).webp({ quality: 82, effort: 5 }).toBuffer();
        const tmp = path.join(images, `${req.params.id}.${process.pid}.tmp`);
        await fsp.writeFile(tmp, out); await fsp.rename(tmp, path.join(images, `${req.params.id}.webp`));
        await mutate(s2 => { const p = producto(s2, req.params.id); if (p) { p.hasImage = true; p.updatedAt = Date.now(); } });
        res.json({ ok: true, bytes: out.length });
      } catch (e) { sendError(res, e); }
    });
  });

  router.delete('/products/:id/image', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
    try {
      const ok = await mutate(s => { const p = producto(s, req.params.id); if (!p) return false; p.hasImage = false; p.updatedAt = Date.now(); return true; });
      if (!ok) return res.status(404).json({ error: 'Producto no encontrado' });
      await fsp.rm(path.join(images, `${req.params.id}.webp`), { force: true }); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/products/:id/image', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).end();
    try {
      const s = await state(); const p = producto(s, req.params.id); if (!p?.hasImage) return res.status(404).end();
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.sendFile(path.join(images, `${req.params.id}.webp`), err => { if (err && !res.headersSent) res.status(404).end(); });
    } catch { res.status(404).end(); }
  });

  router.post('/entries', async (req, res) => {
    try {
      const result = await mutate(s => {
        const p = producto(s, String(req.body?.productId || '')); if (!p) return null;
        return addEntry(s, p, cleanQty(req.body.quantity ?? p.defaultQuantity));
      });
      if (!result) return res.status(404).json({ error: 'Producto no encontrado' });
      res.json({ entry: result });
    } catch (e) { sendError(res, e); }
  });
  router.put('/entries/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Elemento no encontrado' });
    try {
      const entry = await mutate(s => {
        const e = s.entries.find(x => x.id === req.params.id); if (!e) return null;
        if (req.body.quantity !== undefined) { e.quantity = cleanQty(req.body.quantity); e.updatedAt = Date.now(); }
        if (req.body.status === 'bought' && e.status !== 'bought') { e.status = 'bought'; e.boughtAt = Date.now(); e.updatedAt = Date.now(); }
        return e;
      });
      if (!entry) return res.status(404).json({ error: 'Elemento no encontrado' });
      res.json({ entry });
    } catch (e) { sendError(res, e); }
  });
  router.delete('/entries/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Elemento no encontrado' });
    try {
      const ok = await mutate(s => { const i = s.entries.findIndex(e => e.id === req.params.id); if (i < 0) return false; s.entries.splice(i, 1); return true; });
      if (!ok) return res.status(404).json({ error: 'Elemento no encontrado' });
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.post('/categories', async (req, res) => {
    const name = cleanStr(req.body?.name, 60).trim(); if (!name) return res.status(400).json({ error: 'Escribe un nombre de categoría' });
    try {
      const category = await mutate(s => {
        if (s.categories.some(c => normal(c.name) === normal(name))) return { error: 'Esa categoría ya existe' };
        const c = { id: newId(), name }; s.categories.push(c); return c;
      });
      if (category.error) return res.status(409).json({ error: category.error });
      res.json({ category });
    } catch (e) { sendError(res, e); }
  });
  router.put('/categories/:id', async (req, res) => {
    const name = cleanStr(req.body?.name, 60).trim(); if (!name) return res.status(400).json({ error: 'Escribe un nombre de categoría' });
    try {
      const category = await mutate(s => { const c = s.categories.find(x => x.id === req.params.id); if (!c) return null; const previous = c.name; c.name = name; s.products.forEach(p => { if (p.category === previous) p.category = name; }); return c; });
      if (!category) return res.status(404).json({ error: 'Categoría no encontrada' }); res.json({ category });
    } catch (e) { sendError(res, e); }
  });
  router.delete('/categories/:id', async (req, res) => {
    try {
      const ok = await mutate(s => { const c = s.categories.find(x => x.id === req.params.id); if (!c) return false; s.categories = s.categories.filter(x => x.id !== req.params.id); s.products.forEach(p => { if (p.category === c.name) p.category = ''; }); return true; });
      if (!ok) return res.status(404).json({ error: 'Categoría no encontrada' }); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });
  return router;
}

module.exports = createShopping;
