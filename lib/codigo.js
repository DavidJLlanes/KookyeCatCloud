'use strict';

// Código: fragmentos con lenguaje, etiquetas y vista previa. Cada fragmento es su propio JSON: <raíz>/.kcc/codigo/<id>.json
// Los contadores de uso (vistas previas, copias) van en <raíz>/.kcc/codigo/stats.json
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const LENGUAJES = {
  html: ['HTML', 'html'], css: ['CSS', 'css'], javascript: ['JavaScript', 'js'], typescript: ['TypeScript', 'ts'], json: ['JSON', 'json'],
  markdown: ['Markdown', 'md'], python: ['Python', 'py'], php: ['PHP', 'php'], sql: ['SQL', 'sql'], bash: ['Bash', 'sh'], yaml: ['YAML', 'yml'],
  xml: ['XML', 'xml'], java: ['Java', 'java'], csharp: ['C#', 'cs'], cpp: ['C++', 'cpp'], c: ['C', 'c'], go: ['Go', 'go'], rust: ['Rust', 'rs'],
  ruby: ['Ruby', 'rb'], kotlin: ['Kotlin', 'kt'], swift: ['Swift', 'swift'], ini: ['INI / .env', 'ini'], nginx: ['Nginx', 'conf'], plaintext: ['Texto plano', 'txt'],
};
const MAX_SNIPS = 500, MAX_CODIGO = 200 * 1024, MAX_ETQ = 8;
const RE_ID = /^[a-f0-9]{16}$/;

const lineas = (c) => (c ? String(c).split('\n').length : 0);
const limpiaEtiquetas = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(t => cleanStr(t, 24).trim().toLowerCase()).filter(Boolean))].slice(0, MAX_ETQ);

function resumenCodigo(snips, stats) {
  const langs = new Set(snips.map(s => s.lenguaje).filter(l => l && l !== 'plaintext'));
  const tiene = (l) => snips.some(s => s.lenguaje === l && String(s.codigo || '').trim());
  return {
    cod_snips: snips.length,
    cod_lineas: snips.reduce((n, s) => n + lineas(s.codigo), 0),
    cod_langs: langs.size,
    cod_fav: snips.filter(s => s.favorito).length,
    cod_max: snips.reduce((m, s) => Math.max(m, lineas(s.codigo)), 0),
    cod_web: tiene('html') && tiene('css') && tiene('javascript') ? 1 : 0,
    cod_prev: (stats && stats.previews) || 0,
    cod_copias: (stats && stats.copias) || 0,
  };
}

function createCodigo({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const json = express.json({ limit: '1mb' });
  const dir = (user) => kccDir(userRoot(user), 'codigo');
  const archivo = (user, id) => path.join(dir(user), `${id}.json`);
  const statsFile = (user) => path.join(dir(user), 'stats.json');
  const validId = (id) => RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };

  async function lista(user) {
    let nombres = [];
    try { nombres = (await fsp.readdir(dir(user))).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch { return []; }
    const out = [];
    for (const f of nombres) { const s = await readJson(path.join(dir(user), f), null); if (s && typeof s.codigo === 'string') out.push(s); }
    return out;
  }
  const leer = async (user, id) => { if (!validId(id)) throw new HttpError(404, 'No existe'); const s = await readJson(archivo(user, id), null); if (!s || typeof s.codigo !== 'string') throw new HttpError(404, 'No existe'); return s; };
  const ficha = (s) => ({ id: s.id, titulo: s.titulo, lenguaje: s.lenguaje, etiquetas: s.etiquetas || [], favorito: !!s.favorito, lineas: lineas(s.codigo), inicio: s.codigo.split('\n').filter(l => l.trim()).slice(0, 3).join('\n').slice(0, 220), actualizado: s.updatedAt });
  function datos(body, prev) {
    const b = body || {};
    const lenguaje = LENGUAJES[b.lenguaje] ? b.lenguaje : (prev ? prev.lenguaje : 'plaintext');
    const codigo = b.codigo !== undefined ? String(b.codigo).replace(/\r\n?/g, '\n') : (prev ? prev.codigo : '');
    if (codigo.length > MAX_CODIGO) throw new HttpError(400, 'El fragmento es demasiado largo (máximo 200 KB)');
    return {
      titulo: b.titulo !== undefined ? (cleanStr(b.titulo, 120).trim() || 'Sin título') : (prev ? prev.titulo : 'Sin título'),
      lenguaje, codigo,
      etiquetas: b.etiquetas !== undefined ? limpiaEtiquetas(b.etiquetas) : (prev ? prev.etiquetas : []),
      favorito: b.favorito !== undefined ? !!b.favorito : !!(prev && prev.favorito),
    };
  }

  router.get('/', async (req, res) => {
    try {
      const l = (await lista(req.user)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ items: l.map(ficha), lenguajes: Object.fromEntries(Object.entries(LENGUAJES).map(([k, v]) => [k, v[0]])) });
    } catch (e) { sendError(res, e); }
  });

  router.post('/', json, async (req, res) => {
    try {
      if ((await lista(req.user)).length >= MAX_SNIPS) throw new HttpError(400, 'Has llegado al máximo de fragmentos');
      const d = datos(req.body, null);
      const s = { id: newId(), ...d, createdAt: Date.now(), updatedAt: Date.now() };
      await writeJson(archivo(req.user, s.id), s);
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'crear', nombre: s.titulo });
      cambio(req.user);
      res.json(s);
    } catch (e) { sendError(res, e); }
  });

  // Contadores de uso: vista previa y copias
  router.post('/accion', json, async (req, res) => {
    try {
      const tipo = req.body && req.body.tipo; const clave = tipo === 'preview' ? 'previews' : tipo === 'copia' ? 'copias' : null;
      if (!clave) throw new HttpError(400, 'Acción no válida');
      await fsp.mkdir(dir(req.user), { recursive: true });
      await updateJson(statsFile(req.user), () => ({}), (x) => { x[clave] = (x[clave] || 0) + 1; });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id', async (req, res) => { try { res.json(await leer(req.user, req.params.id)); } catch (e) { sendError(res, e); } });

  router.put('/:id', json, async (req, res) => {
    try {
      const s = await leer(req.user, req.params.id);
      Object.assign(s, datos(req.body, s)); s.updatedAt = Date.now();
      await writeJson(archivo(req.user, s.id), s);
      cambio(req.user);
      res.json(s);
    } catch (e) { sendError(res, e); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const s = await leer(req.user, req.params.id);
      await fsp.unlink(archivo(req.user, s.id));
      if (registrarActividad) registrarActividad(req, 'codigo', { accion: 'borrar', nombre: s.titulo });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.get('/:id/export', async (req, res) => {
    try {
      const s = await leer(req.user, req.params.id);
      const ext = (LENGUAJES[s.lenguaje] || LENGUAJES.plaintext)[1];
      const nombre = (s.titulo.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '').trim().replace(/\s+/g, '-') || 'fragmento') + '.' + ext;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fragmento.${ext}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(s.codigo);
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      resumen: async (user) => resumenCodigo(await lista(user), await readJson(statsFile(user), {})),
    },
  };
}

module.exports = createCodigo;
module.exports.resumenCodigo = resumenCodigo;
