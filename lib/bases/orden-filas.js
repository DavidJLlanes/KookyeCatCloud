'use strict';
// Bases · orden manual de las filas (arrastrar para reordenar). El orden de `rows` es el orden «natural» de la base.
const { HttpError } = require('../store');
const { RE_ID } = require('./constantes');

// POST /:id/orden  { id, antes }  → mueve la fila `id` justo antes de `antes` (sin `antes`: al final)
function montaOrdenFilas(router, { json, mutar, cambio, sendError }) {
  router.post('/:id/orden', json, async (req, res) => {
    try {
      const rid = String((req.body && req.body.id) || ''), antes = req.body && req.body.antes ? String(req.body.antes) : '';
      if (!RE_ID.test(rid)) throw new HttpError(400, 'Fila no válida');
      let ids;
      await mutar(req.user, req.params.id, (x) => {
        const i = x.rows.findIndex(r => r.id === rid); if (i < 0) throw new HttpError(404, 'No existe la fila');
        if (antes === rid) { ids = x.rows.map(r => r.id); return; }
        const [fila] = x.rows.splice(i, 1);
        const j = antes ? x.rows.findIndex(r => r.id === antes) : x.rows.length;
        if (antes && j < 0) { x.rows.splice(i, 0, fila); throw new HttpError(404, 'No existe la fila de destino'); }
        x.rows.splice(j, 0, fila);
        x.stats = x.stats || { moves: 0 }; x.stats.reordenadas = Math.min(1e6, (x.stats.reordenadas || 0) + 1);
        ids = x.rows.map(r => r.id);
      });
      cambio(req.user);
      res.json({ ok: true, ids });
    } catch (e) { sendError(res, e); }
  });
}

module.exports = { montaOrdenFilas };
