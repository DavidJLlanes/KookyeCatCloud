// Trocea un IIFE de navegador en archivos que comparten un espacio K._xxx. Uso: node trocea.js <origen> <carpeta> <ns> <ini> <fin> nombre:desde-hasta ...
const fs = require('fs'), path = require('path');
const R = '' + require('path').resolve(__dirname, '../../node_modules') + '/';
const espree = require(R + 'espree'), escope = require(R + 'eslint-scope');
const [src, dir, ns, ini, fin, ...tramos] = process.argv.slice(2);
const text = fs.readFileSync(src, 'utf8'), lines = text.split('\n');
const ast = espree.parse(text, { ecmaVersion: 2022, loc: true, range: true, sourceType: 'script' });
const iife = ast.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression');
const cuerpo = iife.expression.callee.body.body;
const files = tramos.map(t => { const [n, r] = t.split(':'); const [a, b] = r.split('-').map(Number); return { n, a, b, stmts: [], decl: new Map() }; });
// cada sentencia a su archivo (por línea de inicio)
for (const st of cuerpo) {
  const f = files.find(x => st.loc.start.line >= x.a && st.loc.start.line <= x.b);
  if (!f) throw new Error('sentencia fuera de rangos, línea ' + st.loc.start.line);
  if (st.loc.end.line > f.b) throw new Error(`sentencia cruza el límite de ${f.n}: ${st.loc.start.line}-${st.loc.end.line}`);
  f.stmts.push(st);
  const nombres = [];
  if (st.type === 'FunctionDeclaration') nombres.push([st.id.name, 'fn']);
  if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
    if (d.id.type !== 'Identifier') throw new Error('desestructuración top-level en línea ' + st.loc.start.line + ' (a mano)');
    nombres.push([d.id.name, d.init && /Function/.test(d.init.type) ? 'fn' : (st.kind === 'let' ? 'let' : 'val')]);
  }
  for (const [n, k] of nombres) f.decl.set(n, k);
}
const dueño = new Map(); files.forEach((f, i) => f.decl.forEach((k, n) => { if (dueño.has(n)) throw new Error('duplicado ' + n); dueño.set(n, { i, k }); }));
// identificadores libres de cada archivo
fs.mkdirSync(dir, { recursive: true });
const resumen = [];
files.forEach((f, i) => {
  const trozo = lines.slice(f.a - 1, f.b).join('\n');
  const prog = espree.parse('(function(){\n' + trozo + '\n})();', { ecmaVersion: 2022, range: true, loc: true });
  const sm = escope.analyze(prog, { ecmaVersion: 2022 });
  const libres = new Set(sm.globalScope.through.map(r => r.identifier.name));
  const fns = [], vals = [], malos = [];
  for (const n of libres) { const d = dueño.get(n); if (!d || d.i === i) continue;
    if (d.k === 'fn') fns.push(n); else if (d.k === 'val' && d.i < i) vals.push(n); else malos.push(`${n} (${d.k}, en ${files[d.i].n})`); }
  fns.sort(); vals.sort();
  const cab = [];
  if (vals.length) cab.push(`  const { ${vals.join(', ')} } = C;`);
  for (const n of fns) cab.push(`  const ${n} = (...a) => C.${n}(...a);`);
  const exp = [...f.decl.keys()];
  const sal = `'use strict';\n/* ${f.n}: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio ${ns}. */\n(function () {\n  const C = (${ns} = ${ns} || {});\n${cab.join('\n')}${cab.length ? '\n' : ''}\n${trozo.replace(/^\n+/, '')}\n\n  Object.assign(C, { ${exp.join(', ')} });\n})();\n`;
  fs.writeFileSync(path.join(dir, f.n + '.js'), sal);
  resumen.push(`${f.n}: ${sal.split('\n').length} líneas, ${exp.length} nombres${malos.length ? ' · PROBLEMAS: ' + malos.join('; ') : ''}`);
});
console.log(resumen.join('\n'));
