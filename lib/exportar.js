'use strict';

// Exportación de datos en JSON: una sección del usuario (/api/export/:seccion) o toda la app comprimida (solo administración).
// Nunca se incluyen contraseñas, secretos, sesiones ni passkeys.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SECCIONES = {
  notas: { nombre: 'Notas', rutas: ['.notes'] },
  prompts: { nombre: 'Prompts', rutas: ['.kcc/prompts'] },
  contactos: { nombre: 'Contactos', rutas: ['.kcc/contacts.json'] },
  calendario: { nombre: 'Calendario', rutas: ['.kcc/calendar.json'] },
  etiquetas: { nombre: 'Etiquetas', rutas: ['.kcc/labels.json'] },
  valores: { nombre: 'Valores reutilizables', rutas: ['.kcc/valores.json'] },
  juegos: { nombre: 'Juegos', rutas: ['.kcc/games'] },
  bases: { nombre: 'Bases', rutas: ['.kcc/bases'] },
  codigo: { nombre: 'Código', rutas: ['.kcc/codigo'] },
  logros: { nombre: 'Logros y progreso', rutas: ['.kcc/game.json'] },
  portapapeles: { nombre: 'Portapapeles', rutas: ['.kcc/clip'] },
  archivos: { nombre: 'Favoritos y álbumes', rutas: ['.favorites.json', '.albums'] },
  compra: { nombre: 'Compra (compartida)', compartida: true },
};
const SALTAR = new Set(['images', 'covers', 'photos', 'f', 'versions', 'node_modules', 'users']);
const MAX_ARCHIVO = 25 * 1024 * 1024;

// Devuelve [{ruta relativa, abs}] con los .json de una ruta (archivo o carpeta, hasta 3 niveles)
async function recoge(base, rel, prof = 0, out = []) {
  const abs = path.join(base, rel);
  let st; try { st = await fsp.lstat(abs); } catch { return out; }
  if (st.isSymbolicLink()) return out;
  if (st.isFile()) { if (rel.endsWith('.json') && st.size <= MAX_ARCHIVO) out.push({ rel, abs }); return out; }
  if (!st.isDirectory() || prof > 3) return out;
  let nombres = []; try { nombres = await fsp.readdir(abs); } catch { return out; }
  for (const n of nombres.sort()) { if (SALTAR.has(n)) continue; await recoge(base, path.posix.join(rel.split(path.sep).join('/'), n), prof + 1, out); }
  return out;
}

function createExportar({ express, auth, adminOnly, userRoot, dataRoot, loadUsers, ZipArchive, registrarActividad, sendError }) {
  const router = express.Router();
  const archivosDe = async (user, def) => {
    if (def.compartida) return recoge(dataRoot, '.kcc/shopping/data.json');
    const base = userRoot(user); const out = [];
    for (const r of def.rutas) await recoge(base, r, 0, out);
    return out;
  };
  const leeJson = async (abs) => { try { return JSON.parse(await fsp.readFile(abs, 'utf8')); } catch { return null; } };

  router.get('/export', auth, (req, res) => {
    res.json({ secciones: Object.entries(SECCIONES).map(([id, d]) => ({ id, nombre: d.nombre })) });
  });

  router.get('/export/:seccion', auth, async (req, res) => {
    try {
      const def = SECCIONES[req.params.seccion]; if (!def) return res.status(404).json({ error: 'Sección desconocida' });
      const lista = await archivosDe(req.user, def);
      let salida;
      if (lista.length === 1) salida = await leeJson(lista[0].abs);
      else { salida = {}; for (const f of lista) salida[f.rel] = await leeJson(f.abs); }
      if (!lista.length) salida = {};
      const nombre = `kookyecatcloud-${req.params.seccion}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (registrarActividad) registrarActividad(req, 'exportar', { accion: 'seccion', nombre: req.params.seccion });
      res.send(JSON.stringify(salida, null, 2));
    } catch (e) { sendError(res, e); }
  });

  // Toda la app: los JSON de cada usuario y los compartidos, en un ZIP
  router.get('/admin/export-all', auth, adminOnly, async (req, res) => {
    try {
      const usuarios = loadUsers();
      const nombre = `kookyecatcloud-json-${new Date().toISOString().slice(0, 10)}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      const zip = new ZipArchive({ zlib: { level: 9 } });
      zip.on('warning', (err) => { if (err.code !== 'ENOENT') console.warn('zip', err.message); });
      zip.on('error', (err) => { console.warn('zip', err.message); res.destroy(); });
      zip.pipe(res);
      let total = 0;
      zip.append(JSON.stringify(usuarios.map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt || null })), null, 2), { name: 'app/usuarios.json' });
      for (const u of usuarios) {
        const user = { username: u.username, role: u.role };
        let visto = new Set();
        for (const [id, def] of Object.entries(SECCIONES)) {
          if (def.compartida) continue;
          for (const f of await archivosDe(user, def)) { if (visto.has(f.abs)) continue; visto.add(f.abs); zip.file(f.abs, { name: `usuarios/${u.username}/${f.rel}` }); total++; }
        }
      }
      for (const f of await archivosDe(null, SECCIONES.compra)) { zip.file(f.abs, { name: 'compartido/compra.json' }); total++; }
      zip.append(JSON.stringify({ app: 'KookyeCatCloud', exportado: new Date().toISOString(), usuarios: usuarios.length, archivos: total, nota: 'No incluye contraseñas, secretos, sesiones ni passkeys.' }, null, 2), { name: 'LEEME.json' });
      if (registrarActividad) registrarActividad(req, 'exportar', { accion: 'todo', archivos: total });
      await zip.finalize();
    } catch (e) { if (!res.headersSent) sendError(res, e); else res.destroy(); }
  });

  return { router, SECCIONES };
}

module.exports = createExportar;
