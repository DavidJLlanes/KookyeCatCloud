'use strict';
// Bloques sincronizados de las notas: un mismo texto que aparece en varias notas y, al cambiarlo en una, cambia en todas.
// En la nota solo queda la referencia («::sync <id>»); el texto vive aquí.
// Datos: <raíz>/.kcc/sincronizados/data.json  { bloques: [ { id, texto, ediciones, createdAt, updatedAt, editBy } ] }
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson, HttpError } = store;
const modelo = require('./modelo');
const { resumenSincronizados } = require('./resumen');

function createSincronizados({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const json = express.json({ limit: '64kb' });
  const archivo = (user) => path.join(kccDir(userRoot(user), 'sincronizados'), 'data.json');
  const VACIO = () => ({ bloques: [] });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const log = (req, accion) => { if (registrarActividad) registrarActividad(req, 'sincronizados', { accion }); };
  const normaliza = (d) => { d.bloques = Array.isArray(d.bloques) ? d.bloques : []; return d; };
  const lee = async (user) => normaliza(await readJson(archivo(user), VACIO));
  const muta = (user, fn) => updateJson(archivo(user), VACIO, (d) => fn(normaliza(d)));
  const en = (d, id) => { const b = modelo.RE_ID.test(String(id)) ? d.bloques.find(x => x.id === id) : null; if (!b) throw new HttpError(404, 'No existe ese bloque sincronizado'); return b; };

  router.get('/', async (req, res) => { try { res.json({ bloques: (await lee(req.user)).bloques }); } catch (e) { sendError(res, e); } });
  router.get('/:id', async (req, res) => { try { res.json({ bloque: en(await lee(req.user), req.params.id) }); } catch (e) { sendError(res, e); } });

  router.post('/', json, async (req, res) => {
    try {
      let creado;
      await muta(req.user, (d) => {
        if (d.bloques.length >= modelo.MAX_BLOQUES) throw new HttpError(400, 'Has llegado al máximo de bloques sincronizados');
        creado = store.marcaEdicion(modelo.limpia(req.body, null), req); d.bloques.push(creado);
      });
      log(req, 'crear'); cambio(req.user);
      res.json({ bloque: creado });
    } catch (e) { sendError(res, e); }
  });

  // «base»: la fecha del texto que abrió esta pestaña; si otro dispositivo lo cambió después, se responde 409 en vez de pisarlo
  router.put('/:id', json, async (req, res) => {
    try {
      let guardado;
      await muta(req.user, (d) => {
        const b = en(d, req.params.id); store.compruebaBase(b, req);
        guardado = store.marcaEdicion(modelo.limpia(req.body, b), req); d.bloques[d.bloques.indexOf(b)] = guardado;
      });
      cambio(req.user);
      res.json({ bloque: guardado });
    } catch (e) { sendError(res, e); }
  });

  // Se aparta 30 días en .kcc/borrados/sincronizados/. Las notas que lo usaban muestran «bloque no disponible»
  router.delete('/:id', async (req, res) => {
    try {
      await muta(req.user, async (d) => {
        const b = en(d, req.params.id);
        await store.guardaBorrado(userRoot(req.user), 'sincronizados', b.id, b);
        d.bloques.splice(d.bloques.indexOf(b), 1);
      });
      log(req, 'borrar'); cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  return { router, core: { resumen: async (user) => resumenSincronizados(await lee(user)) } };
}

module.exports = createSincronizados;
