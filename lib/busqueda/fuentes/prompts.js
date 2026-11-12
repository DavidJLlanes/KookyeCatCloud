'use strict';
// Búsqueda · prompts (un JSON por prompt). El historial de versiones no se indexa.
const { fsp, path, ruta, leeSeguro, aplana, fechaDe } = require('./ayudas');

module.exports = {
  id: 'prompts', nombre: 'Prompts',
  async documentos(ctx, user) {
    const dir = ruta(ctx, user, 'prompts', 'items');
    const nombres = (await fsp.readdir(dir).catch(() => [])).filter(n => n.endsWith('.json'));
    const out = [];
    for (let i = 0; i < nombres.length; i += 100) {
      await Promise.all(nombres.slice(i, i + 100).map(async (n) => {
        const p = await leeSeguro(path.join(dir, n), null);
        if (p && p.id && !p.deletedAt) out.push({ fuente: 'prompts', id: p.id, titulo: p.title || 'Prompt', texto: aplana(p), fecha: fechaDe(p) });
      }));
    }
    return out;
  },
};
