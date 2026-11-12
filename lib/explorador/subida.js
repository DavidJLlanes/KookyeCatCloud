'use strict';
// Subida de archivos: un único constructor para la subida autenticada y la pública (solo cambia dónde cae).
const fs = require('fs');
const path = require('path');

// Recorta un nombre a 200 bytes en UTF-8 sin partir caracteres y conservando la extensión
function recorta(nombre) {
  if (Buffer.byteLength(nombre) <= 200) return nombre;
  const ext = path.extname(nombre).slice(0, 20);
  let base = nombre.slice(0, nombre.length - ext.length);
  while (Buffer.byteLength(base + ext) > 200) base = Array.from(base).slice(0, -1).join('');
  return base + ext;
}

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
          // sin caracteres de control y con un máximo de 200 bytes (el sistema de archivos admite 255)
          const safeName = recorta(path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '')) || 'archivo';
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
    // defParamCharset utf8: los navegadores mandan el nombre en UTF-8; con el latin1 por defecto «ñandú.txt» llegaba como «Ã±andÃº.txt»
    return multer({ storage, defParamCharset: 'utf8', limits: limits || { fileSize: MAX_UPLOAD_BYTES, files: 1000 } });
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
