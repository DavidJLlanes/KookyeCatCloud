'use strict';
// Rutas de resultados de partidas: Tetris, 2048 y Breakout, con topes y tiempo mínimo entre partidas.
const { updateJson, HttpError } = require('../store');
const { nivelDe } = require('./niveles');
const { ESTADO_BASE, arc, diaCliente } = require('./utilidades');
const { prepararSemana, cierra, vista } = require('./motor');

function monta(ctx) {
  const { router, archivo, jsonPeq, recuentos, sendError, registrarActividad } = ctx;
  // Resultado de una partida de Tetris
  router.post('/tetris', jsonPeq, async (req, res) => {
    try {
      const b = req.body || {};
      const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
      const dur = num(b.duration, 600), lineas = num(b.lines, 400), puntos = num(b.score, 5000000);
      if (dur < 5) throw new HttpError(400, 'Partida demasiado corta para contar');
      if (lineas > dur * 2 + 4) throw new HttpError(400, 'Resultado no válido');
      if (puntos > 1500 * dur) throw new HttpError(400, 'Resultado no válido');
      const partida = {
        at: Date.now(), score: puntos, lines: lineas, level: num(b.level, 60), tetrises: Math.min(num(b.tetrises, 100), Math.floor(lineas / 4)),
        combo: num(b.maxCombo, 40), poderes: num(b.powerups, 200), dur, fin: b.ended === 'top' ? 'top' : b.ended === 'abandono' ? 'abandono' : 'tiempo',
      };
      const dia = diaCliente(b.day) || new Date().toISOString().slice(0, 10);
      const c = await recuentos(req.user);
      const nuevos = []; let out; let record = false; let ganado;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        const t = s.tetris;
        // Una partida no puede terminar antes de haber durado lo que dice: se exige un tiempo mínimo desde la anterior
        if (t.ultima && Date.now() - t.ultima < dur * 800) throw new HttpError(429, 'Demasiado rápido: espera a que termine la partida anterior');
        t.ultima = Date.now();
        record = puntos > t.mejor;
        t.partidas++; t.total += puntos; t.lineas += lineas; t.tetrises += partida.tetrises; t.tiempo += dur;
        t.combo = Math.max(t.combo, partida.combo); t.poderes += partida.poderes; if (record) t.mejor = puntos;
        t.historial.push({ at: partida.at, score: puntos, lines: lineas, level: partida.level, dur });
        if (t.historial.length > 40) t.historial.splice(0, t.historial.length - 40);
        prepararSemana(s, dia, c);
        s.semana.mejorPartida = Math.max(s.semana.mejorPartida, puntos);
        if (partida.fin === 'tiempo' && puntos >= 1500) s.especiales.fantasma = s.especiales.fantasma || Date.now();
        const xp = Math.min(150, Math.floor(puntos / 200)) + 10;
        const monedas = Math.min(120, Math.floor(puntos / 500) + Math.floor(lineas / 10));
        const extra = Math.round(monedas * (b.bonusMonedas ? 0.5 : 0));
        s.xp += xp; s.monedas += monedas + extra; s.monedasTotal += monedas + extra;
        ganado = { xp, monedas: monedas + extra };
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      if (registrarActividad) registrarActividad(req, 'tetris', { score: puntos });
      res.json({ ...out, nuevos, ganado, record });
    } catch (err) { sendError(res, err); }
  });

  // Resultado de una partida de 2048 o de Breakout (mismas reglas que el Tetris: tiempo mínimo entre partidas y topes por duración)
  const JUEGOS_ARCADE = Object.assign(Object.create(null), {
    g2048: { durMax: 3600 },
    breakout: { durMax: 1800 },
  });
  router.post('/arcade/:juego', jsonPeq, async (req, res) => {
    try {
      const juego = String(req.params.juego);
      const def = Object.hasOwn(JUEGOS_ARCADE, juego) ? JUEGOS_ARCADE[juego] : null;
      if (!def) throw new HttpError(404, 'Juego desconocido');
      const b = req.body || {};
      const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
      const dur = num(b.duration, def.durMax), puntos = num(b.score, 5000000), poderes = num(b.powerups, 200);
      if (dur < 5) throw new HttpError(400, 'Partida demasiado corta para contar');
      if (puntos > 1500 * dur) throw new HttpError(400, 'Resultado no válido');
      let extra = {};
      if (juego === 'g2048') {
        const movs = num(b.moves, 100000), ficha = num(b.maxTile, 131072), fus = num(b.merges, 400000);
        if (movs < 1 || movs > dur * 14 + 5) throw new HttpError(400, 'Resultado no válido');
        if (puntos > 100 * (movs + 4) || fus > movs * 8) throw new HttpError(400, 'Resultado no válido');
        if (ficha < 2 || (ficha & (ficha - 1)) !== 0 || (ficha >= 256 && puntos < ficha / 2)) throw new HttpError(400, 'Resultado no válido');
        extra = { movs, ficha, fus };
      } else {
        const lad = num(b.bricks, 100000), niv = Math.max(1, num(b.level, 99)), perf = num(b.perfect, 99), racha = num(b.perfectRun, 99);
        if (lad > dur * 8 + 10 || niv > Math.floor(lad / 8) + 1 || perf > niv || racha > perf) throw new HttpError(400, 'Resultado no válido');
        extra = { lad, niv, perf, racha };
      }
      const fin = ['fin', 'abandono', 'victoria'].includes(b.ended) ? b.ended : 'fin';
      const dia = diaCliente(b.day) || new Date().toISOString().slice(0, 10);
      const c = await recuentos(req.user);
      const nuevos = []; let out; let record = false; let ganado;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        const t = arc(s)[juego];
        if (t.ultima && Date.now() - t.ultima < dur * 800) throw new HttpError(429, 'Demasiado rápido: espera a que termine la partida anterior');
        t.ultima = Date.now();
        record = puntos > t.mejor;
        t.partidas++; t.total += puntos; t.tiempo += dur; t.poderes += poderes; if (record) t.mejor = puntos;
        if (juego === 'g2048') {
          t.movs += extra.movs; t.fusiones += extra.fus; t.ficha = Math.max(t.ficha, extra.ficha); if (extra.ficha >= 2048) t.ganadas++;
        } else {
          t.ladrillos += extra.lad; t.niveles = Math.max(t.niveles, extra.niv); t.perfectos += extra.perf; t.mejorPerfectos = Math.max(t.mejorPerfectos, extra.racha);
        }
        t.historial.push({ at: Date.now(), score: puntos, dur, fin });
        if (t.historial.length > 40) t.historial.splice(0, t.historial.length - 40);
        prepararSemana(s, dia, c);
        if (juego === 'g2048') s.semana.mejorG = Math.max(s.semana.mejorG || 0, puntos); else s.semana.mejorB = Math.max(s.semana.mejorB || 0, puntos);
        const xp = Math.min(150, Math.floor(puntos / (juego === 'g2048' ? 150 : 200))) + 10;
        const monedas = Math.min(120, Math.floor(puntos / 500) + (juego === 'g2048' ? Math.floor(extra.ficha / 256) : Math.floor(extra.lad / 40)));
        const bonus = nivelDe(s.xp) >= 35 && b.bonusMonedas ? Math.round(monedas * 0.5) : 0;   // pasivo «Lluvia de monedas»
        s.xp += xp; s.monedas += monedas + bonus; s.monedasTotal += monedas + bonus;
        ganado = { xp, monedas: monedas + bonus };
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      if (registrarActividad) registrarActividad(req, juego, { score: puntos });
      res.json({ ...out, nuevos, ganado, record });
    } catch (err) { sendError(res, err); }
  });

}

module.exports = monta;
