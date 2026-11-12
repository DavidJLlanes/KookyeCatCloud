'use strict';
// PDF generado en el servidor (pdfkit): POST /api/pdf { titulo, md, ancho, nombre } → application/pdf.
// Sustituye al «imprimir» del navegador, que en el móvil no guardaba nada. Las imágenes de la nube (kcc:file/…) se resuelven
// con los permisos del usuario. Ver lib/pdf/render.js.
const fs = require('fs');
const path = require('path');
const { renderiza } = require('./pdf/render');

const MAX_MD = 6 * 1024 * 1024, MAX_IMAGENES = 30, MAX_IMG_BYTES = 25 * 1024 * 1024;

function createPdf({ express, auth, resolveFor, sendError, registrarActividad, sharp }) {
  const router = express.Router();
  let activos = 0;

  router.post('/pdf', auth, async (req, res) => {
    const b = req.body || {};
    const md = typeof b.md === 'string' ? b.md : '';
    if (!md.trim()) return res.status(400).json({ error: 'No hay nada que exportar' });
    if (md.length > MAX_MD) return res.status(413).json({ error: 'El texto es demasiado largo para un PDF' });
    if (activos >= 3) return res.status(429).json({ error: 'Hay otros PDF en preparación; inténtalo en unos segundos' });
    activos++;
    try {
      const titulo = String(b.titulo || '').slice(0, 200);
      let usadas = 0;
      const resuelveImagen = async (ref) => {
        if (usadas >= MAX_IMAGENES) return null;
        const m = /^kcc:file\/(.+)$/.exec(ref);
        if (!m) return null;
        let rel; try { rel = decodeURIComponent(m[1]); } catch { return null; }
        let abs; try { abs = resolveFor(req.user, rel, { compartidos: true }); } catch { return null; }
        const st = await fs.promises.stat(abs).catch(() => null);
        if (!st || !st.isFile() || st.size > MAX_IMG_BYTES) return null;
        usadas++;
        const ext = path.extname(abs).toLowerCase();
        const buf = await fs.promises.readFile(abs);
        if (sharp) {
          try { return await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); } catch { /* sigue con el original */ }
        }
        return ['.jpg', '.jpeg', '.png'].includes(ext) ? buf : null;
      };
      const { buffer, paginas } = await renderiza({ md: md.replace(/[ \t]{200,}/g, ' '.repeat(8)), titulo, ancho: !!b.ancho, resuelveImagen });
      const base = String(b.nombre || titulo || 'documento').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'documento';
      res.set({
        'Content-Type': 'application/pdf', 'Content-Length': buffer.length, 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(base + '.pdf')}`,
      });
      res.end(buffer);
      if (registrarActividad) { try { registrarActividad(req, 'pdf', `${base}.pdf (${paginas} p.)`); } catch { /* la actividad es opcional */ } }
    } catch (e) { sendError(res, e); }
    finally { activos--; }
  });
  return { router };
}
module.exports = createPdf;
