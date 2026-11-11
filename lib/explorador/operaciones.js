'use strict';
// Borrar (a la papelera), operaciones por lotes y renombrar/mover. Mover avisa a calendario, versiones y carpetas compartidas.
const fsp = require('fs').promises;
const path = require('path');

const BATCH_LIMIT = 500;

function montaOperaciones({ router, auth, userPath, limpiaRel, mismoAlmacen, sharesMueve, exists, freeName, sendError, registrarActividad, trash, calendar, versions }) {
  // --- Eliminar (va a la papelera) ---
  router.delete('/api/files', auth, async (req, res) => {
    try {
      await trash()(req.user, req.query.path);
      registrarActividad(req, 'enviado_papelera', { path: req.query.path });
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // --- Operaciones por lotes (mover / eliminar / renombrar varios) ---
  router.post('/api/batch', auth, async (req, res) => {
    try {
      const { op, paths, dest, pattern, start } = req.body || {};
      if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ error: 'No hay nada seleccionado' });
      if (paths.length > BATCH_LIMIT) return res.status(400).json({ error: `Máximo ${BATCH_LIMIT} elementos por operación` });
      if (!['move', 'delete', 'rename'].includes(op)) return res.status(400).json({ error: 'Operación no válida' });

      // Renombrado en lote: patrón con {n} (número de secuencia) y {name} (nombre original sin extensión)
      if (op === 'rename') {
        const pat = String(pattern || '').trim();
        if (!pat) return res.status(400).json({ error: 'Falta el patrón de nombres' });
        const errores = [];
        let hechos = 0;
        const pad = String(paths.length).length;
        let n = Number(start) > 0 ? Math.floor(Number(start)) : 1;
        for (const rel of paths) {
          try {
            const from = userPath(req, rel);
            const stat = await fsp.stat(from);
            const dir = path.dirname(from);
            const ext = stat.isDirectory() ? '' : path.extname(from);
            const nombreOriginal = path.basename(from, ext);
            const numero = String(n).padStart(pad, '0');
            let nuevo = pat.replace(/\{n\}/g, numero).replace(/\{name\}/g, nombreOriginal);
            nuevo = nuevo.replace(/[\\/]/g, '-').trim() || nombreOriginal;
            let to = path.join(dir, nuevo + ext);
            if (to !== from && await exists(to)) to = await freeName(dir, nuevo + ext);
            if (to !== from) {
              await fsp.rename(from, to);
              const nuevaRel = path.posix.join(path.posix.dirname(limpiaRel(rel)), path.basename(to));
              calendar().mueveOrigenArchivo(req.user, limpiaRel(rel), limpiaRel(nuevaRel)).catch(() => {});
              versions().mueve(req.user, rel, nuevaRel);
              sharesMueve(req.user, rel, nuevaRel);
            }
            n++;
            hechos++;
          } catch (e) { errores.push({ path: rel, error: e.message }); }
        }
        registrarActividad(req, 'renombrado_lote', { cantidad: hechos, patron: pat });
        return res.json({ ok: errores.length === 0, done: hechos, errors: errores });
      }

      const errors = [];
      let done = 0;
      // En serie a propósito: el índice de la papelera es un único archivo JSON
      for (const rel of paths) {
        try {
          if (op === 'delete') {
            await trash()(req.user, rel);
          } else {
            const name = path.basename(String(rel).replace(/\\/g, '/'));
            if (!mismoAlmacen(rel, dest || '')) throw new Error('No se puede mover entre tus archivos y una carpeta compartida, ni entre dos compartidas');
            const from = userPath(req, rel);
            const destDir = userPath(req, dest || '');
            const to = path.join(destDir, name);
            if (from === to) { done++; continue; }
            // Mover una carpeta dentro de sí misma dejaría el árbol inaccesible
            if (to === from || to.startsWith(from + path.sep)) throw new Error('No puedes mover una carpeta dentro de sí misma');
            if (await exists(to)) throw new Error(`Ya existe "${name}" en el destino`);
            await fsp.mkdir(destDir, { recursive: true });
            await fsp.rename(from, to);
            calendar().mueveOrigenArchivo(req.user, limpiaRel(rel), limpiaRel(path.posix.join(String(dest || ''), name))).catch(() => {});
            versions().mueve(req.user, rel, path.posix.join(String(dest || ''), name));
            sharesMueve(req.user, rel, path.posix.join(String(dest || ''), name));
          }
          done++;
        } catch (e) {
          errors.push({ path: rel, error: e.message });
        }
      }
      if (done) registrarActividad(req, op === 'delete' ? 'enviado_papelera_lote' : 'movido_lote', { cantidad: done });
      res.json({ ok: errors.length === 0, done, errors });
    } catch (err) {
      sendError(res, err);
    }
  });

  // --- Renombrar / mover ---
  router.post('/api/move', auth, async (req, res) => {
    try {
      if (!mismoAlmacen(req.body?.from, req.body?.to)) return res.status(400).json({ error: 'No se puede mover entre tus archivos y una carpeta compartida, ni entre dos compartidas. Copia y borra.' });
      const from = userPath(req, req.body?.from);
      const to = userPath(req, req.body?.to);
      if (from === to) return res.json({ ok: true });
      // rename() machaca el destino en silencio: comprobarlo antes evita perder archivos
      try {
        await fsp.access(to);
        return res.status(409).json({ error: 'Ya existe un archivo con ese nombre' });
      } catch { /* destino libre, seguimos */ }
      await fsp.rename(from, to);
      calendar().mueveOrigenArchivo(req.user, limpiaRel(req.body?.from), limpiaRel(req.body?.to)).catch(() => {});
      versions().mueve(req.user, req.body?.from, req.body?.to);
      sharesMueve(req.user, req.body?.from, req.body?.to);
      registrarActividad(req, 'renombrado', { from: req.body?.from, to: req.body?.to });
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { montaOperaciones };
