'use strict';
// Forma de un bloque sincronizado y su validación. El texto es Markdown en línea con «<br>» como salto de línea
// (igual que el cuerpo de un desplegable de las notas). Se rechaza lo demasiado largo en vez de recortarlo.
const { newId, HttpError, textoLargo } = require('../nucleo/store');

const MAX_BLOQUES = 1000, MAX_TEXTO = 20000;
const RE_ID = /^[a-f0-9]{16}$/;

function limpia(b, prev) {
  const x = prev ? { ...prev } : { id: newId(), ediciones: 0, createdAt: Date.now(), texto: '' };
  if (b && Object.prototype.hasOwnProperty.call(b, 'texto')) {
    if (typeof b.texto !== 'string') throw new HttpError(400, 'El texto del bloque no es válido');
    x.texto = textoLargo(b.texto, MAX_TEXTO, 'El bloque sincronizado');
  }
  if (prev) x.ediciones = (x.ediciones || 0) + 1;
  x.updatedAt = Date.now();
  return x;
}

module.exports = { limpia, RE_ID, MAX_BLOQUES, MAX_TEXTO };
