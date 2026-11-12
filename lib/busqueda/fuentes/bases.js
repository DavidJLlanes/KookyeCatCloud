'use strict';
// Búsqueda · bases: un documento por base (nombre y columnas) y otro por fila (sus celdas de texto), hasta un tope por base.
const { fsp, path, ruta, leeSeguro, lista, aplana, fechaDe } = require('./ayudas');

const MAX_FILAS = 5000;

module.exports = {
  id: 'bases', nombre: 'Bases',
  async documentos(ctx, user) {
    const dir = ruta(ctx, user, 'bases');
    const nombres = (await fsp.readdir(dir).catch(() => [])).filter(n => /^[a-f0-9]{16}\.json$/.test(n));
    const out = [];
    for (const n of nombres) {
      const b = await leeSeguro(path.join(dir, n), null);
      if (!b || !b.id || !Array.isArray(b.rows)) continue;
      const cols = lista(b.columns);
      out.push({ fuente: 'bases', id: b.id, titulo: b.name || 'Base', texto: cols.map(c => c.nombre).filter(Boolean).join(', '), fecha: fechaDe(b) });
      for (const f of b.rows.slice(0, MAX_FILAS)) {
        if (!f || !f.id) continue;
        const celdas = [];
        for (const c of cols) { if (c.tipo === 'relation' || c.tipo === 'formula') continue; const v = f.c && f.c[c.id]; if (v !== undefined && v !== null && v !== '') celdas.push(aplana(v, { numeros: true })); }
        const texto = celdas.filter(Boolean).join('\n');
        if (texto) out.push({ fuente: 'bases', id: b.id, sub: f.id, titulo: `${(celdas[0] || '').split('\n')[0].slice(0, 80)} · ${b.name}`, texto, fecha: fechaDe(f) });
      }
    }
    return out;
  },
};
