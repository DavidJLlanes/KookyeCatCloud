'use strict';
// Búsqueda · notas (índice en JSON + un .md por nota). Las carpetas y bases incrustadas solo aportan el título.
const fsp = require('fs').promises;

module.exports = {
  id: 'notas', nombre: 'Notas',
  async documentos(ctx, user) {
    if (!ctx.notas) return [];
    const data = await ctx.notas.readNotes(user, { tolerante: true });
    const out = [];
    for (const it of (data && data.items) || []) {
      if (!it || !it.id || it.deletedAt) continue;
      let texto = '';
      if (it.type === 'note') { try { texto = (await fsp.readFile(ctx.notas.notaFile(user, it.id), 'utf8')).slice(0, 60000); } catch { /* sin cuerpo */ } }
      out.push({ fuente: 'notas', id: it.id, titulo: it.title || 'Sin título', texto, fecha: Number(it.updatedAt || it.createdAt) || 0 });
    }
    return out;
  },
};
