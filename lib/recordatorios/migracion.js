'use strict';
// Los recordatorios y tareas que antes colgaban de una nota o un contacto vivían como eventos del calendario. Se pasan una sola vez
// a Recordatorios (que es ahora su sitio) y siguen viéndose en el calendario con la misma fecha.
const { newId } = require('../nucleo/store');

const TIPO = Object.assign(Object.create(null), { note: 'note', contact: 'contact' });

function desdeEvento(e) {
  const hora = e.start && !e.allDay ? String(e.start).slice(11, 16) : '';
  const rem = Array.isArray(e.reminders) && e.reminders.length ? Number(e.reminders[0]) : -1;
  const vinculo = TIPO[e.link.type] ? { tipo: TIPO[e.link.type], ref: String(e.link.ref), titulo: String(e.link.title || '') } : null;
  return {
    id: newId(), titulo: String(e.title || 'Recordatorio').slice(0, 200), notas: '', fecha: e.start ? String(e.start).slice(0, 10) : '', hora,
    antes: [-1, 0, 10, 60, 1440].includes(rem) ? rem : -1, calendario: !!e.start, vinculo,
    hecho: !!e.done, hechoEn: e.done ? Date.now() : 0, createdAt: e.createdAt || Date.now(), updatedAt: Date.now(),
  };
}

// Devuelve los recordatorios creados (vacío si ya estaba hecho o no había nada). El JSON se guarda ANTES de tocar el calendario:
// si algo falla a medias, a lo sumo queda un evento repetido, nunca se pierde un recordatorio.
async function migra({ user, calendar, muta }) {
  const eventos = (await calendar.eventosVinculados(user)).filter(e => TIPO[e.link.type]);
  const hechos = [];
  await muta((d) => {
    if (d.migrado) return { __abort: true };
    for (const e of eventos) hechos.push({ evento: e, item: desdeEvento(e) });
    d.recordatorios.push(...hechos.map(h => h.item));
    d.migrado = true;
  });
  for (const { evento, item } of hechos) {
    try {
      if (item.calendario) await calendar.sincronizaOrigen(user, 'recordatorio', item.id, item.titulo, { date: item.fecha, time: item.hora });
      await calendar.quitaEvento(user, evento.id);
    } catch (e) { console.error('[recordatorios] migración de', evento.id, e.message); }
  }
  return hechos.map(h => h.item);
}

module.exports = { migra };
