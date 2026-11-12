'use strict';
// lectura: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const crypto = require('crypto');
const { HttpError } = require('../nucleo/store');
const fs = require('fs');
const fsp = fs.promises;
const { CHUNK, MIME_SEGURO, REG_FIJO, abrir, extDe } = require('./constantes');

function monta(ctx) {
  const { auth, binFile, errorVault, exigeAbierta, leeIndice, router, thumbFile } = ctx;

  /* ---------- Lectura (descarga, vista previa, miniatura) ---------- */
  async function leeRegistro(fh, id, dek, i, tam) {
    const largo = Math.min(CHUNK, Math.max(tam - i * CHUNK, 0));
    const off = 4 + i * REG_FIJO;
    const buf = Buffer.alloc(4 + 12 + largo + 16);
    const { bytesRead } = await fh.read(buf, 0, buf.length, off);
    if (bytesRead !== buf.length) throw new Error('Archivo cifrado truncado');
    if (buf.readUInt32BE(0) !== largo) throw new Error('Registro corrupto');
    const d = crypto.createDecipheriv('aes-256-gcm', dek, buf.subarray(4, 16));
    d.setAAD(Buffer.from(`${id}:${i}`));
    d.setAuthTag(buf.subarray(4 + 12 + largo));
    return Buffer.concat([d.update(buf.subarray(16, 16 + largo)), d.final()]);
  }

  router.get('/vault/items/:id/file', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const it = (await leeIndice(req.user, dek)).items.find(i => i.id === req.params.id && i.type === 'file');
      if (!it) throw new HttpError(404, 'No encontrado');
      const mime = MIME_SEGURO[extDe(it.name)];
      const adj = req.query.download === '1' || !mime;
      const nombre = it.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.setHeader('Content-Type', adj ? 'application/octet-stream' : mime);
      res.setHeader('Content-Disposition', `${adj ? 'attachment' : 'inline'}; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(it.name)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const tam = it.size;
      let ini = 0, fin = Math.max(tam - 1, 0);
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && tam > 0) {
        if (m[1] !== '') { ini = +m[1]; if (m[2] !== '') fin = Math.min(+m[2], tam - 1); }
        else if (m[2] !== '') { ini = Math.max(tam - +m[2], 0); }
        if (ini > fin || ini >= tam) { res.status(416).setHeader('Content-Range', `bytes */${tam}`); return res.end(); }
        res.status(206).setHeader('Content-Range', `bytes ${ini}-${fin}/${tam}`);
      }
      res.setHeader('Content-Length', tam === 0 ? 0 : fin - ini + 1);
      if (tam === 0) return res.end();
      const fh = await fsp.open(binFile(req.user, it.id), 'r');
      try {
        for (let i = Math.floor(ini / CHUNK); i <= Math.floor(fin / CHUNK); i++) {
          const plano = await leeRegistro(fh, it.id, dek, i, tam);
          const a = Math.max(ini - i * CHUNK, 0), b = Math.min(fin - i * CHUNK + 1, plano.length);
          if (!res.write(plano.subarray(a, b))) await new Promise(r => res.once('drain', r));
          if (res.destroyed) break;
        }
        res.end();
      } catch (e) { res.destroy(); } finally { await fh.close(); }
    } catch (err) { if (!res.headersSent) errorVault(res, err); else res.destroy(); }
  });

  router.get('/vault/items/:id/thumb', auth, async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      if (!/^[a-f0-9]{16}$/.test(req.params.id)) throw new HttpError(400, 'No válido');
      const blob = await fsp.readFile(thumbFile(req.user, req.params.id)).catch(() => null);
      if (!blob) throw new HttpError(404, 'Sin miniatura');
      res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'private, no-store');
      res.send(abrir(dek, blob, `t:${req.params.id}`));
    } catch (err) { errorVault(res, err); }
  });


  return { leeRegistro };
}

module.exports = monta;
