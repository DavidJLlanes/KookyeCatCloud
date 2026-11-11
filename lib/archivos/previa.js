'use strict';
// Vista previa y miniaturas de imágenes, vídeos, audio y PDF.
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { HEIC_TYPES, VIDEO_TYPES, PREVIEW_TYPES, THUMBABLE, DISPLAY_MAX, THUMB_SIZE } = require('./tipos');

function montaPrevia({ router, auth, userPath, sendError, sharp, ffmpeg, THUMBS_DIR, exists, convertirCache, fotogramaVideo }) {
  router.get('/api/preview', auth, async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      const ext = path.extname(file).toLowerCase();
      const type = PREVIEW_TYPES[ext];
      // Sin esta lista blanca, subir un .html y abrirlo por aquí daría XSS en el propio dominio
      if (!type) return res.status(415).json({ error: 'Este tipo de archivo no se puede previsualizar' });

      res.setHeader('Cache-Control', 'private, max-age=3600');

      if (ext === '.pdf') {
        // Solo la restricción de marco. Nada de default-src 'none': el visor de PDF
        // de Chrome monta un <embed> dentro del propio documento, y esa directiva
        // arrastra object-src 'none', con lo que el visor se bloquea a sí mismo y
        // enseña un recuadro gris. Corre en su propio proceso, sin acceso a la sesión.
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Disposition', 'inline');
        return res.sendFile(file, { headers: { 'Content-Type': 'application/pdf' } }, err => {
          if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
        });
      }

      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

      if (HEIC_TYPES[ext]) {
        if (!sharp) return res.status(415).json({ error: 'Este servidor no puede convertir HEIC' });
        const stat = await fsp.stat(file);
        const conv = await convertirCache(file, stat, DISPLAY_MAX, 'view');
        return res.sendFile(conv, { headers: { 'Content-Type': 'image/webp' } });
      }
      res.sendFile(file, { headers: { 'Content-Type': type } }, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/api/thumb', auth, async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      const ext = path.extname(file).toLowerCase();
      const esVideo = !!VIDEO_TYPES[ext];
      const tipo = THUMBABLE[ext];
      if (!tipo && !esVideo) return res.status(415).json({ error: 'Sin miniatura para este tipo' });
      if (esVideo && !ffmpeg) return res.status(415).json({ error: 'Este servidor no tiene ffmpeg' });

      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=86400');

      // Sin sharp la app sigue funcionando: se envía el original, solo que pesa más
      if (!esVideo && !sharp) return res.sendFile(file, { headers: { 'Content-Type': tipo } });

      const stat = await fsp.stat(file);
      // La clave incluye tamaño y mtime: si el archivo cambia, la miniatura se regenera sola
      const key = crypto.createHash('sha1')
        .update(`${file}|${stat.size}|${stat.mtimeMs}|${THUMB_SIZE}|thumb`).digest('hex');
      const cached = path.join(THUMBS_DIR, `${key}.webp`);

      if (!await exists(cached)) {
        const tmp = `${cached}.${process.pid}.tmp`;
        if (esVideo) {
          const tmpImg = `${tmp}.webp`;
          await fotogramaVideo(file, tmpImg);
          await fsp.rename(tmpImg, cached);
        } else {
          const buf = await sharp(file, { failOn: 'none' })
            .rotate() // respeta la orientación EXIF de las fotos de móvil
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
            .webp({ quality: 78 })
            .toBuffer();
          await fsp.writeFile(tmp, buf);
          await fsp.rename(tmp, cached);
        }
      }
      res.sendFile(cached, { headers: { 'Content-Type': 'image/webp' } }, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
      });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { montaPrevia };
