'use strict';
// Gestión de los enlaces propios desde la zona «Enlaces»: cambiar la caducidad de cualquier tipo de enlace, poner o
// quitar la contraseña de uno de descarga, renombrarlo, revocarlo (con copia de 30 días) y limpiar los caducados.
// Los contadores para los logros viven en <userRoot>/.kcc/enlaces/stats.json (un JSON propio, aparte de uploadlinks.json).
const path = require('path');
const store = require('../nucleo/store');

function montaGestion({
  router, auth, bcrypt, userRoot, loadLinks, saveLinks, caducidad, linkKind, linkExpired, alCambiar, registrarActividad, sendError,
}) {
  const fichero = (user) => path.join(store.kccDir(userRoot(user), 'enlaces'), 'stats.json');
  const stats = (user) => store.leeJsonSync(fichero(user), {});
  function suma(user, campo, n = 1) {
    const f = fichero(user); const s = store.leeJsonSync(f, {});
    s[campo] = Math.min(1e6, (s[campo] || 0) + n);
    store.escribeJsonSync(f, s, 0o600);
  }
  const propio = (links, req) => links.find(l => l.id === req.params.id && l.owner === req.user.username);
  const noEncontrado = (res) => res.status(404).json({ error: 'Enlace no encontrado' });

  // Aparta el enlace 30 días (con su contraseña ya cifrada). Va antes de quitarlo de la lista.
  const aparta = (req, l) => store.guardaBorrado(userRoot(req.user), 'enlaces', l.id, { ...l, revocadoEn: Date.now() });
  // Quita de la lista los enlaces indicados releyéndola justo antes de guardar (varias revocaciones a la vez no se pisan);
  // devuelve cuántos seguían en la lista.
  function quita(ids) {
    const lista = loadLinks(); const sigue = lista.filter(x => ids.has(x.id));
    if (sigue.length) saveLinks(lista.filter(x => !ids.has(x.id)));
    return sigue.length;
  }

  router.put('/links/:id/caducidad', auth, (req, res) => {
    try {
      const links = loadLinks(); const l = propio(links, req); if (!l) return noEncontrado(res);
      l.expiresAt = caducidad(req.body && req.body.days);
      saveLinks(links); suma(req.user, 'caducidades');
      if (alCambiar) alCambiar(req.user);
      res.json({ ok: true, expiresAt: l.expiresAt, expired: linkExpired(l) });
    } catch (err) { sendError(res, err); }
  });

  // Contraseña de un enlace de descarga: texto = la pone o la cambia; vacío = la quita
  router.put('/links/:id/clave', auth, (req, res) => {
    try {
      const links = loadLinks(); const l = propio(links, req); if (!l || linkKind(l) !== 'share') return noEncontrado(res);
      const pw = req.body && req.body.password;
      if (pw !== undefined && pw !== null && typeof pw !== 'string') return res.status(400).json({ error: 'La contraseña no es válida' });
      if (pw && pw.length > 200) return res.status(400).json({ error: 'La contraseña es demasiado larga (200 caracteres como máximo)' });
      if (pw) l.passwordHash = bcrypt.hashSync(pw, 10); else delete l.passwordHash;
      saveLinks(links);
      registrarActividad(req, pw ? 'enlace_clave_puesta' : 'enlace_clave_quitada', { id: l.id });
      res.json({ ok: true, protegido: !!l.passwordHash });
    } catch (err) { sendError(res, err); }
  });

  router.put('/links/:id/etiqueta', auth, (req, res) => {
    try {
      const links = loadLinks(); const l = propio(links, req); if (!l) return noEncontrado(res);
      const t = String((req.body && req.body.label) || '').trim().slice(0, 80);
      if (!t) return res.status(400).json({ error: 'Escribe un nombre para el enlace' });
      l.label = t; saveLinks(links);
      res.json({ ok: true, label: t });
    } catch (err) { sendError(res, err); }
  });

  // Revocar: el mismo manejador para la ruta de siempre y la de la zona nueva
  const revocar = async (req, res) => {
    try {
      const l = propio(loadLinks(), req); if (!l) return noEncontrado(res);
      await aparta(req, l);
      if (!quita(new Set([l.id]))) return noEncontrado(res);   // otra petición lo revocó mientras tanto
      suma(req.user, 'revocados');
      if (alCambiar) alCambiar(req.user);
      registrarActividad(req, 'enlace_revocado', { id: l.id, tipo: linkKind(l) });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  };
  router.delete('/uploadlinks/:id', auth, revocar);
  router.delete('/links/:id', auth, revocar);

  // Quita de una vez todos los enlaces propios que ya caducaron
  router.post('/links/limpiar-caducados', auth, async (req, res) => {
    try {
      const vencidos = loadLinks().filter(x => x.owner === req.user.username && linkExpired(x));
      for (const l of vencidos) await aparta(req, l);
      const n = vencidos.length ? quita(new Set(vencidos.map(l => l.id))) : 0;
      if (n) { suma(req.user, 'revocados', n); if (alCambiar) alCambiar(req.user); registrarActividad(req, 'enlaces_caducados_limpiados', { n }); }
      res.json({ ok: true, quitados: n });
    } catch (err) { sendError(res, err); }
  });

  return { stats };
}

module.exports = { montaGestion };
