'use strict';
// Perfil del usuario: por ahora, la foto. Aparece en la cabecera y en la lista de usuarios de Administración.
// Datos: <raíz>/.kcc/perfil/perfil.json  { avatar: { v: marca de tiempo, bytes } | null }  y  <raíz>/.kcc/perfil/avatar.webp
const path = require('path');
const store = require('../store');
const { kccDir, readJson, updateJson, HttpError } = store;
const { procesa, escribe } = require('./avatar');

const MAX_BYTES = 12 * 1024 * 1024;

function createPerfil({ express, multer, sharp, userRoot, usuarios, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const dir = (user) => kccDir(userRoot(user), 'perfil');
  const datos = (user) => path.join(dir(user), 'perfil.json');
  const imagen = (user) => path.join(dir(user), 'avatar.webp');
  const VACIO = () => ({ avatar: null });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };
  const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

  router.get('/', async (req, res) => {
    try { res.json({ avatar: (await readJson(datos(req.user), VACIO)).avatar || null }); } catch (e) { sendError(res, e); }
  });

  router.put('/avatar', (req, res) => {
    subida.single('foto')(req, res, async (err) => {
      try {
        if (err) throw new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa demasiado (máximo 12 MB)' : err.message);
        if (!req.file) throw new HttpError(400, 'Elige una foto');
        const webp = await procesa(sharp, req.file.buffer);
        await escribe(imagen(req.user), webp);
        const avatar = { v: Date.now(), bytes: webp.length };
        await updateJson(datos(req.user), VACIO, (d) => { d.avatar = avatar; });
        if (registrarActividad) registrarActividad(req, 'perfil', { accion: 'foto' });
        cambio(req.user);
        res.json({ avatar });
      } catch (e) { sendError(res, e); }
    });
  });

  // La foto no se borra en el acto: se aparta 30 días (lib/store.js, guardaBorrado)
  router.delete('/avatar', async (req, res) => {
    try {
      await updateJson(datos(req.user), VACIO, async (d) => {
        if (!d.avatar) return { __abort: true };
        await store.guardaBorrado(userRoot(req.user), 'perfil', 'avatar', { mover: imagen(req.user) }).catch((e) => { if (!e || e.code !== 'ENOENT') throw e; });   // si no se puede apartar, no se quita
        d.avatar = null;
      });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  // Versiones de las fotos de todos los usuarios (solo administradores): { nombre: marca | null }
  router.get('/avatares', async (req, res) => {
    try {
      if (req.user.role !== 'admin') throw new HttpError(403, 'Solo administradores');
      const out = {};
      for (const u of usuarios()) out[u.username] = ((await readJson(datos(u), VACIO)).avatar || {}).v || null;
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  // La propia foto, o la de cualquiera si eres administrador
  router.get('/avatar/:username?', async (req, res) => {
    try {
      const nombre = req.params.username;
      let dueno = req.user;
      if (nombre && nombre !== req.user.username) {
        if (req.user.role !== 'admin') throw new HttpError(403, 'No permitido');
        dueno = usuarios().find(u => u.username === nombre);
        if (!dueno) throw new HttpError(404, 'No existe ese usuario');
      }
      if (!(await readJson(datos(dueno), VACIO)).avatar) return res.status(404).end();
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.sendFile(imagen(dueno), (e) => { if (e && !res.headersSent) res.status(404).end(); });
    } catch (e) { sendError(res, e); }
  });

  const core = { resumen: async (user) => ({ perfil_foto: (await readJson(datos(user), VACIO)).avatar ? 1 : 0 }) };
  return { router, core };
}

module.exports = createPerfil;
