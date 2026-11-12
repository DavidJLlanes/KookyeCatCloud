'use strict';
// Búsqueda · papelera de archivos (nombre y carpeta de origen de lo borrado, que aún se puede recuperar).
const path = require('path');
const { leeSeguro, lista } = require('./ayudas');

module.exports = { id: 'papelera', nombre: 'Papelera',
  async documentos(ctx, u) {
    const entradas = lista(await leeSeguro(path.join(ctx.userRoot(u), '.trash', 'index.json'), () => []));
    return entradas.filter(e => e && e.id && e.name).map(e => ({ fuente: 'papelera', id: e.id, titulo: String(e.name).slice(0, 200),
      texto: `En la papelera: ${e.isDir ? 'carpeta' : 'archivo'} ${e.name}${e.from ? ` (estaba en ${e.from})` : ''}`, fecha: Number(e.deletedAt) || 0 }));
  } };
