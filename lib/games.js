'use strict';

// Videojuegos: colección personal (próximos, deseados, pendientes, jugando, jugados, abandonados).
// Cada usuario tiene <raíz>/.kcc/games/data.json y las carátulas en <raíz>/.kcc/games/covers/<id>.webp.
// La búsqueda automática usa RAWG (https://rawg.io/apidocs) si hay RAWG_KEY; sin clave todo funciona a mano.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const ESTADOS = ['proximo', 'deseado', 'pendiente', 'jugando', 'jugado', 'abandonado'];
const FORMATOS = ['', 'fisico', 'digital'];
const MAX_JUEGOS = 20000;
const MAX_SESIONES = 400;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RAWG = 'https://api.rawg.io/api';

const hoy = () => new Date().toISOString().slice(0, 10);
const num = (v, min, max, dec = 1) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dec;
  return Math.round(Math.max(min, Math.min(max, n)) * f) / f;
};
const dia = (v) => (RE_DIA.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : '');
const lista = (v, max, len) => [...new Set((Array.isArray(v) ? v : []).map(x => cleanStr(x, len).trim()).filter(Boolean))].slice(0, max);
const urlOk = (v) => { const s = cleanStr(v, 300).trim(); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; };

// Normaliza un juego; `prev` conserva lo que no venga en el cuerpo (actualización parcial)
function limpia(b, prev) {
  const p = prev || {};
  const tiene = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const g = (k, f) => (tiene(k) ? f(b[k]) : p[k]);
  const o = {
    id: p.id,
    title: tiene('title') ? cleanStr(b.title, 160).trim() : p.title || '',
    status: tiene('status') ? (ESTADOS.includes(b.status) ? b.status : p.status || 'pendiente') : p.status || 'pendiente',
    platforms: g('platforms', v => lista(v, 12, 40)) || [],
    genres: g('genres', v => lista(v, 10, 40)) || [],
    developer: g('developer', v => cleanStr(v, 120).trim()) || '',
    series: g('series', v => cleanStr(v, 120).trim()) || '',
    released: g('released', dia) || '',
    rating: g('rating', v => num(v, 0, 10, 1)) ?? null,
    review: g('review', v => cleanStr(v, 4000)) || '',
    pros: g('pros', v => cleanStr(v, 500)) || '',
    cons: g('cons', v => cleanStr(v, 500)) || '',
    tags: g('tags', v => lista(v, 20, 30)) || [],
    hours: g('hours', v => num(v, 0, 100000, 1)) ?? 0,
    started: g('started', dia) || '',
    finished: g('finished', dia) || '',
    percent: g('percent', v => num(v, 0, 100, 0)) ?? 0,
    replays: g('replays', v => num(v, 0, 999, 0)) ?? 0,
    priority: g('priority', v => num(v, 0, 3, 0)) ?? 0,
    format: tiene('format') ? (FORMATOS.includes(b.format) ? b.format : '') : p.format || '',
    store: g('store', v => cleanStr(v, 60).trim()) || '',
    price: g('price', v => num(v, 0, 100000, 2)) ?? null,
    targetPrice: g('targetPrice', v => num(v, 0, 100000, 2)) ?? null,
    lentTo: g('lentTo', v => cleanStr(v, 80).trim()) || '',
    url: g('url', urlOk) || '',
    rawgId: g('rawgId', v => num(v, 1, 1e9, 0)) ?? null,
    cover: !!p.cover,
    coverV: p.coverV || 0,
    sessions: Array.isArray(p.sessions) ? p.sessions : [],
    cal: p.cal || null,
    createdAt: p.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (!o.title) throw new HttpError(400, 'Escribe el título del juego');
  // Al cambiar el estado se rellenan las fechas que faltan
  if (o.status === 'jugando' && !o.started) o.started = hoy();
  if (o.status === 'jugado' && !o.finished) o.finished = hoy();
  return o;
}

function resumen(items) {
  const plat = new Set();
  let jugados = 0, horas = 0, resenas = 0, deseos = 0, completos = 0, retro = false, sesion = 0;
  for (const g of items) {
    if (g.status === 'jugado') jugados++;
    if (g.status === 'deseado') deseos++;
    horas += g.hours || 0;
    if ((g.review || '').trim().length >= 10) resenas++;
    if ((g.percent || 0) >= 100) completos++;
    (g.platforms || []).forEach(p => plat.add(p.toLowerCase()));
    for (const x of g.sessions || []) if (x.h > sesion) sesion = x.h;
    if (g.released && g.released < '2000-01-01') retro = true;
  }
  return { juegos: items.length, j_jugados: jugados, j_horas: Math.floor(horas), j_resenas: resenas, j_deseos: deseos, j_completos: completos, j_plataformas: plat.size, j_retro: retro ? 1 : 0, j_sesion: sesion };
}

const csvCelda = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // evita que una hoja de cálculo ejecute fórmulas
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function createGames({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar }) {
  const router = express.Router();
  const dir = (user) => kccDir(userRoot(user), 'games');
  const archivo = (user) => path.join(dir(user), 'data.json');
  const portadas = (user) => { const d = path.join(dir(user), 'covers'); fs.mkdirSync(d, { recursive: true }); return d; };
  const vacio = () => ({ items: [] });
  const validId = (id) => /^[a-f0-9]{16}$/.test(String(id));
  const json = express.json({ limit: '64kb' });
  const jsonGrande = express.json({ limit: '6mb' });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  const leer = async (user) => { const d = await readJson(archivo(user), vacio); d.items = Array.isArray(d.items) ? d.items : []; return d; };
  const mutar = (user, fn) => updateJson(archivo(user), vacio, (d) => { d.items = Array.isArray(d.items) ? d.items : []; return fn(d); });
  const publico = (g) => g;

  async function guardaPortada(user, id, buf) {
    if (!sharp) throw new HttpError(501, 'El servidor no tiene sharp para procesar imágenes');
    const meta = await sharp(buf, { failOn: 'error', limitInputPixels: 40000000 }).metadata();
    if (!/^(jpeg|png|webp|avif|heif|tiff|gif)$/.test(meta.format || '')) throw new HttpError(415, 'Formato de imagen no compatible');
    const out = await sharp(buf, { failOn: 'error', limitInputPixels: 40000000 }).rotate()
      .resize(720, 720, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
    await fsp.writeFile(path.join(portadas(user), `${id}.webp`), out);
  }

  // ---------- RAWG ----------
  const claveRawg = () => String(process.env.RAWG_KEY || '').trim();
  async function rawg(ruta, params = {}) {
    const key = claveRawg();
    if (!key) throw new HttpError(501, 'Este servidor no tiene RAWG_KEY configurada: añade los juegos a mano o pon la clave en .env');
    const u = new URL(`${RAWG}${ruta}`);
    u.searchParams.set('key', key);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    let r;
    try { r = await fetch(u, { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'KookyeCatCloud (uso personal)' } }); }
    catch { throw new HttpError(502, 'No se pudo contactar con RAWG'); }
    if (r.status === 401 || r.status === 403) throw new HttpError(502, 'RAWG ha rechazado la clave (RAWG_KEY)');
    if (r.status === 429) throw new HttpError(429, 'RAWG ha limitado las peticiones: prueba más tarde');
    if (!r.ok) throw new HttpError(502, `RAWG respondió con el error ${r.status}`);
    return r.json();
  }
  async function descargaImagen(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'media.rawg.io') return null;   // solo imágenes de RAWG
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length && buf.length <= 15 * 1024 * 1024 ? buf : null;
    } catch { return null; }
  }
  const nombres = (arr, k) => (Array.isArray(arr) ? arr.map(x => (k ? x && x[k] && x[k].name : x && x.name)).filter(Boolean) : []);

  // ---------- Rutas ----------
  router.get('/', async (req, res) => {
    try { const d = await leer(req.user); res.json({ items: d.items.map(publico), rawg: !!claveRawg() }); }
    catch (e) { sendError(res, e); }
  });

  router.get('/search', async (req, res) => {
    try {
      const q = cleanStr(req.query.q, 100).trim();
      if (q.length < 2) return res.json({ items: [] });
      const d = await rawg('/games', { search: q, page_size: 8, search_precise: 'false' });
      res.json({
        items: (d.results || []).map(g => ({
          rawgId: g.id, title: g.name, released: g.released || '', image: g.background_image || '',
          platforms: nombres(g.platforms, 'platform'), genres: nombres(g.genres), metacritic: g.metacritic || null,
        })),
      });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      const b = req.body || {};
      const g = await mutar(req.user, (d) => {
        if (d.items.length >= MAX_JUEGOS) throw new HttpError(400, 'Has llegado al máximo de juegos');
        const nuevo = limpia(b, null); nuevo.id = newId();
        d.items.push(nuevo);
        return nuevo;
      });
      if (b.calendar && b.calendar.date) { await calendar.sincronizaOrigen(req.user, 'game', g.id, g.title, b.calendar); g.cal = { date: b.calendar.date, time: b.calendar.time || '' }; await mutar(req.user, (d) => { const x = d.items.find(i => i.id === g.id); if (x) x.cal = g.cal; }); }
      res.json(g);
    } catch (e) { sendError(res, e); }
  });

  // Alta desde RAWG: trae ficha y carátula
  router.post('/from-rawg', json, async (req, res) => {
    try {
      const id = num(req.body && req.body.rawgId, 1, 1e9, 0);
      if (!id) throw new HttpError(400, 'Falta el juego de RAWG');
      const ya = (await leer(req.user)).items.find(i => i.rawgId === id);
      if (ya) throw new HttpError(409, `Ya tienes «${ya.title}» en tu colección`);
      const d = await rawg(`/games/${id}`);
      const estado = ESTADOS.includes(req.body.status) ? req.body.status : (d.released && d.released > hoy() ? 'proximo' : 'pendiente');
      const base = {
        title: d.name, status: estado, platforms: nombres(d.platforms, 'platform'), genres: nombres(d.genres),
        developer: (nombres(d.developers)[0]) || '', released: d.released || '', rawgId: id, url: d.website || '',
      };
      const g = await mutar(req.user, (data) => {
        if (data.items.length >= MAX_JUEGOS) throw new HttpError(400, 'Has llegado al máximo de juegos');
        const nuevo = limpia(base, null); nuevo.id = newId();
        data.items.push(nuevo);
        return nuevo;
      });
      const img = await descargaImagen(d.background_image);
      if (img) {
        try { await guardaPortada(req.user, g.id, img); await mutar(req.user, (data) => { const x = data.items.find(i => i.id === g.id); if (x) { x.cover = true; x.coverV = Date.now(); g.cover = true; g.coverV = x.coverV; } }); } catch { /* sin carátula, el juego se queda igual */ }
      }
      res.json(g);
    } catch (e) { sendError(res, e); }
  });

  router.put('/:id', json, async (req, res) => {
    try {
      if (!validId(req.params.id)) throw new HttpError(404, 'No existe');
      const b = req.body || {};
      let renombrado = false;
      const g = await mutar(req.user, (d) => {
        const i = d.items.findIndex(x => x.id === req.params.id);
        if (i < 0) throw new HttpError(404, 'No existe');
        const prev = d.items[i];
        const nuevo = limpia(b, prev);
        renombrado = nuevo.title !== prev.title;
        d.items[i] = nuevo;
        return nuevo;
      });
      if (b.calendar !== undefined) {
        const cal = b.calendar && b.calendar.date ? { date: b.calendar.date, time: b.calendar.time || '', calendarId: b.calendar.calendarId } : null;
        await calendar.sincronizaOrigen(req.user, 'game', g.id, g.title, cal);
        g.cal = cal ? { date: cal.date, time: cal.time } : null;
        await mutar(req.user, (d) => { const x = d.items.find(i => i.id === g.id); if (x) x.cal = g.cal; });
      } else if (renombrado && g.cal) await calendar.renombraOrigen(req.user, 'game', g.id, g.title);
      res.json(g);
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/sessions', json, async (req, res) => {
    try {
      if (!validId(req.params.id)) throw new HttpError(404, 'No existe');
      const h = num(req.body && req.body.hours, 0.1, 48, 1);
      if (!h) throw new HttpError(400, 'Indica las horas de la sesión');
      const fecha = dia(req.body.date) || hoy();
      const g = await mutar(req.user, (d) => {
        const x = d.items.find(i => i.id === req.params.id);
        if (!x) throw new HttpError(404, 'No existe');
        x.sessions = [...(x.sessions || []), { d: fecha, h }].slice(-MAX_SESIONES);
        x.hours = Math.round(((x.hours || 0) + h) * 10) / 10;
        if (x.status === 'pendiente' || x.status === 'deseado' || x.status === 'proximo') x.status = 'jugando';
        if (!x.started) x.started = fecha;
        x.updatedAt = Date.now();
        return x;
      });
      res.json(g);
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!validId(req.params.id)) throw new HttpError(404, 'No existe');
      await mutar(req.user, (d) => {
        const i = d.items.findIndex(x => x.id === req.params.id);
        if (i < 0) throw new HttpError(404, 'No existe');
        d.items.splice(i, 1);
      });
      await fsp.rm(path.join(portadas(req.user), `${req.params.id}.webp`), { force: true });
      await calendar.quitaOrigen(req.user, 'game', req.params.id);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/cover', async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).end();
      const f = path.join(portadas(req.user), `${req.params.id}.webp`);
      await fsp.access(f);
      res.set('Cache-Control', 'private, max-age=86400');
      res.type('image/webp').sendFile(f);
    } catch { res.status(404).end(); }
  });

  router.put('/:id/cover', (req, res) => {
    upload.single('image')(req, res, async (err) => {
      try {
        if (err) throw new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'La imagen es demasiado grande' : 'No se pudo leer la imagen');
        if (!validId(req.params.id)) throw new HttpError(404, 'No existe');
        if (!req.file) throw new HttpError(400, 'Selecciona una imagen');
        if (!(await leer(req.user)).items.some(i => i.id === req.params.id)) throw new HttpError(404, 'No existe');
        await guardaPortada(req.user, req.params.id, req.file.buffer);
        const g = await mutar(req.user, (d) => { const x = d.items.find(i => i.id === req.params.id); if (!x) throw new HttpError(404, 'No existe'); x.cover = true; x.coverV = Date.now(); return x; });
        res.json(g);
      } catch (e) { sendError(res, e instanceof HttpError ? e : new HttpError(400, 'No se pudo procesar la imagen')); }
    });
  });

  router.delete('/:id/cover', async (req, res) => {
    try {
      if (!validId(req.params.id)) throw new HttpError(404, 'No existe');
      await fsp.rm(path.join(portadas(req.user), `${req.params.id}.webp`), { force: true });
      const g = await mutar(req.user, (d) => { const x = d.items.find(i => i.id === req.params.id); if (!x) throw new HttpError(404, 'No existe'); x.cover = false; return x; });
      res.json(g);
    } catch (e) { sendError(res, e); }
  });

  router.get('/export', async (req, res) => {
    try {
      const d = await leer(req.user);
      if (req.query.format === 'csv') {
        const cols = [['title', 'Título'], ['status', 'Estado'], ['platforms', 'Plataformas'], ['genres', 'Géneros'], ['developer', 'Desarrolladora'], ['series', 'Saga'], ['released', 'Lanzamiento'],
          ['rating', 'Nota'], ['hours', 'Horas'], ['percent', '% completado'], ['replays', 'Rejugado'], ['started', 'Inicio'], ['finished', 'Fin'], ['format', 'Formato'], ['store', 'Tienda'],
          ['price', 'Precio'], ['targetPrice', 'Precio objetivo'], ['priority', 'Prioridad'], ['lentTo', 'Prestado a'], ['tags', 'Etiquetas'], ['review', 'Reseña']];
        const csv = '﻿' + [cols.map(c => c[1]).join(';'), ...d.items.map(g => cols.map(c => csvCelda(g[c[0]])).join(';'))].join('\r\n');
        res.set('Content-Disposition', 'attachment; filename="juegos.csv"').type('text/csv; charset=utf-8').send(csv);
      } else {
        res.set('Content-Disposition', 'attachment; filename="juegos.json"').json({ version: 1, items: d.items.map(({ cover, coverV, sessions, cal, ...g }) => g) });
      }
    } catch (e) { sendError(res, e); }
  });

  router.post('/import', jsonGrande, async (req, res) => {
    try {
      const entrada = Array.isArray(req.body && req.body.items) ? req.body.items : null;
      if (!entrada) throw new HttpError(400, 'El archivo no tiene una lista de juegos');
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es');
      let nuevos = 0, repetidos = 0;
      await mutar(req.user, (d) => {
        const vistos = new Set(d.items.map(i => `${norm(i.title)}|${norm((i.platforms || [])[0])}`));
        for (const raw of entrada.slice(0, 5000)) {
          if (d.items.length >= MAX_JUEGOS) break;
          let g; try { g = limpia(raw || {}, null); } catch { continue; }
          const k = `${norm(g.title)}|${norm((g.platforms || [])[0])}`;
          if (vistos.has(k)) { repetidos++; continue; }
          vistos.add(k); g.id = newId(); d.items.push(g); nuevos++;
        }
      });
      res.json({ nuevos, repetidos });
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      async resumen(user) { return resumen((await leer(user)).items); },
      async setCal(user, id, ev) {
        await mutar(user, (d) => {
          const g = d.items.find(i => i.id === id);
          if (!g) return { __abort: true };
          g.cal = ev ? { date: ev.start.slice(0, 10), time: ev.allDay ? '' : ev.start.slice(11, 16) } : null;
        });
      },
    },
  };
}

module.exports = createGames;
module.exports.resumen = resumen;
