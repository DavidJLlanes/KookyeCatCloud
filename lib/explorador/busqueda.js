'use strict';
// Búsqueda recursiva de archivos por nombre desde una carpeta.
const fsp = require('fs').promises;
const path = require('path');

const SEARCH_LIMIT = 300;

function montaBusqueda({ router, auth, userPath, isHidden, sendError }) {
  // --- Buscar (recursivo desde la carpeta indicada) ---
  router.get('/api/search', auth, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      if (q.length < 2) return res.json({ items: [], truncated: false });
      const startRel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const base = userPath(req, startRel);
      const results = [];

      async function walk(dir, rel) {
        if (results.length >= SEARCH_LIMIT) return;
        let entries;
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (results.length >= SEARCH_LIMIT) return;
          if (isHidden(e.name)) continue;
          const full = path.join(dir, e.name);
          const childRel = rel ? `${rel}/${e.name}` : e.name;
          if (e.name.toLowerCase().includes(q)) {
            try {
              const stat = await fsp.stat(full);
              results.push({
                name: e.name, isDir: stat.isDirectory(), size: stat.size,
                modified: stat.mtime, dir: rel,
              });
            } catch { /* desaparecido a mitad del recorrido */ }
          }
          if (e.isDirectory()) await walk(full, childRel);
        }
      }

      await walk(base, startRel);
      res.json({ items: results, truncated: results.length >= SEARCH_LIMIT });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { montaBusqueda };
