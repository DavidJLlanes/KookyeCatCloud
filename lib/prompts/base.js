'use strict';
// Estado del módulo: índice en memoria por usuario, rutas de datos, metadatos y limpieza de entrada.
const fsp = require('fs').promises;
const path = require('path');
const store = require('../store');
const { kccDir, readJson, writeJson, updateJson, newId, cleanColor, cleanStr, cleanIds } = store;
const { BODY_MAX, TIPOS, normalizaTipos, MAX_SALIDAS, MAX_CADENA, ESTADOS, MODELOS_BASE, HERRAMIENTAS_BASE, CATEGORIAS_BASE } = require('./constantes');

function montaBase(ctx) {
  const { cache, userRoot, valores } = ctx;


  const dir = (user, ...sub) => kccDir(userRoot(user), 'prompts', ...sub);
  const metaFile = (user) => path.join(dir(user), 'meta.json');
  const itemFile = (user, id) => path.join(dir(user, 'items'), `${id}.json`);
  const imgDir = (user, id) => dir(user, 'img', id);
  const idOk = (id) => /^[a-f0-9]{16}$/.test(String(id));

  async function indice(user) {
    const raiz = userRoot(user);
    let c = cache.get(raiz);
    if (!c) {
      c = { items: new Map() };
      c.cargado = (async () => {
        const carpeta = dir(user, 'items');
        const nombres = (await fsp.readdir(carpeta)).filter(n => n.endsWith('.json'));
        for (let i = 0; i < nombres.length; i += 200) {
          await Promise.all(nombres.slice(i, i + 200).map(async (n) => {
            const p = await readJson(path.join(carpeta, n), null);
            if (p && p.id) c.items.set(p.id, p);
          }));
        }
      })();
      cache.set(raiz, c);
      // Un fallo pasajero al cargar no puede quedarse en caché para siempre (Prompts quedaría inservible hasta reiniciar)
      c.cargado.catch(() => { if (cache.get(raiz) === c) cache.delete(raiz); });
    }
    await c.cargado;
    return c.items;
  }
  // Modelo, herramienta e idioma son valores reutilizables: se canonizan al guardar (ver lib/valores.js)
  const guarda = async (user, p) => { await valores.aplica(user, 'prompts', p); (await indice(user)).set(p.id, p); await writeJson(itemFile(user, p.id), p); };
  const usoDe = async (user, prop) => {
    const r = {};
    for (const p of (await indice(user)).values()) if (!p.deletedAt && p[prop]) r[p[prop]] = (r[p[prop]] || 0) + 1;
    return r;
  };
  const renombraEn = async (user, prop, mapea) => {
    let n = 0;
    for (const p of (await indice(user)).values()) {
      const nv = p[prop] ? mapea(p[prop]) : undefined;
      if (nv === undefined) continue;
      p[prop] = nv; p.updatedAt = Date.now(); n++;
      await writeJson(itemFile(user, p.id), p);
    }
    return n;
  };
  for (const [prop, etiqueta, semilla, max, legado] of [['model', 'Modelo', MODELOS_BASE, 60, 'models'], ['tool', 'Herramienta', HERRAMIENTAS_BASE, 60, 'tools'], ['language', 'Idioma', [], 30, null]]) {
    valores.registra({
      campo: 'prompts.' + prop, modulo: 'prompts', prop, etiqueta, semilla, max,
      uso: (user) => usoDe(user, prop),
      renombra: (user, mapea) => renombraEn(user, prop, mapea),
      // Antes había una lista manual en meta.json: pasa al catálogo la primera vez
      migra: legado ? async (user) => { const m = await readJson(metaFile(user), null); return m && Array.isArray(m[legado]) ? m[legado] : []; } : undefined,
    });
  }

  const metaBase = () => ({
    categories: CATEGORIAS_BASE.map(([name, emoji, color]) => ({ id: newId(), name, emoji, color, parent: '' })),
    lists: [], kinds: normalizaTipos(),
    views: [],
    models: [],
    tools: [],
  });
  // Primera vez: se siembran categorías de ejemplo, que se pueden renombrar o borrar
  const leeMeta = async (user) => {
    const m = await readJson(metaFile(user), null);
    if (m) { m.models = Array.isArray(m.models) ? m.models : []; m.tools = Array.isArray(m.tools) ? m.tools : []; m.kinds = normalizaTipos(m.kinds); return m; }
    await updateJson(metaFile(user), metaBase, () => {});
    return readJson(metaFile(user), metaBase);
  };
  const mutaMeta = (user, fn) => updateJson(metaFile(user), metaBase, fn);

  /* ---------- Limpieza de entrada ---------- */
  // Resultados guardados con el prompt (respuesta de un modelo, con su valoración). Los ids ya existentes se respetan.
  function limpiaSalidas(lista, previas, recortar) {
    const conocidos = new Set((previas || []).map(x => x.id));
    const out = [];
    for (const x of (Array.isArray(lista) ? lista : []).slice(0, MAX_SALIDAS)) {
      if (!x || typeof x !== 'object') continue;
      const text = store.textoLargo(x.text, 30000, 'Un resultado', recortar);
      const input = store.textoLargo(x.input, 5000, 'La entrada de un resultado', recortar);
      if (!text.trim() && !input.trim()) continue;
      out.push({
        id: conocidos.has(x.id) ? x.id : newId(),
        input, text, model: cleanStr(x.model, 60).trim(),
        rating: Math.min(Math.max(parseInt(x.rating, 10) || 0, 0), 5),
        best: !!x.best, at: Number.isFinite(+x.at) && +x.at > 0 ? +x.at : Date.now(),
      });
    }
    // Solo un resultado puede ser "el mejor"
    let visto = false;
    for (const x of out) { if (x.best && visto) x.best = false; if (x.best) visto = true; }
    return out;
  }

  function limpia(b, prev, meta) {
    const o = prev ? { ...prev } : { images: [], versions: [], uses: 0, favorite: false, pinned: false, rating: 0 };
    if (b.title !== undefined || !prev) o.title = store.corto(b.title, 200, 'El título', b.__recorta) || 'Prompt sin título';
    if (b.body !== undefined) o.body = store.textoLargo(b.body, BODY_MAX, 'El prompt', b.__recorta);
    if (b.negative !== undefined) o.negative = store.textoLargo(b.negative, 20000, 'El negativo', b.__recorta);
    if (b.notes !== undefined) o.notes = store.textoLargo(b.notes, 20000, 'Las notas', b.__recorta);
    if (b.system !== undefined) o.system = store.textoLargo(b.system, 20000, 'El mensaje de sistema', b.__recorta);
    if (b.chain !== undefined) o.chain = [...new Set(cleanIds(b.chain))].filter(id => idOk(id) && (!prev || id !== prev.id)).slice(0, MAX_CADENA);
    if (b.outputs !== undefined) o.outputs = limpiaSalidas(b.outputs, o.outputs, b.__recorta);
    if (b.kind !== undefined) o.kind = TIPOS.includes(b.kind) ? b.kind : 'otro';
    if (b.status !== undefined) o.status = ESTADOS.includes(b.status) ? b.status : 'borrador';
    if (b.model !== undefined) o.model = cleanStr(b.model, 60).trim();
    if (b.tool !== undefined) o.tool = cleanStr(b.tool, 60).trim();
    if (b.language !== undefined) o.language = cleanStr(b.language, 30).trim();
    if (b.source !== undefined) o.source = store.corto(b.source, 500, 'La fuente', b.__recorta);
    if (b.color !== undefined) o.color = cleanColor(b.color, '');
    if (b.favorite !== undefined) o.favorite = !!b.favorite;
    if (b.pinned !== undefined) o.pinned = !!b.pinned;
    if (b.rating !== undefined) o.rating = Math.min(Math.max(parseInt(b.rating, 10) || 0, 0), 5);
    if (b.labels !== undefined) o.labels = cleanIds(b.labels);
    if (b.lists !== undefined) {
      o.lists = cleanIds(b.lists).filter(id => !meta || meta.lists.some(l => l.id === id));
    }
    if (b.category !== undefined) {
      const c = cleanStr(b.category, 40);
      o.category = (!c || !meta || meta.categories.some(x => x.id === c)) ? c : '';
    }
    if (b.params !== undefined) {
      const params = {};
      if (b.params && typeof b.params === 'object') {
        for (const [k, v] of Object.entries(b.params).slice(0, 30)) {
          const kk = cleanStr(k, 40).trim();
          if (kk) params[kk] = cleanStr(v, 200);
        }
      }
      o.params = params;
    }
    // Valores por defecto para que el cliente no tenga que comprobar si existen
    o.body = o.body || '';
    o.negative = o.negative || '';
    o.notes = o.notes || '';
    o.system = o.system || '';
    o.chain = o.chain || [];
    o.outputs = o.outputs || [];
    o.kind = o.kind || 'imagen';
    o.status = o.status || 'borrador';
    o.model = o.model || '';
    o.tool = o.tool || '';
    o.language = o.language || '';
    o.source = o.source || '';
    o.color = o.color || '';
    o.category = o.category || '';
    o.labels = o.labels || [];
    o.lists = o.lists || [];
    o.params = o.params || {};
    // Proyectos de Código vinculados. Solo lo cambia lib/vinculos.js (el vínculo va en los dos lados), nunca el cuerpo de la petición
    o.codigo = Array.isArray(o.codigo) ? o.codigo : [];
    return o;
  }

  const ligero = (p) => ({
    id: p.id, title: p.title, snippet: p.body.slice(0, 260), kind: p.kind, status: p.status, model: p.model, tool: p.tool,
    category: p.category, labels: p.labels, lists: p.lists, rating: p.rating, favorite: p.favorite,
    pinned: p.pinned, color: p.color, uses: p.uses, createdAt: p.createdAt, updatedAt: p.updatedAt,
    cal: p.cal || null, deletedAt: p.deletedAt || null,
    images: p.images.map(i => ({ id: i.id, w: i.w, h: i.h })), cover: p.cover || (p.images[0] && p.images[0].id) || '',
    hasNegative: !!p.negative, hasSystem: !!p.system, outputs: (p.outputs || []).length, chain: (p.chain || []).length, vars: (p.body.match(/\{\{[^{}\n]{1,120}\}\}/g) || []).length,
  });

  function descendientesCat(meta, id) {
    const ids = new Set([id]);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const c of meta.categories) if (c.parent && ids.has(c.parent) && !ids.has(c.id)) { ids.add(c.id); crecio = true; }
    }
    return ids;
  }

  return { dir, metaFile, itemFile, imgDir, idOk, indice, guarda, usoDe, renombraEn, metaBase, leeMeta, mutaMeta, limpiaSalidas, limpia, ligero, descendientesCat };
}

module.exports = { montaBase };
