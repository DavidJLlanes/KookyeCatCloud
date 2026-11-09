'use strict';
// Contadores de Marcadores para la gamificación (mk_*).
function resumenMarcadores(d) {
  const ms = d.marcadores || [], cs = d.carpetas || [];
  const sinCarpeta = ms.filter(m => !m.carpeta).length;
  return {
    marcadores: ms.length,
    mk_total: ms.length,
    mk_carpetas: cs.length,
    mk_colores: ms.filter(m => m.color).length,
    mk_visitas: ms.reduce((a, m) => a + (m.visitas || 0), 0),
    mk_ordenado: ms.length >= 10 && sinCarpeta === 0 ? 1 : 0,
  };
}
module.exports = { resumenMarcadores };
