'use strict';
// Subida de archivos: un único constructor para la subida autenticada y la pública (solo cambia dónde cae).
const fs = require('fs');
const path = require('path');

function creaSubida({ multer, router, auth, userPath, registrarActividad, MAX_UPLOAD_BYTES }) {
  // Un único constructor para la subida autenticada y la pública: solo cambia
  // cómo se resuelve la carpeta de destino.
  const nombresEnSubida = new Set();
  function makeUploader(resolveDir, limits) {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          const dir = resolveDir(req);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        } catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        try {
          const dir = resolveDir(req);
          // basename() descarta cualquier ruta que venga en el nombre original del cliente
          const safeName = path.basename(file.originalname).replace(/^\.+/, '') || 'archivo';
          const ext = path.extname(safeName);
          const base = path.basename(safeName, ext);
          let target = path.join(dir, safeName);
          let counter = 1;
          // Nombres reservados por subidas en curso: dos subidas del mismo nombre a la vez ya no escriben el mismo archivo
          while (fs.existsSync(target) || nombresEnSubida.has(target)) {
            target = path.join(dir, `${base}_${counter}${ext}`);
            counter++;
          }
          nombresEnSubida.add(target);
          req.once('close', () => nombresEnSubida.delete(target));
          cb(null, path.basename(target));
        } catch (e) { cb(e); }
      }
    });
    return multer({ storage, limits: limits || { fileSize: MAX_UPLOAD_BYTES } });
  }

  const upload = makeUploader(req => userPath(req, req.query.path || ''));

  router.post('/api/upload', auth, (req, res) => {
    upload.array('files')(req, res, err => {
      if (err) return res.status(err.status || 400).json({ error: err.message });
      const subidos = (req.files || []).map(f => f.filename);
      if (subidos.length) registrarActividad(req, 'archivo_subido', { path: req.query.path || '', archivos: subidos });
      res.json({ ok: true, uploaded: subidos });
    });
  });

  return { makeUploader };
}

module.exports = { creaSubida };
