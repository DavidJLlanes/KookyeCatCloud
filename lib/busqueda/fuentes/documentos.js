'use strict';
// Búsqueda · documentos: un resultado por documento (título y texto sin etiquetas).
const { fsp, path, ruta, leeSeguro, fechaDe } = require('./ayudas');
const { aTexto } = require('../../documentos/sanear');

module.exports = {
  id: 'documentos', nombre: 'Documentos',
  async documentos(ctx, user) {
    const dir = ruta(ctx, user, 'documentos');
    const nombres = (await fsp.readdir(dir).catch(() => [])).filter(n => /^[a-f0-9]{16}\.json$/.test(n));
    const out = [];
    for (const n of nombres) {
      const d = await leeSeguro(path.join(dir, n), null);
      if (!d || !d.id || typeof d.html !== 'string') continue;
      out.push({ fuente: 'documentos', id: d.id, titulo: d.title || 'Documento', texto: aTexto(d.html), fecha: fechaDe(d) });
    }
    return out;
  },
};
