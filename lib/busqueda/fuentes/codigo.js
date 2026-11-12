'use strict';
// Búsqueda · proyectos de Código: nombre, descripción, etiquetas y rutas de archivo (el contenido va aparte, por su hash).
const { fsp, path, ruta, leeSeguro, fechaDe } = require('./ayudas');

module.exports = {
  id: 'codigo', nombre: 'Código',
  async documentos(ctx, user) {
    const raiz = ruta(ctx, user, 'codigo');
    const ids = (await fsp.readdir(raiz).catch(() => [])).filter(n => /^[a-f0-9]{16}$/.test(n));
    const out = [];
    for (const id of ids) {
      const p = await leeSeguro(path.join(raiz, id, 'proyecto.json'), null);
      if (!p || !p.id) continue;
      const rutas = Array.isArray(p.archivos) ? p.archivos.map(a => a && (a.ruta || a.path || a.nombre)).filter(Boolean).join('\n') : '';
      out.push({ fuente: 'codigo', id: p.id, titulo: p.nombre || 'Proyecto', texto: [p.descripcion, (p.etiquetas || []).join(' '), rutas].filter(Boolean).join('\n'), fecha: fechaDe(p) });
    }
    return out;
  },
};
