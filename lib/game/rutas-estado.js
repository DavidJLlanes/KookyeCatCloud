'use strict';
// Rutas del estado: lectura, aviso de uso (racha y tiempo) y eventos del navegador.
const { updateJson, HttpError, cleanStr } = require('../nucleo/store');
const { nivelDe } = require('./niveles');
const { ESTADO_BASE, difDias, diaCliente } = require('./utilidades');
const { cierra, vista } = require('./motor');

function monta(ctx) {
  const { router, archivo, jsonPeq, recuentos, sendError } = ctx;
  router.get('/', async (req, res) => {
    try {
      const c = await recuentos(req.user);
      const dia = diaCliente(req.query.day);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        cierra(s, c, nuevos, antes, dia || s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

  // La pestaña avisa cada minuto mientras está a la vista: así se mide el tiempo de uso y se mantiene la racha
  router.post('/ping', jsonPeq, async (req, res) => {
    try {
      let seg = Math.max(0, Math.min(90, Math.floor(Number(req.body.seconds) || 0)));
      const dia = diaCliente(req.body.day);
      if (!dia) throw new HttpError(400, 'Fecha no válida');
      const hora = Math.max(0, Math.min(23, Math.floor(Number(req.body.hour) || 0)));
      const dow = Math.max(0, Math.min(6, Math.floor(Number(req.body.dow) || 0)));   // 0 = domingo
      const c = await recuentos(req.user);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        if (s.ultimoDia !== dia) {
          const salto = s.ultimoDia ? difDias(s.ultimoDia, dia) : 0;
          if (!s.ultimoDia) s.racha = 1;
          else if (salto === 1) s.racha += 1;
          else if (salto === 2 && s.escudos > 0) { s.escudos -= 1; s.racha += 1; nuevos.push({ tipo: 'escudo', nombre: 'Un escudo ha salvado tu racha', icono: 'shield' }); }
          else if (salto > 0) s.racha = 1;
          if (s.racha > s.mejorRacha) s.mejorRacha = s.racha;
          if (s.racha > 0 && s.racha % 7 === 0 && s.escudos < 2) s.escudos += 1;
          s.ultimoDia = dia; s.dias += 1;
          if (dow === 6) s.sabado += 1; if (dow === 0) s.domingo += 1;
          const bono = 20 + Math.min(s.racha, 30) * 2;
          s.xp += bono; nuevos.push({ tipo: 'diario', nombre: `Bono diario · racha de ${s.racha}`, icono: 'flame', xp: bono });
        }
        // El tiempo contado no puede superar el que de verdad ha pasado desde el aviso anterior (evita inflarlo con avisos repetidos)
        const ahora = Date.now();
        const permitido = s.ultimoPing ? Math.min(seg, Math.floor((ahora - s.ultimoPing) / 1000) + 5) : Math.min(seg, 60);
        s.ultimoPing = ahora;
        seg = Math.max(0, permitido);
        if (seg) {
          s.segundos += seg; s.diario[dia] = (s.diario[dia] || 0) + seg;
          if (hora < 5) s.noche += seg; else if (hora < 7) s.madrugada += seg;
          // 1 XP por minuto de uso, hasta 120 al día
          s.restoXp += seg;
          const minutos = Math.floor(s.restoXp / 60); s.restoXp -= minutos * 60;
          const dado = s.xpTiempo[dia] || 0;
          const gana = Math.max(0, Math.min(minutos, 120 - dado));
          if (gana) { s.xp += gana; s.xpTiempo[dia] = dado + gana; }
          // Solo se guardan las últimas 60 jornadas
          const claves = Object.keys(s.diario).sort();
          for (const k of claves.slice(0, Math.max(0, claves.length - 60))) { delete s.diario[k]; delete s.xpTiempo[k]; }
        }
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

  // Hechos que solo conoce el navegador (por ahora, compartir una tarjeta)
  router.post('/event', jsonPeq, async (req, res) => {
    try {
      const tipo = cleanStr(req.body.type, 20);
      if (tipo !== 'tarjeta') throw new HttpError(400, 'Evento desconocido');
      const c = await recuentos(req.user);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        s.eventos.tarjeta = (s.eventos.tarjeta || 0) + 1;
        cierra(s, c, nuevos, nivelDe(s.xp), s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

}

module.exports = monta;
