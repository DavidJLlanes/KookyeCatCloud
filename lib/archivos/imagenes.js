'use strict';
// Conversión y miniaturas con caché en disco (sharp y ffmpeg son opcionales).
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { THUMB_SIZE } = require('./tipos');

function creaImagenes({ sharp, THUMBS_DIR, exists }) {
  // Convierte a WebP y cachea; devuelve la ruta del archivo cacheado
  async function convertirCache(file, stat, ancho, sufijo) {
    const key = crypto.createHash('sha1')
      .update(`${file}|${stat.size}|${stat.mtimeMs}|${ancho}|${sufijo}`).digest('hex');
    const cached = path.join(THUMBS_DIR, `${key}.webp`);
    if (await exists(cached)) return cached;
    const buf = await sharp(file, { failOn: 'none' })
      .rotate()
      .resize(ancho, ancho, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const tmp = `${cached}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, cached);
    return cached;
  }

  // Saca un fotograma del vídeo con ffmpeg y lo deja cacheado
  function fotogramaVideo(file, destino) {
    return new Promise((resolve, reject) => {
      const args = [
        '-y', '-loglevel', 'error',
        '-ss', '1',                 // un segundo dentro: el primer fotograma suele ser negro
        '-i', file,
        '-frames:v', '1',
        '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
        destino,
      ];
      const p = spawn('ffmpeg', args, { stdio: 'ignore' });
      const temporizador = setTimeout(() => p.kill('SIGKILL'), 20000);
      p.on('error', err => { clearTimeout(temporizador); reject(err); });
      p.on('close', code => {
        clearTimeout(temporizador);
        if (code === 0) return resolve();
        // Vídeo más corto que un segundo: se reintenta desde el principio
        const p2 = spawn('ffmpeg', args.map(a => (a === '1' ? '0' : a)), { stdio: 'ignore' });
        p2.on('error', reject);
        p2.on('close', c2 => (c2 === 0 ? resolve() : reject(new Error('ffmpeg falló'))));
      });
    });
  }

  return { convertirCache, fotogramaVideo };
}

module.exports = { creaImagenes };
