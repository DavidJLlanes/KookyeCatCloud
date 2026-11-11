'use strict';
// Pagos · documentos adjuntos a un pago (la póliza del seguro, un recibo…): PDF o imagen.
// El contenido vive en <raíz>/.kcc/pagos/adjuntos/<pagoId>/<id>.<ext>; en el pago solo van los metadatos (`adjuntos`).
const fsp = require('fs').promises;
const path = require('path');
const store = require('../store');
const { kccDir, newId, HttpError } = store;

const MAX_BYTES = 15 * 1024 * 1024, MAX_POR_PAGO = 8;
const RE_ID = /^[a-f0-9]{16}$/;
// Se decide por el contenido, no por la extensión ni por la cabecera que mande el cliente
function tipoPorContenido(b) {
  if (b.length > 4 && b.slice(0, 4).toString('latin1') === '%PDF') return { tipo: 'application/pdf', ext: 'pdf' };
  if (b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: 'image/png', ext: 'png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipo: 'image/jpeg', ext: 'jpg' };
  if (b.length > 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { tipo: 'image/webp', ext: 'webp' };
  return null;
}
const nombreSeguro = (n) => String(n || 'documento').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || 'documento';

function montaAdjuntos(router, { express, userRoot, muta, lee, buscaEn, cambio, sendError, log }) {
  const dirDe = (user, pid) => kccDir(userRoot(user), 'pagos', 'adjuntos', pid);
  const cuerpo = express.raw({ type: () => true, limit: MAX_BYTES });

  router.post('/:id/adjuntos', cuerpo, async (req, res) => {
    try {
      const datos = req.body;
      if (!Buffer.isBuffer(datos) || !datos.length) throw new HttpError(400, 'No llegó ningún archivo');
      const t = tipoPorContenido(datos);
      if (!t) throw new HttpError(400, 'Solo se admiten PDF o imágenes (JPG, PNG o WebP)');
      let nombre = 'documento'; try { nombre = decodeURIComponent(String(req.get('x-nombre') || '')); } catch { /* nombre mal codificado: se usa el genérico */ }
      nombre = nombreSeguro(nombre);
      if (!/\.[a-z0-9]{2,5}$/i.test(nombre)) nombre += '.' + t.ext;
      const adj = { id: newId(), nombre, tipo: t.tipo, ext: t.ext, tam: datos.length, createdAt: Date.now() };
      let pagoId;
      await muta(req.user, async (d) => {
        const p = buscaEn(d, req.params.id); pagoId = p.id;
        p.adjuntos = Array.isArray(p.adjuntos) ? p.adjuntos : [];
        if (p.adjuntos.length >= MAX_POR_PAGO) throw new HttpError(400, `Cada pago admite hasta ${MAX_POR_PAGO} documentos`);
        await store.escribeAtomico(path.join(dirDe(req.user, p.id), `${adj.id}.${adj.ext}`), datos);   // el archivo, antes que el dato
        p.adjuntos.push(adj);
      });
      log(req, 'adjuntar', { pago: pagoId, tipo: adj.tipo });
      cambio(req.user);
      res.json({ adjunto: adj });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/adjuntos/:aid', async (req, res) => {
    try {
      const p = buscaEn(await lee(req.user), req.params.id);
      const a = (p.adjuntos || []).find(x => x.id === req.params.aid);
      if (!a || !RE_ID.test(a.id)) throw new HttpError(404, 'No existe ese documento');
      const f = path.join(dirDe(req.user, p.id), `${a.id}.${a.ext}`);
      await fsp.access(f).catch(() => { throw new HttpError(404, 'El archivo ya no está'); });
      res.set({ 'Content-Type': a.tipo, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        'Content-Disposition': `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`, 'Cache-Control': 'private, max-age=300' });
      res.sendFile(f);
    } catch (e) { sendError(res, e); }
  });

  // Se aparta 30 días (lib/store.js, guardaBorrado) en vez de borrarse en el acto
  router.delete('/:id/adjuntos/:aid', async (req, res) => {
    try {
      await muta(req.user, async (d) => {
        const p = buscaEn(d, req.params.id);
        const i = (p.adjuntos || []).findIndex(x => x.id === req.params.aid); if (i < 0) throw new HttpError(404, 'No existe ese documento');
        const a = p.adjuntos[i]; const f = path.join(dirDe(req.user, p.id), `${a.id}.${a.ext}`);
        if (await fsp.access(f).then(() => true, () => false)) await store.guardaBorrado(userRoot(req.user), 'pagos-adjuntos', `${p.id}-${a.id}`, { mover: f });
        p.adjuntos.splice(i, 1);
      });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });
}

// Al borrar un pago, su carpeta de documentos se aparta con él
async function apartaAdjuntos(userRoot, user, pid) {
  const dir = path.join(kccDir(userRoot(user), 'pagos', 'adjuntos'), pid);
  if (await fsp.access(dir).then(() => true, () => false)) await store.guardaBorrado(userRoot(user), 'pagos-adjuntos', `${pid}-todos`, { mover: dir });
}

module.exports = { montaAdjuntos, apartaAdjuntos, tipoPorContenido };
