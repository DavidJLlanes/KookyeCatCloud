'use strict';
// Búsqueda · gamificación del usuario: nivel, racha y logros especiales conseguidos (un resumen, no un documento por logro).
const path = require('path');
const { leeSeguro } = require('./ayudas');
const { nivelDe, rangoDe } = require('../../game/niveles');
const { ESPECIALES } = require('../../game/logros');

module.exports = { id: 'logros', nombre: 'Logros y nivel',
  async documentos(ctx, u) {
    const s = await leeSeguro(path.join(ctx.userRoot(u), '.kcc', 'game.json'), () => null);
    if (!s || typeof s.xp !== 'number') return [];
    const nv = nivelDe(s.xp);
    const hechos = ESPECIALES.filter(e => s.especiales && s.especiales[e[0]]).map(e => `${e[2]} (${e[3]})`);
    return [{ fuente: 'logros', id: 'resumen', resumen: true, titulo: 'Mis logros y nivel',
      texto: [`Nivel ${nv}, rango ${rangoDe(nv).nombre}, ${s.xp} puntos de experiencia, ${s.monedas || 0} monedas.`,
        `Racha de días: ${s.racha || 0} (mejor racha ${s.mejorRacha || 0}).`,
        hechos.length ? `Logros especiales conseguidos (${hechos.length}): ${hechos.join('; ')}.` : 'Aún no hay logros especiales conseguidos.'].join('\n'), fecha: Number(s.ultimoDia) || 0 }];
  } };
