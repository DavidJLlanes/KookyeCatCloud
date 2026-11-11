'use strict';
// Red mínima contra los fallos que `node --check` no ve: un identificador sin definir/importar
// (típico al mover código entre archivos) solo explota en tiempo de ejecución y un try/catch lo puede tragar.
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', 'public/**', '.thumbs/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
];
