'use strict';
// Documentos · límites y listas permitidas (las comparte el saneado, el modelo y las rutas).
module.exports = {
  MAX_DOCS: 300,
  MAX_HTML: 1500000,            // caracteres de HTML por documento
  MAX_TITULO: 120,
  PAGINAS: ['a4', 'carta', 'ancho'],
  RE_ID: /^[a-f0-9]{16}$/,
  SALVAVIDAS: 5,                // copias del texto anterior cuando un guardado lo deja (casi) vacío
  FUENTES: ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Impact'],
  CLASES: ['dc-cols', 'dc-col', 'dc-tareas', 'dc-hecha', 'dc-cita'],
};
