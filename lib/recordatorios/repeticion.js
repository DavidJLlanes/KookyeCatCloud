'use strict';
// Recordatorios que se repiten. Forma de `repite` (o null):
//   { freq: 'dia'|'semana'|'mes'|'anio', cada: 1..99, dias: [1..7] (solo semana; 1 = lunes), mesModo: 'dia'|'semana' (solo mes),
//     hasta: 'YYYY-MM-DD' | '' }
// «mesModo: semana» es «el primer lunes del mes» / «el último viernes»: se deduce de la fecha del recordatorio.
// Al marcarlo hecho, la fecha salta a la siguiente vez (nunca anterior a hoy: las que se saltaron no se acumulan).
const { HttpError } = require('../store');

const FREQ = ['dia', 'semana', 'mes', 'anio'];
const DIA = 86400000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d) => Date.parse(d + 'T00:00:00Z');
const txt = (t) => new Date(t).toISOString().slice(0, 10);
const iso = (d) => ((new Date(ms(d)).getUTCDay() + 6) % 7) + 1;                // 1 lunes … 7 domingo
const diasDelMes = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();      // m: 0-11
const fechaOk = (s) => RE_DIA.test(s) && Number.isFinite(ms(s)) && txt(ms(s)) === s;

function limpiaRepite(v, fecha) {
  if (v === null || v === undefined || v === '' || v === false) return null;
  if (typeof v !== 'object' || Array.isArray(v) || !FREQ.includes(v.freq)) throw new HttpError(400, 'La repetición no es válida');
  if (!fecha) throw new HttpError(400, 'Para repetir un recordatorio necesita fecha');
  const cada = Number(v.cada === undefined ? 1 : v.cada);
  if (!Number.isInteger(cada) || cada < 1 || cada > 99) throw new HttpError(400, 'La repetición debe ser cada 1 a 99');
  const r = { freq: v.freq, cada, hasta: '', ancla: fecha };     // ancla: el día de partida (31 → fin de mes sin que se vaya corriendo)
  if (v.hasta) { if (!fechaOk(String(v.hasta))) throw new HttpError(400, 'La fecha final de la repetición no es válida'); if (String(v.hasta) < fecha) throw new HttpError(400, 'La repetición no puede terminar antes de la fecha'); r.hasta = String(v.hasta); }
  if (v.freq === 'semana') {
    const dias = [...new Set((Array.isArray(v.dias) ? v.dias : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
    r.dias = dias.length ? dias : [iso(fecha)];
  }
  if (v.freq === 'mes') r.mesModo = v.mesModo === 'semana' ? 'semana' : 'dia';
  return r;
}

// Fecha de un mes concreto (y, m 0-11) según el modo, tomando como modelo la fecha original
function enMes(y, m, orig, modo) {
  const dim = diasDelMes(y, m);
  if (modo !== 'semana') return txt(Date.UTC(y, m, Math.min(Number(orig.slice(8, 10)), dim)));
  const wd = iso(orig), n = Math.ceil(Number(orig.slice(8, 10)) / 7);            // el n-ésimo día de la semana wd
  const primero = iso(txt(Date.UTC(y, m, 1)));
  let dia = 1 + ((wd - primero + 7) % 7) + (Math.min(n, 4) - 1) * 7;
  if (n === 5) while (dia + 7 <= dim) dia += 7;                                     // el 5.º de la fecha original = «el último»
  return txt(Date.UTC(y, m, Math.min(dia, dim)));
}

// Siguiente vez posterior a `fecha` y no anterior a `desde` (hoy); null si ya pasó la fecha final
function siguiente(rep, fecha, desde) {
  if (!rep || !fecha) return null;
  const inicio = Math.max(ms(fecha) + DIA, ms(desde || fecha));
  let res = null;
  if (rep.freq === 'dia') { const k = Math.ceil((inicio - ms(fecha)) / DIA / rep.cada); res = txt(ms(fecha) + k * rep.cada * DIA); }
  else if (rep.freq === 'semana') {
    const lunes = (d) => ms(d) - (iso(d) - 1) * DIA, base = lunes(fecha);
    for (let t = inicio; t < inicio + (7 * rep.cada + 7) * DIA; t += DIA) {
      const d = txt(t); if (rep.dias.includes(iso(d)) && Math.round((lunes(d) - base) / DIA / 7) % rep.cada === 0) { res = d; break; }
    }
  } else {
    const y0 = Number(fecha.slice(0, 4)), m0 = Number(fecha.slice(5, 7)) - 1;
    for (let k = 1; k < 2400 && !res; k++) {
      const meses = rep.freq === 'mes' ? k * rep.cada : 0, anios = rep.freq === 'anio' ? k * rep.cada : 0;
      const m = m0 + meses, y = y0 + anios + Math.floor(m / 12);
      const modelo = rep.ancla || fecha;
      const d = rep.freq === 'mes' ? enMes(y, ((m % 12) + 12) % 12, modelo, rep.mesModo) : enMes(y, m0, modelo, 'dia');
      if (ms(d) >= inicio) res = d;
    }
  }
  return res && (!rep.hasta || res <= rep.hasta) ? res : null;
}

const describe = (rep, fecha) => {
  if (!rep) return '';
  const n = rep.cada;
  const base = { dia: n === 1 ? 'Cada día' : `Cada ${n} días`, semana: n === 1 ? 'Cada semana' : `Cada ${n} semanas`, mes: n === 1 ? 'Cada mes' : `Cada ${n} meses`, anio: n === 1 ? 'Cada año' : `Cada ${n} años` }[rep.freq];
  return rep.hasta ? `${base}, hasta ${rep.hasta.split('-').reverse().join('/')}` : base + (fecha ? '' : '');
};

module.exports = { limpiaRepite, siguiente, describe, FREQ };
