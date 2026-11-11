'use strict';
/* ---------------- Analizador de espacio por carpeta ----------------
   Reparto de tamaños de lo que hay DENTRO de una carpeta (un nivel), con el
   tamaño de cada subcarpeta ya sumado recursivamente: sirve para encontrar
   qué está llenando el disco sin tener que adivinarlo por tipo de archivo.
   Dos cuidados que la primera versión no tenía y que en un almacén grande
   sí se notan: un tope de archivos examinados (si no, una carpeta enorme
   podía agotar los descriptores de archivo o tardar minutos) y concurrencia
   limitada al sumar las subcarpetas del nivel, en vez de lanzarlas todas
   a la vez con Promise.all. */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const isHidden = (name) => name.startsWith('.');   // lo interno (.trash, .kcc…) no se cuenta como carpeta del usuario

const DU_LIMIT = Number(process.env.DU_LIMIT || 200000);

async function tamanoDir(p, contador) {
  let total = 0, entradas;
  if (contador.cortado) return 0;
  try { entradas = await fsp.readdir(p, { withFileTypes: true }); } catch { return 0; }
  for (const e of entradas) {
    if (isHidden(e.name)) continue;
    if (++contador.n > DU_LIMIT) { contador.cortado = true; return total; }
    const full = path.join(p, e.name);
    try { total += e.isDirectory() ? await tamanoDir(full, contador) : (await fsp.stat(full)).size; }
    catch { /* desaparecido a mitad del recorrido */ }
  }
  return total;
}

function monta({ router, auth, userPath, sendError, datosApp }) {
  router.get('/api/diskusage', auth, async (req, res) => {
    try {
      const rel = req.query.path || '';
      const dir = userPath(req, rel);
      const entradas = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
      const contador = { n: 0, cortado: false };
      const items = [];
      // De cuatro en cuatro: sumar todas las subcarpetas del nivel a la vez agota
      // los descriptores de archivo en un almacén con muchas carpetas grandes.
      for (let i = 0; i < entradas.length; i += 4) {
        const grupo = entradas.slice(i, i + 4);
        const parciales = await Promise.all(grupo.map(async e => {
          const full = path.join(dir, e.name);
          try {
            const stat = await fsp.stat(full);
            const size = stat.isDirectory() ? await tamanoDir(full, contador) : stat.size;
            return { name: e.name, isDir: stat.isDirectory(), size };
          } catch { return null; }
        }));
        items.push(...parciales.filter(Boolean));
      }
      // En la raíz también salen los datos de la app (no son carpetas navegables)
      if (!rel) for (const d of await datosApp(req.user)) if (d.bytes) items.push({ name: d.nombre, isDir: false, app: true, size: d.bytes });
      items.sort((a, b) => b.size - a.size);
      res.json({
        path: rel, items, total: items.reduce((n, i) => n + i.size, 0),
        cortado: contador.cortado,
      });
    } catch (err) { sendError(res, err); }
  });
}

module.exports = { monta };
