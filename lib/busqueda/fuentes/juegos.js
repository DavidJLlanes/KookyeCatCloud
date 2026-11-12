'use strict';
// Búsqueda · lista de juegos del usuario (estado, plataformas, géneros, estudio, saga, reseña…).
const { ruta, desdeLista } = require('./ayudas');
module.exports = { id: 'juegos', nombre: 'Juegos',
  documentos: (ctx, u) => desdeLista(ctx, u, { fuente: 'juegos', archivo: ruta(ctx, u, 'games', 'data.json'), clave: 'items', titulo: (g) => g.title }) };
