'use strict';
// Niveles, curva de experiencia y rangos.
const MAX_NIVEL = 100;
const xpAcumulada = (nivel) => (nivel <= 1 ? 0 : Math.round(40 * Math.pow(nivel - 1, 1.8)));
function nivelDe(xp) {
  let n = 1;
  while (n < MAX_NIVEL && xp >= xpAcumulada(n + 1)) n++;
  return n;
}
const RANGOS = [
  [1, 'Novato', 'quill', '#94a3b8'], [5, 'Aprendiz', 'lantern', '#22c55e'], [10, 'Explorador', 'compass', '#06b6d4'],
  [15, 'Organizador', 'abacus', '#3b82f6'], [20, 'Archivista', 'books', '#6366f1'], [30, 'Curador', 'archive', '#8b5cf6'],
  [40, 'Maestro', 'anvil', '#d946ef'], [50, 'Sabio', 'owl', '#f59e0b'], [65, 'Gran maestro', 'crystal', '#f97316'],
  [80, 'Leyenda', 'dragon', '#ef4444'], [100, 'Mítico', 'crown', '#facc15'],
];
const rangoDe = (nivel) => { let r = RANGOS[0]; for (const x of RANGOS) if (nivel >= x[0]) r = x; return { desde: r[0], nombre: r[1], icono: r[2], color: r[3] }; };

module.exports = { MAX_NIVEL, xpAcumulada, nivelDe, RANGOS, rangoDe };
