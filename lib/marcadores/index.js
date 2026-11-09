'use strict';
// Marcadores web: tus enlaces con nombre, descripción, color, carpeta y el icono de cada web (se extrae solo).
// Datos: <raíz>/.kcc/marcadores/data.json  { carpetas: [ … ], marcadores: [ … ] }  y los iconos en .kcc/marcadores/iconos/<id>.<ext>
// Piezas: modelo.js (forma y validación), favicon.js (buscar el icono), red.js (descargas con defensa SSRF), resumen.js (logros).
const fsp = require('fs').promises;
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson, HttpError } = store;
const modelo = require('./modelo');
const { buscaIcono } = require('./favicon');
const { ErrorRed } = require('./red');
const { resumenMarcadores } = require('./resumen');

const TIPOS = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', ico: 'image/x-icon' };

function createMarcadores({ express, sharp, userRoot, sendError, registrarActividad, alCambiar, permiteLocal = false }) {
  const router = express.Router();
  const json = express.json({ limit: '128kb' });
  const dir = (user) => kccDir(userRoot(user), 'marcadores');
  const archivo = (user) => path.join(dir(user), 'data.json');
  const icono = (user, id, ext) => path.join(dir(user), 'iconos', `${id}.${ext}`);
  const VACIO = () => ({ carpetas: [], marcadores: [] });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const log = (req, accion, detalle) => { if (registrarActividad) registrarActividad(req, 'marcadores', { accion, ...detalle }); };
  const normaliza = (d) => { d.carpetas = Array.isArray(d.carpetas) ? d.carpetas : []; d.marcadores = Array.isArray(d.marcadores) ? d.marcadores : []; return d; };
  const lee = async (user) => normaliza(await readJson(archivo(user), VACIO));
  const muta = (user, fn) => updateJson(archivo(user), VACIO, (d) => fn(normaliza(d)));
  const marcadorEn = (d, id) => { const m = modelo.RE_ID.test(String(id)) ? d.marcadores.find(x => x.id === id) : null; if (!m) throw new HttpError(404, 'No existe ese marcador'); return m; };
  const carpetaEn = (d, id) => { const c = modelo.RE_ID.test(String(id)) ? d.carpetas.find(x => x.id === id) : null; if (!c) throw new HttpError(404, 'No existe esa carpeta'); return c; };

  router.get('/', async (req, res) => { try { res.json(await lee(req.user)); } catch (e) { sendError(res, e); } });

  /* ---------- Marcadores ---------- */
  router.post('/', json, async (req, res) => {
    try {
      let creado;
      await muta(req.user, (d) => {
        if (d.marcadores.length >= modelo.MAX_MARCADORES) throw new HttpError(400, 'Has llegado al máximo de marcadores');
        creado = store.marcaEdicion(modelo.limpiaMarcador(req.body, null, d.carpetas), req);
        d.marcadores.push(creado);
      });
      log(req, 'crear', { nombre: creado.nombre });
      cambio(req.user);
      res.json({ marcador: creado });
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id', json, async (req, res) => {
    try {
      let guardado, iconoViejo = null;
      await muta(req.user, (d) => {
        const m = marcadorEn(d, req.params.id);
        store.compruebaBase(m, req);
        guardado = store.marcaEdicion(modelo.limpiaMarcador(req.body, m, d.carpetas), req);
        if (m.icono && !guardado.icono) iconoViejo = m.icono;
        d.marcadores[d.marcadores.indexOf(m)] = guardado;
      });
      if (iconoViejo) await fsp.rm(icono(req.user, guardado.id, iconoViejo.ext), { force: true }).catch(() => {});
      cambio(req.user);
      res.json({ marcador: guardado });
    } catch (e) { sendError(res, e); }
  });

  // Se aparta 30 días en .kcc/borrados/marcadores/ (lib/store.js, guardaBorrado); el icono se vuelve a buscar si se recupera
  router.delete('/:id', async (req, res) => {
    try {
      let quitado;
      await muta(req.user, async (d) => {
        const m = marcadorEn(d, req.params.id);
        await store.guardaBorrado(userRoot(req.user), 'marcadores', m.id, m);   // si la copia falla, no se quita nada
        quitado = m; d.marcadores.splice(d.marcadores.indexOf(m), 1);
      });
      if (quitado.icono) await fsp.rm(icono(req.user, quitado.id, quitado.icono.ext), { force: true }).catch(() => {});
      log(req, 'borrar', { nombre: quitado.nombre });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/visita', async (req, res) => {
    try {
      await muta(req.user, (d) => { const m = marcadorEn(d, req.params.id); m.visitas = (m.visitas || 0) + 1; m.ultimaVisita = Date.now(); });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Icono (favicon) ---------- */
  // Busca el icono de la web del marcador. No encontrarlo no es un error: el marcador sigue con su inicial.
  router.post('/:id/icono', async (req, res) => {
    try {
      const m0 = marcadorEn(await lee(req.user), req.params.id);
      let hallado;
      try { hallado = await buscaIcono(sharp, m0.url, { permiteLocal }); }
      catch (e) { throw e instanceof ErrorRed ? new HttpError(422, e.message) : e; }
      if (!hallado) {      // se anota el intento: el cliente no vuelve a probar esta web hasta pasados unos días
        let m1;
        await muta(req.user, (d) => { m1 = marcadorEn(d, req.params.id); m1.iconoIntento = Date.now(); });
        return res.json({ marcador: m1, encontrado: false });
      }
      await store.escribeAtomico(icono(req.user, m0.id, hallado.ext), hallado.datos);
      let guardado, viejo = null;
      await muta(req.user, (d) => {
        const m = marcadorEn(d, req.params.id);
        if (m.icono && m.icono.ext !== hallado.ext) viejo = m.icono;
        m.icono = { ext: hallado.ext, v: Date.now() }; m.iconoIntento = Date.now(); guardado = m;
      });
      if (viejo) await fsp.rm(icono(req.user, m0.id, viejo.ext), { force: true }).catch(() => {});
      res.json({ marcador: guardado, encontrado: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/icono', async (req, res) => {
    try {
      const m = marcadorEn(await lee(req.user), req.params.id);
      if (!m.icono || !TIPOS[m.icono.ext]) return res.status(404).end();
      res.set({ 'Content-Type': TIPOS[m.icono.ext], 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
      res.sendFile(icono(req.user, m.id, m.icono.ext), (e) => { if (e && !res.headersSent) res.status(404).end(); });
    } catch { res.status(404).end(); }
  });

  /* ---------- Carpetas ---------- */
  router.post('/carpetas', json, async (req, res) => {
    try {
      let creada;
      await muta(req.user, (d) => {
        if (d.carpetas.length >= modelo.MAX_CARPETAS) throw new HttpError(400, 'Has llegado al máximo de carpetas');
        creada = modelo.limpiaCarpeta(req.body, null, d.carpetas); d.carpetas.push(creada);
      });
      cambio(req.user);
      res.json({ carpeta: creada });
    } catch (e) { sendError(res, e); }
  });

  router.put('/carpetas/:id', json, async (req, res) => {
    try {
      let guardada;
      await muta(req.user, (d) => { const c = carpetaEn(d, req.params.id); guardada = modelo.limpiaCarpeta(req.body, c, d.carpetas); d.carpetas[d.carpetas.indexOf(c)] = guardada; });
      res.json({ carpeta: guardada });
    } catch (e) { sendError(res, e); }
  });

  // Los marcadores de una carpeta que se borra no se pierden: pasan a «Sin carpeta»
  router.delete('/carpetas/:id', async (req, res) => {
    try {
      let movidos = 0;
      await muta(req.user, async (d) => {
        const c = carpetaEn(d, req.params.id);
        await store.guardaBorrado(userRoot(req.user), 'marcadores', `carpeta-${c.id}`, c);
        d.carpetas.splice(d.carpetas.indexOf(c), 1);
        for (const m of d.marcadores) if (m.carpeta === c.id) { m.carpeta = ''; m.updatedAt = Date.now(); movidos++; }
      });
      cambio(req.user);
      res.json({ ok: true, movidos });
    } catch (e) { sendError(res, e); }
  });

  const core = { resumen: async (user) => resumenMarcadores(await lee(user)) };
  return { router, core };
}

module.exports = createMarcadores;
