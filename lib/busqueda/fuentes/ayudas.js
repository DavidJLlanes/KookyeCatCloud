'use strict';
// Búsqueda · piezas comunes de los lectores de cada módulo.
const fsp = require('fs').promises;
const path = require('path');
const { readJson } = require('../../nucleo/store');
const { aplana } = require('../texto');

// Ruta dentro de <raíz>/.kcc/ SIN crearla: buscar nunca debe crear carpetas ni archivos en los datos del usuario
const ruta = (ctx, user, ...sub) => path.join(ctx.userRoot(user), '.kcc', ...sub);
const lista = (v) => (Array.isArray(v) ? v : []);
const fechaDe = (o) => Number((o && (o.updatedAt || o.createdAt)) || 0) || 0;

// Lee un JSON; si está dañado o no se puede leer, esa fuente se omite (la búsqueda nunca debe romper ni «arreglar» datos)
async function leeSeguro(file, vacio) {
  try { return await readJson(file, vacio); } catch { return typeof vacio === 'function' ? vacio() : vacio; }
}

// Lista de elementos de un JSON de módulo → documentos. `titulo(x)` y `campos` (los demás textos) son opcionales.
async function desdeLista(ctx, user, { fuente, archivo, clave, titulo, ref }) {
  const d = await leeSeguro(archivo, () => ({}));
  const arr = clave ? lista(d[clave]) : lista(d);
  return arr.filter(x => x && x.id && !x.deletedAt).map(x => ({
    fuente, id: ref ? ref(x) : x.id, titulo: String(titulo(x) || '').slice(0, 200), texto: aplana(x), fecha: fechaDe(x),
  }));
}

module.exports = { fsp, path, ruta, lista, fechaDe, leeSeguro, desdeLista, aplana };
