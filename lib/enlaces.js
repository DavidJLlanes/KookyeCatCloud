'use strict';
// Enlaces públicos, sin sesión para quien los recibe: de descarga (archivo, carpeta con galería o álbum,
// con contraseña y caducidad opcionales), de subida a una carpeta y de lectura de prompts. Los datos viven
// en uploadlinks.json (APP_DIR). Fábrica como el resto: createEnlaces({...}) → { router, core }.
// `router` va en /api; `paginas` va en la raíz (las páginas públicas son /s/:id, /p/:id y /u/:id).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const LINK_MAX_FILES = Number(process.env.LINK_MAX_FILES || 50);
const LINK_MAX_BYTES = Number(process.env.LINK_MAX_BYTES || 2 * 1024 * 1024 * 1024);
const LINK_IP_HOURLY = Number(process.env.LINK_IP_HOURLY || 200);

function createEnlaces({
  express, auth, jsonMedio, bcrypt, appDir, thumbsDir, loadUsers, sendError, registrarActividad,
  resolveFor, userPath, assertVisible, safeResolve, isHidden, esCompartida, exists,
  enviaPlantilla, enviarZip, cabeceraDescarga, makeUploader, MAX_UPLOAD_BYTES,
  albums, promptsCore, events,
  IMAGE_TYPES, HEIC_TYPES, VIDEO_TYPES, THUMBABLE, PREVIEW_TYPES, THUMB_SIZE, DISPLAY_MAX,
  sharp, ffmpeg, fotogramaVideo, convertirCache,
}) {
  const router = express.Router();
  const paginas = express.Router();   // /s/:id, /p/:id y /u/:id (en la raíz, no bajo /api)
  const LINKS_FILE = path.join(appDir, 'uploadlinks.json');

  function loadLinks() {
    try { return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8')); } catch { return []; }
  }
  function saveLinks(links) {
    const tmp = `${LINKS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(links, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, LINKS_FILE);
  }
  const linkExpired = (l) => !!l.expiresAt && Date.now() > l.expiresAt;
  // Los enlaces creados antes de que existieran los de descarga no llevan kind
  const linkKind = (l) => l.kind || 'upload';
  function linkPublic(l) {
    // Lo único que ve quien recibe el enlace: nunca la ruta ni el dueño
    return { id: l.id, label: l.label, expiresAt: l.expiresAt, files: l.files, maxFiles: LINK_MAX_FILES };
  }
  // El rol puede haber cambiado desde que se creó el enlace, así que se relee
  function ownerOf(link) {
    const u = loadUsers().find(u => u.username === link.owner);
    return u ? { username: u.username, role: u.role } : null;
  }

  // Tope por IP para el endpoint público de subida
  const publicHits = new Map();
  function publicAllowed(ip) {
    const now = Date.now();
    const e = publicHits.get(ip);
    if (!e || now > e.reset) { publicHits.set(ip, { n: 1, reset: now + 3600000 }); return true; }
    e.n++;
    return e.n <= LINK_IP_HOURLY;
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of publicHits) if (now > v.reset) publicHits.delete(k);
  }, 10 * 60 * 1000).unref();

  router.get('/uploadlinks', auth, (req, res) => {
    const soloDe = req.query.kind;
    const mine = loadLinks()
      .filter(l => l.owner === req.user.username)
      .filter(l => !soloDe || linkKind(l) === soloDe)
      .map(l => ({ ...l, kind: linkKind(l), expired: linkExpired(l), password: undefined,
                   passwordHash: undefined, protegido: !!l.passwordHash }));
    res.json(mine);
  });

  /* --- Enlaces de descarga: compartir un archivo o una carpeta --- */
  router.post('/sharelinks', auth, async (req, res) => {
    try {
      const { path: rel, label, days, password, album: albumId } = req.body || {};
      let abs = '', stat = null, albumTitulo = '';
      if (albumId) {
        // Un álbum se comparte como una galería plana con sus fotos, estén en la carpeta que estén
        const album = (await albums.readAlbums(req.user)).find(a => a.id === String(albumId));
        if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
        if (!(await albums.albumArchivos(req.user, album)).length) return res.status(400).json({ error: 'El álbum no tiene archivos que compartir' });
        albumTitulo = album.title;
      } else {
        if (esCompartida(rel)) return res.status(400).json({ error: 'Lo que otro usuario te ha compartido no se puede volver a compartir con un enlace' });
        abs = userPath(req, rel);
        stat = await fsp.stat(abs);
      }
      const d = Number(days);
      const links = loadLinks();
      const entrada = {
        id: crypto.randomBytes(16).toString('hex'),
        kind: 'share',
        owner: req.user.username,
        path: albumId ? '' : String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
        label: String(label || '').slice(0, 80) || (albumId ? albumTitulo : path.basename(abs)),
        isDir: albumId ? true : stat.isDirectory(),
        ...(albumId ? { album: String(albumId) } : {}),
        createdAt: Date.now(),
        expiresAt: d > 0 ? Date.now() + d * 86400000 : null,
        downloads: 0,
      };
      if (password) entrada.passwordHash = bcrypt.hashSync(String(password), 10);
      links.unshift(entrada);
      saveLinks(links);
      registrarActividad(req, 'enlace_compartido_creado', { path: entrada.path || `álbum ${entrada.label}`, isDir: entrada.isDir });
      res.json({ ok: true, link: { ...entrada, passwordHash: undefined, protegido: !!entrada.passwordHash } });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Datos públicos del enlace: nunca la ruta ni el dueño
  router.get('/public/share/:id', async (req, res) => {
    const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    const owner = ownerOf(link);
    if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

    let size = 0;
    try {
      if (link.album) {
        const album = (await albums.readAlbums(owner)).find(a => a.id === link.album);
        if (!album) throw new Error('álbum borrado');
      } else {
        const abs = resolveFor(owner, link.path);
        const stat = await fsp.stat(abs);
        size = stat.isDirectory() ? 0 : stat.size;
      }
    } catch {
      return res.status(410).json({ error: link.album ? 'El álbum ya no está disponible' : 'El archivo ya no está disponible' });
    }
    res.json({
      id: link.id, label: link.label, isDir: link.isDir, album: !!link.album, size,
      expiresAt: link.expiresAt, downloads: link.downloads, protegido: !!link.passwordHash,
    });
  });

  router.get('/public/share/:id/download', async (req, res) => {
    try {
      if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas descargas desde tu conexión' });
      const links = loadLinks();
      const link = links.find(l => l.id === req.params.id && linkKind(l) === 'share');
      if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
      if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
      if (link.passwordHash && !bcrypt.compareSync(String(req.query.pw || ''), link.passwordHash)) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
      }
      const owner = ownerOf(link);
      if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

      if (link.album) {
        const album = (await albums.readAlbums(owner)).find(a => a.id === link.album);
        if (!album) return res.status(410).json({ error: 'El álbum ya no está disponible' });
        const archivos = await albums.albumArchivos(owner, album);
        if (!archivos.length) return res.status(410).json({ error: 'El álbum está vacío' });
        link.downloads = (link.downloads || 0) + 1;
        link.lastDownloadAt = Date.now();
        saveLinks(links);
        return enviarZip(res, archivos.map(a => ({ abs: a.abs, name: a.name, isDir: false })), `${albums.nombreSeguro(album.title)}.zip`);
      }
      const abs = resolveFor(owner, link.path);
      const stat = await fsp.stat(abs);

      link.downloads = (link.downloads || 0) + 1;
      link.lastDownloadAt = Date.now();
      saveLinks(links);

      if (stat.isDirectory()) {
        return enviarZip(res, [{ abs, name: path.basename(abs), isDir: true }], `${path.basename(abs)}.zip`);
      }
      cabeceraDescarga(res, path.basename(abs));
      res.sendFile(abs, { headers: { 'Content-Type': 'application/octet-stream' } });
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
    }
  });

  /* --- Galería pública de una carpeta compartida ---
     Antes, compartir una carpeta solo ofrecía el ZIP entero. Esto deja navegarla
     y ver las fotos igual que en la propia app, sin sesión y sin salir de la ruta
     que se compartió: dentroDeLink() nunca deja subir por encima de link.path. */
  function dentroDeLink(owner, link, subrel) {
    const base = resolveFor(owner, link.path);           // ya es de fiar: es el dueño real del enlace
    const sub = String(subrel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    assertVisible(sub);
    return safeResolve(base, sub);
  }
  /* Ruta real de lo que se pide en un enlace público. En un enlace de álbum "sub" es el nombre de una foto
     del álbum (nunca una ruta): se busca entre sus archivos, así no se puede salir de lo compartido. */
  async function rutaPublica(owner, link, subrel) {
    if (!link.album) return dentroDeLink(owner, link, subrel);
    const album = (await albums.readAlbums(owner)).find(a => a.id === link.album);
    if (!album) throw new Error('álbum borrado');
    const nombre = String(subrel || '');
    const a = (await albums.albumArchivos(owner, album)).find(x => x.name === nombre);
    if (!a) throw new Error('no está en el álbum');
    return a.abs;
  }
  function claveCompartida(link, req) {
    return !link.passwordHash || bcrypt.compareSync(String(req.query.pw || ''), link.passwordHash);
  }
  function esMediaPublico(name) {
    const ext = path.extname(name).toLowerCase();
    return !!(IMAGE_TYPES[ext] || HEIC_TYPES[ext] || VIDEO_TYPES[ext]);
  }

  router.get('/public/share/:id/list', async (req, res) => {
    try {
      const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
      if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
      if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
      if (!link.isDir) return res.status(400).json({ error: 'Este enlace no es una carpeta' });
      if (!claveCompartida(link, req)) return res.status(401).json({ error: 'Contraseña incorrecta' });
      const owner = ownerOf(link);
      if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

      if (link.album) {
        if (req.query.sub) return res.status(404).json({ error: 'No encontrado' });
        const album = (await albums.readAlbums(owner)).find(a => a.id === link.album);
        if (!album) return res.status(410).json({ error: 'El álbum ya no está disponible' });
        const archivos = await albums.albumArchivos(owner, album);
        return res.json({ items: archivos.map(a => ({ name: a.name, isDir: false, size: a.size, modified: a.modified,
          viewable: esMediaPublico(a.name) })) });
      }
      const dir = dentroDeLink(owner, link, req.query.sub || '');
      const entradas = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
      const items = (await Promise.all(entradas.map(async e => {
        try {
          const stat = await fsp.stat(path.join(dir, e.name));
          return { name: e.name, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtime,
                   viewable: !stat.isDirectory() && esMediaPublico(e.name) };
        } catch { return null; }
      }))).filter(Boolean).sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'es'));
      res.json({ items });
    } catch (err) { sendError(res, err); }
  });

  router.get('/public/share/:id/thumb', async (req, res) => {
    try {
      const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
      if (!link || linkExpired(link) || !link.isDir || !claveCompartida(link, req)) return res.status(404).end();
      const owner = ownerOf(link);
      if (!owner) return res.status(404).end();
      const file = await rutaPublica(owner, link, req.query.sub || '');
      const ext = path.extname(file).toLowerCase();
      const esVideo = !!VIDEO_TYPES[ext];
      const tipo = THUMBABLE[ext];
      if (!tipo && !esVideo) return res.status(415).end();
      if (esVideo && !ffmpeg) return res.status(415).end();

      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=86400');
      if (!esVideo && !sharp) return res.sendFile(file, { headers: { 'Content-Type': tipo } });

      const stat = await fsp.stat(file);
      const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|${THUMB_SIZE}|thumb`).digest('hex');
      const cached = path.join(thumbsDir, `${key}.webp`);
      if (!await exists(cached)) {
        const tmp = `${cached}.${process.pid}.tmp`;
        if (esVideo) {
          const tmpImg = `${tmp}.webp`;
          await fotogramaVideo(file, tmpImg);
          await fsp.rename(tmpImg, cached);
        } else {
          const buf = await sharp(file, { failOn: 'none' }).rotate()
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 78 }).toBuffer();
          await fsp.writeFile(tmp, buf);
          await fsp.rename(tmp, cached);
        }
      }
      res.sendFile(cached, { headers: { 'Content-Type': 'image/webp' } });
    } catch { res.status(404).end(); }
  });

  router.get('/public/share/:id/view', async (req, res) => {
    try {
      const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
      if (!link || linkExpired(link) || !link.isDir || !claveCompartida(link, req)) return res.status(404).end();
      const owner = ownerOf(link);
      if (!owner) return res.status(404).end();
      const file = await rutaPublica(owner, link, req.query.sub || '');
      const ext = path.extname(file).toLowerCase();
      const type = PREVIEW_TYPES[ext];
      if (!type || ext === '.pdf') return res.status(415).end();   // la galería pública es solo fotos y vídeos

      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      if (HEIC_TYPES[ext]) {
        if (!sharp) return res.status(415).end();
        const stat = await fsp.stat(file);
        const conv = await convertirCache(file, stat, DISPLAY_MAX, 'view');
        return res.sendFile(conv, { headers: { 'Content-Type': 'image/webp' } });
      }
      res.sendFile(file, { headers: { 'Content-Type': type } });
    } catch { res.status(404).end(); }
  });

  // Descarga de UN archivo dentro de la galería, sin tener que bajarte el ZIP entero
  router.get('/public/share/:id/file', async (req, res) => {
    try {
      if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas descargas desde tu conexión' });
      const links = loadLinks();
      const link = links.find(l => l.id === req.params.id && linkKind(l) === 'share');
      if (!link || linkExpired(link) || !link.isDir) return res.status(404).end();
      if (!claveCompartida(link, req)) return res.status(401).end();
      const owner = ownerOf(link);
      if (!owner) return res.status(404).end();
      const file = await rutaPublica(owner, link, req.query.sub || '');
      const stat = await fsp.stat(file);
      if (stat.isDirectory()) return res.status(400).end();
      link.downloads = (link.downloads || 0) + 1;
      saveLinks(links);
      cabeceraDescarga(res, path.basename(file));
      res.sendFile(file, { headers: { 'Content-Type': 'application/octet-stream' } });
    } catch { res.status(404).end(); }
  });

  // Página pública del enlace de descarga
  paginas.get('/s/:id', (req, res) => {
    enviaPlantilla(res, 'share.html', 'html');
  });

  /* --- Enlace público de solo lectura a uno o varios prompts (con los fragmentos ya sustituidos) --- */
  router.post('/prompts-share', auth, jsonMedio, async (req, res) => {
    try {
      const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: 'Elige al menos un prompt' });
      const lista = await promptsCore.paraCompartir(req.user, ids);
      if (!lista.length) return res.status(404).json({ error: 'Los prompts no existen' });
      const d = Number(req.body.days);
      const entrada = {
        id: crypto.randomBytes(16).toString('hex'), kind: 'prompts', owner: req.user.username,
        label: String(req.body.title || '').slice(0, 80) || (lista.length === 1 ? lista[0].title : `${lista.length} prompts`),
        ids: lista.map(x => x.id), createdAt: Date.now(), expiresAt: d > 0 ? Date.now() + d * 86400000 : null, views: 0,
      };
      const links = loadLinks(); links.unshift(entrada); saveLinks(links);
      registrarActividad(req, 'prompts_compartidos', { n: lista.length });
      res.json({ ok: true, link: { id: entrada.id, label: entrada.label, expiresAt: entrada.expiresAt, count: lista.length } });
    } catch (err) { sendError(res, err); }
  });
  router.get('/public/prompts/:id', async (req, res) => {
    try {
      if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas peticiones desde tu conexión' });
      const links = loadLinks();
      const link = links.find(l => l.id === req.params.id && l.kind === 'prompts');
      if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
      if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
      const owner = ownerOf(link);
      if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });
      const prompts = await promptsCore.paraCompartir(owner, link.ids);
      if (!prompts.length) return res.status(410).json({ error: 'Estos prompts ya no están disponibles' });
      link.views = (link.views || 0) + 1; saveLinks(links);
      res.json({ label: link.label, expiresAt: link.expiresAt, prompts: prompts.map(({ id, ...resto }) => resto) });
    } catch (err) { sendError(res, err); }
  });
  paginas.get('/p/:id', (req, res) => {
    enviaPlantilla(res, 'prompts-share.html', 'html');
  });

  router.post('/uploadlinks', auth, (req, res) => {
    try {
      const { path: rel, label, days } = req.body || {};
      if (esCompartida(rel || '')) return res.status(400).json({ error: 'No se puede crear un enlace de subida en una carpeta compartida contigo' });
      const dir = userPath(req, rel || '');           // valida que la ruta es suya y visible
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return res.status(400).json({ error: 'La carpeta de destino no existe' });
      }
      const d = Number(days);
      const links = loadLinks();
      links.unshift({
        id: crypto.randomBytes(16).toString('hex'),
        owner: req.user.username,
        path: String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
        label: String(label || '').slice(0, 80) || 'Envío de archivos',
        createdAt: Date.now(),
        expiresAt: d > 0 ? Date.now() + d * 86400000 : null,
        files: 0,
        bytes: 0,
      });
      saveLinks(links);
      res.json({ ok: true, link: links[0] });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/uploadlinks/:id', auth, (req, res) => {
    const links = loadLinks();
    const link = links.find(l => l.id === req.params.id);
    if (!link || link.owner !== req.user.username) return res.status(404).json({ error: 'No encontrado' });
    saveLinks(links.filter(l => l.id !== link.id));
    res.json({ ok: true });
  });

  /* --- Enlaces de subida: uso público, sin sesión --- */
  router.get('/public/link/:id', (req, res) => {
    const link = loadLinks().find(l => l.id === req.params.id);
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    if (!ownerOf(link)) return res.status(410).json({ error: 'Este enlace ya no está disponible' });
    res.json(linkPublic(link));
  });

  router.post('/public/link/:id/upload', (req, res) => {
    if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas subidas desde tu conexión. Inténtalo más tarde.' });

    const links = loadLinks();
    const link = links.find(l => l.id === req.params.id);
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    if (link.files >= LINK_MAX_FILES) return res.status(429).json({ error: 'Este enlace ha alcanzado su límite de archivos' });
    if (link.bytes >= LINK_MAX_BYTES) return res.status(429).json({ error: 'Este enlace ha alcanzado su límite de tamaño' });

    const owner = ownerOf(link);
    if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

    const uploader = makeUploader(
      () => resolveFor(owner, link.path),
      { fileSize: MAX_UPLOAD_BYTES, files: LINK_MAX_FILES }
    );
    uploader.array('files')(req, res, err => {
      if (err) return res.status(400).json({ error: err.message });
      const subidos = req.files || [];
      if (!subidos.length) return res.status(400).json({ error: 'No has adjuntado ningún archivo' });
      // Se releen los enlaces por si cambiaron durante la subida
      const actuales = loadLinks();
      const actual = actuales.find(l => l.id === link.id);
      if (actual) {
        actual.files += subidos.length;
        actual.bytes += subidos.reduce((n, f) => n + f.size, 0);
        actual.lastUploadAt = Date.now();
        saveLinks(actuales);
      }
      try { events.cambio(resolveFor(owner, link.path)); } catch { /* sin aviso */ }
      res.json({ ok: true, uploaded: subidos.length });
    });
  });

  // Página pública del enlace
  paginas.get('/u/:id', (req, res) => {
    enviaPlantilla(res, 'upload.html', 'html');
  });

  return { router, paginas, core: { loadLinks } };
}

module.exports = createEnlaces;
