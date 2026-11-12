'use strict';
// Motor de la gamificación: métricas, concesión de logros y retos, y la vista que recibe la pestaña. Funciones puras sobre el estado.
const { nivelDe, xpAcumulada, rangoDe, MAX_NIVEL, RANGOS } = require('./niveles');
const { TIERS, XP_TIER, FAMILIAS, ESPECIALES, XP_ESPECIAL } = require('./logros');
const { COSMETICOS } = require('./cosmeticos');
const { RETOS, RECOMPENSA_RETO, BONUS_SEMANA } = require('./retos');
const { arc, semanaIso, rng, hash } = require('./utilidades');

const catalogo = (id) => COSMETICOS.find(c => c.id === id);
const gotDe = (s, id) => s.logros[id] || 0;
function metricas(s, c) {
  const A = arc(s), G2 = A.g2048, BR = A.breakout;
  return {
    archivos: c.archivos || 0, fotos: c.fotos || 0, notas: c.notas || 0, prompts: c.prompts || 0, contactos: c.contactos || 0,
    eventos: c.eventos || 0, etiquetas: c.etiquetas || 0, enlaces: c.enlaces || 0, en_qr: c.en_qr || 0, en_revocados: c.en_revocados || 0, en_caduca: c.en_caduca || 0, val_total: c.val_total || 0, val_unidos: c.val_unidos || 0, val_campos: c.val_campos || 0,
    horas: s.segundos / 3600, minutos: s.segundos / 60, dias: s.dias, racha: s.mejorRacha, nivel: nivelDe(s.xp), retos: s.retos,
    cosmeticos: s.propios.length, tarjetas: s.eventos.tarjeta || 0,
    t_partidas: s.tetris.partidas, t_mejor: s.tetris.mejor, t_lineas: s.tetris.lineas, t_tetrises: s.tetris.tetrises,
    t_combo: s.tetris.combo, t_poder: s.tetris.poderes, monedas: s.monedasTotal,
    g_partidas: G2.partidas, g_mejor: G2.mejor, g_ficha: G2.ficha, g_fusiones: G2.fusiones, g_poder: G2.poderes,
    b_partidas: BR.partidas, b_mejor: BR.mejor, b_ladrillos: BR.ladrillos, b_niveles: BR.niveles, b_perfectos: BR.perfectos, b_poder: BR.poderes,
    a_partidas: s.tetris.partidas + G2.partidas + BR.partidas, a_juegos: (s.tetris.partidas > 0) + (G2.partidas > 0) + (BR.partidas > 0),
    compra_prod: c.compra_prod || 0, compra_hechas: c.compra_hechas || 0, favoritos: c.favoritos || 0, albumes: c.albumes || 0, seg_capas: c.seg_capas || 0, copias_manuales: c.copias_manuales || 0,
    mud_envios: c.mud_envios || 0, clip_envios: c.clip_envios || 0, cod_snips: c.cod_snips || 0, cod_archivos: c.cod_archivos || 0, cod_versiones: c.cod_versiones || 0, cod_zips: c.cod_zips || 0, cod_lineas: c.cod_lineas || 0, cod_langs: c.cod_langs || 0, cod_prev: c.cod_prev || 0, cod_copias: c.cod_copias || 0,
    pg_total: c.pg_total || 0, pg_polizas: c.pg_polizas || 0, pg_meses: c.pg_meses || 0, pg_pagados: c.pg_pagados || 0, pg_companias: c.pg_companias || 0,
    push_avisos: c.push_avisos || 0, rc_total: c.rc_total || 0, rc_hechos: c.rc_hechos || 0, rc_vinculados: c.rc_vinculados || 0, rc_repiten: c.rc_repiten || 0, nb_anidados: c.nb_anidados || 0, nb_vistas: c.nb_vistas || 0, nb_estructura: c.nb_estructura || 0, nb_ciencia: c.nb_ciencia || 0, nb_incrusta: c.nb_incrusta || 0, nb_sync: c.nb_sync || 0, sy_total: c.sy_total || 0, rc_vueltas: c.rc_vueltas || 0, mk_total: c.mk_total || 0, mk_carpetas: c.mk_carpetas || 0, mk_colores: c.mk_colores || 0, mk_visitas: c.mk_visitas || 0,
    db_bases: c.db_bases || 0, db_filas: c.db_filas || 0, db_columnas: c.db_columnas || 0, db_mov: c.db_mov || 0, db_hechas: c.db_hechas || 0, db_calc: c.db_calc || 0, db_plantillas: c.db_plantillas || 0, db_doble: c.db_doble || 0, db_orden: c.db_orden || 0, db_grupos: c.db_grupos || 0, db_totales: c.db_totales || 0, db_usos: c.db_usos || 0, nb_botones: c.nb_botones || 0, nt_plantillas: c.nt_plantillas || 0, db_rel: c.db_rel || 0,
    juegos: c.juegos || 0, j_jugados: c.j_jugados || 0, j_horas: c.j_horas || 0, j_resenas: c.j_resenas || 0, j_deseos: c.j_deseos || 0, j_completos: c.j_completos || 0,
  };
}
const reqOk = (item, s) => (!item.nivel || nivelDe(s.xp) >= item.nivel) && (!item.logro || gotDe(s, item.logro[0]) >= item.logro[1]);
const esPropio = (item, s) => s.propios.includes(item.id) || (item.precio === 0 && reqOk(item, s));

// Concede lo que toque con las métricas actuales. Se repite porque subir de nivel puede abrir logros de nivel.
function evalua(s, c, nuevos, ahora) {
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let cambio = false;
    const m = metricas(s, c);
    for (const [id, , icono, nombre, met, umbrales] of FAMILIAS) {
      for (let i = gotDe(s, id); i < umbrales.length; i++) {
        if (m[met] >= umbrales[i]) {
          s.logros[id] = i + 1; s.cuando[`${id}:${i}`] = ahora; s.xp += XP_TIER[i]; cambio = true;
          nuevos.push({ tipo: 'logro', id, nombre, icono, tramo: TIERS[i], xp: XP_TIER[i] });
        } else break;
      }
    }
    const esp = {
      bienvenida: s.dias >= 1,
      catalogador: (c.val_campos || 0) >= 3,
      todoterreno: ['archivos', 'notas', 'prompts', 'contactos', 'eventos', 'etiquetas'].every(k => (c[k] || 0) > 0),
      noctambulo: s.noche >= 1800, madrugador: s.madrugada >= 1800,
      maraton: Object.values(s.diario).some(x => x >= 3 * 3600),
      finde: s.sabado > 0 && s.domingo > 0,
      fantasma: !!s.especiales.fantasma,
      recreativa: s.tetris.partidas > 0 && arc(s).g2048.partidas > 0 && arc(s).breakout.partidas > 0,
      ficha2048: arc(s).g2048.ficha >= 2048, barrido: arc(s).breakout.mejorPerfectos >= 5,
      maestro: s.tetris.mejor >= 5000 && arc(s).g2048.mejor >= 5000 && arc(s).breakout.mejor >= 5000,
      cod_trio: !!c.cod_web, cod_larga: (c.cod_max || 0) >= 200, cod_viaje: (c.cod_restaura || 0) > 0,
      doble_cerradura: (c.seg_2fa || 0) > 0, caja_fuerte: (c.seg_boveda || 0) > 0, huella: (c.seg_passkeys || 0) > 0, gran_album: (c.album_max || 0) >= 50,
      pg_aldia: (c.pg_aldia || 0) > 0, pg_seguros: (c.pg_seguros || 0) >= 3, mk_ordenado: (c.mk_ordenado || 0) > 0, rc_aldia: (c.rc_aldia || 0) > 0, rc_habito: (c.rc_vmax || 0) >= 30, nb_maestro: (c.nb_tipos || 0) >= 9, perfil_foto: (c.perfil_foto || 0) > 0, push_activo: (c.push_activo || 0) > 0,
      db_completa: (c.db_tipos || 0) >= 7, db_grande: (c.db_maxfilas || 0) >= 100, db_vistas: (c.db_vistatipos || 0) >= 5,
      retro: (c.j_retro || 0) > 0, plataformas: (c.j_plataformas || 0) >= 5, sesion: (c.j_sesion || 0) >= 6,
    };
    for (const [id, icono, nombre, , clave] of ESPECIALES) {
      if (!s.especiales[id] && esp[clave]) {
        s.especiales[id] = ahora; s.xp += XP_ESPECIAL; cambio = true;
        nuevos.push({ tipo: 'logro', id, nombre, icono, tramo: 'Especial', xp: XP_ESPECIAL });
      }
    }
    if (!cambio) break;
  }
}

function prepararSemana(s, dia, c) {
  const clave = semanaIso(dia);
  if (s.semana.clave === clave) return;
  const m = metricas(s, c);
  const nv = nivelDe(s.xp);
  const dif = nv < 10 ? 0 : nv < 30 ? 1 : 2;
  const azar = rng(hash(clave + s.xp.toString().length + (s.semana.clave || '')));
  const elige = (g) => { const l = RETOS.filter(r => r[1] === g); return l[Math.floor(azar() * l.length)]; };
  const picks = [elige('contenido'), elige('uso'), elige('arcade')];
  s.semana = {
    clave, base: Object.fromEntries(Object.keys(m).map(k => [k, m[k]])), mejorPartida: 0, mejorG: 0, mejorB: 0, bonus: false, hechos: [],
    retos: picks.map(r => ({ id: r[0], dif, objetivo: r[5][dif] })),
  };
}
function progresoReto(s, c, r) {
  const def = RETOS.find(x => x[0] === r.id);
  const m = metricas(s, c);
  const actual = def[4] === 't_semana' ? s.semana.mejorPartida : def[4] === 'g_semana' ? (s.semana.mejorG || 0) : def[4] === 'b_semana' ? (s.semana.mejorB || 0) : Math.max(0, m[def[4]] - (s.semana.base[def[4]] || 0));
  return Math.min(r.objetivo, Math.floor(actual));
}
function evaluaRetos(s, c, nuevos) {
  let todos = true;
  for (const r of s.semana.retos) {
    if (s.semana.hechos.includes(r.id)) continue;
    if (progresoReto(s, c, r) >= r.objetivo) {
      const rec = RECOMPENSA_RETO[r.dif];
      s.semana.hechos.push(r.id); s.retos++; s.xp += rec.xp; s.monedas += rec.monedas; s.monedasTotal += rec.monedas;
      const def = RETOS.find(x => x[0] === r.id);
      nuevos.push({ tipo: 'reto', id: r.id, nombre: def[3].replace('{n}', r.objetivo), icono: def[2], xp: rec.xp, monedas: rec.monedas });
    } else todos = false;
  }
  if (todos && s.semana.retos.length && !s.semana.bonus) {
    s.semana.bonus = true; s.xp += BONUS_SEMANA.xp; s.monedas += BONUS_SEMANA.monedas; s.monedasTotal += BONUS_SEMANA.monedas;
    nuevos.push({ tipo: 'semana', nombre: 'Semana completa', icono: 'trophy', xp: BONUS_SEMANA.xp, monedas: BONUS_SEMANA.monedas });
  }
}

// Lo que se hace siempre que se toca el estado: comprobar logros y retos y avisar de subidas de nivel
function cierra(s, c, nuevos, nivelAntes, dia) {
  const ahora = Date.now();
  if (dia) prepararSemana(s, dia, c);
  for (let i = 0; i < 3; i++) { evalua(s, c, nuevos, ahora); evaluaRetos(s, c, nuevos); }
  evalua(s, c, nuevos, ahora);
  const nivelDespues = nivelDe(s.xp);
  if (nivelDespues > nivelAntes) nuevos.push({ tipo: 'nivel', nivel: nivelDespues, rango: rangoDe(nivelDespues).nombre, icono: rangoDe(nivelDespues).icono });
}

function vista(s, c) {
  const m = metricas(s, c);
  const nv = nivelDe(s.xp);
  const desde = xpAcumulada(nv), hasta = nv >= MAX_NIVEL ? desde : xpAcumulada(nv + 1);
  const familias = FAMILIAS.map(([id, grupo, icono, nombre, met, umbrales, texto]) => ({
    id, grupo, icono, nombre, valor: Math.floor(m[met] * (met === 'horas' ? 10 : 1)) / (met === 'horas' ? 10 : 1), umbrales, texto, tramos: gotDe(s, id),
    cuando: umbrales.map((_, i) => s.cuando[`${id}:${i}`] || 0),
  }));
  const especiales = ESPECIALES.map(([id, icono, nombre, texto, , secreto]) => ({ id, icono, nombre, texto: s.especiales[id] || !secreto ? texto : 'Logro secreto', secreto, cuando: s.especiales[id] || 0 }));
  const total = FAMILIAS.reduce((a, f) => a + f[5].length, 0) + ESPECIALES.length;
  const hechos = familias.reduce((a, f) => a + f.tramos, 0) + especiales.filter(e => e.cuando).length;
  return {
    xp: s.xp, nivel: nv, xpNivel: s.xp - desde, xpSiguiente: hasta - desde, maxNivel: nv >= MAX_NIVEL, rango: rangoDe(nv), rangos: RANGOS.map(r => ({ desde: r[0], nombre: r[1], icono: r[2], color: r[3] })),
    monedas: s.monedas, racha: s.racha, mejorRacha: s.mejorRacha, escudos: s.escudos, dias: s.dias, segundos: s.segundos,
    hoy: s.diario[s.ultimoDia] || 0, ultimoDia: s.ultimoDia, diario: s.diario,
    recuentos: Object.fromEntries(['archivos', 'fotos', 'notas', 'prompts', 'contactos', 'eventos', 'etiquetas', 'enlaces', 'juegos', 'bases', 'pagos', 'marcadores', 'sincronizados', 'recordatorios', 'compra_prod', 'favoritos', 'albumes', 'cod_snips', 'val_total', 'copias_manuales', 'mud_envios', 'clip_envios'].map(k => [k, c[k] || 0])),
    logros: { total, hechos, familias, especiales, tramos: TIERS, xpTramo: XP_TIER },
    semana: {
      clave: s.semana.clave, bonus: s.semana.bonus, premioBonus: BONUS_SEMANA,
      retos: s.semana.retos.map(r => {
        const def = RETOS.find(x => x[0] === r.id);
        return { id: r.id, icono: def[2], texto: def[3].replace('{n}', r.objetivo), objetivo: r.objetivo, progreso: progresoReto(s, c, r), hecho: s.semana.hechos.includes(r.id), premio: RECOMPENSA_RETO[r.dif] };
      }),
    },
    cosmeticos: COSMETICOS.map(it => ({ ...it, propio: esPropio(it, s), disponible: reqOk(it, s), puesto: s.equipado[it.tipo] === it.id })),
    equipado: s.equipado,
    tetris: { ...s.tetris, ultima: undefined, historial: s.tetris.historial.slice(-12).reverse() },
    arcade: Object.fromEntries(Object.entries(arc(s)).map(([k, v]) => [k, { ...v, ultima: undefined, historial: v.historial.slice(-12).reverse() }])),
    tarjetas: s.eventos.tarjeta || 0, version: 1,
  };
}

module.exports = { catalogo, metricas, reqOk, esPropio, prepararSemana, cierra, vista };
