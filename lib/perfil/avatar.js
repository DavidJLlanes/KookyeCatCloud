'use strict';
// Foto de perfil: se procesa a un cuadrado de 256 × 256 en WebP (el original no se guarda) y se escribe de forma atómica.
const { HttpError, escribeAtomico } = require('../store');

const LADO = 256;
const FORMATOS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff', 'gif']);

async function procesa(sharp, buffer) {
  if (!sharp) throw new HttpError(501, 'El servidor no tiene «sharp» instalado: no puede procesar fotos');
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 64e6, failOn: 'error' }).metadata(); } catch { throw new HttpError(400, 'No se pudo leer la imagen'); }
  if (!FORMATOS.has(meta.format)) throw new HttpError(415, 'Formato de imagen no compatible (usa JPG, PNG, WebP o HEIC)');
  try {
    return await sharp(buffer, { limitInputPixels: 64e6, failOn: 'none' }).rotate().resize(LADO, LADO, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
  } catch { throw new HttpError(400, 'No se pudo procesar la imagen'); }
}

module.exports = { procesa, escribe: escribeAtomico };
