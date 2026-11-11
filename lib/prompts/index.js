'use strict';
// Módulo de prompts de IA. Cada prompt es un JSON propio (items/<id>.json) y se mantiene un
// índice en memoria por usuario, de modo que buscar y filtrar miles de prompts es instantáneo
// sin reescribir nunca un archivo gigante. Las imágenes de muestra se convierten a WebP.
//
// Cada archivo de esta carpeta añade una parte (rutas y ayudantes) al contexto compartido `ctx`.
// El ORDEN de montaje importa: las rutas de una sola barra (/meta, /stats, /fragments…) deben ir antes que /:id.
const { montaBase } = require('./base');
const { montaListado } = require('./listado');
const { montaOrganiza } = require('./organiza');
const { montaParecidos } = require('./parecidos');
const { montaCrud } = require('./crud');
const { montaImagenes } = require('./imagenes');
const { montaComfy } = require('./comfy');
const { montaExportar } = require('./exportar');
const { montaEnganches } = require('./enganches');

function createPrompts({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar, labels, papeleraDias, valores }) {
  const ctx = {
    express, multer, sharp, userRoot, sendError, registrarActividad, calendar, labels, papeleraDias, valores,
    router: express.Router(),
    cache: new Map(),   // raíz del usuario -> { items: Map, cargado: Promise }
  };
  for (const monta of [montaBase, montaListado, montaOrganiza, montaParecidos, montaCrud, montaImagenes, montaComfy, montaExportar, montaEnganches]) {
    Object.assign(ctx, monta(ctx));
  }
  return { router: ctx.router, core: ctx.core };
}

module.exports = createPrompts;
