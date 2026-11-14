'use strict';
// Listar carpetas (con la carpeta virtual @compartido) y crear carpetas.
const fsp = require('fs').promises;
const path = require('path');

function montaListado({ router, auth, userPath, isHidden, limpiaRel, sendError, registrarActividad, shares }) {
  // --- Listar archivos/carpetas ---
  router.get('/api/files', auth, async (req, res) => {
    try {
      const rel = req.query.path || '';
      // "@compartido" es la carpeta virtual con lo que otros usuarios te han compartido
      if (limpiaRel(rel) === '@compartido') return res.json({ path: rel, items: shares().entradasPara(req.user), perm: 'read' });
      const dir = userPath(req, rel);
      const entries = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
      const items = await Promise.all(entries.map(async e => {
        const full = path.join(dir, e.name);
        let stat;
        try { stat = await fsp.stat(full); } catch { return null; } // symlink roto o borrado a medias
        return {
          name: e.name,
          isDir: stat.isDirectory(),
          size: stat.size,
          modified: stat.mtime,
        };
      }));
      const visible = items.filter(Boolean);
      visible.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
      if (limpiaRel(rel) === '' && shares().hayPara(req.user)) visible.unshift({ name: '@compartido', isDir: true, size: 0, modified: new Date(), virtual: true });
      const info = shares().permDe(req.user, rel);
      res.json({ path: rel, items: visible, ...(info ? { perm: info.perm, sharedBy: info.owner } : {}) });
    } catch (err) {
      sendError(res, err);
    }
  });

  // --- Crear carpeta ---
  router.post('/api/mkdir', auth, async (req, res) => {
    try {
      const { path: rel, name } = req.body || {};
      if (typeof name !== 'string' || (rel !== undefined && rel !== null && typeof rel !== 'string') || !name || /[\\/]/.test(name) || name === '.' || name === '..') {
        return res.status(400).json({ error: 'Nombre de carpeta inválido' });
      }
      const dir = userPath(req, path.join(rel || '', name));
      await fsp.mkdir(dir, { recursive: false });
      registrarActividad(req, 'carpeta_creada', { path: path.join(rel || '', name) });
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'EEXIST') return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
      sendError(res, err);
    }
  });
}

module.exports = { montaListado };
