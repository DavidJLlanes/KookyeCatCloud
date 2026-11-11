'use strict';
// proyectos: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const store = require('../store');
const { writeJson, updateJson, newId, HttpError, cleanStr } = store;
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { MAX_ARCHIVOS, MAX_BYTES, MAX_PROYECTOS, MAX_VERSIONES, PLANTILLAS, limpiaEtiquetas, recuenta } = require('./constantes');

function monta(ctx) {
  const { cambio, detalle, dirP, etq, ficha, fichero, json, leer, lista, mutar, ponArchivo, raiz, registrarActividad, router, sendError, statsFile, userRoot } = ctx;

  /* ---------- Proyectos ---------- */
  router.get('/', async (req, res) => {
    try { res.json({ items: (await lista(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(ficha), limites: { archivos: MAX_ARCHIVOS, bytes: MAX_BYTES, versiones: MAX_VERSIONES } }); } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      if ((await lista(req.user)).length >= MAX_PROYECTOS) throw new HttpError(400, 'Has llegado al máximo de proyectos');
      const b = req.body || {}; const nombre = cleanStr(b.nombre, 120).trim() || 'Proyecto nuevo';
      const p = { id: newId(), nombre, descripcion: cleanStr(b.descripcion, 300).trim(), etiquetas: await etq(req.user, b.etiquetas), favorito: false, createdAt: Date.now(), updatedAt: Date.now(), archivos: {}, carpetas: [], versiones: [], siguienteV: 1, objetos: {} };
      const plan = (PLANTILLAS[b.plantilla] || PLANTILLAS.vacio)(nombre);
      await fsp.mkdir(path.join(dirP(req.user, p.id), 'objetos'), { recursive: true });
      for (const [r, c] of Object.entries(plan)) await ponArchivo(req.user, p, r, Buffer.from(c, 'utf8'));
      recuenta(p);
      await writeJson(fichero(req.user, p.id), p);
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'crear', nombre });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.post('/accion', json, async (req, res) => {
    try {
      const tipo = req.body && req.body.tipo; const clave = tipo === 'preview' ? 'previews' : tipo === 'copia' ? 'copias' : null;
      if (!clave) throw new HttpError(400, 'Acción no válida');
      await fsp.mkdir(raiz(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (x) => { x[clave] = (x[clave] || 0) + 1; });
      cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json(detalle(await leer(req.user, req.params.id))); } catch (e) { sendError(res, e); } });

  router.put('/:id', json, async (req, res) => {
    try {
      const b = req.body || {};
      if (b.etiquetas !== undefined) b.etiquetas = await etq(req.user, b.etiquetas);
      const p = await mutar(req.user, req.params.id, (x) => {
        if (b.nombre !== undefined) x.nombre = cleanStr(b.nombre, 120).trim() || x.nombre;
        if (b.descripcion !== undefined) x.descripcion = cleanStr(b.descripcion, 300).trim();
        if (b.etiquetas !== undefined) x.etiquetas = limpiaEtiquetas(b.etiquetas);
        if (b.favorito !== undefined) x.favorito = !!b.favorito;
      });
      cambio(req.user); res.json(detalle(p));
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const p = await leer(req.user, req.params.id);
      await store.guardaBorrado(userRoot(req.user), 'codigo', p.id, { mover: dirP(req.user, p.id) });   // 30 días en .kcc/borrados/codigo/
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'borrar', nombre: p.nombre });
      cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });


  return {  };
}

module.exports = monta;
