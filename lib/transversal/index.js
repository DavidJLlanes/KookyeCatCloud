'use strict';
// Rutas y conexiones que cruzan varios módulos: iCal, búsqueda global, fechas de archivos y cableado entre módulos.
const { montaIcal } = require('./ical');
const { montaArchivosCalendario } = require('./archivos-calendario');
const { montaOmni } = require('./omni');
const { conectaModulos } = require('./cableado');

function montaTransversal({ app, auth, sendError, userPath, limpiaRel, BASE_PATH, labels, calendar, prompts, games, readNotes, writeNotes, notaFile }) {
  conectaModulos({ labels, calendar, prompts, games, readNotes, writeNotes });
  montaIcal({ app, calendar, BASE_PATH });
  montaArchivosCalendario({ app, auth, userPath, limpiaRel, sendError, calendarCore: calendar });
  montaOmni({ app, auth, sendError, readNotes, notaFile, promptsCore: prompts, calendarCore: calendar });
}

module.exports = montaTransversal;
