'use strict';
// Programador: cada minuto mira, usuario por usuario, qué avisos tocan y los envía. Solo trabaja con usuarios que tienen
// los avisos activados y algún dispositivo; para el resto no hace nada (un archivo pequeño leído por usuario y minuto).
const { readJson } = require('../store');
const { ahora: ahoraDe, enSilencio } = require('./tiempo');
const { POR_DEFECTO, limpia } = require('./ajustes');
const { VACIO, norm } = require('./dispositivos');
const enviados = require('./enviados');

const MAX_LINEAS = 4;
const REINTENTO_MS = 10 * 60000;

function creaProgramador({ usuarios, archivoDe, envio, fuentes, cores, registra }) {
  const proximoIntento = new Map();
  let corriendo = false;      // un ciclo lento no debe solaparse con el siguiente (se enviaría dos veces lo mismo)

  async function aviso(user, f, ajustes, ahora) {
    const clave = `${user.username}:${f.id}`;
    if ((proximoIntento.get(clave) || 0) > Date.now()) return;
    const archivoEnv = archivoDe(user, 'enviados');
    const ya = (await enviados.lee(archivoEnv)).claves;
    const nuevos = (await f.pendientes({ user, cfg: ajustes[f.id], ajustes, ahora, core: cores[f.id] })).filter(p => !ya[p.clave]);
    if (!nuevos.length) return;
    const lineas = nuevos.slice(0, MAX_LINEAS).map(p => p.texto);
    if (nuevos.length > MAX_LINEAS) lineas.push(`y ${nuevos.length - MAX_LINEAS} más`);
    const r = await envio.envia(user, {
      titulo: f.titulo, cuerpo: ajustes.detalles ? lineas.join('\n') : f.generico(nuevos.length),
      vista: f.vista, etiqueta: `kcc-${f.id}`,
      // Con un solo aviso, el propio aviso lleva los botones «Hecho» y «Posponer» (los entiende public/sw.js)
      ...(nuevos.length === 1 && nuevos[0].accion ? { accion: nuevos[0].accion } : {}),
    });
    if (r.ok > 0) { await enviados.anota(archivoEnv, nuevos.map(p => p.clave)); registra && registra(user, f.id, nuevos.length); }
    else if (r.fallos > 0) proximoIntento.set(clave, Date.now() + REINTENTO_MS);   // fallo pasajero: se reintenta en un rato
  }

  // `fecha` solo se usa en las pruebas
  async function tick(fecha = new Date()) {
    if (corriendo) return;
    corriendo = true;
    try { await ciclo(fecha); } finally { corriendo = false; }
  }
  async function ciclo(fecha) {
    const ahora = ahoraDe(fecha);
    for (const user of usuarios()) {
      try {
        const ajustes = limpia({}, await readJson(archivoDe(user, 'ajustes'), POR_DEFECTO));
        if (!ajustes.on || enSilencio(ajustes.silencio, ahora.hm)) continue;
        if (!norm(await readJson(archivoDe(user, 'suscripciones'), VACIO)).dispositivos.length) continue;
        for (const f of fuentes) if (ajustes[f.id] && ajustes[f.id].on) await aviso(user, f, ajustes, ahora).catch((e) => console.error(`[push] ${user.username}/${f.id}:`, e.message));
      } catch (e) { console.error(`[push] ${user.username}:`, e.message); }
    }
  }

  let timer = null;
  const arranca = () => { if (!timer) { timer = setInterval(() => { tick().catch(() => {}); }, 60000); timer.unref(); } };
  return { tick, arranca };
}

module.exports = { creaProgramador };
