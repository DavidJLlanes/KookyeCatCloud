'use strict';
// Claves VAPID del servidor (identifican a este servidor ante los servicios push). Se generan una vez y se guardan fuera
// de los datos de los usuarios; si se pierden, los dispositivos tienen que volver a activar los avisos.
const webpush = require('web-push');
const { leeJsonSync, escribeJsonSync } = require('../store');

function cargaClaves(archivo) {
  const g = leeJsonSync(archivo, null);
  if (g && g.publicKey && g.privateKey) return g;
  const nuevas = webpush.generateVAPIDKeys();
  escribeJsonSync(archivo, nuevas, 0o600);
  return nuevas;
}

module.exports = { cargaClaves };
