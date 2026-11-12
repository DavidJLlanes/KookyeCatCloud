'use strict';
// Documentos: textos al estilo Google Docs con editor enriquecido (formato, columnas, tablas, listas de tareas).
// Datos: un JSON por documento en <raíz>/.kcc/documentos/<id>.json; copias de seguridad del texto anterior en salvavidas/ y
// contadores de logros en stats.json. Lo borrado va a .kcc/borrados/documentos (30 días).
const fsp = require('fs').promises;
const path = require('path');
const store = require('../store');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError } = store;
const C = require('./constantes');
const modelo = require('./modelo');
const { PLANTILLAS } = require('./plantillas');
const exporta = require('./exportar');
const { resumenDocumentos } = require('./resumen');

function createDocumentos({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const json = express.json({ limit: '8mb' });
  const dir = (user) => kccDir(userRoot(user), 'documentos');
  const archivo = (user, id) => path.join(dir(user), `${id}.json`);
  const statsFile = (user) => path.join(dir(user), 'stats.json');
  const valido = (id) => C.RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper el documento */ } };
  const log = (req, accion) => { if (registrarActividad) registrarActividad(req, 'documentos', { accion }); };
  const suma = (user, campo) => updateJson(statsFile(user), () => ({}), (d) => { d[campo] = (d[campo] || 0) + 1; }).catch(() => {});

  // Un archivo que existe pero no se lee NO es «sin documentos»: el error llega al cliente
  async function todos(user) {
    const nombres = (await fsp.readdir(dir(user)).catch(() => [])).filter(n => n.endsWith('.json') && valido(n.slice(0, -5)));
    const docs = await Promise.all(nombres.map(n => readJson(path.join(dir(user), n), null)));
    return docs.filter(d => d && typeof d.html === 'string');
  }
  // Contar y crear van juntos, de uno en uno por usuario: así nunca se pasa del máximo de documentos
  const alta = (user, fn) => store.enCola('alta-documentos:' + userRoot(user), async () => {
    if ((await todos(user)).length >= C.MAX_DOCS) throw new HttpError(400, `Has llegado al máximo de ${C.MAX_DOCS} documentos`);
    return fn();
  });
  const leer = async (user, id) => {
    if (!valido(id)) throw new HttpError(404, 'No existe ese documento');
    const d = await readJson(archivo(user, id), null);
    if (!d || typeof d.html !== 'string') throw new HttpError(404, 'No existe ese documento');
    return d;
  };
  const ficha = (d) => ({ id: d.id, title: d.title, palabras: d.palabras || 0, caracteres: d.caracteres || 0, extracto: d.extracto || '', pagina: d.pagina, favorito: !!d.favorito, createdAt: d.createdAt, updatedAt: d.updatedAt, cols: !!d.cols });

  // Guarda el texto anterior si el nuevo lo deja casi vacío (editor roto, selección borrada por error…): salvavidas
  async function salvavidas(user, d, nuevoTexto) {
    if ((d.caracteres || 0) < 40 || nuevoTexto >= (d.caracteres || 0) / 2) return;
    const sdir = path.join(dir(user), 'salvavidas'); await fsp.mkdir(sdir, { recursive: true });
    await writeJson(path.join(sdir, `${d.id}-${Date.now()}.json`), { id: d.id, title: d.title, html: d.html, at: Date.now() });
    const suyos = (await fsp.readdir(sdir)).filter(n => n.startsWith(d.id + '-')).sort();
    for (const n of suyos.slice(0, -C.SALVAVIDAS)) await fsp.rm(path.join(sdir, n), { force: true });
  }

  router.get('/', async (req, res) => {
    try {
      const docs = (await todos(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ documentos: docs.map(ficha), plantillas: Object.entries(PLANTILLAS).map(([id, p]) => ({ id, nombre: p.nombre, icono: p.icono, desc: p.desc })) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      const b = req.body || {};
      const p = PLANTILLAS[b.plantilla] || PLANTILLAS.blanco;
      const html = b.html !== undefined ? modelo.cuerpo(b.html) : p.html;
      const ahora = Date.now();
      const d = { id: newId(), title: modelo.titulo(b.title) || p.titulo, html, pagina: C.PAGINAS.includes(b.pagina) ? b.pagina : 'a4', favorito: false, ...modelo.derivados(html), createdAt: ahora, updatedAt: ahora };
      store.marcaEdicion(d, req);
      await alta(req.user, () => writeJson(archivo(req.user, d.id), d));
      if (b.plantilla && PLANTILLAS[b.plantilla] && b.plantilla !== 'blanco') await suma(req.user, 'plantillas');
      log(req, 'crear'); cambio(req.user);
      res.json({ documento: d });
    } catch (e) { sendError(res, e); }
  });

  router.get('/papelera', async (req, res) => {
    try {
      const bdir = kccDir(userRoot(req.user), 'borrados', 'documentos');
      const out = [];
      for (const n of await fsp.readdir(bdir).catch(() => [])) {
        const d = await readJson(path.join(bdir, n), null).catch(() => null);
        if (d && typeof d.html === 'string') out.push({ nombre: n, id: d.id, title: d.title, palabras: d.palabras || 0, borrado: Number(n.split('-')[0]) || 0 });
      }
      res.json({ documentos: out.sort((a, b) => b.borrado - a.borrado) });
    } catch (e) { sendError(res, e); }
  });
  router.post('/papelera/restaura', json, async (req, res) => {
    try {
      const nombre = String((req.body || {}).nombre || '');
      if (!/^\d+-[\w.-]+\.json$/.test(nombre)) throw new HttpError(400, 'Nombre no válido');
      const f = path.join(kccDir(userRoot(req.user), 'borrados', 'documentos'), nombre);
      const d = await readJson(f, null);
      if (!d || typeof d.html !== 'string' || !valido(d.id)) throw new HttpError(404, 'No está en la papelera');
      const existe = await readJson(archivo(req.user, d.id), null);
      if (existe) d.id = newId();   // no pisa uno que ya existe con ese id
      d.updatedAt = Date.now();
      await alta(req.user, () => writeJson(archivo(req.user, d.id), d)); await fsp.rm(f, { force: true });
      cambio(req.user); res.json({ documento: ficha(d) });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json({ documento: await leer(req.user, req.params.id) }); } catch (e) { sendError(res, e); } });

  // «base»: la fecha de la versión que abrió esta pestaña; si otro dispositivo guardó después se responde 409 en vez de pisarlo
  router.put('/:id', json, async (req, res) => {
    try {
      if (!valido(req.params.id)) throw new HttpError(404, 'No existe ese documento');
      const b = req.body || {}; const d = await updateJson(archivo(req.user, req.params.id), () => null, async (d) => {
        if (!d || typeof d.html !== 'string') throw new HttpError(404, 'No existe ese documento');
        if (b.html !== undefined) store.compruebaBase(d, req);
        if (b.html !== undefined) { const h = modelo.cuerpo(b.html); const der = modelo.derivados(h); await salvavidas(req.user, d, der.caracteres); Object.assign(d, { html: h }, der); }
        if (b.title !== undefined) d.title = modelo.titulo(b.title) || 'Documento sin título';
        if (C.PAGINAS.includes(b.pagina)) d.pagina = b.pagina;
        if (b.favorito !== undefined) d.favorito = !!b.favorito;
        d.updatedAt = Date.now(); store.marcaEdicion(d, req);
        return d;
      });
      log(req, 'guardar'); cambio(req.user);
      res.json({ ok: true, updatedAt: d.updatedAt, palabras: d.palabras, caracteres: d.caracteres });
    } catch (e) { sendError(res, e); }
  });

  router.post('/:id/duplicar', json, async (req, res) => {
    try {
      const o = await leer(req.user, req.params.id);
      const ahora = Date.now(), d = { ...o, id: newId(), title: modelo.titulo('Copia de ' + o.title), favorito: false, createdAt: ahora, updatedAt: ahora };
      await alta(req.user, () => writeJson(archivo(req.user, d.id), d)); log(req, 'duplicar'); cambio(req.user);
      res.json({ documento: d });
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await leer(req.user, req.params.id);
      await store.guardaBorrado(userRoot(req.user), 'documentos', req.params.id, { mover: archivo(req.user, req.params.id) });
      log(req, 'borrar'); cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/salvavidas', async (req, res) => {
    try {
      await leer(req.user, req.params.id);
      const sdir = path.join(dir(req.user), 'salvavidas');
      const l = (await fsp.readdir(sdir).catch(() => [])).filter(n => n.startsWith(req.params.id + '-')).sort().reverse();
      res.json({ copias: l.map(n => ({ nombre: n, at: Number(n.slice(17).replace('.json', '')) || 0 })) });
    } catch (e) { sendError(res, e); }
  });
  router.post('/:id/restaura', json, async (req, res) => {
    try {
      const nombre = String((req.body || {}).nombre || '');
      if (!new RegExp(`^${req.params.id}-\\d+\\.json$`).test(nombre)) throw new HttpError(400, 'Copia no válida');
      const c = await readJson(path.join(dir(req.user), 'salvavidas', nombre), null);
      if (!c || typeof c.html !== 'string') throw new HttpError(404, 'Esa copia ya no existe');
      const html = modelo.cuerpo(c.html);
      await updateJson(archivo(req.user, req.params.id), () => null, async (d) => {
        if (!d) throw new HttpError(404, 'No existe ese documento');
        await salvavidas(req.user, { ...d }, 0);   // lo actual también se guarda antes de volver atrás
        Object.assign(d, { html }, modelo.derivados(html)); d.updatedAt = Date.now(); store.marcaEdicion(d, req); return d;
      });
      cambio(req.user); res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/export', async (req, res) => {
    try {
      const d = await leer(req.user, req.params.id), f = String(req.query.format || 'html');
      const nombre = (d.title.replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'documento');
      const cd = (ext) => { const fn = nombre + ext; return `attachment; filename="${fn.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fn)}`; };
      let cuerpo, tipo, ext;
      if (f === 'md') { cuerpo = exporta.aMarkdown(d); tipo = 'text/markdown'; ext = '.md'; }
      else if (f === 'txt') { cuerpo = exporta.aTextoPlano(d); tipo = 'text/plain'; ext = '.txt'; }
      else { cuerpo = exporta.aHtml(d); tipo = 'text/html'; ext = '.html'; }
      await suma(req.user, 'exportados'); cambio(req.user);
      res.set('Content-Type', tipo + '; charset=utf-8').set('Content-Disposition', cd(ext)).set('X-Content-Type-Options', 'nosniff').send(cuerpo);
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      resumen: async (user) => resumenDocumentos(await todos(user), await readJson(statsFile(user), {})),
      lista: (user) => todos(user),
      // Enviar entre secciones y exportación de datos (lib/exportar.js)
      async exportaTodo(user) { return (await todos(user)).map(d => ({ id: d.id, title: d.title, html: d.html, pagina: d.pagina, createdAt: d.createdAt, updatedAt: d.updatedAt })); },
    },
  };
}

module.exports = createDocumentos;
