'use strict';
/* ---------------- Buscador de duplicados ----------------
   Primero se agrupa por tamaño (gratis, ya se recorre el árbol) y solo se
   calcula el hash de los que comparten tamaño con otro: es lo que hace viable
   pasarlo por una nube con miles de archivos sin tardar minutos. */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const DUP_LIMIT = Number(process.env.DUP_LIMIT || 20000);   // tope de archivos a examinar por si el árbol es enorme

function monta({ router, auth, userRoot, isHidden, sendError }) {
  router.get('/api/duplicates', auth, async (req, res) => {
    try {
      const raiz = userRoot(req.user);
      const porTamano = new Map();
      let escaneados = 0, cortado = false;

      async function recorrer(dir, rel) {
        if (cortado) return;
        let entradas;
        try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
          if (cortado) return;
          if (isHidden(e.name)) continue;
          const full = path.join(dir, e.name);
          const hijoRel = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { await recorrer(full, hijoRel); continue; }
          if (++escaneados > DUP_LIMIT) { cortado = true; return; }
          try {
            const stat = await fsp.stat(full);
            if (!stat.size) continue;
            if (!porTamano.has(stat.size)) porTamano.set(stat.size, []);
            porTamano.get(stat.size).push({ abs: full, rel: hijoRel, size: stat.size, modified: stat.mtime });
          } catch { /* desaparecido a mitad del recorrido */ }
        }
      }
      await recorrer(raiz, '');

      const candidatos = [...porTamano.values()].filter(g => g.length > 1).flat();
      const porHash = new Map();
      for (const f of candidatos) {
        try {
          const hash = await new Promise((resolve, reject) => {
            const h = crypto.createHash('sha1');
            fs.createReadStream(f.abs).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
          });
          if (!porHash.has(hash)) porHash.set(hash, []);
          porHash.get(hash).push({ rel: f.rel, name: path.basename(f.abs), size: f.size, modified: f.modified });
        } catch { /* archivo ilegible: se ignora en vez de tumbar todo el escaneo */ }
      }
      const grupos = [...porHash.values()].filter(g => g.length > 1)
        .sort((a, b) => (b[0].size * b.length) - (a[0].size * a.length));
      const espacioRecuperable = grupos.reduce((n, g) => n + g[0].size * (g.length - 1), 0);
      res.json({ grupos, espacioRecuperable, escaneados, cortado });
    } catch (err) { sendError(res, err); }
  });
}

module.exports = { monta };
