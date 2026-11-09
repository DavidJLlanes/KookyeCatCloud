'use strict';
// Avisos del calendario: los recordatorios que cada evento o tarea ya tiene («15 min antes», «1 día antes»…).
// Se mira la última media jornada, así un aviso que cayó en horas de silencio o con el servidor parado no se pierde.
const REVISA_ATRAS = 12 * 3600000;

const hhmm = (s) => String(s).slice(11, 16);
const antes = (m) => (m === 0 ? 'ahora' : m < 60 ? `en ${m} min` : m < 1440 ? `en ${Math.round(m / 60)} h` : `en ${Math.round(m / 1440)} d`);

module.exports = {
  id: 'calendario', vista: 'calendar', titulo: 'Calendario',
  generico: (n) => (n === 1 ? 'Tienes un evento próximo' : `Tienes ${n} eventos próximos`),
  async pendientes({ user, cfg, ahora, core }) {
    const lista = await core.recordatorios(user, ahora.ms - REVISA_ATRAS, ahora.ms, cfg.hora);
    return lista.map(r => ({
      clave: `ev:${r.id}:${r.ocurrencia}:${r.minutos}`,
      texto: `${r.tarea ? 'Tarea: ' : ''}${r.titulo}${r.diaCompleto ? '' : ` · ${hhmm(r.start)}`} · ${r.diaCompleto ? (r.minutos ? antes(r.minutos) : 'hoy') : antes(r.minutos)}`,
      orden: r.t,
    })).sort((a, b) => a.orden - b.orden);
  },
};
