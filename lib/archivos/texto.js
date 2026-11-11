'use strict';
// Lectura y guardado de archivos de texto desde el visor (con detección de cambios ajenos y versiones).
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { TEXT_RE, TEXT_MAX } = require('./tipos');

function montaTexto({ express, router, auth, userPath, sendError, registrarActividad, versions }) {
  router.get('/api/text', auth, async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      const base = path.basename(file);
      // Se admite por extensión o por nombre completo (Makefile, Dockerfile…)
      if (!TEXT_RE.test(base) && !/^(makefile|dockerfile|licen[cs]e|readme)$/i.test(base)) {
        return res.status(415).json({ error: 'Este archivo no es de texto' });
      }
      const stat = await fsp.stat(file);
      if (stat.isDirectory()) return res.status(400).json({ error: 'Es una carpeta' });

      // Se lee solo el principio: un log de 2 GB no puede tumbar el servidor
      const leer = Math.min(stat.size, TEXT_MAX);
      const fh = await fsp.open(file, 'r');
      const buf = Buffer.alloc(leer);
      try { await fh.read(buf, 0, leer, 0); } finally { await fh.close(); }

      res.json({
        text: buf.toString('utf8'),
        truncated: stat.size > TEXT_MAX,
        size: stat.size,
        shown: leer,
        mtime: stat.mtimeMs,   // «base» para el guardado: detecta si el archivo cambió en otro sitio mientras se editaba
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Guardar un archivo de texto editado desde el propio visor
  router.put('/api/text', auth, express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      const base = path.basename(file);
      if (!TEXT_RE.test(base) && !/^(makefile|dockerfile|licen[cs]e|readme)$/i.test(base)) {
        return res.status(415).json({ error: 'Este archivo no es de texto' });
      }
      const stat = await fsp.stat(file);
      if (stat.isDirectory()) return res.status(400).json({ error: 'Es una carpeta' });
      // Un archivo más grande que lo que el visor carga NO se puede guardar desde aquí: el editor solo tenía el principio y
      // guardar habría cortado el resto del archivo
      if (stat.size > TEXT_MAX) return res.status(413).json({ error: 'Este archivo es demasiado grande para editarlo aquí: solo se mostraba el principio.' });
      const contenido = String(req.body?.text ?? '');
      if (Buffer.byteLength(contenido) > TEXT_MAX) return res.status(400).json({ error: 'Demasiado grande para editar aquí' });
      const baseM = Number(req.body?.base);
      if (Number.isFinite(baseM) && baseM > 0 && stat.mtimeMs > baseM + 1) {
        const actual = await fsp.readFile(file, 'utf8').catch(() => null);
        if (actual !== null && actual !== contenido) return res.status(409).json({ error: 'El archivo se cambió en otro sitio mientras lo editabas. Copia tu texto, cierra y vuelve a abrirlo.' });
      }
      // Si no cambia nada, no se reescribe ni se crea una versión de más
      if (stat.size <= TEXT_MAX * 4 && await fsp.readFile(file, 'utf8').then(t => t === contenido, () => false)) return res.json({ ok: true, unchanged: true });
      await versions().snapshot(req.user, req.query.path, file);     // guarda lo que había antes
      // Escritura atómica: un corte a mitad no deja el archivo truncado
      const tmpE = path.join(path.dirname(file), `.kcc-edicion-${crypto.randomBytes(6).toString('hex')}`);
      try { await fsp.writeFile(tmpE, contenido, 'utf8'); await fsp.rename(tmpE, file); } catch (e) { await fsp.rm(tmpE, { force: true }).catch(() => {}); throw e; }
      registrarActividad(req, 'archivo_editado', { path: req.query.path });
      res.json({ ok: true, mtime: (await fsp.stat(file)).mtimeMs });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { montaTexto };
