'use strict';
// Portapapeles compartido: un buzón por usuario donde se deja texto o archivos desde un dispositivo y se
// recogen desde otro (del móvil al PC y al revés), sin pasar por el correo ni por un chat.
//
// Es temporal a propósito: lo que no se fija caduca a las CLIP_TTL_HOURS horas. Lo que merezca guardarse
// se pasa a "Archivos" con un botón (el archivo se copia tal cual, sin tocar su resolución).
// Los cambios se avisan en directo al resto de dispositivos del usuario (evento SSE "clip").
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const MAX_MB = Number(process.env.CLIP_MAX_MB || 100);          // por archivo
const TOTAL_MB = Number(process.env.CLIP_TOTAL_MB || 500);      // todo lo que un usuario puede tener a la vez
const TTL_H = Number(process.env.CLIP_TTL_HOURS || 48);
const MAX_ITEMS = 100;
const TEXT_MAX = 200000;
const MAX_ARCHIVOS = 10;
const idOk = (id) => /^[a-f0-9]{16}$/.test(String(id));
const IMAGENES_SEGURAS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// Nombre legible del dispositivo a partir del User-Agent, por si el cliente no manda uno
function dispositivoDe(ua) {
  const u = String(ua || '');
  const so = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : '';
  const nav = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return [so, nav].filter(Boolean).join(' · ') || 'Otro dispositivo';
}

function createClip({ express, multer, userRoot, sendError, registrarActividad, events, resolveFor, freeName, alCambiarArchivos }) {
  const router = express.Router();
  const dir = (user, ...sub) => kccDir(userRoot(user), 'clip', ...sub);
  const indexFile = (user) => path.join(dir(user), 'index.json');
  const archivoDe = (user, id) => path.join(dir(user, 'f'), id);
  const VACIO = () => ({ items: [] });
  const mutar = (user, fn) => updateJson(indexFile(user), VACIO, fn);
  const lee = async (user) => {
    const d = await readJson(indexFile(user), VACIO);
    if (!Array.isArray(d.items)) d.items = [];
    return d;
  };
  const avisa = (user, req) => {
    const cid = req ? String(req.get('x-kcc-client') || '').slice(0, 40).replace(/[^\w-]/g, '') : '';
    try { events.notifica(user.username, 'clip', cid); } catch { /* sin aviso */ }
  };

  // Quita lo caducado (salvo lo fijado) y los archivos que lo acompañaban
  async function caduca(user) {
    const corte = Date.now() - TTL_H * 3600000;
    const fuera = [];
    await mutar(user, (d) => {
      const antes = d.items.length;
      d.items = d.items.filter(i => { if (!i.pinned && i.createdAt < corte) { fuera.push(i); return false; } return true; });
      if (d.items.length === antes) return { __abort: true };
    });
    for (const i of fuera) if (i.type === 'file') await fsp.rm(archivoDe(user, i.id), { force: true }).catch(() => {});
    return fuera.length;
  }

  const publico = (i) => ({ id: i.id, type: i.type, text: i.text, name: i.name, size: i.size, mime: i.mime, device: i.device,
    createdAt: i.createdAt, pinned: !!i.pinned, image: !!IMAGENES_SEGURAS[path.extname(i.name || '').toLowerCase()] });

  /* Añade texto y/o archivos ya subidos a disco (rutas temporales). Lo usan las rutas y el "Compartir" de Android. */
  async function agrega(user, { texto, archivos = [], device }) {
    const dispositivo = cleanStr(device, 40).trim() || 'Otro dispositivo';
    const nuevos = [];
    const t = String(texto || '').replace(/\r\n/g, '\n').trim();
    if (t) {
      if (t.length > TEXT_MAX) throw new HttpError(400, `Texto demasiado largo (máx. ${TEXT_MAX.toLocaleString('es-ES')} caracteres)`);
      nuevos.push({ id: newId(), type: 'text', text: t, device: dispositivo, createdAt: Date.now() });
    }
    const d0 = await lee(user);
    let usado = d0.items.reduce((a, i) => a + (i.size || 0), 0);
    for (const f of archivos) {
      if (usado + f.size > TOTAL_MB * 1048576) {
        await fsp.rm(f.path, { force: true }).catch(() => {});
        throw new HttpError(413, `El portapapeles está lleno (máx. ${TOTAL_MB} MB). Borra algo o espera a que caduque.`);
      }
      usado += f.size;
      const id = newId();
      await fsp.rename(f.path, archivoDe(user, id));
      nuevos.push({ id, type: 'file', name: cleanStr(f.name, 200) || 'archivo', size: f.size, mime: cleanStr(f.mime, 100),
        device: dispositivo, createdAt: Date.now() + nuevos.length });
    }
    if (!nuevos.length) throw new HttpError(400, 'No hay nada que enviar');
    const sobran = [];
    await mutar(user, (d) => {
      d.items = [...nuevos, ...d.items];
      // Tope de elementos: se descartan los más antiguos que no estén fijados
      while (d.items.length > MAX_ITEMS) {
        const k = [...d.items].reverse().findIndex(i => !i.pinned);
        if (k < 0) break;
        sobran.push(...d.items.splice(d.items.length - 1 - k, 1));
      }
    });
    for (const i of sobran) if (i.type === 'file') await fsp.rm(archivoDe(user, i.id), { force: true }).catch(() => {});
    return nuevos.map(publico);
  }

  /* ---------- Subida de archivos (a disco, nunca a memoria) ---------- */
  const subida = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => { try { cb(null, dir(req.user, 'tmp')); } catch (e) { cb(e); } },
      filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex')),
    }),
    limits: { fileSize: MAX_MB * 1048576, files: MAX_ARCHIVOS },
  });
  const sube = (req, res, next) => subida.array('files', MAX_ARCHIVOS)(req, res, (err) => {
    if (!err) return next();
    const e = err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, `Archivo demasiado grande (máx. ${MAX_MB} MB)`)
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? new HttpError(400, `Máximo ${MAX_ARCHIVOS} archivos por vez`) : err;
    sendError(res, e);
  });
  const deMulter = (files) => (files || []).map(f => ({
    path: f.path, size: f.size, mime: f.mimetype,
    name: Buffer.from(f.originalname, 'latin1').toString('utf8').replace(/[\\/]/g, '_'),
  }));
  const limpiaTemporales = (files) => Promise.all((files || []).map(f => fsp.rm(f.path, { force: true }).catch(() => {})));

  /* ---------- Rutas ---------- */
  router.get('/', async (req, res) => {
    try {
      await caduca(req.user);
      const d = await lee(req.user);
      const items = [...d.items].sort((a, b) => (!!b.pinned - !!a.pinned) || b.createdAt - a.createdAt);
      res.json({ items: items.map(publico), usedBytes: d.items.reduce((a, i) => a + (i.size || 0), 0),
        limits: { maxMb: MAX_MB, totalMb: TOTAL_MB, ttlHours: TTL_H, textMax: TEXT_MAX, files: MAX_ARCHIVOS } });
    } catch (err) { sendError(res, err); }
  });

  router.post('/text', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const device = (req.body && req.body.device) || dispositivoDe(req.get('user-agent'));
      const items = await agrega(req.user, { texto: req.body && req.body.text, device });
      avisa(req.user, req);
      res.json({ ok: true, items });
    } catch (err) { sendError(res, err); }
  });

  router.post('/files', sube, async (req, res) => {
    try {
      const device = (req.body && req.body.device) || dispositivoDe(req.get('user-agent'));
      const items = await agrega(req.user, { texto: req.body && req.body.text, archivos: deMulter(req.files), device });
      avisa(req.user, req);
      registrarActividad(req, 'portapapeles_envio', { n: items.length });
      res.json({ ok: true, items });
    } catch (err) { await limpiaTemporales(req.files); sendError(res, err); }
  });

  const buscar = async (user, id) => {
    if (!idOk(id)) throw new HttpError(404, 'No encontrado');
    const i = (await lee(user)).items.find(x => x.id === id);
    if (!i) throw new HttpError(404, 'No encontrado');
    return i;
  };

  router.get('/:id/file', async (req, res) => {
    try {
      const i = await buscar(req.user, req.params.id);
      if (i.type !== 'file') throw new HttpError(400, 'No es un archivo');
      const tipoImagen = IMAGENES_SEGURAS[path.extname(i.name).toLowerCase()];
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      if (req.query.inline === '1' && tipoImagen) {
        res.setHeader('Content-Type', tipoImagen);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.sendFile(archivoDe(req.user, i.id));
      }
      const ascii = i.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(i.name)}`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.sendFile(archivoDe(req.user, i.id));
    } catch (err) { if (!res.headersSent) sendError(res, err); }
  });

  router.put('/:id', express.json(), async (req, res) => {
    try {
      await buscar(req.user, req.params.id);
      await mutar(req.user, (d) => {
        const i = d.items.find(x => x.id === req.params.id);
        if (!i) throw new HttpError(404, 'No encontrado');
        if (req.body && req.body.pinned !== undefined) i.pinned = !!req.body.pinned;
      });
      avisa(req.user, req);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // Pasa el archivo del portapapeles a la nube (carpeta indicada, "Recibidos" por defecto), sin recomprimirlo
  router.post('/:id/save', express.json(), async (req, res) => {
    try {
      const i = await buscar(req.user, req.params.id);
      if (i.type !== 'file') throw new HttpError(400, 'Solo se pueden guardar archivos');
      const carpeta = String((req.body && req.body.path) || 'Recibidos').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const destino = resolveFor(req.user, carpeta);
      await fsp.mkdir(destino, { recursive: true });
      const abs = await freeName(destino, i.name);
      await fsp.copyFile(archivoDe(req.user, i.id), abs);
      if (alCambiarArchivos) alCambiarArchivos(req.user, destino, req);
      res.json({ ok: true, path: (carpeta ? carpeta + '/' : '') + path.basename(abs) });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const i = await buscar(req.user, req.params.id).catch(() => null);
      if (i) {
        await mutar(req.user, (d) => { d.items = d.items.filter(x => x.id !== i.id); });
        if (i.type === 'file') await fsp.rm(archivoDe(req.user, i.id), { force: true }).catch(() => {});
        avisa(req.user, req);
      }
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/', async (req, res) => {       // vaciar (lo fijado se queda)
    try {
      const fuera = [];
      await mutar(req.user, (d) => { d.items = d.items.filter(i => { if (i.pinned) return true; fuera.push(i); return false; }); });
      for (const i of fuera) if (i.type === 'file') await fsp.rm(archivoDe(req.user, i.id), { force: true }).catch(() => {});
      avisa(req.user, req);
      res.json({ ok: true, removed: fuera.length });
    } catch (err) { sendError(res, err); }
  });

  const core = { agrega, caduca, sube, deMulter, limpiaTemporales, dispositivoDe, avisa };
  return { router, core };
}

module.exports = createClip;
