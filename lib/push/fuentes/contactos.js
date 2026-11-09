'use strict';
// Avisos de fechas de contactos (cumpleaños y demás): el propio día y/o los días de antelación elegidos.
const { enMinutos, sumaDias } = require('../tiempo');

module.exports = {
  id: 'contactos', vista: 'contacts', titulo: 'Contactos',
  generico: (n) => (n === 1 ? 'Hay una fecha especial cerca' : `Hay ${n} fechas especiales cerca`),
  async pendientes({ user, cfg, ahora, core }) {
    if (enMinutos(ahora.hm) < enMinutos(cfg.hora) || !cfg.dias.length) return [];
    const fechas = await core.fechas(user), out = [];
    for (const antes of cfg.dias) {
      const objetivo = sumaDias(ahora.dia, antes), mmdd = objetivo.slice(5);
      for (const f of fechas) {
        if (`${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}` !== mmdd) continue;
        const edad = f.anio ? Number(objetivo.slice(0, 4)) - f.anio : null;
        const cuando = antes === 0 ? 'hoy' : antes === 1 ? 'mañana' : `en ${antes} días`;
        out.push({ clave: `ct:${f.id}:${f.label}:${objetivo}:${antes}`, texto: `${f.label} de ${f.nombre}${edad > 0 ? ` (${edad})` : ''} · ${cuando}`, orden: antes });
      }
    }
    return out.sort((a, b) => a.orden - b.orden);
  },
};
