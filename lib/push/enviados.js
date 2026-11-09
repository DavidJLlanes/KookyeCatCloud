'use strict';
// Registro de avisos ya enviados (para no repetirlos) y su total. Datos: <raíz>/.kcc/push/enviados.json
const { updateJson, readJson } = require('../store');

const VACIO = () => ({ claves: {}, total: 0 });
const CADUCA = 45 * 86400000;

const lee = async (archivo) => { const d = await readJson(archivo, VACIO); d.claves = d.claves || {}; d.total = d.total || 0; return d; };

// Anota las claves enviadas y suma al total; de paso olvida las de hace más de 45 días
async function anota(archivo, claves, ahoraMs = Date.now()) {
  await updateJson(archivo, VACIO, (d) => {
    d.claves = d.claves || {};
    for (const k of Object.keys(d.claves)) if (ahoraMs - d.claves[k] > CADUCA) delete d.claves[k];
    for (const k of claves) d.claves[k] = ahoraMs;
    d.total = (d.total || 0) + claves.length;
  });
}

module.exports = { lee, anota, VACIO };
