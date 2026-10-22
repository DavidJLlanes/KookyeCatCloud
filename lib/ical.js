'use strict';
// Generador de calendarios iCalendar (RFC 5545) para la suscripción de solo lectura que
// leen Google Calendar, Apple Calendar u Outlook.
//
// Las horas se emiten "flotantes" (sin zona ni Z), igual que las guarda la app: el evento
// de las 9:00 se ve a las 9:00 en el calendario de quien se suscriba, sea cual sea su zona.

const p2 = (n) => String(n).padStart(2, '0');
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const fechaDia = (s) => s.slice(0, 10).replace(/-/g, '');
const fechaHora = (s) => `${s.slice(0, 10).replace(/-/g, '')}T${s.slice(11, 13)}${s.slice(14, 16)}00`;
const sumaDias = (s, n) => {
  const m = DIA.exec(s.slice(0, 10));
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};

const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Las líneas no pueden pasar de 75 octetos: se parten con un espacio de continuación
function pliega(linea) {
  if (Buffer.byteLength(linea) <= 75) return linea;
  const partes = []; let actual = ''; let bytes = 0; let limite = 75;
  for (const ch of linea) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > limite) { partes.push(actual); actual = ''; bytes = 0; limite = 74; }
    actual += ch; bytes += b;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

const DIAS_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function rrule(r, allDay) {
  const f = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.freq];
  if (!f) return '';
  let s = `FREQ=${f}`;
  if (r.interval > 1) s += `;INTERVAL=${r.interval}`;
  if (r.freq === 'weekly' && r.byday && r.byday.length) s += `;BYDAY=${r.byday.map(d => DIAS_ICS[d]).join(',')}`;
  if (r.until) s += `;UNTIL=${r.until.replace(/-/g, '')}${allDay ? '' : 'T235959'}`;
  else if (r.count) s += `;COUNT=${r.count}`;
  return s;
}

function minutosATrigger(m) {
  if (!m) return 'PT0S';
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return '-P' + (d ? `${d}D` : '') + (h || mi ? 'T' + (h ? `${h}H` : '') + (mi ? `${mi}M` : '') : '');
}

function veventos(ev, calName, urlBase, stamp) {
  const L = [];
  const dt = (k, v, allDay) => L.push(allDay ? `${k};VALUE=DATE:${fechaDia(v)}` : `${k}:${fechaHora(v)}`);
  const base = (tipo) => {
    L.push(`BEGIN:${tipo}`, `UID:${ev.id}@kookyecatcloud`, `DTSTAMP:${stamp(ev.updatedAt || ev.createdAt)}`);
    L.push(`SUMMARY:${esc((ev.kind === 'task' && tipo === 'VEVENT' ? '☐ ' : '') + ev.title)}`);
    if (ev.description) L.push(`DESCRIPTION:${esc(ev.description)}`);
    if (ev.location) L.push(`LOCATION:${esc(ev.location)}`);
    L.push(`CATEGORIES:${esc(calName)}`);
    if (urlBase && ev.source) L.push(`URL:${urlBase}`);
  };
  if (!ev.start) {
    // Tarea sin fecha: es un VTODO, no un evento
    base('VTODO');
    L.push(`STATUS:${ev.done ? 'COMPLETED' : 'NEEDS-ACTION'}`, 'END:VTODO');
    return L;
  }
  base('VEVENT');
  dt('DTSTART', ev.start, ev.allDay);
  if (ev.allDay) L.push(`DTEND;VALUE=DATE:${fechaDia(sumaDias(ev.end || ev.start, 1))}`);   // en iCal el fin es exclusivo
  else if (ev.end) dt('DTEND', ev.end, false);
  if (ev.repeat) {
    const rr = rrule(ev.repeat, ev.allDay);
    if (rr) L.push(`RRULE:${rr}`);
    for (const ex of ev.exdates || []) {
      L.push(ev.allDay ? `EXDATE;VALUE=DATE:${fechaDia(ex)}` : `EXDATE:${fechaDia(ex)}T${ev.start.slice(11, 13)}${ev.start.slice(14, 16)}00`);
    }
  }
  if (ev.done) L.push('STATUS:CONFIRMED');
  L.push('TRANSP:' + (ev.allDay ? 'TRANSPARENT' : 'OPAQUE'));
  for (const m of ev.reminders || []) {
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:${minutosATrigger(m)}`, 'END:VALARM');
  }
  L.push('END:VEVENT');
  return L;
}

// eventos: [{...evento}], festivos: [{ date, title, scope }]
function construir({ nombre, eventos, calendarios, festivos = [], urlBase = '' }) {
  const byCal = Object.fromEntries((calendarios || []).map(c => [c.id, c.name]));
  const stamp = (ms) => {
    const d = new Date(ms || Date.now());
    return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  };
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KookyeCatCloud//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(nombre)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  for (const ev of eventos) L.push(...veventos(ev, byCal[ev.calendarId] || 'Calendario', urlBase, stamp));
  for (const h of festivos) {
    L.push('BEGIN:VEVENT', `UID:festivo-${h.date}-${h.scope}@kookyecatcloud`, `DTSTAMP:${stamp(0)}`,
      `SUMMARY:${esc(h.title)}`, `DTSTART;VALUE=DATE:${fechaDia(h.date)}`, `DTEND;VALUE=DATE:${fechaDia(sumaDias(h.date, 1))}`,
      'CATEGORIES:Festivos', 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(pliega).join('\r\n') + '\r\n';
}

module.exports = { construir, pliega, esc, minutosATrigger };
