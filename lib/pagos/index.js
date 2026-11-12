'use strict';
// Pagos y recordatorios: en qué compañía tienes cada pago, cuánto, cada cuánto y cuándo toca.
// Datos: <raíz>/.kcc/pagos/data.json  { pagos: [ … ] }  (un solo JSON pequeño: decenas de pagos, no miles).
// Piezas: modelo.js (forma y validación), fechas.js (fechas), valores.js (compañía y categoría), resumen.js (logros).
const path = require('path');
const store = require('../nucleo/store');
const { kccDir, readJson, updateJson, HttpError } = store;
const modelo = require('./modelo');
const { hoy } = require('./fechas');
const { registraValores } = require('./valores');
const { resumenPagos } = require('./resumen');
const { montaAdjuntos, apartaAdjuntos } = require('./adjuntos');

const RE_ID = /^[a-f0-9]{16}$/;

function createPagos({ express, userRoot, sendError, registrarActividad, alCambiar, calendar, valores }) {
  const router = express.Router();
  const json = express.json({ limit: '256kb' });
  const archivo = (user) => path.join(kccDir(userRoot(user), 'pagos'), 'data.json');
  const VACIO = () => ({ pagos: [] });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const log = (req, accion, detalle) => { if (registrarActividad) registrarActividad(req, 'pagos', { accion, ...detalle }); };
  registraValores(valores, archivo, VACIO);

  const lee = async (user) => { const d = await readJson(archivo(user), VACIO); d.pagos = Array.isArray(d.pagos) ? d.pagos : []; return d; };
  const muta = (user, fn) => updateJson(archivo(user), VACIO, (d) => { d.pagos = Array.isArray(d.pagos) ? d.pagos : []; return fn(d); });
  const buscaEn = (d, id) => { const p = RE_ID.test(String(id)) ? d.pagos.find(x => x.id === id) : null; if (!p) throw new HttpError(404, 'No existe ese pago'); return p; };

  // El próximo vencimiento vive también en el calendario «Pagos» (un evento por pago que se mueve al pagar)
  async function sincroniza(user, p) {
    if (!calendar) return;
    const cal = p.recordar && p.activo !== false && p.fechaProxima ? { date: p.fechaProxima } : null;
    const titulo = `Pago: ${p.nombre}${p.importe !== null && p.importe !== undefined ? ` (${String(p.importe).replace('.', ',')} €)` : ''}`;
    await calendar.sincronizaOrigen(user, 'pago', p.id, titulo, cal).catch(() => {});
  }

  router.get('/', async (req, res) => {
    try { res.json({ pagos: (await lee(req.user)).pagos, hoy: hoy(), categorias: modelo.SEMILLA_CATEGORIAS }); } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      const cuerpo = { ...(req.body || {}) };
      await valores.aplica(req.user, 'pagos', cuerpo);
      let creado;
      await muta(req.user, (d) => {
        if (d.pagos.length >= modelo.MAX_PAGOS) throw new HttpError(400, 'Has llegado al máximo de pagos');
        creado = store.marcaEdicion(modelo.limpia(cuerpo, null), req);
        d.pagos.push(creado);
      });
      await sincroniza(req.user, creado);
      log(req, 'crear', { nombre: creado.nombre });
      cambio(req.user);
      res.json({ pago: creado });
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id', json, async (req, res) => {
    try {
      const cuerpo = { ...(req.body || {}) };
      await valores.aplica(req.user, 'pagos', cuerpo);
      let guardado;
      await muta(req.user, (d) => {
        const p = buscaEn(d, req.params.id);
        store.compruebaBase(p, req);
        guardado = store.marcaEdicion(modelo.limpia(cuerpo, p), req);
        d.pagos[d.pagos.indexOf(p)] = guardado;
      });
      await sincroniza(req.user, guardado);
      cambio(req.user);
      res.json({ pago: guardado });
    } catch (e) { sendError(res, e); }
  });

  montaAdjuntos(router, { express, userRoot, muta, lee, buscaEn, cambio, sendError, log });

  // Marcar como pagado: anota el pago y pasa la fecha al siguiente periodo
  router.post('/:id/pagado', json, async (req, res) => {
    try {
      let guardado;
      await muta(req.user, (d) => {
        const p = buscaEn(d, req.params.id);
        guardado = store.marcaEdicion(modelo.registraPago(p, req.body || {}, hoy()), req);
      });
      await sincroniza(req.user, guardado);
      log(req, 'pagado', { nombre: guardado.nombre });
      cambio(req.user);
      res.json({ pago: guardado });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/deshacer', json, async (req, res) => {
    try {
      let guardado;
      await muta(req.user, (d) => { guardado = store.marcaEdicion(modelo.deshacePago(buscaEn(d, req.params.id)), req); });
      await sincroniza(req.user, guardado);
      cambio(req.user);
      res.json({ pago: guardado });
    } catch (e) { sendError(res, e); }
  });

  // Se aparta 30 días en .kcc/borrados/pagos/ en vez de borrarse en el acto (lib/store.js, guardaBorrado)
  router.delete('/:id', async (req, res) => {
    try {
      let quitado;
      await muta(req.user, async (d) => {
        const p = buscaEn(d, req.params.id);
        await store.guardaBorrado(userRoot(req.user), 'pagos', p.id, p);   // si la copia falla, no se quita nada
        quitado = p; d.pagos.splice(d.pagos.indexOf(p), 1);
      });
      await apartaAdjuntos(userRoot, req.user, quitado.id).catch(() => {});
      if (calendar) await calendar.quitaOrigen(req.user, 'pago', quitado.id).catch(() => {});
      log(req, 'borrar', { nombre: quitado.nombre });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  const core = {
    resumen: async (user) => resumenPagos((await lee(user)).pagos),
    // Para los avisos push: pagos activos con recordatorio y su próxima fecha
    vencimientos: async (user) => (await lee(user)).pagos
      .filter(p => p.activo !== false && p.recordar !== false && p.fechaProxima)
      .map(p => ({ id: p.id, nombre: p.nombre, importe: p.importe, fecha: p.fechaProxima, avisoDias: p.avisoDias })),
  };
  return { router, core };
}

module.exports = createPagos;
