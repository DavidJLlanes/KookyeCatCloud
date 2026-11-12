'use strict';
// Red mínima contra los fallos que `node --check` no ve: un identificador sin definir/importar
// (típico al mover código entre archivos) solo explota en tiempo de ejecución y un try/catch lo puede tragar.
// Servidor: `no-undef` sobre Node. Cliente (public/js): los scripts se cargan sueltos y comparten el ámbito global, así que los
// globales válidos son los del navegador MÁS lo que cualquier script declare en su nivel superior (funciones, const, let, class).
// Un nombre que no esté en ninguna de las dos listas (p. ej. `S` fuera de su IIFE) es un fallo real: ya hizo que Buscar «no respondiera».
const fs = require('fs');
const path = require('path');
const globals = require('globals');
const espree = require('espree');

function globalesDelCliente() {
  // Bibliotecas que cargan sus propias etiquetas <script> (Leaflet, highlight.js) y la guía UMD `typeof module`
  const out = { L: 'readonly', hljs: 'readonly', module: 'readonly' };
  // `window.NB = …` y `const NB = window.NB = …` crean globales desde dentro de un IIFE
  const ventana = (nodo) => {
    if (!nodo || typeof nodo.type !== 'string') return;
    if (nodo.type === 'AssignmentExpression' && nodo.left.type === 'MemberExpression' && nodo.left.object.type === 'Identifier'
        && nodo.left.object.name === 'window' && !nodo.left.computed && nodo.left.property.type === 'Identifier') out[nodo.left.property.name] = 'writable';
    for (const k of Object.keys(nodo)) { const v = nodo[k]; if (Array.isArray(v)) v.forEach(ventana); else if (v && typeof v.type === 'string') ventana(v); }
  };
  const nombres = (id) => {
    if (!id) return;
    if (id.type === 'Identifier') out[id.name] = 'writable';
    else if (id.type === 'ObjectPattern') id.properties.forEach((p) => nombres(p.value || p.argument));
    else if (id.type === 'ArrayPattern') id.elements.forEach(nombres);
    else if (id.type === 'AssignmentPattern') nombres(id.left);
    else if (id.type === 'RestElement') nombres(id.argument);
  };
  const anda = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) { if (!/vendor/.test(p)) anda(p); } else if (p.endsWith('.js')) {
        let ast; try { ast = espree.parse(fs.readFileSync(p, 'utf8'), { ecmaVersion: 2023, sourceType: 'script' }); } catch { continue; }
        for (const s of ast.body) {
          if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') nombres(s.id);
          else if (s.type === 'VariableDeclaration') s.declarations.forEach((d) => nombres(d.id));
        }
        ventana(ast);
      }
    }
  };
  anda(path.join(__dirname, 'public', 'js'));
  return out;
}

module.exports = [
  { ignores: ['node_modules/**', 'public/vendor/**', 'public/sw.js', 'tests/ui/**', '.thumbs/**'] },
  {
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    // `crypto` existe como global (WebCrypto) en Node y no tiene createHash/randomBytes: usarlo sin require falla en ejecución.
    rules: { 'no-undef': 'error', 'no-restricted-globals': ['error', { name: 'crypto', message: "Importa el módulo: const crypto = require('crypto')" }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...globalesDelCliente() } },
    rules: { 'no-undef': 'error' },
  },
];
