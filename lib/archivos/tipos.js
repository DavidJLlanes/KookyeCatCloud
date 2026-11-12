'use strict';
// Tipos de archivo que la app sabe previsualizar, convertir o editar, y los topes asociados.
const createOffice = require('../office');

const IMAGE_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
};
const HEIC_TYPES = { '.heic': 'image/heic', '.heif': 'image/heif' };
const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
};
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/opus', '.flac': 'audio/flac',
};
const PREVIEW_TYPES = { ...IMAGE_TYPES, ...HEIC_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES, '.pdf': 'application/pdf' };
// Texto plano y código: se devuelven como JSON y el cliente los pinta con textContent
const TEXT_RE = /\.(txt|md|markdown|csv|tsv|log|json|xml|svg|yml|yaml|ini|conf|cfg|toml|env|js|mjs|cjs|ts|jsx|tsx|css|scss|less|html?|php|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|sh|bash|zsh|sql|ps1|bat|srt|vtt|gitignore|dockerfile|makefile)$/i;
// Admite bytes ("524288") o con sufijo ("512KB", "1MB"); si el valor no vale, usa el de por defecto
// en vez de dejar NaN, que rompía la lectura de cualquier texto.
function bytesDeEntorno(valor, porDefecto) {
  const m = /^(\d+(?:[.,]\d+)?)[ \t]*([kmg]?)b?$/i.exec(String(valor ?? '').trim());
  if (!m) return porDefecto;
  const n = Number(m[1].replace(',', '.')) * ({ '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase()]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
}
const TEXT_MAX = bytesDeEntorno(process.env.TEXT_MAX, 512 * 1024);
const { OFFICE_RE } = createOffice;

// Mapa de fotos. El servidor de tiles es lo único externo que carga la app, así que
// se declara aquí y de aquí sale el permiso de la CSP: cambiar TILE_URL basta.
const TILE_URL = process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = process.env.TILE_ATTR ||
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TILE_ORIGIN = (() => {
  try { return new URL(TILE_URL.replace(/\{[sxyz]\}/g, '1')).origin; }
  catch { return 'https://tile.openstreetmap.org'; }
})();
const THUMBABLE = { ...IMAGE_TYPES, ...HEIC_TYPES };
const DISPLAY_MAX = Number(process.env.DISPLAY_MAX || 2200);
const THUMB_SIZE = 480;

module.exports = {
  IMAGE_TYPES, HEIC_TYPES, VIDEO_TYPES, AUDIO_TYPES, PREVIEW_TYPES, TEXT_RE, TEXT_MAX, OFFICE_RE, THUMBABLE, DISPLAY_MAX, THUMB_SIZE,
  TILE_URL, TILE_ATTR, TILE_ORIGIN, bytesDeEntorno,
};
