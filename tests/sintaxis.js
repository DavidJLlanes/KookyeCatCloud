'use strict';
// Comprueba la sintaxis de todo el JavaScript propio (servidor, módulos en lib/ y su subcarpetas, cliente en public/js y sw.js).
// Se ejecuta con `npm run check`. Usa `node --check`, que no ejecuta nada.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

const jsDe = (rel) => fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? jsDe(`${rel}/${e.name}`) : e.name.endsWith('.js') ? [`${rel}/${e.name}`] : []);

const archivos = ['server.js', 'webdav.js', 'public/sw.js', ...jsDe('lib'), ...jsDe('public/js'), ...jsDe('tests')];
let fallos = 0;
for (const f of archivos) {
  try { execFileSync(process.execPath, ['--check', path.join(RAIZ, f)], { stdio: 'pipe' }); }
  catch (e) { fallos++; console.error(`sintaxis: ${f}\n${String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')}`); }
}
if (fallos) { console.error(`\n${fallos} archivo(s) con errores de sintaxis`); process.exit(1); }
console.log(`sintaxis: ${archivos.length} archivos correctos`);
