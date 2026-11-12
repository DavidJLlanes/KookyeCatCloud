'use strict';
// Código: proyectos con carpetas y archivos, subida de archivos y de ZIP (con descompresión), versiones y vista previa aislada.
// Almacenamiento (todo bajo <raíz>/.kcc/codigo/):
//   <id>/proyecto.json   metadatos, árbol de archivos (ruta → [hash, tamaño, líneas]) y versiones (fotos del árbol)
//   <id>/objetos/<hash>  contenido de cada archivo, direccionado por su SHA-256 (las versiones comparten objetos)
//   stats.json           contadores de uso (vistas previas, copias, ZIP, restauraciones)
// Los fragmentos antiguos (<id>.json) se convierten solos en proyectos de un archivo.
const store = require('../nucleo/store');
const { readJson } = store;
const { resumenProyectos } = require('./constantes');

function createCodigo({ express, multer, userRoot, sendError, registrarActividad, alCambiar, ZipArchive, valores }) {
  const ctx = { express, multer, userRoot, sendError, registrarActividad, alCambiar, ZipArchive, valores };
  // El orden de montaje es el del archivo original
  Object.assign(ctx, require('./base')(ctx));
  Object.assign(ctx, require('./proyectos')(ctx));
  Object.assign(ctx, require('./archivos')(ctx));
  Object.assign(ctx, require('./versiones')(ctx));
  Object.assign(ctx, require('./vista')(ctx));
  Object.assign(ctx, require('./transferencia')(ctx));
  Object.assign(ctx, require('./vinculos')(ctx));

  const { aparta, borra, borraAparcado, crea, exporta, importa, lista, nombres, promptsDe, quitaRutas, restaura, router, statsFile, vinculaPrompt, vistaRouter } = ctx;
  return {
    router, vistaRouter,
    core: { vinculaPrompt, nombres, promptsDe, crea, resumen: async (user) => resumenProyectos(await lista(user), await readJson(statsFile(user), {})), exporta, importa, quitaRutas, aparta, restaura, borraAparcado, borra },
  };
}

module.exports = createCodigo;
module.exports.resumenProyectos = resumenProyectos;
