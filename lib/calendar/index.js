'use strict';
// Calendario. Las fechas se guardan «ingenuas» (ver fechas.js). Cada archivo de esta carpeta añade una parte
// (rutas y ayudantes) al contexto compartido `ctx`; el ORDEN de montaje importa solo entre rutas de la misma forma.
const { montaBase } = require('./base');
const { montaCalendarios } = require('./calendarios');
const { montaTareas } = require('./tareas');
const { montaImportar } = require('./importar');
const { montaIcal } = require('./ical');
const { montaConsultas } = require('./consultas');
const { montaEventos } = require('./eventos');
const { montaCore } = require('./core');
const { expande } = require('./recurrencia');
const { limpiaEvento } = require('./evento');

function createCalendar({ express, userRoot, sendError, registrarActividad, icalIndexFile }) {
  const ctx = { express, userRoot, sendError, registrarActividad, icalIndexFile, router: express.Router() };
  for (const monta of [montaBase, montaCalendarios, montaTareas, montaImportar, montaIcal, montaConsultas, montaEventos, montaCore]) {
    Object.assign(ctx, monta(ctx));
  }
  return { router: ctx.router, core: ctx.core };
}

module.exports = createCalendar;
module.exports.expande = expande;
module.exports.limpiaEvento = limpiaEvento;
