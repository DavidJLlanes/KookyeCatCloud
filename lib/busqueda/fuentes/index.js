'use strict';
// Búsqueda · lista de fuentes. Cada una devuelve [{ fuente, id, sub?, titulo, texto, fecha }] de un usuario.
const modulos = require('./modulos');
const FUENTES = [require('./notas'), require('./prompts'), require('./bases'), require('./documentos'), require('./codigo'), ...modulos, require('./archivos')];
module.exports = { FUENTES, NOMBRES: Object.fromEntries(FUENTES.map(f => [f.id, f.nombre])) };
