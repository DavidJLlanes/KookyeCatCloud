'use strict';
// contenido: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const { newId, HttpError } = require('../nucleo/store');
const fs = require('fs');
const fsp = fs.promises;
const { MAX_ITEMS } = require('./constantes');

function monta(ctx) {
  const { auth, binFile, descendientes, errorVault, exigeAbierta, express, leeIndice, mutaIndice, nombreLibre, nombreOk, padreValido, router, thumbFile } = ctx;

  /* ---------- Contenido ---------- */
  router.get('/vault/items', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const idx = await leeIndice(req.user, dek);
      res.json({ items: idx.items });
    } catch (err) { errorVault(res, err); }
  });

  router.post('/vault/folders', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const item = await mutaIndice(req.user, dek, (idx) => {
        if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
        const parent = String(req.body.parent || '');
        if (!padreValido(idx, parent)) throw new HttpError(400, 'Carpeta no válida');
        const it = { id: newId(), type: 'folder', name: nombreLibre(idx, parent, nombreOk(req.body.name)), parent, createdAt: Date.now(), modifiedAt: Date.now() };
        idx.items.push(it);
        return it;
      });
      res.json({ ok: true, item });
    } catch (err) { errorVault(res, err); }
  });

  router.put('/vault/items/:id', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const item = await mutaIndice(req.user, dek, (idx) => {
        const it = idx.items.find(i => i.id === req.params.id);
        if (!it) throw new HttpError(404, 'No encontrado');
        if (req.body.parent !== undefined) {
          const p = String(req.body.parent || '');
          if (!padreValido(idx, p)) throw new HttpError(400, 'Carpeta no válida');
          if (p === it.id || descendientes(idx, it.id).some(d => d.id === p)) throw new HttpError(400, 'No puedes mover una carpeta dentro de sí misma');
          it.parent = p;
        }
        if (req.body.name !== undefined) it.name = nombreOk(req.body.name);
        const otros = idx.items.filter(o => o.id !== it.id && o.parent === it.parent && o.name.toLowerCase() === it.name.toLowerCase());
        if (otros.length) it.name = nombreLibre({ items: idx.items.filter(o => o.id !== it.id) }, it.parent, it.name);
        it.modifiedAt = Date.now();
        return it;
      });
      res.json({ ok: true, item });
    } catch (err) { errorVault(res, err); }
  });

  async function quitaDatos(user, ids) {
    for (const id of ids) { await fsp.rm(binFile(user, id), { force: true }); await fsp.rm(thumbFile(user, id), { force: true }); }
  }
  router.delete('/vault/items/:id', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const quitados = await mutaIndice(req.user, dek, (idx) => {
        const it = idx.items.find(i => i.id === req.params.id);
        if (!it) return [];
        const ids = new Set([it.id, ...descendientes(idx, it.id).map(d => d.id)]);
        const sueltos = idx.items.filter(i => ids.has(i.id));
        idx.items = idx.items.filter(i => !ids.has(i.id));
        return sueltos.filter(i => i.type === 'file').map(i => i.id);
      });
      await quitaDatos(req.user, quitados);
      res.json({ ok: true, removed: quitados.length });
    } catch (err) { errorVault(res, err); }
  });


  return { quitaDatos };
}

module.exports = monta;
