'use strict';
// mover: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const { pipeline } = require('stream/promises');
const fs = require('fs');
const { newId, HttpError } = require('../store');
const fsp = fs.promises;
const path = require('path');
const { CHUNK, CifraChunks, MAX_ITEMS, sellar } = require('./constantes');

function monta(ctx) {
  const { alRetirar, auth, binFile, descendientes, errorVault, exigeAbierta, express, hijos, leeIndice, leeRegistro, mutaIndice, nombreLibre, nombreOk, padreValido, quitaDatos, registrarActividad, resolveFor, router, sharp, thumbFile, userRoot } = ctx;

  /* ---------- Mover entre tus archivos y la caja ---------- */
  async function cifraArchivo(user, dek, abs, id) {
    const cif = new CifraChunks(dek, id);
    await pipeline(fs.createReadStream(abs), cif, fs.createWriteStream(binFile(user, id), { mode: 0o600 }));
    return cif.total;
  }

  router.post('/vault/import', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const rutas = Array.isArray(req.body.paths) ? req.body.paths.slice(0, 500) : [];
      if (!rutas.length) throw new HttpError(400, 'No hay nada seleccionado');
      const destino = String(req.body.parent || '');
      let movidos = 0;
      const retirados = [];
      await mutaIndice(req.user, dek, async (idx) => {
        if (!padreValido(idx, destino)) throw new HttpError(400, 'Carpeta no válida');
        // Copia cifrando; el original solo se borra cuando todo lo de esa ruta quedó cifrado
        const sube = async (abs, nombre, parent) => {
          const st = await fsp.stat(abs);
          if (idx.items.length >= MAX_ITEMS) throw new HttpError(400, 'La caja fuerte está llena');
          if (st.isDirectory()) {
            const carpeta = { id: newId(), type: 'folder', name: nombreLibre(idx, parent, nombreOk(nombre)), parent, createdAt: Date.now(), modifiedAt: Date.now() };
            idx.items.push(carpeta);
            // También los ocultos (.env, .git…): antes se saltaban y, como después se borra la carpeta original entera, se perdían
            for (const h of await fsp.readdir(abs, { withFileTypes: true })) await sube(path.join(abs, h.name), h.name, carpeta.id);
          } else {
            const id = newId();
            const tam = await cifraArchivo(req.user, dek, abs, id);
            let thumb = false;
            if (sharp && /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(nombre) && st.size <= 25 * 1024 * 1024) {
              try {
                const mini = await sharp(abs, { limitInputPixels: 64e6, failOn: 'none' }).rotate().resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
                await fsp.writeFile(thumbFile(req.user, id), sellar(dek, mini, `t:${id}`), { mode: 0o600 }); thumb = true;
              } catch { /* sin miniatura */ }
            }
            idx.items.push({ id, type: 'file', name: nombreLibre(idx, parent, nombreOk(nombre)), parent, size: tam, thumb, createdAt: Date.now(), modifiedAt: Date.now() });
          }
        };
        for (const rel of rutas) {
          const abs = resolveFor(req.user, rel);
          if (abs === userRoot(req.user)) continue;
          await sube(abs, path.basename(abs), destino);
          retirados.push({ rel: String(rel), abs });
          movidos++;
        }
      });
      // Ahora que el índice ya está guardado, se borran los originales
      for (const r of retirados) { await fsp.rm(r.abs, { recursive: true, force: true }); if (alRetirar) { try { await alRetirar(req.user, r.rel); } catch {} } }
      registrarActividad(req, 'caja_importar', { n: movidos });
      res.json({ ok: true, moved: movidos });
    } catch (err) { errorVault(res, err); }
  });

  // Sacar de la caja a tus archivos (descifra). Con move=true se quita de la caja.
  router.post('/vault/export', auth, express.json(), async (req, res) => {
    try {
      const dek = exigeAbierta(req);
      const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 500) : [];
      const destRel = String(req.body.dest || '');
      const destAbs = resolveFor(req.user, destRel);
      await fsp.mkdir(destAbs, { recursive: true });
      const idx = await leeIndice(req.user, dek);
      let n = 0;
      const libre = async (dir, nombre) => {
        const ext = path.extname(nombre), base = path.basename(nombre, ext); let obj = path.join(dir, nombre), k = 1;
        while (await fsp.access(obj).then(() => true, () => false)) obj = path.join(dir, `${base} (${k++})${ext}`);
        return obj;
      };
      const saca = async (it, dir) => {
        if (it.type === 'folder') {
          const carpeta = await libre(dir, it.name); await fsp.mkdir(carpeta);
          for (const h of hijos(idx, it.id)) await saca(h, carpeta);
          return;
        }
        const obj = await libre(dir, it.name);
        const fh = await fsp.open(binFile(req.user, it.id), 'r');
        const out = fs.createWriteStream(obj);
        // El error del flujo se escucha desde el principio: sin oyente, un disco lleno tumbaba el servidor entero
        let errOut = null; out.on('error', (e) => { errOut = e; out.emit('drain'); });
        try {
          const nChunks = Math.max(Math.ceil(it.size / CHUNK), 1);
          for (let i = 0; i < nChunks; i++) {
            if (errOut) throw errOut;
            const p = await leeRegistro(fh, it.id, dek, i, it.size); if (!out.write(p)) await new Promise(r => out.once('drain', r));
          }
          if (errOut) throw errOut;
          await new Promise((r, j) => { out.end(); out.on('finish', r); out.on('error', j); if (errOut) j(errOut); });
        } catch (e) { out.destroy(); await fsp.rm(obj, { force: true }).catch(() => {}); throw e; }
        finally { await fh.close(); }
        n++;
      };
      for (const id of ids) { const it = idx.items.find(i => i.id === id); if (it) await saca(it, destAbs); }
      if (req.body.move) {
        const quitar = [];
        await mutaIndice(req.user, dek, (ix) => {
          const fuera = new Set();
          for (const id of ids) { const it = ix.items.find(i => i.id === id); if (it) { fuera.add(it.id); descendientes(ix, it.id).forEach(d => fuera.add(d.id)); } }
          ix.items.filter(i => fuera.has(i.id) && i.type === 'file').forEach(i => quitar.push(i.id));
          ix.items = ix.items.filter(i => !fuera.has(i.id));
        });
        await quitaDatos(req.user, quitar);
      }
      registrarActividad(req, 'caja_exportar', { n });
      res.json({ ok: true, exported: n });
    } catch (err) { errorVault(res, err); }
  });


  return { cifraArchivo };
}

module.exports = monta;
