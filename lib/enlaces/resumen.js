'use strict';
// Contadores de gamificación de los enlaces de descarga (URL corta, caducidad y QR).
function resumenEnlaces(links, stats = {}) {
  const compartidos = links.filter(l => (l.kind || 'upload') === 'share');
  return {
    en_qr: compartidos.filter(l => l.qr > 0).length,
    en_caduca: compartidos.filter(l => !!l.expiresAt).length,
    en_revocados: stats.revocados || 0,
    en_perpetuos: compartidos.filter(l => !l.expiresAt).length,
  };
}
module.exports = { resumenEnlaces };
