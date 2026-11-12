'use strict';
// Importar · límites y listas comunes.
const MB = 1024 * 1024;
module.exports = {
  MAX_SUBIDA: 100 * MB,                  // archivo subido para analizar
  PAQUETE_TTL: 20 * 60 * 1000,           // el análisis espera la confirmación este tiempo
  PAQUETES_POR_USUARIO: 3,
  NOTE_MAX_CHARS: Number(process.env.NOTE_MAX_CHARS || 500000),
  NOTES_LIMIT: Number(process.env.NOTES_LIMIT || 5000),
  CARPETA_ADJUNTOS: 'Adjuntos de notas',
  // Solo formatos que el visor de notas muestra sin ejecutar nada (nunca svg, html ni js)
  ADJUNTO_OK: /\.(png|jpe?g|gif|webp|avif|bmp|pdf|txt|md|csv|docx?|xlsx?|pptx?|odt|ods|odp|zip|mp3|m4a|wav|ogg|mp4|mov|webm)$/i,
};
