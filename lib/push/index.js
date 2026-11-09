'use strict';
// Avisos push: llegan al móvil u ordenador aunque la app esté cerrada. Cada usuario elige qué secciones avisan, a qué hora,
// con cuánta antelación y cuándo no molestar.
// Datos: <raíz>/.kcc/push/{ajustes,suscripciones,enviados}.json  ·  claves VAPID del servidor: <app>/vapid.json
// Piezas: ajustes.js (preferencias), dispositivos.js (suscripciones), envio.js (Web Push), programa.js (cada minuto),
//         fuentes/ (qué avisa cada sección), enviados.js (registro anti-repetición), tiempo.js (hora local).
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson, HttpError } = store;
const { cargaClaves } = require('./claves');
const ajustesMod = require('./ajustes');
const disp = require('./dispositivos');
const enviados = require('./enviados');
const { creaEnvio, registroPruebas, PRUEBAS } = require('./envio');
const { creaProgramador } = require('./programa');
const FUENTES = [require('./fuentes/pagos'), require('./fuentes/calendario'), require('./fuentes/contactos')];

function createPush({ express, userRoot, usuarios, sendError, registrarActividad, alCambiar, claveFile, fuentes }) {
  const router = express.Router();
  const json = express.json({ limit: '16kb' });
  const claves = cargaClaves(claveFile);
  const contacto = process.env.PUSH_CONTACT || 'mailto:no-reply@kookyecat.dev';
  const archivoDe = (user, nombre) => path.join(kccDir(userRoot(user), 'push'), `${nombre}.json`);
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const envio = creaEnvio({ claves, contacto, archivoDe });
  const programa = creaProgramador({ usuarios, archivoDe, envio, fuentes: FUENTES, cores: fuentes, registra: (user) => cambio(user) });

  const leeAjustes = async (user) => ajustesMod.limpia({}, await readJson(archivoDe(user, 'ajustes'), ajustesMod.POR_DEFECTO));
  const leeDisp = async (user) => disp.norm(await readJson(archivoDe(user, 'suscripciones'), disp.VACIO)).dispositivos;
  const publico = (d) => ({ id: d.id, nombre: d.nombre, creada: d.creada });

  router.get('/config', async (req, res) => {
    try { res.json({ clavePublica: claves.publicKey, ajustes: await leeAjustes(req.user), dispositivos: (await leeDisp(req.user)).map(publico), pruebas: PRUEBAS }); } catch (e) { sendError(res, e); }
  });

  router.put('/ajustes', json, async (req, res) => {
    try {
      let guardado;
      await updateJson(archivoDe(req.user, 'ajustes'), ajustesMod.POR_DEFECTO, (d) => { guardado = ajustesMod.limpia(req.body, ajustesMod.limpia({}, d)); Object.keys(d).forEach(k => delete d[k]); Object.assign(d, guardado); });
      cambio(req.user);
      res.json({ ajustes: guardado });
    } catch (e) { sendError(res, e); }
  });

  // Este dispositivo se suscribe (o renueva su suscripción). El primero también enciende los avisos.
  router.post('/dispositivos', json, async (req, res) => {
    try {
      const nuevo = disp.limpia(req.body && req.body.suscripcion, req.get('user-agent'), PRUEBAS);
      await updateJson(archivoDe(req.user, 'suscripciones'), disp.VACIO, (d) => {
        disp.norm(d);
        const i = d.dispositivos.findIndex(x => x.id === nuevo.id);
        if (i >= 0) d.dispositivos[i] = { ...nuevo, creada: d.dispositivos[i].creada };
        else { if (d.dispositivos.length >= disp.MAX_DISPOSITIVOS) throw new HttpError(400, 'Has llegado al máximo de dispositivos: quita alguno'); d.dispositivos.push(nuevo); }
      });
      // Un navegador pertenece a una sola cuenta: si antes estaba en otra (p. ej. se cambió de usuario en el mismo móvil),
      // se quita de ella para que los avisos de esa otra persona no lleguen aquí
      for (const otro of usuarios()) {
        if (otro.username === req.user.username) continue;
        await updateJson(archivoDe(otro, 'suscripciones'), disp.VACIO, (d) => { disp.norm(d); const n = d.dispositivos.length; d.dispositivos = d.dispositivos.filter(x => x.id !== nuevo.id); if (d.dispositivos.length === n) return { __abort: true }; }).catch(() => {});
      }
      const ajustes = await updateJson(archivoDe(req.user, 'ajustes'), ajustesMod.POR_DEFECTO, (d) => { const a = ajustesMod.limpia({ on: true }, ajustesMod.limpia({}, d)); Object.keys(d).forEach(k => delete d[k]); Object.assign(d, a); return d; });
      if (registrarActividad) registrarActividad(req, 'push', { accion: 'activar', dispositivo: nuevo.nombre });
      cambio(req.user);
      res.json({ id: nuevo.id, dispositivos: (await leeDisp(req.user)).map(publico), ajustes: ajustes || await leeAjustes(req.user) });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/dispositivos/:id', async (req, res) => {
    try {
      if (!/^[a-f0-9]{16}$/.test(req.params.id)) throw new HttpError(404, 'No existe ese dispositivo');
      let quitado = false;
      await updateJson(archivoDe(req.user, 'suscripciones'), disp.VACIO, (d) => { disp.norm(d); const n = d.dispositivos.length; d.dispositivos = d.dispositivos.filter(x => x.id !== req.params.id); quitado = d.dispositivos.length < n; });
      if (!quitado) throw new HttpError(404, 'No existe ese dispositivo');
      cambio(req.user);
      res.json({ ok: true, dispositivos: (await leeDisp(req.user)).map(publico) });
    } catch (e) { sendError(res, e); }
  });

  const ultimaPrueba = new Map();
  router.post('/prueba', async (req, res) => {
    try {
      if (!(await leeDisp(req.user)).length) throw new HttpError(400, 'Primero activa los avisos en este dispositivo');
      if (Date.now() - (ultimaPrueba.get(req.user.username) || 0) < 10000) throw new HttpError(429, 'Espera unos segundos antes de enviar otra prueba');
      ultimaPrueba.set(req.user.username, Date.now());
      const r = await envio.envia(req.user, { titulo: 'KookyeCatCloud', cuerpo: 'Los avisos funcionan correctamente.', vista: 'cuenta', etiqueta: 'kcc-prueba' });
      if (!r.ok) throw new HttpError(502, 'El servicio de avisos de tu navegador no ha aceptado el envío. Prueba a desactivar y volver a activar los avisos.');
      res.json({ ok: r.ok });
    } catch (e) { sendError(res, e); }
  });

  // Solo con KCC_PUSH_PRUEBAS=1 (pruebas automáticas): ejecuta un ciclo del programador a una hora dada y enseña lo «enviado»
  if (PRUEBAS) {
    router.post('/_ciclo', json, async (req, res) => { try { await programa.tick(new Date(String((req.body || {}).fecha))); res.json({ avisos: registroPruebas.filter(r => r.usuario === req.user.username).map(r => r.payload) }); } catch (e) { sendError(res, e); } });
  }

  const core = {
    resumen: async (user) => {
      const [d, a, e] = await Promise.all([leeDisp(user), leeAjustes(user), enviados.lee(archivoDe(user, 'enviados'))]);
      return { push_dispositivos: d.length, push_activo: a.on && d.length ? 1 : 0, push_avisos: e.total };
    },
  };
  return { router, core, arranca: programa.arranca, tick: programa.tick };
}

module.exports = createPush;
