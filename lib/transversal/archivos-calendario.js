'use strict';
// Pone, mueve o quita la fecha de calendario de archivos ya subidos. Con pocos archivos
// cada uno tiene su evento; con muchos (una subida de fotos) se crea uno solo para la carpeta.
const fsp = require('fs').promises;
const path = require('path');

function montaArchivosCalendario({ app, auth, userPath, limpiaRel, sendError, calendarCore }) {
  app.post('/api/files/calendar', auth, async (req, res) => {
    try {
      const { paths, calendar } = req.body || {};
      if (!Array.isArray(paths) || !paths.length || paths.length > 500) return res.status(400).json({ error: 'Selección no válida' });
      const rels = [];
      for (const rel of paths) {
        const abs = userPath(req, rel);
        await fsp.stat(abs);
        rels.push(limpiaRel(rel));
      }
      if (!calendar || rels.length <= 3) {
        for (const rel of rels) await calendarCore.sincronizaOrigen(req.user, 'file', rel, path.posix.basename(rel), calendar || null);
      } else {
        const carpetas = new Set(rels.map(r => path.posix.dirname(r)));
        const dir = carpetas.size === 1 ? [...carpetas][0] : '.';
        const ref = dir === '.' ? '' : dir;
        const titulo = `${rels.length} archivos subidos${ref ? ' a ' + ref : ''}`;
        await calendarCore.sincronizaOrigen(req.user, 'file', ref || '/', titulo, calendar);
      }
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });
}

module.exports = { montaArchivosCalendario };
