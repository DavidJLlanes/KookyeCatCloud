'use strict';
// Preferencias de avisos de un usuario: qué secciones avisan, a qué hora, con cuántos días de antelación y cuándo no molestar.
const { HttpError } = require('../store');

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIAS_PERMITIDOS = [0, 1, 2, 3, 7, 14, 30];

const POR_DEFECTO = () => ({
  on: false,                          // interruptor general: se enciende al activar los avisos en un dispositivo
  detalles: false,                    // false: avisos genéricos («Hoy vence un pago»); true: con nombre e importe
  silencio: { on: true, desde: '22:00', hasta: '08:00' },
  pagos: { on: true, hora: '09:00', mismoDia: true, vencidos: true },   // la antelación de cada pago es su campo «Avisar»
  calendario: { on: true, hora: '09:00' },                               // la hora de cada aviso es el recordatorio de cada evento; `hora` solo vale para los de día completo
  contactos: { on: true, hora: '09:00', dias: [0] },
  recordatorios: { on: true, hora: '09:00' },                            // cada recordatorio avisa a su hora; `hora` solo vale para los de todo el día
});

const hora = (v, def, nombre) => { if (v === undefined) return def; if (!RE_HORA.test(String(v))) throw new HttpError(400, `${nombre}: escribe una hora válida (HH:MM)`); return v; };
const si = (v, def) => (v === undefined ? def : v === true || v === 'true');

// Aplica `b` sobre `prev` (o los valores por defecto), rechazando lo que no vale
function limpia(b, prev) {
  const d = POR_DEFECTO(), base = prev || d, o = JSON.parse(JSON.stringify({ ...d, ...base }));
  // Lo que falte en lo guardado (un ajuste nuevo en una versión posterior, un archivo a medias) se rellena con el valor por defecto
  for (const k of ['silencio', 'pagos', 'calendario', 'contactos', 'recordatorios']) o[k] = { ...d[k], ...(base[k] && typeof base[k] === 'object' ? JSON.parse(JSON.stringify(base[k])) : {}) };
  if (!Array.isArray(o.contactos.dias)) o.contactos.dias = d.contactos.dias;
  b = b && typeof b === 'object' ? b : {};
  o.on = si(b.on, o.on); o.detalles = si(b.detalles, o.detalles);
  if (b.silencio) { const s = b.silencio; o.silencio = { on: si(s.on, o.silencio.on), desde: hora(s.desde, o.silencio.desde, 'Silencio desde'), hasta: hora(s.hasta, o.silencio.hasta, 'Silencio hasta') }; }
  if (b.pagos) { const s = b.pagos; o.pagos = { on: si(s.on, o.pagos.on), hora: hora(s.hora, o.pagos.hora, 'Hora de pagos'), mismoDia: si(s.mismoDia, o.pagos.mismoDia), vencidos: si(s.vencidos, o.pagos.vencidos) }; }
  if (b.calendario) { const s = b.calendario; o.calendario = { on: si(s.on, o.calendario.on), hora: hora(s.hora, o.calendario.hora, 'Hora de eventos de día completo') }; }
  if (b.recordatorios) { const s = b.recordatorios; o.recordatorios = { on: si(s.on, o.recordatorios.on), hora: hora(s.hora, o.recordatorios.hora, 'Hora de recordatorios de todo el día') }; }
  if (b.contactos) {
    const s = b.contactos; let dias = o.contactos.dias;
    if (s.dias !== undefined) {
      if (!Array.isArray(s.dias) || s.dias.some(n => !DIAS_PERMITIDOS.includes(Number(n)))) throw new HttpError(400, 'Días de antelación no válidos');
      dias = [...new Set(s.dias.map(Number))].sort((a, c) => a - c);
    }
    o.contactos = { on: si(s.on, o.contactos.on), hora: hora(s.hora, o.contactos.hora, 'Hora de contactos'), dias };
  }
  return o;
}

module.exports = { POR_DEFECTO, limpia, DIAS_PERMITIDOS, RE_HORA };
