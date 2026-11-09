'use strict';
// Fechas «AAAA-MM-DD» sin hora ni zona: todo se calcula en UTC sobre el texto para que nunca baile un día.

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ZONA = process.env.APP_TZ || 'Europe/Madrid';

const esDia = (v) => RE_DIA.test(String(v || '')) && !Number.isNaN(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0, 10) === v;

// Hoy en la zona horaria de la app (en-CA da el formato AAAA-MM-DD)
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const enMs = (dia) => Date.parse(`${dia}T00:00:00Z`);
const diasHasta = (dia, desde) => Math.round((enMs(dia) - enMs(desde)) / 86400000);

// Suma meses conservando el «día de cobro»: un recibo del 31 cae el 28 en febrero y vuelve al 31 en marzo
function sumaMeses(dia, meses, diaCobro) {
  const [y, m, d] = dia.split('-').map(Number);
  const objetivo = d && diaCobro ? Math.max(d, diaCobro) : d;
  const total = (y * 12 + (m - 1)) + meses;
  const ny = Math.floor(total / 12), nm = total % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(objetivo, ultimo)).padStart(2, '0')}`;
}

module.exports = { esDia, hoy, diasHasta, sumaMeses };
