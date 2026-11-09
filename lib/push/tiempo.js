'use strict';
// «Ahora» en la zona horaria de la app (APP_TZ, por defecto Europe/Madrid), como hora de reloj sin zona: igual que el
// calendario, que guarda «2026-11-10T09:00» sin zona. `ms` es esa hora de reloj expresada como UTC para poder restar.
const ZONA = process.env.APP_TZ || 'Europe/Madrid';
const DIA = 86400000;

function ahora(fecha = new Date()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(fecha)) p[x.type] = x.value;
  return { dia: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, ms: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) };
}

const diaMs = (dia) => Date.parse(`${dia}T00:00:00Z`);
const sumaDias = (dia, n) => new Date(diaMs(dia) + n * DIA).toISOString().slice(0, 10);
const diasHasta = (dia, desde) => Math.round((diaMs(dia) - diaMs(desde)) / DIA);
const enMinutos = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

// ¿Estamos dentro del horario de silencio? (admite que cruce la medianoche: 22:00 → 08:00)
function enSilencio(s, hm) {
  if (!s || !s.on) return false;
  const a = enMinutos(s.desde), b = enMinutos(s.hasta), n = enMinutos(hm);
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

module.exports = { ahora, diaMs, sumaDias, diasHasta, enMinutos, enSilencio, DIA, ZONA };
