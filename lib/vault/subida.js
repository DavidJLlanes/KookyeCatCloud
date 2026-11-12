'use strict';
// subida: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const { newId, HttpError } = require('../nucleo/store');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const fsp = fs.promises;
const path = require('path');
const { CifraChunks, MAX_ITEMS, sellar } = require('./constantes');

function monta(ctx) {
  const { auth, binFile, errorVault, exigeAbierta, maxUpload, multer, mutaIndice, nombreLibre, nombreOk, padreValido, quitaDatos, registrarActividad, router, sendError, sharp, thumbFile } = ctx;

  /* ---------- Subida cifrada ---------- */
  // Almacenamiento de multer propio: el archivo se cifra al vuelo, nunca toca el disco en claro
  const almacen = {
    _handleFile(req, file, cb) {
      try {
        const id = newId();
        const cif = new CifraChunks(req.vaultDek, id);
        const esImg = /^image\//.test(file.mimetype) && !/svg/.test(file.mimetype) && !!sharp;
        const copia = []; let copiaLen = 0;
        if (esImg) file.stream.on('data', (c) => { if (copiaLen <= 25 * 1024 * 1024) { copia.push(c); copiaLen += c.length; } });
        const out = fs.createWriteStream(binFile(req.vaultUser, id), { mode: 0o600 });
        pipeline(file.stream, cif, out).then(async () => {
          let thumb = false;
          if (esImg && copiaLen <= 25 * 1024 * 1024) {
            try {
              const mini = await sharp(Buffer.concat(copia), { limitInputPixels: 64e6, failOn: 'none' }).rotate()
                .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
              await fsp.writeFile(thumbFile(req.vaultUser, id), sellar(req.vaultDek, mini, `t:${id}`), { mode: 0o600 });
              thumb = true;
            } catch { /* sin miniatura */ }
          }
          cb(null, { id, size: cif.total, thumb });
        }).catch((e) => { fsp.rm(binFile(req.vaultUser, id), { force: true }).catch(() => {}); cb(e); });
      } catch (e) { cb(e); }
    },
    _removeFile(req, file, cb) { fsp.rm(binFile(req.vaultUser, file.id), { force: true }).then(() => cb(null), cb); },
  };
  const subida = multer({ storage: almacen, limits: { fileSize: maxUpload } });

  router.post('/vault/upload', auth, (req, res, next) => {
    try { req.vaultDek = exigeAbierta(req); req.vaultUser = req.user; next(); } catch (err) { errorVault(res, err); }
  }, (req, res) => {
    subida.array('files')(req, res, async (err) => {
      if (err) return sendError(res, err);
      try {
        const parent = String(req.query.parent || '');
        const items = await mutaIndice(req.user, req.vaultDek, (idx) => {
          if (!padreValido(idx, parent)) throw new HttpError(400, 'Carpeta no válida');
          const nuevos = [];
          for (const f of req.files || []) {
            if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
            const orig = Buffer.from(f.originalname, 'latin1').toString('utf8');
            const it = { id: f.id, type: 'file', name: nombreLibre(idx, parent, nombreOk(path.basename(orig))), parent, size: f.size, thumb: !!f.thumb, createdAt: Date.now(), modifiedAt: Date.now() };
            idx.items.push(it); nuevos.push(it);
          }
          return nuevos;
        });
        registrarActividad(req, 'caja_subida', { n: items.length });
        res.json({ ok: true, items });
      } catch (e) {
        for (const f of req.files || []) { await quitaDatos(req.user, [f.id]); }
        errorVault(res, e);
      }
    });
  });


  return { almacen, subida };
}

module.exports = monta;
