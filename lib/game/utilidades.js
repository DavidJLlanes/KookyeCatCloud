'use strict';
// Fechas, azar determinista y el estado inicial de una cuenta.
const { POR_DEFECTO } = require('./cosmeticos');

const diaOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const msDia = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const difDias = (a, b) => Math.round((msDia(b) - msDia(a)) / 86400000);
function semanaIso(d) {
  const t = new Date(msDia(d));
  const dow = (t.getUTCDay() + 6) % 7;            // lunes = 0
  t.setUTCDate(t.getUTCDate() - dow + 3);          // jueves de esa semana
  const y = t.getUTCFullYear();
  const primero = new Date(Date.UTC(y, 0, 4));
  const n = 1 + Math.round(((t - primero) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(n).padStart(2, '0')}`;
}
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const ARC_BASE = () => ({
  g2048: { partidas: 0, mejor: 0, total: 0, tiempo: 0, poderes: 0, ficha: 0, fusiones: 0, movs: 0, ganadas: 0, historial: [] },
  breakout: { partidas: 0, mejor: 0, total: 0, tiempo: 0, poderes: 0, ladrillos: 0, niveles: 0, perfectos: 0, mejorPerfectos: 0, historial: [] },
});
// Las cuentas anteriores no tienen estos contadores: se completan al leer
const arc = (s) => { const b = ARC_BASE(); s.arcade = s.arcade || {}; for (const k of Object.keys(b)) s.arcade[k] = { ...b[k], ...(s.arcade[k] || {}) }; return s.arcade; };
const ESTADO_BASE = () => ({
  v: 1, xp: 0, monedas: 0, monedasTotal: 0, segundos: 0, restoXp: 0,
  diario: {}, xpTiempo: {}, ultimoDia: '', racha: 0, mejorRacha: 0, dias: 0, escudos: 0, sabado: 0, domingo: 0, noche: 0, madrugada: 0,
  logros: {}, cuando: {}, especiales: {},
  tetris: { partidas: 0, mejor: 0, total: 0, lineas: 0, tetrises: 0, combo: 0, poderes: 0, tiempo: 0, historial: [] },
  arcade: ARC_BASE(),
  eventos: { tarjeta: 0 }, retos: 0,
  semana: { clave: '', base: {}, retos: [], hechos: [], bonus: false, mejorPartida: 0, mejorG: 0, mejorB: 0 },
  propios: [], equipado: { ...POR_DEFECTO },
});


const HOY_VALIDO = 2;   // días de diferencia admitidos entre el reloj del cliente y el del servidor
function diaCliente(d) {
  if (!diaOk(d)) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  return Math.abs(difDias(hoy, d)) <= HOY_VALIDO ? d : null;
}

module.exports = { diaOk, msDia, difDias, semanaIso, hash, rng, ARC_BASE, arc, ESTADO_BASE, diaCliente };
