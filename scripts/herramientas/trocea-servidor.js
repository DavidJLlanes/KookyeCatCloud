'use strict';
// Trocea un módulo de servidor con forma `function createX(params) { ...cierre...; return {...}; }` en lib/<carpeta>/:
// constantes.js (lo de antes de la fábrica), una sección por tramo (reciben `ctx` y devuelven lo que declaran) e index.js.
// Uso: node scripts/herramientas/trocea-servidor.js <origen> <carpeta> <fábrica> <ini> <fin> nombre:desde-hasta ...   (ini-fin = cuerpo de la fábrica sin el return final)
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '../../node_modules') + '/';
const espree = require(R + 'espree'), escope = require(R + 'eslint-scope');
const [src, dir, fabrica, ini, fin, ...tramos] = process.argv.slice(2);
const text = fs.readFileSync(src, 'utf8'), lines = text.split('\n');
const ast = espree.parse(text, { ecmaVersion: 2022, loc: true, range: true });
const fnNode = ast.body.find(s => s.type === 'FunctionDeclaration' && s.id.name === fabrica);
if (!fnNode) throw new Error('no hay función ' + fabrica);
const params = fnNode.params[0] && fnNode.params[0].type === 'ObjectPattern' ? fnNode.params[0].properties.map(p => p.key.name) : [];
const cuerpo = fnNode.body.body;
const retorno = cuerpo[cuerpo.length - 1]; if (retorno.type !== 'ReturnStatement') throw new Error('falta return final');
// ---- módulo: imports y constantes (todo lo anterior a la fábrica)
const pre = ast.body.filter(s => s !== fnNode && s.loc.end.line < fnNode.loc.start.line && s.type !== 'ExpressionStatement');
const post = ast.body.filter(s => s.loc.start.line > fnNode.loc.end.line);
const nombresDe = (s) => { const o = []; if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') o.push(s.id.name); if (s.type === 'VariableDeclaration') for (const d of s.declarations) { if (d.id.type === 'Identifier') o.push(d.id.name); else if (d.id.type === 'ObjectPattern') d.id.properties.forEach(p => o.push(p.value.name)); } return o; };
const raizDe = (n) => { while (n && n.type === 'MemberExpression') n = n.object; return n; };
const esRequire = (n) => n && n.type === 'CallExpression' && n.callee.name === 'require' || n && n.type === 'MemberExpression' && esRequire(raizDe(n));
const importados = new Set();
const esImport = (s) => {
  if (s.type !== 'VariableDeclaration') return false;
  const ok = s.declarations.every(d => { const r = d.init && raizDe(d.init); return r && (esRequire(d.init) || (r.type === 'Identifier' && importados.has(r.name))); });
  if (ok) nombresDe(s).forEach(n => importados.add(n));
  return ok;
};
const imports = pre.filter(esImport).map(s => ({ s, nombres: nombresDe(s), txt: text.slice(s.range[0], s.range[1]) }));
const consts = pre.filter(s => !esImport(s));
const nombreImport = new Map(); imports.forEach(i => i.nombres.forEach(n => nombreImport.set(n, i)));
const nombreConst = new Set(); consts.forEach(s => nombresDe(s).forEach(n => nombreConst.add(n)));
const rutaRel = (txt) => txt.replace(/require\('\.\//g, "require('../");
function libres(codigo, cuantos) {
  const prog = espree.parse('(function(){\n' + codigo + '\n})();', { ecmaVersion: 2022, range: true, loc: true });
  const sm = escope.analyze(prog, { ecmaVersion: 2022 });
  return new Set(sm.globalScope.through.map(r => r.identifier.name));
}
function cabeceraImports(usados) {
  usados = [...usados];
  const hechos = new Set(), out = [];
  const añade = (i) => { if (hechos.has(i)) return; const r = i.s.declarations.map(d => d.init && raizDe(d.init)).find(x => x && x.type === 'Identifier' && nombreImport.has(x.name)); if (r) añade(nombreImport.get(r.name)); hechos.add(i);
    const d = i.s.declarations[0];
    if (i.s.declarations.length === 1 && d.id.type === 'ObjectPattern' && (d.init.type === 'Identifier' || esRequire(d.init))) {
      const mantener = d.id.properties.filter(p => usados.includes(p.value.name)).map(p => text.slice(p.range[0], p.range[1]));
      if (mantener.length) out.push(`const { ${mantener.join(', ')} } = ${rutaRel(text.slice(d.init.range[0], d.init.range[1]))};`);
    } else out.push(rutaRel(i.txt)); };
  for (const n of usados) { const i = nombreImport.get(n); if (i) añade(i); }
  return out;
}
fs.mkdirSync(dir, { recursive: true });
// constantes.js
{
  const trozo = consts.map(s => text.slice(s.range[0], s.range[1])).join('\n\n');
  const lib = libres(trozo); const usados = [...lib].filter(n => nombreImport.has(n));
  const exp = [...nombreConst];
  fs.writeFileSync(path.join(dir, 'constantes.js'), `'use strict';\n// Constantes y utilidades puras del módulo.\n${cabeceraImports(usados).join('\n')}\n\n${trozo}\n\nmodule.exports = { ${exp.join(', ')} };\n`);
}
// secciones
const secs = tramos.map(t => { const [n, r] = t.split(':'); const [a, b] = r.split('-').map(Number); return { n, a, b, stmts: [], decl: new Map() }; });
for (const st of cuerpo.slice(0, -1)) {
  const f = secs.find(x => st.loc.start.line >= x.a && st.loc.start.line <= x.b);
  if (!f) throw new Error('sentencia fuera de tramos, línea ' + st.loc.start.line);
  if (st.loc.end.line > f.b) throw new Error('sentencia cruza el límite de ' + f.n + ': ' + st.loc.start.line);
  f.stmts.push(st); nombresDe(st).forEach(n => f.decl.set(n, st.type === 'FunctionDeclaration' || (st.declarations && st.declarations.every(d => d.init && /Function/.test(d.init.type))) ? 'fn' : 'val'));
}
const dueño = new Map(); secs.forEach((s, i) => s.decl.forEach((k, n) => { if (dueño.has(n)) throw new Error('duplicado ' + n); dueño.set(n, { i, k }); }));
const informe = [];
secs.forEach((f, i) => {
  const trozo = lines.slice(f.a - 1, f.b).join('\n');
  const lib = libres(trozo); const doCtx = [], lazy = [], malos = [], consu = [], usadosImp = [];
  for (const n of lib) {
    const d = dueño.get(n);
    if (d && d.i === i) continue;
    if (d) { if (d.i < i) doCtx.push(n); else if (d.k === 'fn') lazy.push(n); else malos.push(n + ' (en ' + secs[d.i].n + ')'); }
    else if (params.includes(n)) doCtx.push(n);
    else if (nombreConst.has(n)) consu.push(n);
    else if (nombreImport.has(n)) usadosImp.push(n);
  }
  const cab = [...cabeceraImports(usadosImp)];
  if (consu.length) cab.push(`const { ${consu.sort().join(', ')} } = require('./constantes');`);
  const cuerpoFn = [];
  if (doCtx.length) cuerpoFn.push(`  const { ${doCtx.sort().join(', ')} } = ctx;`);
  for (const n of lazy.sort()) cuerpoFn.push(`  const ${n} = (...a) => ctx.${n}(...a);`);
  const exp = [...f.decl.keys()];
  fs.writeFileSync(path.join(dir, f.n + '.js'), `'use strict';\n// ${f.n}: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.\n${cab.join('\n')}${cab.length ? '\n' : ''}\nfunction monta(ctx) {\n${cuerpoFn.join('\n')}${cuerpoFn.length ? '\n' : ''}\n${trozo.replace(/^\n+/, '')}\n\n  return { ${exp.join(', ')} };\n}\n\nmodule.exports = monta;\n`);
  informe.push(`${f.n}: ${exp.length} nombres${malos.length ? ' · PROBLEMAS: ' + malos.join('; ') : ''}`);
});
// index.js: parámetros → ctx; secciones en orden; return original
const retTxt = text.slice(retorno.range[0], retorno.range[1]);
const libRet = [...libres(retTxt)].filter(n => !nombreImport.has(n) && !nombreConst.has(n));
const usadosRet = [...libres(retTxt)].filter(n => nombreImport.has(n));
const impPost = [...new Set([...nombreImport.keys()])];
const mod = text.slice(0, 0);
const pieMod = post.map(s => text.slice(s.range[0], s.range[1])).join('\n');
const cabIdx = cabeceraImports([...libres(retTxt), ...libres(pieMod)].filter(n => nombreImport.has(n)));
const constsIdx = [...new Set([...libres(retTxt), ...libres(pieMod)].filter(n => nombreConst.has(n)))];
const cabecera = (lines.slice(0, 8).filter(l => l.startsWith('/*') || l.startsWith(' ') || l.startsWith('//') || l.startsWith('*')).join('\n'));
fs.writeFileSync(path.join(dir, 'index.js'), `'use strict';\n${cabecera}\n${cabIdx.join('\n')}${constsIdx.length ? `\nconst { ${constsIdx.sort().join(', ')} } = require('./constantes');` : ''}\n\nfunction ${fabrica}(${fnNode.params.map(p => text.slice(p.range[0], p.range[1])).join(', ')}) {\n  const ctx = { ${params.join(', ')} };\n  // El orden de montaje es el del archivo original\n${secs.map(f => `  Object.assign(ctx, require('./${f.n}')(ctx));`).join('\n')}\n\n  const { ${libRet.sort().join(', ')} } = ctx;\n  ${retTxt}\n}\n\n${pieMod.replace(new RegExp(`module\\.exports = ${fabrica}`), `module.exports = ${fabrica}`)}\n`);
console.log(informe.join('\n'));
