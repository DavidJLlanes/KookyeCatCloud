'use strict';
// Rutas de la tienda: comprar y equipar cosméticos.
const { updateJson, HttpError } = require('../nucleo/store');
const { nivelDe } = require('./niveles');
const { ESTADO_BASE } = require('./utilidades');
const { catalogo, reqOk, esPropio, cierra, vista } = require('./motor');

function monta(ctx) {
  const { router, archivo, jsonPeq, recuentos, sendError } = ctx;
  router.post('/buy', jsonPeq, async (req, res) => {
    try {
      const it = catalogo(String(req.body.id || ''));
      if (!it) throw new HttpError(404, 'No existe');
      const c = await recuentos(req.user);
      let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        if (esPropio(it, s)) throw new HttpError(400, 'Ya lo tienes');
        if (!reqOk(it, s)) throw new HttpError(400, it.nivel ? `Se desbloquea en el nivel ${it.nivel}` : 'Todavía no cumples el requisito');
        if (it.precio <= 0) throw new HttpError(400, 'Se consigue cumpliendo su logro');
        if (s.monedas < it.precio) throw new HttpError(400, 'Te faltan monedas');
        s.monedas -= it.precio; s.propios.push(it.id);
        const nuevos = []; cierra(s, c, nuevos, nivelDe(s.xp), s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = { ...vista(s, c), nuevos };
      });
      res.json(out);
    } catch (err) { sendError(res, err); }
  });

  router.post('/equip', jsonPeq, async (req, res) => {
    try {
      const it = catalogo(String(req.body.id || ''));
      if (!it) throw new HttpError(404, 'No existe');
      const c = await recuentos(req.user);
      let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        if (!esPropio(it, s)) throw new HttpError(400, 'Aún no lo tienes');
        s.equipado[it.tipo] = it.id;
        out = vista(s, c);
      });
      res.json(out);
    } catch (err) { sendError(res, err); }
  });

}

module.exports = monta;
