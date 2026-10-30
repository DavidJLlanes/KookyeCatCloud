'use strict';
// Favoritos y álbumes. Favoritos: una lista de rutas por usuario (.favorites.json). Álbumes:
// colecciones con nombre que apuntan a fotos por ruta sin moverlas (.albums/index.json).
// Fábrica como el resto: createAlbums({...}) → { router, core }. El router se monta en /api.
// enviarZip y resolveFor se piden al usarlos porque se definen más abajo en server.js.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ALBUMS_DIR = '.albums';
const ALBUM_LIMIT = 200;
const ALBUM_ITEMS_LIMIT = 2000;

function createAlbums({ express, auth, userRoot, resolveFor, enviarZip, sendError }) {
  const router = express.Router();

  /* ---------------- Favoritos ----------------
     Solo una lista de rutas por usuario: marcar y quitar tiene que ser instantáneo,
     así que no hace falta nada más elaborado que un JSON pequeño. */
  const favFile = (user) => path.join(userRoot(user), '.favorites.json');
  async function readFavs(user) {
    try { return JSON.parse(await fsp.readFile(favFile(user), 'utf8')); } catch { return []; }
  }
  async function writeFavs(user, list) {
    const file = favFile(user);
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(list));
    await fsp.rename(tmp, file);
  }
  router.get('/favorites', auth, async (req, res) => {
    try {
      const favs = await readFavs(req.user);
      const vivos = [];
      for (const rel of favs) {
        try { await fsp.access(resolveFor(req.user, rel)); vivos.push(rel); } catch { /* ya no existe: se depura */ }
      }
      if (vivos.length !== favs.length) await writeFavs(req.user, vivos);
      res.json({ items: vivos });
    } catch (err) { sendError(res, err); }
  });
  router.post('/favorites', auth, async (req, res) => {
    try {
      const rel = String(req.body?.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      resolveFor(req.user, rel);       // valida que es suya y que existe
      const favs = await readFavs(req.user);
      if (!favs.includes(rel)) favs.unshift(rel);
      await writeFavs(req.user, favs);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/favorites', auth, async (req, res) => {
    try {
      const rel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const favs = await readFavs(req.user);
      await writeFavs(req.user, favs.filter(f => f !== rel));
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  /* ---------------- Álbumes ----------------
     Colecciones con nombre que apuntan a fotos por ruta, sin moverlas: la misma
     foto puede estar en varios álbumes y seguir viviendo en una sola carpeta. */
  function albumsFile(user) {
    const dir = path.join(userRoot(user), ALBUMS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'index.json');
  }
  async function readAlbums(user) {
    try { return JSON.parse(await fsp.readFile(albumsFile(user), 'utf8')); } catch { return []; }
  }
  async function writeAlbums(user, list) {
    const file = albumsFile(user);
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
    await fsp.rename(tmp, file);
  }
  const nombreSeguro = (n) => String(n || 'album').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80) || 'album';
  /* Archivos de un álbum (las carpetas y lo que ya no existe se saltan). Dos fotos con el mismo nombre
     en carpetas distintas se distinguen con un sufijo, para el ZIP y para la galería pública. */
  async function albumArchivos(user, album) {
    const salida = [];
    const usados = new Set();
    for (const rel of album.items) {
      try {
        const abs = resolveFor(user, rel);
        const stat = await fsp.stat(abs);
        if (stat.isDirectory()) continue;
        const ext = path.extname(abs);
        const base = path.basename(abs, ext);
        let name = path.basename(abs), n = 2;
        while (usados.has(name.toLowerCase())) name = `${base} (${n++})${ext}`;
        usados.add(name.toLowerCase());
        salida.push({ rel, abs, name, size: stat.size, modified: stat.mtime });
      } catch { /* ya no se puede alcanzar */ }
    }
    return salida;
  }
  router.get('/albums/:id/zip', auth, async (req, res) => {
    try {
      const album = (await readAlbums(req.user)).find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'No encontrado' });
      const archivos = await albumArchivos(req.user, album);
      if (!archivos.length) return res.status(400).json({ error: 'El álbum no tiene archivos' });
      await enviarZip(res, archivos.map(a => ({ abs: a.abs, name: a.name, isDir: false })), `${nombreSeguro(album.title)}.zip`);
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
    }
  });
  router.get('/albums', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      res.json({ items: albums.map(a => ({ id: a.id, title: a.title, createdAt: a.createdAt, count: a.items.length })) });
    } catch (err) { sendError(res, err); }
  });
  router.post('/albums', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      if (albums.length >= ALBUM_LIMIT) return res.status(400).json({ error: `Máximo ${ALBUM_LIMIT} álbumes` });
      const album = {
        id: crypto.randomBytes(8).toString('hex'),
        title: String(req.body?.title || '').slice(0, 80) || 'Álbum sin título',
        createdAt: Date.now(),
        items: [].concat(req.body?.paths || []).map(r => String(r).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')),
      };
      for (const r of album.items) resolveFor(req.user, r);   // valida cada ruta antes de guardar
      albums.unshift(album);
      await writeAlbums(req.user, albums);
      res.json({ ok: true, album: { id: album.id, title: album.title, createdAt: album.createdAt, count: album.items.length } });
    } catch (err) { sendError(res, err); }
  });
  router.get('/albums/:id', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      const album = albums.find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'No encontrado' });
      const items = [];
      for (const rel of album.items) {
        try {
          const abs = resolveFor(req.user, rel);
          const stat = await fsp.stat(abs);
          items.push({ name: path.basename(abs), rel, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtime });
        } catch { /* se dejó de poder alcanzar: se ignora, no se borra del álbum por si vuelve */ }
      }
      res.json({ id: album.id, title: album.title, items });
    } catch (err) { sendError(res, err); }
  });
  router.put('/albums/:id', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      const album = albums.find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'No encontrado' });
      if (req.body?.title !== undefined) album.title = String(req.body.title).slice(0, 80) || album.title;
      await writeAlbums(req.user, albums);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/albums/:id', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      await writeAlbums(req.user, albums.filter(a => a.id !== req.params.id));
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });
  router.post('/albums/:id/items', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      const album = albums.find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'No encontrado' });
      const rutas = [].concat(req.body?.paths || []).map(r => String(r).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
      for (const r of rutas) {
        resolveFor(req.user, r);
        if (!album.items.includes(r)) album.items.push(r);
      }
      album.items = album.items.slice(0, ALBUM_ITEMS_LIMIT);
      await writeAlbums(req.user, albums);
      res.json({ ok: true, count: album.items.length });
    } catch (err) { sendError(res, err); }
  });
  router.delete('/albums/:id/items', auth, async (req, res) => {
    try {
      const albums = await readAlbums(req.user);
      const album = albums.find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'No encontrado' });
      const rel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      album.items = album.items.filter(i => i !== rel);
      await writeAlbums(req.user, albums);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  return { router, core: { readFavs, readAlbums, albumArchivos, nombreSeguro } };
}

module.exports = createAlbums;
