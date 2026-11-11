'use strict';
// Compañía y categoría de un pago son valores reutilizables (lib/valores.js): se eligen de una lista y no se duplican
// variantes ("Mapfre" / "MAPFRE").
const { readJson, updateJson } = require('../store');
const { SEMILLA_CATEGORIAS, SEMILLA_BANCOS } = require('./modelo');

const CAMPOS = [['compania', 'Compañía', 120, []], ['categoria', 'Categoría', 80, SEMILLA_CATEGORIAS], ['banco', 'Banco', 120, SEMILLA_BANCOS]];

function registraValores(valores, archivo, vacio) {
  const uso = async (user, prop) => {
    const r = {};
    for (const p of (await readJson(archivo(user), vacio)).pagos || []) if (p[prop]) r[p[prop]] = (r[p[prop]] || 0) + 1;
    return r;
  };
  const renombra = async (user, prop, mapea) => {
    let n = 0;
    await updateJson(archivo(user), vacio, (d) => {
      for (const p of d.pagos) { const nv = p[prop] ? mapea(p[prop]) : undefined; if (nv !== undefined) { p[prop] = nv; p.updatedAt = Date.now(); n++; } }
    });
    return n;
  };
  for (const [prop, etiqueta, max, semilla] of CAMPOS) {
    valores.registra({ campo: 'pagos.' + prop, modulo: 'pagos', prop, etiqueta, max, semilla, uso: (u) => uso(u, prop), renombra: (u, m) => renombra(u, prop, m) });
  }
}

module.exports = { registraValores };
