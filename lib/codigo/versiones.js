'use strict';
// versiones: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const store = require('../nucleo/store');
const { updateJson, HttpError } = store;
const fs = require('fs');
const fsp = fs.promises;
const { recuenta } = require('./constantes');

function monta(ctx) {
  const { barre, cambio, detalle, igualQueUltima, instantanea, json, leer, mutar, raiz, registrarActividad, router, sendError, statsFile } = ctx;

  /* ---------- Versiones ---------- */
  router.post('/:id/versiones', json, async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, (x) => {
        if (!Object.keys(x.archivos).length) throw new HttpError(400, 'El proyecto está vacío');
        if (igualQueUltima(x)) throw new HttpError(400, 'No hay cambios desde la última versión');
        instantanea(x, req.body && req.body.mensaje); recuenta(x);
      });
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'version', nombre: p.nombre });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/versiones/:vid', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id); const v = p.versiones.find(x => x.id === req.params.vid); if (!v) throw new HttpError(404, 'No existe esa versión');
      res.json({ id: v.id, n: v.n, mensaje: v.mensaje, fecha: v.fecha, archivos: Object.fromEntries(Object.entries(v.archivos).map(([r, a]) => [r, { h: a[0], t: a[1], l: a[2] }])), carpetas: v.carpetas || [],
        actual: Object.fromEntries(Object.entries(p.archivos).map(([r, a]) => [r, { h: a[0], t: a[1], l: a[2] }])) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/versiones/:vid/restaurar', json, async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, (x) => {
        const v = x.versiones.find(y => y.id === req.params.vid); if (!v) throw new HttpError(404, 'No existe esa versión');
        if (!igualQueUltima(x) && Object.keys(x.archivos).length) instantanea(x, `Antes de restaurar la v${v.n}`);
        x.archivos = JSON.parse(JSON.stringify(v.archivos)); x.carpetas = [...(v.carpetas || [])]; recuenta(x);
      });
      await fsp.mkdir(raiz(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (s) => { s.restauraciones = (s.restauraciones || 0) + 1; });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id/versiones/:vid', async (req, res) => {
    try {
      const p = await mutar(req.user, req.params.id, async (x) => {
        const i = x.versiones.findIndex(y => y.id === req.params.vid); if (i < 0) throw new HttpError(404, 'No existe esa versión');
        x.versiones.splice(i, 1); recuenta(x); await barre(req.user, x);
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });


  return {  };
}

module.exports = monta;
