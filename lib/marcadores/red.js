'use strict';
// Descargas HTTP hacia webs de terceros con defensa contra SSRF: el servidor comparte máquina con otros servicios
// (bases de datos, paneles, Temporal…) y una URL guardada por el usuario nunca debe poder alcanzarlos.
//   · se resuelve el nombre y se rechaza si CUALQUIER dirección es privada, local o reservada;
//   · se conecta a la dirección ya comprobada (no se vuelve a resolver: evita el «DNS rebinding»);
//   · cada redirección se vuelve a validar, con un máximo de saltos;
//   · tope de tamaño y de tiempo.
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');

const bloqueo = new net.BlockList();
[['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]].forEach(([ip, n]) => bloqueo.addSubnet(ip, n, 'ipv4'));
[['::', 96], ['2002::', 16], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32], ['100::', 64]].forEach(([ip, n]) => bloqueo.addSubnet(ip, n, 'ipv6'));

function esPrivada(ip) {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapeada) return bloqueo.check(mapeada[1], 'ipv4');
  const fam = net.isIPv6(ip) ? 'ipv6' : net.isIPv4(ip) ? 'ipv4' : null;
  return !fam || bloqueo.check(ip, fam);
}

class ErrorRed extends Error {}

// Devuelve una dirección pública del anfitrión (o lanza ErrorRed)
async function resuelve(host, permiteLocal) {
  if (net.isIP(host)) { if (!permiteLocal && esPrivada(host)) throw new ErrorRed('Dirección no permitida'); return { address: host, family: net.isIPv6(host) ? 6 : 4 }; }
  let lista;
  try { lista = await dns.lookup(host, { all: true }); } catch { throw new ErrorRed('No se encuentra esa web'); }
  if (!lista.length || (!permiteLocal && lista.some(a => esPrivada(a.address)))) throw new ErrorRed('Dirección no permitida');
  return lista[0];
}

function peticion(url, destino, { max, timeout, accept }) {
  return new Promise((resolve, reject) => {
    const modulo = url.protocol === 'https:' ? https : http;
    const req = modulo.request(url, {
      method: 'GET', timeout,
      headers: { 'User-Agent': 'KookyeCatCloud/1.0 (+favicon)', Accept: accept || '*/*', 'Accept-Encoding': 'identity' },
      // Se conecta a la dirección ya validada; el nombre solo sirve para el certificado y la cabecera Host
      lookup: (_h, opciones, cb) => (opciones && opciones.all ? cb(null, [{ address: destino.address, family: destino.family }]) : cb(null, destino.address, destino.family)),
    }, (res) => {
      const trozos = []; let total = 0;
      res.on('data', (c) => { total += c.length; if (total > max) { res.destroy(); resolve({ status: res.statusCode, headers: res.headers, cuerpo: Buffer.concat(trozos), truncado: true }); } else trozos.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, cuerpo: Buffer.concat(trozos), truncado: false }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new ErrorRed('La web tarda demasiado en responder')));
    // Plazo total: un servidor que gotea bytes no debe mantener la conexión abierta indefinidamente
    const plazo = setTimeout(() => req.destroy(new ErrorRed('La web tarda demasiado en responder')), (timeout || 6000) * 2);
    req.on('close', () => clearTimeout(plazo));
    req.on('error', (e) => reject(e instanceof ErrorRed ? e : new ErrorRed('No se pudo conectar con la web')));
    req.end();
  });
}

// GET seguro con redirecciones validadas. Devuelve { status, headers, cuerpo, url }.
async function descarga(texto, { max = 512 * 1024, timeout = 6000, saltos = 4, accept, permiteLocal = false } = {}) {
  let url;
  try { url = new URL(texto); } catch { throw new ErrorRed('La dirección no es válida'); }
  for (let i = 0; i <= saltos; i++) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new ErrorRed('Solo se admiten direcciones http y https sin usuario');
    const destino = await resuelve(url.hostname.replace(/^\[|\]$/g, ''), permiteLocal);
    const r = await peticion(url, destino, { max, timeout, accept });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      try { url = new URL(r.headers.location, url); } catch { throw new ErrorRed('Redirección no válida'); }
      continue;
    }
    return { ...r, url: url.toString() };
  }
  throw new ErrorRed('Demasiadas redirecciones');
}

module.exports = { descarga, esPrivada, ErrorRed };
