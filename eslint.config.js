'use strict';
// Red mínima contra los fallos que `node --check` no ve: un identificador sin definir/importar
// (típico al mover código entre archivos) solo explota en tiempo de ejecución y un try/catch lo puede tragar.
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', 'public/**', 'tests/ui/**', '.thumbs/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    // `crypto` existe como global (WebCrypto) en Node y no tiene createHash/randomBytes: usarlo sin require falla en ejecución.
    rules: { 'no-undef': 'error', 'no-restricted-globals': ['error', { name: 'crypto', message: "Importa el módulo: const crypto = require('crypto')" }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
];
