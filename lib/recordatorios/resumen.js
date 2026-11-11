'use strict';
// Contadores de Recordatorios para la gamificación (rc_*).
const { ahora } = require('../push/tiempo');

function resumenRecordatorios(d) {
  const rs = d.recordatorios || [];
  const hoy = ahora().dia;
  const pendientes = rs.filter(r => !r.hecho);
  const hechos = rs.filter(r => r.hecho).length;
  return {
    recordatorios: rs.length,
    rc_total: rs.length,
    rc_hechos: hechos,
    rc_vinculados: rs.filter(r => r.vinculo).length,
    rc_repiten: rs.filter(r => r.repite).length,
    rc_vueltas: rs.reduce((n, r) => n + (r.vueltas || 0), 0),
    rc_vmax: rs.reduce((n, r) => Math.max(n, r.vueltas || 0), 0),
    rc_aldia: hechos >= 5 && !pendientes.some(r => r.fecha && r.fecha < hoy) ? 1 : 0,
  };
}
module.exports = { resumenRecordatorios };
