'use strict';
/* Gamificación: XP, niveles y rangos, racha diaria, logros por cantidad de elementos y por uso, retos semanales,
   cosméticos y estadísticas de los juegos. Todo es personal y vive en <usuario>/.kcc/game.json.
   El servidor es quien calcula y concede los puntos, así que la pestaña solo pinta lo que devuelve.
   Catálogos: niveles.js, logros.js, cosmeticos.js, retos.js · lógica: motor.js · rutas: rutas-*.js */
const path = require('path');
const { kccDir, readJson } = require('../nucleo/store');
const { nivelDe, xpAcumulada, rangoDe } = require('./niveles');
const { FAMILIAS } = require('./logros');
const { COSMETICOS } = require('./cosmeticos');
const { semanaIso } = require('./utilidades');

function createGame({ userRoot, contar, sendError, registrarActividad, express }) {
  const router = express.Router();
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'game.json');
  const jsonPeq = express.json({ limit: '20kb' });
  const cacheContar = new Map();

  async function recuentos(user) {
    const hit = cacheContar.get(user.username);
    if (hit && Date.now() - hit.t < 45000) return hit.v;
    let v = {};
    try { v = await contar(user); } catch { /* sin recuentos: los logros de contenido esperan */ }
    cacheContar.set(user.username, { t: Date.now(), v });
    return v;
  }

  const ctx = { router, archivo, jsonPeq, recuentos, sendError, registrarActividad };
  // El orden de montaje es el de las rutas originales
  require('./rutas-estado')(ctx);
  require('./rutas-partidas')(ctx);
  require('./rutas-tienda')(ctx);

  // Los módulos avisan al cambiar su contenido para que los logros no esperen a que caduque la caché
  const invalida = (user) => { if (user && user.username) cacheContar.delete(user.username); };
  return { router, nivelDe, readJson, archivo, invalida, recuentos };
}

module.exports = { createGame, nivelDe, xpAcumulada, rangoDe, semanaIso, COSMETICOS, FAMILIAS };
