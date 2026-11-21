'use strict';
const createAlmacen = require('./almacen');
module.exports = function createCreativos({ express, auth, userRoot, alCambiar }) {
  const router = express.Router();
  const core = createAlmacen(userRoot);
  const body = express.json({ limit: '3mb' });
  const fallo = (res, err) => res.status(err.status || 400).json({ error: err.message || 'Error' });
  router.get('/creativos/:tipo', auth, async (req,res) => {
    try { res.json({ items: await core.lista(req.user,req.params.tipo) }); } catch(e) { fallo(res,e); }
  });
  router.post('/creativos/:tipo', auth, body, async (req,res) => {
    try { const item=await core.guardar(req.user,req.params.tipo,req.body); alCambiar(req.user); res.status(201).json({ item }); } catch(e) { fallo(res,e); }
  });
  router.put('/creativos/:tipo/:id', auth, body, async (req,res) => {
    try { const item=await core.guardar(req.user,req.params.tipo,req.body,req.params.id); alCambiar(req.user); res.json({ item }); } catch(e) { fallo(res,e); }
  });
  router.delete('/creativos/:tipo/:id', auth, async (req,res) => {
    try { await core.borrar(req.user,req.params.tipo,req.params.id); alCambiar(req.user); res.json({ ok:true }); } catch(e) { fallo(res,e); }
  });
  return { router, core };
};
