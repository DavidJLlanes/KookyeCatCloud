'use strict';
// Fechas «ingenuas» (sin zona horaria), como las ve el usuario:
//   día completo  -> 'YYYY-MM-DD'  (el fin es inclusivo: el último día)
//   con hora      -> 'YYYY-MM-DDTHH:mm'
// Así un evento "a las 9:00" sigue siendo a las 9:00 aunque cambie el horario de verano.
const DAY = 86400000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const msDe = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
};
const p2 = (n) => String(n).padStart(2, '0');
const diaDe = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
const fechaDe = (ms) => { const d = new Date(ms); return `${diaDe(ms)}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const validaFecha = (s) => {
  if (!(RE_DIA.test(s) || RE_HORA.test(s))) return false;
  const ms = msDe(s);
  return diaDe(ms) === s.slice(0, 10);
};

module.exports = { DAY, RE_DIA, RE_HORA, msDe, p2, diaDe, fechaDe, validaFecha };
