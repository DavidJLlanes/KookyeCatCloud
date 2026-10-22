'use strict';
// Festivos de España: nacionales y autonómicos. Se calculan para cualquier año (la Semana
// Santa sale de la fecha de Pascua), sin depender de ningún servicio externo.
// Son orientativos: cada comunidad publica su calendario oficial cada año, y algunas mueven
// al lunes los festivos que caen en domingo. Los festivos locales (patrón de cada ciudad)
// no están incluidos.

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mes - 1, dia);
}

const JUEVES = [-3, 'Jueves Santo'];
const LUNES_P = [1, 'Lunes de Pascua'];

const NACIONAL = {
  fijos: [[1, 1, 'Año Nuevo'], [1, 6, 'Epifanía del Señor (Reyes)'], [5, 1, 'Fiesta del Trabajo'],
    [8, 15, 'Asunción de la Virgen'], [10, 12, 'Fiesta Nacional de España'], [11, 1, 'Todos los Santos'],
    [12, 6, 'Día de la Constitución'], [12, 8, 'Inmaculada Concepción'], [12, 25, 'Navidad']],
  pascua: [[-2, 'Viernes Santo']],
};

const REGIONES = {
  AN: { name: 'Andalucía', fijos: [[2, 28, 'Día de Andalucía']], pascua: [JUEVES] },
  AR: { name: 'Aragón', fijos: [[4, 23, 'San Jorge, Día de Aragón']], pascua: [JUEVES] },
  AS: { name: 'Principado de Asturias', fijos: [[9, 8, 'Día de Asturias']], pascua: [JUEVES] },
  IB: { name: 'Illes Balears', fijos: [[3, 1, 'Día de les Illes Balears'], [12, 26, 'Segunda fiesta de Navidad']], pascua: [JUEVES, LUNES_P] },
  CN: { name: 'Canarias', fijos: [[5, 30, 'Día de Canarias']], pascua: [JUEVES] },
  CB: { name: 'Cantabria', fijos: [[7, 28, 'Día de las Instituciones de Cantabria'], [9, 15, 'La Bien Aparecida']], pascua: [JUEVES] },
  CM: { name: 'Castilla-La Mancha', fijos: [[5, 31, 'Día de Castilla-La Mancha']], pascua: [JUEVES] },
  CL: { name: 'Castilla y León', fijos: [[4, 23, 'Día de Castilla y León']], pascua: [JUEVES] },
  CT: { name: 'Cataluña', fijos: [[6, 24, 'San Juan'], [9, 11, 'Diada Nacional de Catalunya'], [12, 26, 'San Esteban']], pascua: [LUNES_P] },
  VC: { name: 'Comunitat Valenciana', fijos: [[3, 19, 'San José'], [6, 24, 'San Juan'], [10, 9, 'Día de la Comunitat Valenciana']], pascua: [LUNES_P] },
  EX: { name: 'Extremadura', fijos: [[9, 8, 'Día de Extremadura']], pascua: [JUEVES] },
  GA: { name: 'Galicia', fijos: [[7, 25, 'Santiago Apóstol']], pascua: [JUEVES] },
  RI: { name: 'La Rioja', fijos: [[6, 9, 'Día de La Rioja']], pascua: [JUEVES] },
  MD: { name: 'Comunidad de Madrid', fijos: [[5, 2, 'Día de la Comunidad de Madrid']], pascua: [JUEVES] },
  MC: { name: 'Región de Murcia', fijos: [[3, 19, 'San José'], [6, 9, 'Día de la Región de Murcia']], pascua: [JUEVES] },
  NC: { name: 'Comunidad Foral de Navarra', fijos: [[12, 3, 'San Francisco Javier']], pascua: [JUEVES, LUNES_P] },
  PV: { name: 'País Vasco', fijos: [[7, 25, 'Santiago Apóstol']], pascua: [JUEVES, LUNES_P] },
  CE: { name: 'Ceuta', fijos: [[9, 2, 'Día de Ceuta']], pascua: [JUEVES] },
  ML: { name: 'Melilla', fijos: [[9, 17, 'Día de Melilla']], pascua: [JUEVES] },
};

const lista = () => Object.entries(REGIONES).map(([code, r]) => ({ code, name: r.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
const regionValida = (c) => (REGIONES[c] ? c : '');

// Festivos de un año: [{ date: 'YYYY-MM-DD', title, scope: 'nacional' | 'autonómico' }]
function deAnio(year, region) {
  const out = [];
  const P = pascua(year);
  const add = (spec, scope) => {
    for (const [m, d, t] of spec.fijos || []) out.push({ date: `${year}-${p2(m)}-${p2(d)}`, title: t, scope });
    for (const [off, t] of spec.pascua || []) out.push({ date: ymd(P + off * 86400000), title: t, scope });
  };
  add(NACIONAL, 'nacional');
  if (REGIONES[region]) add(REGIONES[region], 'autonómico');
  // Un mismo día con dos nombres (p. ej. San Juan y otro): se juntan en un solo festivo
  const porDia = new Map();
  for (const h of out) {
    const prev = porDia.get(h.date);
    if (!prev) porDia.set(h.date, { ...h });
    else if (!prev.title.includes(h.title)) { prev.title += ' / ' + h.title; if (h.scope === 'nacional') prev.scope = 'nacional'; }
  }
  return [...porDia.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Festivos dentro de [desde, hasta] (días 'YYYY-MM-DD', ambos inclusive)
function entre(desde, hasta, region) {
  const out = [];
  for (let y = +desde.slice(0, 4); y <= +hasta.slice(0, 4); y++) {
    for (const h of deAnio(y, region)) if (h.date >= desde && h.date <= hasta) out.push(h);
  }
  return out;
}

module.exports = { lista, regionValida, deAnio, entre, pascua, REGIONES };
