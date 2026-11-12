'use strict';
// Auditoría estática de persistencia (se ejecuta con `npm run check`). Busca los patrones que ya hicieron perder datos:
//   R1  leer un JSON y, si falla, devolver «vacío» (el siguiente guardado sobrescribe lo que no se pudo leer) → usar lib/store.js
//   R2  nombre temporal fijo (`<archivo>.tmp`): dos escrituras a la vez se pisan → usar lib/store.js (nombre único + .bak)
//   R3  escribir con writeFile/writeFileSync directamente sobre un .json de datos (no atómico) → usar lib/store.js
// Lo que es legítimo (cachés, lecturas que no se vuelven a guardar…) va en PERMITIDOS con su motivo.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
// lib/ puede tener módulos en carpeta (lib/pagos/, lib/marcadores/…): se recorren enteras
const jsDe = (rel) => fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsDe(`${rel}/${e.name}`) : e.name.endsWith('.js') ? [`${rel}/${e.name}`] : []);
const ARCHIVOS = [...jsDe('lib'), 'server.js'];
const PERMITIDOS = {
  'lib/nucleo/store.js': 'implementa las reglas',
  'lib/copias/index.js': 'una sola copia a la vez (enCurso); el .tmp es el archivo de la copia',
  'lib/exportar/index.js': 'solo lee para exportar; no vuelve a guardar',
  'lib/copias/archivo.js': 'solo cuenta JSON dañados al hacer la copia',
  'lib/archivos/fotos.js': 'caché de EXIF regenerable',
  'lib/games/index.js': 'JSON de «quitados» en la zona temporal de transferencias',
  'lib/transversal/transferir.js': 'instantánea en la zona temporal de transferencias',
  'lib/vault/index.js': 'índice cifrado: un fallo de lectura lanza error, no devuelve vacío',
};
const reglas = [
  ['R1', /JSON\.parse\([^)]*read(File|FileSync)\b[^\n]*catch\b[^\n]*(return|=)\s*(\[\]|\{\}|null)/],
  ['R2', /\}\.tmp`|\+\s*'\.tmp'/, /pid|random/],
  ['R3', /write(File|FileSync)\([^\n]*\.json['"`)]/],
];
let fallos = 0;
for (const f of ARCHIVOS) {
  if (PERMITIDOS[f]) continue;
  fs.readFileSync(path.join(RAIZ, f), 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return;
    for (const [id, re, excepto] of reglas) if (re.test(l) && !(excepto && excepto.test(l))) { fallos++; console.error(`auditoría ${id}: ${f}:${i + 1}: ${l.trim().slice(0, 140)}`); }
  });
}
if (fallos) { console.error(`\n${fallos} problema(s) de persistencia. Usa readJson/writeJson/updateJson (lib/store.js) o, si es legítimo, añádelo a PERMITIDOS con su motivo.`); process.exit(1); }
console.log('auditoría de persistencia: sin hallazgos');
