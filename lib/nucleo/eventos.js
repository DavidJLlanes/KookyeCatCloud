'use strict';
// Avisos en directo (Server-Sent Events): el navegador mantiene UNA conexión abierta y el servidor
// le dice cuándo algo cambió en su espacio (un archivo subido por un enlace público, WebDAV, otro
// dispositivo…). Así la web no tiene que preguntar cada pocos segundos.
//
// Cada cliente tiene su raíz (la carpeta del usuario; el administrador, todo el almacén) y recibe
// los cambios que ocurren dentro de ella. Un cambio hecho por la propia pestaña no se le reenvía.
const path = require('path');

const MAX_POR_USUARIO = Number(process.env.EVENTS_PER_USER || 8);
const LATIDO_MS = 25 * 1000;       // señal de vida: evita que Nginx o el móvil cierren la conexión
const AGRUPA_MS = 350;             // varios cambios seguidos (una subida de 50 fotos) salen como un solo aviso

function createEvents({ userRoot }) {
  const clientes = new Set();      // { res, raiz, usuario, cid }
  const pendientes = new Map();    // raíz del cambio -> { ruta, origen, timer }

  const dentro = (raiz, ruta) => ruta === raiz || ruta.startsWith(raiz.endsWith(path.sep) ? raiz : raiz + path.sep);

  function envia(c, tipo, datos) {
    try { c.res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos || {})}\n\n`); } catch { cierra(c); }
  }
  function cierra(c) { clientes.delete(c); try { c.res.end(); } catch { /* ya cerrada */ } }

  // ruta: carpeta (absoluta) donde cambió algo; origen: id de la pestaña que lo provocó, si la hay
  function cambio(ruta, origen) {
    if (!ruta) return;
    const clave = `${ruta}\u0000${origen || ''}`;
    if (pendientes.has(clave)) return;
    const t = setTimeout(() => {
      pendientes.delete(clave);
      for (const c of clientes) {
        if (origen && c.cid === origen) continue;
        if (dentro(c.raiz, ruta)) envia(c, 'files', {});
      }
    }, AGRUPA_MS);
    t.unref && t.unref();
    pendientes.set(clave, t);
  }

  // Aviso para un usuario concreto, no ligado a una carpeta (portapapeles compartido…).
  // `tipo` es el nombre del evento SSE; `origen`, la pestaña que lo provocó.
  function notifica(usuario, tipo, origen) {
    const clave = `\u0001${usuario}\u0000${tipo}\u0000${origen || ''}`;
    if (pendientes.has(clave)) return;
    const t = setTimeout(() => {
      pendientes.delete(clave);
      for (const c of clientes) {
        if (c.usuario !== usuario || (origen && c.cid === origen)) continue;
        envia(c, tipo, {});
      }
    }, 120);
    t.unref && t.unref();
    pendientes.set(clave, t);
  }

  // GET /api/events?cid=<id de pestaña>
  function manejador(req, res) {
    let raiz;
    try { raiz = userRoot(req.user); } catch { return res.status(403).end(); }
    const cid = String(req.query.cid || '').slice(0, 40).replace(/[^\w-]/g, '');
    const mios = [...clientes].filter(c => c.usuario === req.user.username);
    while (mios.length >= MAX_POR_USUARIO) cierra(mios.shift());   // se descartan las más antiguas

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',        // Nginx: no retener los avisos
    });
    res.write('retry: 5000\n\n');
    const c = { res, raiz, usuario: req.user.username, cid };
    clientes.add(c);
    envia(c, 'hola', {});
    req.on('close', () => clientes.delete(c));
  }

  const latido = setInterval(() => { for (const c of clientes) { try { c.res.write(': ♥\n\n'); } catch { cierra(c); } } }, LATIDO_MS);
  latido.unref();

  return { manejador, cambio, notifica, total: () => clientes.size };
}

module.exports = createEvents;
