'use strict';
// Ocurrencias de un evento repetido dentro de un rango.
const { DAY, msDe, diaDe, fechaDe } = require('./fechas');

// Ocurrencias de un evento dentro de [desde, hasta] (días 'YYYY-MM-DD', ambos inclusive)
function expande(ev, desde, hasta) {
  if (!ev.start) return [];                     // tarea sin fecha: no ocupa ningún día
  const ini = msDe(ev.start);
  const dur = msDe(ev.end) - ini;
  const extra = ev.allDay ? DAY : 0;            // el último día de un evento de día completo cuenta entero
  const finVentana = msDe(hasta) + DAY;         // exclusivo
  const iniVentana = msDe(desde);
  const solapa = (ms) => ms < finVentana && ms + dur + extra > iniVentana;
  const mk = (ms) => {
    const s = ev.allDay ? diaDe(ms) : fechaDe(ms);
    const e = ev.allDay ? diaDe(ms + dur) : fechaDe(ms + dur);
    return { ...ev, start: s, end: e, occurrence: diaDe(ms), recurring: !!ev.repeat };
  };
  if (!ev.repeat) return solapa(ini) ? [mk(ini)] : [];

  const r = ev.repeat;
  const salida = [];
  const ex = new Set(ev.exdates || []);
  const tope = r.until ? Math.min(finVentana, msDe(r.until) + DAY) : finVentana;
  const horaMs = ini - Math.floor(ini / DAY) * DAY;
  const dia0 = ini - horaMs;
  let n = 0;                                    // ocurrencias contadas desde el origen
  const emite = (diaMs) => {
    const ms = diaMs + horaMs;
    n++;
    if (r.count && n > r.count) return false;
    if (ms >= tope) return false;
    if (!ex.has(diaDe(ms)) && solapa(ms)) salida.push(mk(ms));
    return salida.length < 1000;
  };

  if (r.freq === 'daily') {
    let k = 0;
    if (!r.count) k = Math.max(0, Math.floor((iniVentana - dur - extra - dia0) / DAY / r.interval));
    n = k;
    for (; ; k++) if (!emite(dia0 + k * r.interval * DAY)) break;
  } else if (r.freq === 'weekly') {
    const dow0 = new Date(ini).getUTCDay();
    const dows = (r.byday && r.byday.length) ? r.byday : [dow0];
    const domingo0 = dia0 - dow0 * DAY;
    let dia = dia0;
    if (!r.count) dia = Math.max(dia0, Math.floor((iniVentana - dur - extra) / DAY) * DAY);
    for (; dia < tope; dia += DAY) {
      const sem = Math.floor((dia - domingo0) / (7 * DAY));
      if (sem % r.interval !== 0 || !dows.includes(new Date(dia).getUTCDay())) continue;
      if (!emite(dia)) break;
    }
  } else {
    const f0 = new Date(dia0);
    const paso = r.freq === 'yearly' ? 12 * r.interval : r.interval;
    let k = 0;
    if (!r.count) {
      const f = new Date(iniVentana - dur - extra);
      const meses = (f.getUTCFullYear() - f0.getUTCFullYear()) * 12 + f.getUTCMonth() - f0.getUTCMonth();
      k = Math.max(0, Math.floor(meses / paso) - 1);
    }
    n = k;
    for (; k < 100000; k++) {
      const mes = f0.getUTCMonth() + k * paso;
      const y = f0.getUTCFullYear() + Math.floor(mes / 12);
      const m = ((mes % 12) + 12) % 12;
      const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (!emite(Date.UTC(y, m, Math.min(f0.getUTCDate(), ultimo)))) break;
    }
  }
  return salida;
}

module.exports = { expande };
