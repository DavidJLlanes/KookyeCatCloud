'use strict';
// Archivos: descargas y ZIP, vista previa, miniaturas y texto. Se crea después de LibreOffice (la descarga lo usa).
const { creaImagenes } = require('./imagenes');
const { creaDescarga } = require('./descarga');
const { montaPrevia } = require('./previa');
const { montaTexto } = require('./texto');

function createArchivos({ express, ZipArchive, auth, userPath, sendError, registrarActividad, sharp, ffmpeg, soffice, THUMBS_DIR, exists, convertirOffice, versions }) {
  const router = express.Router();
  const { convertirCache, fotogramaVideo } = creaImagenes({ sharp, THUMBS_DIR, exists });
  const { cabeceraDescarga, enviarZip } = creaDescarga({ ZipArchive, router, auth, userPath, sendError, registrarActividad, sharp, soffice, THUMBS_DIR, exists, convertirOffice });
  montaPrevia({ router, auth, userPath, sendError, sharp, ffmpeg, THUMBS_DIR, exists, convertirCache, fotogramaVideo });
  montaTexto({ express, router, auth, userPath, sendError, registrarActividad, versions });
  return { router, core: { cabeceraDescarga, enviarZip, convertirCache, fotogramaVideo } };
}

module.exports = createArchivos;
