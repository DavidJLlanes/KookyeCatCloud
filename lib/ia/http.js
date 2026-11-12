'use strict';
// IA · petición HTTP a un proveedor. Los servidores conocidos (`fijo`) se llaman tal cual; una dirección escrita por el usuario
// se resuelve antes, se rechaza si es privada/local (salvo KCC_IA_PERMITE_LOCAL=1) y se conecta a la IP ya comprobada.
const http = require('http');
const https = require('https');
const { resuelve, ErrorRed } = require('../marcadores/red');

const MAX_RESPUESTA = 2 * 1024 * 1024;

async function llama(urlTxt, { metodo = 'POST', cabeceras = {}, cuerpo, timeout = 90000, fijo = false, permiteLocal = false } = {}) {
  let url; try { url = new URL(urlTxt); } catch { throw new ErrorRed('La dirección del proveedor no es válida'); }
  if (!/^https?:$/.test(url.protocol)) throw new ErrorRed('La dirección debe empezar por http:// o https://');
  if (url.username || url.password) throw new ErrorRed('La dirección no debe llevar usuario ni contraseña');
  if (!fijo && url.protocol === 'http:' && !permiteLocal) throw new ErrorRed('Usa una dirección https://');
  const destino = fijo ? null : await resuelve(url.hostname.replace(/^\[|\]$/g, ''), permiteLocal);
  const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo));
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const opts = { method: metodo, headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}), ...cabeceras } };
    if (destino) opts.lookup = (_h, o, cb) => (o && o.all ? cb(null, [{ address: destino.address, family: destino.family }]) : cb(null, destino.address, destino.family));
    const req = mod.request(url, opts, (res) => {
      const trozos = []; let total = 0;
      res.on('data', (c) => { total += c.length; if (total > MAX_RESPUESTA) { res.destroy(); reject(new ErrorRed('La respuesta del proveedor es demasiado grande')); } else trozos.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, texto: Buffer.concat(trozos).toString('utf8') }));
      res.on('error', () => reject(new ErrorRed('Se cortó la conexión con el proveedor')));
    });
    const plazo = setTimeout(() => req.destroy(new ErrorRed('El proveedor tarda demasiado en responder')), timeout);
    req.on('close', () => clearTimeout(plazo));
    req.on('error', (e) => reject(e instanceof ErrorRed ? e : new ErrorRed('No se pudo conectar con el proveedor')));
    if (datos) req.write(datos);
    req.end();
  });
}

module.exports = { llama, ErrorRed };
