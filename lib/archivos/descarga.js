'use strict';
// Descargas: archivo suelto (con conversión HEIC→JPG y Office→PDF) y ZIP de selecciones o carpetas.
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { HEIC_TYPES, OFFICE_RE } = require('./tipos');

const ZIP_LIMIT = Number(process.env.ZIP_LIMIT || 200);

function creaDescarga({ ZipArchive, router, auth, userPath, sendError, registrarActividad, sharp, soffice, THUMBS_DIR, exists, convertirOffice }) {
  // Content-Disposition con acentos: nombre en ASCII y la versión real en filename*
  function cabeceraDescarga(res, nombre) {
    const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  }

  async function enviarZip(res, entradas, nombreZip) {
    res.setHeader('Content-Type', 'application/zip');
    cabeceraDescarga(res, nombreZip);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('warning', err => { if (err.code !== 'ENOENT') console.warn('zip', err.message); });
    zip.on('error', err => {
      console.warn('zip', err.message);
      // Ya se están enviando bytes: no queda más que cortar
      res.destroy();
    });
    zip.pipe(res);
    for (const e of entradas) {
      if (e.isDir) zip.directory(e.abs, e.name);
      else zip.file(e.abs, { name: e.name });
    }
    await zip.finalize();
  }

  router.get('/api/zip', auth, async (req, res) => {
    try {
      const lista = [].concat(req.query.p || []).filter(Boolean);
      if (!lista.length) return res.status(400).json({ error: 'No has indicado qué descargar' });
      if (lista.length > ZIP_LIMIT) return res.status(400).json({ error: `Máximo ${ZIP_LIMIT} elementos por ZIP` });

      const entradas = [];
      for (const rel of lista) {
        const abs = userPath(req, rel);
        const stat = await fsp.stat(abs);
        entradas.push({ abs, name: path.basename(abs), isDir: stat.isDirectory() });
      }
      const nombre = entradas.length === 1
        ? `${entradas[0].name.replace(/\.[^.]+$/, '')}.zip`
        : `KookyeCatCloud-${new Date().toISOString().slice(0, 10)}.zip`;
      await enviarZip(res, entradas, nombre);
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
    }
  });

  // --- Descargar archivo ---
  // ?as=jpg convierte un HEIC al vuelo; ?as=pdf convierte un documento de Office
  // con LibreOffice (reutilizando la misma caché que la vista previa). Sin ?as,
  // se descarga el original tal cual.
  router.get('/api/download', auth, async (req, res) => {
    try {
      const file = userPath(req, req.query.path);
      const ext = path.extname(file).toLowerCase();
      const as = String(req.query.as || '').toLowerCase();

      if (as === 'jpg' && HEIC_TYPES[ext]) {
        if (!sharp) return res.status(501).json({ error: 'Este servidor no puede convertir HEIC' });
        const buf = await sharp(file, { failOn: 'none' }).rotate().withMetadata().jpeg({ quality: 92 }).toBuffer();   // conserva EXIF y GPS
        cabeceraDescarga(res, path.basename(file, ext) + '.jpg');
        registrarActividad(req, 'descarga_convertida', { path: req.query.path, as });
        return res.status(200).type('image/jpeg').send(buf);
      }
      if (as === 'pdf' && OFFICE_RE.test(file)) {
        if (!soffice) return res.status(501).json({ error: 'Este servidor no tiene LibreOffice instalado' });
        const stat = await fsp.stat(file);
        const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|office`).digest('hex');
        const cached = path.join(THUMBS_DIR, `${key}.pdf`);
        if (!await exists(cached)) {
          const trabajo = path.join(THUMBS_DIR, `conv-${key}-${process.pid}`);
          await fsp.mkdir(trabajo, { recursive: true });
          try {
            await convertirOffice(file, trabajo);
            const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.pdf'));
            if (!generado) throw new Error('LibreOffice no generó ningún PDF');
            await fsp.rename(path.join(trabajo, generado), cached);
          } finally { fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {}); }
        }
        cabeceraDescarga(res, path.basename(file, ext) + '.pdf');
        registrarActividad(req, 'descarga_convertida', { path: req.query.path, as });
        return res.sendFile(cached, { headers: { 'Content-Type': 'application/pdf' } });
      }

      // Siempre como adjunto y sin tipo interpretable: un .html subido no se ejecuta en el dominio
      res.download(file, path.basename(file), { headers: { 'Content-Type': 'application/octet-stream' } }, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  return { cabeceraDescarga, enviarZip };
}

module.exports = { creaDescarga };
