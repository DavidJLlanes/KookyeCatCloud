'use strict';
// Búsqueda · lista de la compra. Es compartida entre las cuentas (vive en <datos>/.kcc/shopping/data.json, no en la carpeta de cada usuario).
// Un documento por producto, más dos resúmenes (marcados `resumen`: no cuentan como elementos) («pendientes» y «catálogo») para que preguntas como «qué hay en la lista de la compra» los encuentren.
const path = require('path');
const { leeSeguro, lista } = require('./ayudas');

const TITULO = 'Lista de la compra';
const cantidad = (n, u) => `${Number(n) || 1}${u ? ' ' + u : ''}`;

module.exports = {
  id: 'compra', nombre: TITULO,
  async documentos(ctx) {
    if (!ctx.dataRoot) return [];
    const s = await leeSeguro(path.join(ctx.dataRoot, '.kcc', 'shopping', 'data.json'), () => ({}));
    const productos = lista(s.products).filter(p => p && p.id && p.name);
    const entradas = lista(s.entries);
    const docs = [];
    const pendientes = [];
    for (const p of productos) {
      const pend = entradas.find(e => e && e.productId === p.id && e.status === 'pending');
      const comprado = entradas.filter(e => e && e.productId === p.id && e.status === 'bought').length;
      if (pend) pendientes.push(`${p.name} (${cantidad(pend.quantity, p.unit)})`);
      const estado = pend ? `pendiente de comprar: ${cantidad(pend.quantity, p.unit)}` : comprado ? 'comprado, no está pendiente' : 'en el catálogo, no está pendiente';
      docs.push({
        fuente: 'compra', id: p.id, titulo: p.name,
        texto: [`Producto de la ${TITULO.toLowerCase()}: ${p.name}`, p.category && `Categoría: ${p.category}`, `Cantidad habitual: ${cantidad(p.defaultQuantity, p.unit)}`, `Estado: ${estado}`].filter(Boolean).join('\n'),
        fecha: Number(p.updatedAt || p.createdAt) || 0,
      });
    }
    if (productos.length) {
      const nombres = productos.map(p => p.name).sort((a, b) => a.localeCompare(b, 'es')).join(', ');
      docs.push({ fuente: 'compra', id: 'resumen-pendientes', resumen: true, titulo: `${TITULO}: pendientes de comprar`,
        texto: pendientes.length ? `${TITULO}. Pendientes de comprar (${pendientes.length}): ${pendientes.join(', ')}.` : `${TITULO}. No hay nada pendiente de comprar ahora mismo.`, fecha: Date.now() });
      docs.push({ fuente: 'compra', id: 'resumen-catalogo', resumen: true, titulo: `${TITULO}: todos los productos`,
        texto: `${TITULO}. Productos guardados (${productos.length}): ${nombres}.`.slice(0, 20000), fecha: Date.now() });
    }
    return docs;
  },
};
