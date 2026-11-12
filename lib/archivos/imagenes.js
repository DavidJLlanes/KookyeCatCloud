'use strict';
// Conversión y miniaturas con caché en disco (sharp y ffmpeg son opcionales).
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { THUMB_SIZE } = require('./tipos');

// Demuxer de ffmpeg por extensión (nunca autodetección): los de las extensiones de VIDEO_TYPES
const DEMUXER = { '.mp4': 'mov', '.m4v': 'mov', '.mov': 'mov', '.webm': 'matroska', '.mkv': 'matroska', '.ogv': 'ogg' };

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

  // Saca un fotograma del vídeo con ffmpeg y lo deja cacheado.
  // Seguridad: ffmpeg adivina el formato por el CONTENIDO, y un «vídeo» subido que en realidad es una lista HLS o un
  // guion «concat» puede hacerle leer archivos del servidor o pedir URLs. Por eso el demuxer se fija según la extensión
  // (solo contenedores de vídeo de verdad), solo se permite el protocolo «file» y cada intento tiene su tiempo máximo.
  function ejecutaFfmpeg(args) {
    return new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', args, { stdio: 'ignore' });
      const t = setTimeout(() => p.kill('SIGKILL'), 20000);
      p.on('error', (e) => { clearTimeout(t); reject(e); });
      p.on('close', (c) => { clearTimeout(t); c === 0 ? resolve() : reject(new Error('ffmpeg falló')); });
    });
  }
  async function fotogramaVideo(file, destino) {
    const formato = DEMUXER[path.extname(file).toLowerCase()];
    if (!formato) throw new Error('Formato de vídeo no admitido para miniaturas');
    const args = (ss) => [
      '-nostdin', '-y', '-loglevel', 'error', '-protocol_whitelist', 'file',
      '-ss', ss,                    // un segundo dentro: el primer fotograma suele ser negro
      '-f', formato, '-i', file,
      '-frames:v', '1',
      '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
      destino,
    ];
    try { await ejecutaFfmpeg(args('1')); }
    catch (e) { if (e && e.code === 'ENOENT') throw e; await ejecutaFfmpeg(args('0')); }   // vídeo de menos de un segundo
  }

  return { convertirCache, fotogramaVideo };
}

module.exports = { creaImagenes };
