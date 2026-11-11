'use strict';
// Contadores de Bloques sincronizados para la gamificación (sy_*). Los usos dentro de las notas los cuenta lib/notas-bloques.js (nb_sync).
function resumenSincronizados(d) {
  const bs = d.bloques || [];
  return { sincronizados: bs.length, sy_total: bs.length, sy_ediciones: bs.reduce((n, b) => n + (b.ediciones || 0), 0) };
}
module.exports = { resumenSincronizados };
