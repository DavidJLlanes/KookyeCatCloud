'use strict';
// Mueve módulos del servidor sin romper nada: `node scripts/herramientas/mueve.js mapa.json [--seco]`.
// mapa.json = { "lib/viejo.js": "lib/carpeta/nuevo.js", … } (rutas desde la raíz del repositorio).
// 1) Lee todos los require('./…') relativos de los .js del servidor, scripts y pruebas y resuelve a qué archivo apuntan.
// 2) Mueve los archivos con `git mv`.
// 3) Reescribe cada require para que apunte al mismo archivo desde su nueva ubicación (carpeta si es su index.js).
// 4) Reescribe las menciones textuales «lib/viejo.js» en los scripts y la configuración (no en docs/ históricos).
// Después: `npm run check && npm test` (y comparar la lista de rutas si se quiere, ver scripts/herramientas/README.md).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..', '..');
const [, , mapaArg, seco] = process.argv;
const mapa = JSON.parse(fs.readFileSync(mapaArg, 'utf8'));
const abs = (r) => path.join(RAIZ, r);
const MAPA = new Map(Object.entries(mapa).map(([a, b]) => [abs(a), abs(b)]));
const nuevoDe = (f) => MAPA.get(f) || f;

const jsDe = (dir) => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return ['node_modules', '.git', 'public'].includes(e.name) ? [] : jsDe(p);
  return e.name.endsWith('.js') ? [p] : [];
});
const archivos = [...jsDe(RAIZ)];
const resuelve = (desde, spec) => {
  const base = path.resolve(path.dirname(desde), spec);
  for (const c of [base, base + '.js', path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const RE = /require\((['"])(\.{1,2}\/[^'"]*)\1\)/g;
// 1) cada archivo: sus requires relativos con su destino resuelto
const plan = archivos.map(f => {
  const txt = fs.readFileSync(f, 'utf8'); const reqs = [];
  let m; while ((m = RE.exec(txt))) { const t = resuelve(f, m[2]); if (t) reqs.push({ spec: m[2], destino: t }); else console.warn('sin resolver:', path.relative(RAIZ, f), m[2]); }
  return { f, reqs };
});
// 2) mover
for (const [a, b] of MAPA) {
  if (!fs.existsSync(a)) { console.error('no existe', a); process.exit(1); }
  if (fs.existsSync(b)) { console.error('ya existe', b); process.exit(1); }
  console.log('mueve', path.relative(RAIZ, a), '→', path.relative(RAIZ, b));
  if (!seco) { fs.mkdirSync(path.dirname(b), { recursive: true }); execFileSync('git', ['mv', a, b], { cwd: RAIZ }); }
}
if (seco) process.exit(0);
// 3) reescribir requires
const especDe = (desde, destino) => {
  let r = path.relative(path.dirname(desde), destino).split(path.sep).join('/');
  r = r.replace(/\.js$/, '').replace(/\/index$/, '');
  if (r === 'index') r = '.';
  if (r === '') r = '.';
  return r.startsWith('.') ? r : './' + r;
};
let cambios = 0;
for (const { f, reqs } of plan) {
  if (!reqs.length) continue;
  const nf = nuevoDe(f); let txt = fs.readFileSync(nf, 'utf8'); const antes = txt;
  const porSpec = new Map(reqs.map(r => [r.spec, especDe(nf, nuevoDe(r.destino))]));
  txt = txt.replace(RE, (todo, q, spec) => porSpec.has(spec) ? `require(${q}${porSpec.get(spec)}${q})` : todo);
  if (txt !== antes) { fs.writeFileSync(nf, txt); cambios++; }
}
// 4) menciones textuales en scripts, pruebas y configuración
const textos = [...jsDe(RAIZ).map(nuevoDe), path.join(RAIZ, 'eslint.config.js'), path.join(RAIZ, 'package.json')];
const pares = Object.entries(mapa).sort((a, b) => b[0].length - a[0].length);
for (const f of new Set(textos)) {
  if (!fs.existsSync(f)) continue;
  let txt = fs.readFileSync(f, 'utf8'); const antes = txt;
  for (const [a, b] of pares) txt = txt.split(`'${a}'`).join(`'${b}'`).split(`"${a}"`).join(`"${b}"`);
  if (txt !== antes) { fs.writeFileSync(f, txt); cambios++; }
}
console.log(`${MAPA.size} archivo(s) movidos, ${cambios} archivo(s) reescritos`);
