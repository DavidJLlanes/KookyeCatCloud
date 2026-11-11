'use strict';
// Imágenes de muestra: subida y conversión a WebP, orden, pies de foto, portada y borrado.
const store = require('../store');
const fsp = require('fs').promises;
const path = require('path');
const { newId, HttpError, cleanStr } = store;
const { MAX_IMAGENES, IMG_MAX, THUMB_MAX, IMG_MAX_BYTES, IMG_MAX_PIXELS } = require('./constantes');

function montaImagenes(ctx) {
  const { cuerpo, guarda, idOk, imgDir, indice, multer, router, sendError, sharp } = ctx;

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

  return { procesaImagenes, subida };
}

module.exports = { montaImagenes };
