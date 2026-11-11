'use strict';
// vista: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const { MIME, esTexto, ext, normRuta } = require('./constantes');

function monta(ctx) {
  const { claveVista, json, leer, manifiesto, objeto, objetoOk, router, sendError, validId, vistaRouter } = ctx;

  /* ---------- Vista web aislada (sin scripts) ---------- */
  const firmaToken = (datos) => crypto.createHmac('sha256', claveVista).update(datos).digest('base64url');
  router.post('/:id/vista', json, async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const vid = String((req.body && req.body.v) || ''); manifiesto(p, vid);
      const datos = Buffer.from(JSON.stringify({ u: req.user.username, r: req.user.role, id: p.id, v: vid, j: req.body && req.body.js === true ? 1 : 0, e: Date.now() + 60 * 60 * 1000 })).toString('base64url');
      res.json({ token: `${datos}.${firmaToken(datos)}` });
    } catch (e) { sendError(res, e); }
  });

  vistaRouter.get('/:token/*', async (req, res) => {
    const falla = (c, m) => { res.status(c).type('text/plain; charset=utf-8').send(m); };
    try {
      const [datos, f] = String(req.params.token).split('.'); if (!datos || !f) return falla(403, 'Enlace no válido');
      const esperado = Buffer.from(firmaToken(datos)); const dado = Buffer.from(f);
      if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) return falla(403, 'Enlace no válido');
      const t = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')); if (!t || t.e < Date.now() || !validId(t.id)) return falla(403, 'El enlace ha caducado');
      const user = { username: t.u, role: t.r };
      const p = await leer(user, t.id); const { archivos } = manifiesto(p, t.v || '');
      let ruta; try { ruta = normRuta(decodeURIComponent(req.params[0] || '') || 'index.html'); } catch { return falla(400, 'Ruta no válida'); }
      if (!archivos[ruta] && archivos[ruta + '/index.html']) ruta += '/index.html';
      const a = archivos[ruta]; if (!a) return falla(404, 'No existe ese archivo en el proyecto');
      await objetoOk(user, t.id, a); const buf = await fsp.readFile(objeto(user, t.id, a[0])); const e = ext(ruta);
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'private, no-store');
      // Con «Permitir JavaScript» (interruptor de la Vista web) el marco lleva sandbox con allow-scripts y SIN allow-same-origin:
      // el script corre con origen opaco, sin tus cookies ni acceso a la sesión de la app. El permiso va dentro del token firmado.
      res.setHeader('Content-Security-Policy', t.j
        ? "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; media-src 'self' data: blob: https:; connect-src 'self' https:; sandbox allow-scripts"
        : "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self'; sandbox");
      res.setHeader('Content-Type', MIME[e] || (esTexto(ruta, buf) ? 'text/plain; charset=utf-8' : 'application/octet-stream'));
      res.send(buf);
    } catch (e) { falla(e && e.status ? e.status : 500, 'No se pudo mostrar el archivo'); }
  });


  return { firmaToken };
}

module.exports = monta;
