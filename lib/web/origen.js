'use strict';
// Freno CSRF de refuerzo. La cookie de sesión ya es SameSite=Strict, pero eso no protege de un subdominio hermano
// (otra app en *.djl.com.es es «mismo sitio»). Los navegadores mandan Sec-Fetch-Site en cada petición: una escritura
// que llega desde otro sitio o desde un subdominio hermano se rechaza. Clientes sin navegador (WebDAV, scripts) no la
// mandan y siguen funcionando con su credencial. Excepción: /share-target, que llega desde el menú «Compartir» del móvil.
const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXENTAS = /^\/share-target(\/|$)/;

function mismoOrigen(req, res, next) {
  if (SEGUROS.has(req.method) || EXENTAS.test(req.path)) return next();
  const sitio = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (sitio === 'cross-site' || sitio === 'same-site') return res.status(403).json({ error: 'Petición rechazada: llega desde otro sitio' });
  next();
}

module.exports = { mismoOrigen };
