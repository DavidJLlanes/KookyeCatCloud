'use strict';
// Análisis de lo que ocupa cada cosa: estadísticas, espacio por carpeta y duplicados.
const estadisticas = require('./estadisticas');
const espacio = require('./espacio');
const duplicados = require('./duplicados');

function createAnalisis({ express, auth, userRoot, userPath, isHidden, sendError, DATA_ROOT, TRASH_DIR, NOTES_DIR, contar, papelera }) {
  const router = express.Router();
  const { datosApp } = estadisticas.crea({ userRoot, isHidden, TRASH_DIR, NOTES_DIR });
  estadisticas.monta({ router, auth, userRoot, isHidden, sendError, DATA_ROOT, datosApp, contar, papelera });
  espacio.monta({ router, auth, userPath, isHidden, sendError, datosApp });
  duplicados.monta({ router, auth, userRoot, isHidden, sendError });
  return { router, core: { datosApp } };
}

module.exports = createAnalisis;
