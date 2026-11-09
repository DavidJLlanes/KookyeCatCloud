'use strict';
// Avisos de pagos: unos días antes (el campo «Avisar» de cada pago), el mismo día y mientras esté vencido (hasta 7 días).
const { diasHasta, enMinutos } = require('../tiempo');

const euros = (n) => (n === null || n === undefined ? '' : ` · ${String(n).replace('.', ',')} €`);
const cuando = (d) => (d > 1 ? `en ${d} días` : d === 1 ? 'mañana' : d === 0 ? 'hoy' : `vencido hace ${-d} ${d === -1 ? 'día' : 'días'}`);

module.exports = {
  id: 'pagos', vista: 'pagos', titulo: 'Pagos',
  generico: (n) => (n === 1 ? 'Tienes un pago por vencer' : `Tienes ${n} pagos por vencer`),
  async pendientes({ user, cfg, ahora, core }) {
    if (enMinutos(ahora.hm) < enMinutos(cfg.hora)) return [];
    const out = [];
    for (const p of await core.vencimientos(user)) {
      const d = diasHasta(p.fecha, ahora.dia);
      let clave = null;
      if (d > 0 && d <= (p.avisoDias || 0)) clave = `pago:${p.id}:${p.fecha}:antes`;
      else if (d === 0 && cfg.mismoDia) clave = `pago:${p.id}:${p.fecha}:hoy`;
      else if (d < 0 && d >= -7 && cfg.vencidos) clave = `pago:${p.id}:${p.fecha}:venc:${ahora.dia}`;
      if (clave) out.push({ clave, texto: `${p.nombre}${euros(p.importe)} · ${cuando(d)}`, orden: d });
    }
    return out.sort((a, b) => a.orden - b.orden);
  },
};
