'use strict';
const fs = require('fs');
const path = require('path');
const { cabeceras } = require('./cabeceras');
const { mismoOrigen } = require('./origen');
const { creaPlantillas } = require('./plantillas');
const { APP_VERSION, ARRANQUE, buildId } = require('./version');

// Parte «web» del servidor: cabeceras de seguridad, páginas con prefijo, service worker, versión y estáticos.
function createWeb({ express, APP_DIR, BASE_PATH, SECURE_COOKIES, tileOrigin }) {
  const PUBLIC_DIR = path.join(APP_DIR, 'public');
  const { enviaPlantilla } = creaPlantillas({ PUBLIC_DIR, BASE_PATH });

  // Se monta después de las cabeceras y antes de la autenticación
  function montaEstaticos(app) {
    app.get('/manifest.json', (req, res) => enviaPlantilla(res, 'manifest.json', 'application/manifest+json'));
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('application/javascript').send(fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8').split('__BUILD__').join(buildId()));
    });
    // Versión instalada: pública y sin datos sensibles (la usa la tarjeta "Acerca de" y las comprobaciones)
    app.get('/api/version', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ version: APP_VERSION, build: buildId(), startedAt: ARRANQUE });
    });
    app.use(express.static(PUBLIC_DIR, { index: false }));
  }

  return { cabeceras: cabeceras({ SECURE_COOKIES, tileOrigin }), mismoOrigen, enviaPlantilla, montaEstaticos, buildId, PUBLIC_DIR };
}

module.exports = createWeb;
