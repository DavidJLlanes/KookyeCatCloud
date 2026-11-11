'use strict';
// Avisos de Recordatorios: cada uno avisa cuando le toca (a su hora, o a la hora de ajustes si es de todo el día).
// Se mira la última media jornada, así un aviso que cayó en horas de silencio o con el servidor parado no se pierde.
const REVISA_ATRAS = 12 * 3600000;

const antes = (m) => (m === 0 ? 'ahora' : m < 60 ? `en ${m} min` : m < 1440 ? `en ${Math.round(m / 60)} h` : 'mañana');

module.exports = {
  id: 'recordatorios', vista: 'recordatorios', titulo: 'Recordatorios',
  generico: (n) => (n === 1 ? 'Tienes un recordatorio' : `Tienes ${n} recordatorios`),
  async pendientes({ user, cfg, ahora, core }) {
    const lista = await core.avisos(user, ahora.ms - REVISA_ATRAS, ahora.ms, cfg.hora);
    return lista.map(r => ({ clave: r.clave, texto: `${r.titulo}${r.hora ? ` · ${r.hora}` : ''}${r.antes > 0 ? ` · ${antes(r.antes)}` : ''}`, orden: r.t }));
  },
};
