'use strict';
// Etiquetas de color compartidas por todos los módulos (notas, prompts, calendario).
// Una etiqueta se crea una vez y se usa en cualquier sitio; renombrarla o cambiarle el
// color la cambia en todas partes a la vez.
const path = require('path');
const { kccDir, updateJson, readJson, newId, HttpError, cleanColor, cleanStr } = require('./store');

const PALETA = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'];

module.exports = function createLabels({ express, userRoot, sendError }) {
  const router = express.Router();
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'labels.json');
  const contadores = [];   // cada módulo registra cómo contar sus usos: async (user) => { [labelId]: n }
  const alBorrar = [];     // y cómo quitar una etiqueta borrada: async (user, labelId)

  router.get('/', async (req, res) => {
    try {
      const data = await readJson(archivo(req.user), { labels: [] });
      const uso = {};
      for (const c of contadores) {
        const r = await c(req.user);
        for (const [id, n] of Object.entries(r)) uso[id] = (uso[id] || 0) + n;
      }
      res.json({ labels: data.labels.map(l => ({ ...l, uses: uso[l.id] || 0 })), palette: PALETA });
    } catch (err) { sendError(res, err); }
  });

  router.post('/', express.json(), async (req, res) => {
    try {
      const name = cleanStr(req.body && req.body.name, 40).trim();
      if (!name) throw new HttpError(400, 'Falta el nombre');
      const label = await updateJson(archivo(req.user), { labels: [] }, (d) => {
        if (d.labels.length >= 500) throw new HttpError(400, 'Demasiadas etiquetas');
        const dup = d.labels.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (dup) return dup;
        const l = { id: newId(), name, color: cleanColor(req.body.color, PALETA[d.labels.length % PALETA.length]) };
        d.labels.push(l);
        return l;
      });
      res.json({ ok: true, label });
    } catch (err) { sendError(res, err); }
  });

  router.put('/:id', express.json(), async (req, res) => {
    try {
      const label = await updateJson(archivo(req.user), { labels: [] }, (d) => {
        const l = d.labels.find(x => x.id === req.params.id);
        if (!l) throw new HttpError(404, 'Etiqueta no encontrada');
        if (req.body.name !== undefined) {
          const name = cleanStr(req.body.name, 40).trim();
          if (!name) throw new HttpError(400, 'Falta el nombre');
          l.name = name;
        }
        if (req.body.color !== undefined) l.color = cleanColor(req.body.color, l.color);
        return l;
      });
      res.json({ ok: true, label });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await updateJson(archivo(req.user), { labels: [] }, (d) => {
        d.labels = d.labels.filter(l => l.id !== req.params.id);
      });
      for (const f of alBorrar) await f(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return {
    router,
    registrarContador: (f) => contadores.push(f),
    registrarLimpieza: (f) => alBorrar.push(f),
    // Crea las etiquetas que falten por nombre y devuelve sus ids (importaciones)
    async asegurar(user, nombres) {
      const ids = [];
      await updateJson(archivo(user), { labels: [] }, (d) => {
        for (const n of nombres) {
          const name = cleanStr(n, 40).trim();
          if (!name) continue;
          let l = d.labels.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!l && d.labels.length < 500) {
            l = { id: newId(), name, color: PALETA[d.labels.length % PALETA.length] };
            d.labels.push(l);
          }
          if (l) ids.push(l.id);
        }
      });
      return ids;
    },
  };
};
