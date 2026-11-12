'use strict';
// Documentos · contadores de logros (doc_*). `stats`: lo que no se puede deducir de los documentos (descargas, plantillas usadas).
function resumenDocumentos(docs, stats = {}) {
  return {
    doc_total: docs.length,
    doc_palabras: docs.reduce((a, d) => a + (d.palabras || 0), 0),
    doc_max: docs.reduce((a, d) => Math.max(a, d.palabras || 0), 0),
    doc_cols: docs.filter(d => d.cols).length,
    doc_tablas: docs.filter(d => d.tablas).length,
    doc_formato: docs.filter(d => d.titulos && d.listas && (d.palabras || 0) >= 30).length,
    doc_export: stats.exportados || 0,
    doc_plantillas: stats.plantillas || 0,
  };
}
module.exports = { resumenDocumentos };
