'use strict';
// Explorador de archivos: listar, crear carpetas, subir, buscar, borrar, mover y operar por lotes.
const { montaListado } = require('./listado');
const { creaSubida } = require('./subida');
const { montaBusqueda } = require('./busqueda');
const { montaOperaciones } = require('./operaciones');

// trash, shares, calendar y versions son funciones: esos módulos se crean después que este
function createExplorador({ express, multer, auth, userPath, isHidden, limpiaRel, mismoAlmacen, sharesMueve, exists, freeName, sendError, registrarActividad, MAX_UPLOAD_BYTES, trash, shares, calendar, versions }) {
  const router = express.Router();
  montaListado({ router, auth, userPath, isHidden, limpiaRel, sendError, registrarActividad, shares });
  const { makeUploader } = creaSubida({ multer, router, auth, userPath, registrarActividad, MAX_UPLOAD_BYTES });
  montaBusqueda({ router, auth, userPath, isHidden, sendError });
  montaOperaciones({ router, auth, userPath, limpiaRel, mismoAlmacen, sharesMueve, exists, freeName, sendError, registrarActividad, trash, calendar, versions });
  return { router, core: { makeUploader } };
}

module.exports = createExplorador;
