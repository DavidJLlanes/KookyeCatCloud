'use strict';
// Dispositivos suscritos a los avisos de un usuario. Datos: <raíz>/.kcc/push/suscripciones.json  { dispositivos: [ … ] }
const crypto = require('crypto');
const { HttpError, newId } = require('../store');

const MAX_DISPOSITIVOS = 10;

// Solo se envía a los servicios push de los navegadores: si no, un usuario podría hacer que el servidor
// conecte con cualquier dirección (SSRF) usando una «suscripción» inventada.
const SERVICIOS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/];

// `pruebas` (KCC_PUSH_PRUEBAS=1) añade un servicio de mentira para las pruebas automáticas; nunca una dirección local
function endpointValido(endpoint, pruebas) {
  let u; try { u = new URL(endpoint); } catch { return false; }
  const servicios = pruebas ? [...SERVICIOS, /^push\.prueba\.local$/] : SERVICIOS;
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && servicios.some(r => r.test(u.hostname));
}

const huella = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);

function limpia(s, ua, pruebas) {
  if (!s || typeof s !== 'object') throw new HttpError(400, 'Suscripción no válida');
  const endpoint = String(s.endpoint || ''), k = s.keys || {};
  if (endpoint.length > 1000 || !endpointValido(endpoint, pruebas)) throw new HttpError(400, 'Este navegador usa un servicio de avisos no admitido');
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100 || !/^[\w-]+$/.test(k.p256dh) || !/^[\w-]+$/.test(k.auth)) throw new HttpError(400, 'Suscripción incompleta');
  return { id: huella(endpoint), endpoint, keys: { p256dh: k.p256dh, auth: k.auth }, nombre: nombreDe(ua), creada: Date.now() };
}

// «Chrome en Android», «Safari en iPhone»… a partir del agente de usuario (solo para reconocer el dispositivo en la lista)
function nombreDe(ua) {
  const u = String(ua || '');
  const sis = /iPhone|iPad/.test(u) ? 'iPhone/iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Dispositivo';
  const nav = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Navegador';
  return `${nav} en ${sis}`;
}

const VACIO = () => ({ dispositivos: [] });
const norm = (d) => { d.dispositivos = Array.isArray(d.dispositivos) ? d.dispositivos : []; return d; };

module.exports = { MAX_DISPOSITIVOS, endpointValido, limpia, huella, nombreDe, VACIO, norm, newId };
