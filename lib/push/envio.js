'use strict';
// Envío de avisos a los dispositivos de un usuario con Web Push. Los dispositivos que el servicio push da por perdidos
// (404/410) se quitan de la lista. Con KCC_PUSH_PRUEBAS=1 no sale nada a Internet: los avisos se guardan en memoria.
const webpush = require('web-push');
const { updateJson, readJson } = require('../store');
const { VACIO, norm } = require('./dispositivos');

const PRUEBAS = process.env.KCC_PUSH_PRUEBAS === '1';
const registroPruebas = [];

function creaEnvio({ claves, contacto, archivoDe }) {
  webpush.setVapidDetails(contacto, claves.publicKey, claves.privateKey);

  // Devuelve { ok, fallos, quitados } (ok = dispositivos que lo aceptaron)
  async function envia(user, payload) {
    const archivo = archivoDe(user, 'suscripciones');
    const lista = norm(await readJson(archivo, VACIO)).dispositivos;
    const cuerpo = JSON.stringify(payload), caducados = [];
    let ok = 0, fallos = 0;
    await Promise.all(lista.map(async (d) => {
      try {
        if (PRUEBAS) registroPruebas.push({ usuario: user.username, dispositivo: d.id, payload });
        else await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, cuerpo, { TTL: 86400, urgency: 'normal', timeout: 10000 });
        ok++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) caducados.push(d.id); else fallos++;
      }
    }));
    if (caducados.length) await updateJson(archivo, VACIO, (d) => { norm(d); d.dispositivos = d.dispositivos.filter(x => !caducados.includes(x.id)); });
    return { ok, fallos, quitados: caducados.length };
  }
  return { envia };
}

module.exports = { creaEnvio, registroPruebas, PRUEBAS };
