// Trocea un IIFE de navegador en archivos que comparten un espacio K._xxx. Uso: node trocea.js <origen> <carpeta> <ns> <ini> <fin> nombre:desde-hasta ...
const fs = require('fs'), path = require('path');
const R = '' + require('path').resolve(__dirname, '../../node_modules') + '/';
const espree = require(R + 'espree'), escope = require(R + 'eslint-scope');
const [src, dir, ns, ini, fin, ...tramos] = process.argv.slice(2);
let text = fs.readFileSync(src, 'utf8');
/* LETS=<nombre>: los `let` de primer nivel del IIFE (estado compartido que se reasigna) pasan a propiedades de un objeto <nombre>,
   para que varios archivos puedan leerlos y cambiarlos. No cambia el número de líneas. */
if (process.env.LETS) {
  const NOM = process.env.LETS;
  const a0 = espree.parse(text, { ecmaVersion: 2022, loc: true, range: true });
  const f0 = a0.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression').expression.callee;
  const sm0 = escope.analyze(a0, { ecmaVersion: 2022 });
  const fscope = sm0.acquire(f0);
  const ed = [], decls = new Set(), nombres = new Set();
  for (const st of f0.body.body) if (st.type === 'VariableDeclaration' && st.kind === 'let') {
    if (!text.slice(st.range[0], st.range[1]).trimEnd().endsWith(';')) throw new Error('let sin ; en línea ' + st.loc.start.line);
    ed.push([st.range[0], st.range[0] + 3, `Object.assign(${NOM}, {`]);
    ed.push([st.range[1] - 1, st.range[1], ' });']);
    for (const d of st.declarations) {
      nombres.add(d.id.name); decls.add(d.id);
      if (d.init) ed.push([d.id.range[1], d.init.range[0], ': ']); else ed.push([d.id.range[1], d.id.range[1], ': undefined']);
    }
  }
  const cortos = new Set();
  (function walk(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'Property' && n.shorthand) cortos.add(n.value); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); } })(a0);
  for (const v of fscope.variables) if (nombres.has(v.name) && v.defs.every(d => decls.has(d.name)))
    for (const r of v.references) { if (decls.has(r.identifier)) continue; const id = r.identifier;
      ed.push([id.range[0], id.range[1], (cortos.has(id) ? `${v.name}: ` : '') + `${NOM}.${v.name}`]); }
  ed.sort((x, y) => y[0] - x[0]);
  for (const [a, b, t] of ed) text = text.slice(0, a) + t + text.slice(b);
  // el objeto se declara en la primera línea de contenido (sin cambiar el número de líneas)
  const L = text.split('\n'); L[Number(ini) - 1] += ` const ${NOM} = {};`; text = L.join('\n');
  console.log('lets → ' + NOM + '.*: ' + [...nombres].join(', '));
}
const lines = text.split('\n');
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
  const sal = `'use strict';\n/* ${path.basename(dir)}/${f.n}.js: parte del módulo (se carga con el resto de ${path.basename(dir)}/ en index.html). Comparte el espacio ${ns}. */\n(function () {\n  const C = (${ns} = ${ns} || {});\n${cab.join('\n')}${cab.length ? '\n' : ''}\n${trozo.replace(/^\n+/, '')}\n\n  Object.assign(C, { ${exp.join(', ')} });\n})();\n`;
  fs.writeFileSync(path.join(dir, f.n + '.js'), sal);
  resumen.push(`${f.n}: ${sal.split('\n').length} líneas, ${exp.length} nombres${malos.length ? ' · PROBLEMAS: ' + malos.join('; ') : ''}`);
});
console.log(resumen.join('\n'));
