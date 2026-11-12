'use strict';
// Búsqueda · favoritos y álbumes de fotos (viven en la carpeta del usuario, fuera de .kcc).
const path = require('path');
const { leeSeguro, lista } = require('./ayudas');
const nombre = (r) => path.basename(String(r));

module.exports = { id: 'colecciones', nombre: 'Colecciones',
  async documentos(ctx, u) {
    const raiz = ctx.userRoot(u), docs = [];
    const favs = lista(await leeSeguro(path.join(raiz, '.favorites.json'), () => [])).filter(r => typeof r === 'string');
    if (favs.length) docs.push({ fuente: 'colecciones', id: 'favoritos', resumen: true, titulo: 'Favoritos', texto: `Archivos favoritos (${favs.length}): ${favs.slice(0, 500).map(r => r).join(', ')}`.slice(0, 20000), fecha: 0 });
    for (const a of lista(await leeSeguro(path.join(raiz, '.albums', 'index.json'), () => []))) {
      if (!a || !a.id) continue;
      const items = lista(a.items).filter(r => typeof r === 'string');
      docs.push({ fuente: 'colecciones', id: a.id, titulo: `Álbum: ${String(a.title || 'Sin título').slice(0, 160)}`,
        texto: `Álbum «${a.title || ''}» con ${items.length} fotos: ${items.slice(0, 500).map(nombre).join(', ')}`.slice(0, 20000), fecha: Number(a.createdAt) || 0 });
    }
    return docs;
  } };
