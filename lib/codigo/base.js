'use strict';
// base: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const store = require('../nucleo/store');
const { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanStr } = store;
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { EXT_LANG, IMAGENES, MAX_ARCHIVO, MAX_ARCHIVOS, MAX_BYTES, MAX_VERSIONES, MIME, RE_HASH, RE_ID, carpetasDe, esTexto, ext, firma, hashDe, hijosDe, lenguajeDe, limpiaEtiquetas, lineasDe, padres, recuenta } = require('./constantes');

function monta(ctx) {
  const { alCambiar, express, multer, sendError, userRoot, valores } = ctx;

  const router = express.Router();
  const vistaRouter = express.Router();
  const json = express.json({ limit: '3mb' });
  // Las subidas se leen en memoria: se exige Content-Length y se corta antes de leer nada si pasa del tope
  const topeCuerpo = (req, res, next) => {
    const n = Number(req.headers['content-length']);
    if (!Number.isFinite(n) || n <= 0) return sendError(res, new HttpError(411, 'Falta el tamaño de la subida'));
    if (n > MAX_BYTES + 2 * 1024 * 1024) return sendError(res, new HttpError(413, 'La subida supera los 50 MB'));
    next();
  };
  const envuelve = (mw) => (req, res, next) => mw(req, res, (e) => (e ? sendError(res, new HttpError(400, e.code === 'LIMIT_FILE_SIZE' ? 'Archivo demasiado grande' : 'Subida no válida')) : next()));
  const subidaBase = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_ARCHIVOS, fields: 20, parts: MAX_ARCHIVOS + 25 } });
  const subida = { array: (c, n) => envuelve(subidaBase.array(c, n)), single: (c) => envuelve(subidaBase.single(c)) };
  const claveVista = crypto.randomBytes(32);
  const raiz = (user) => kccDir(userRoot(user), 'codigo');
  const dirP = (user, id) => path.join(raiz(user), id);
  const fichero = (user, id) => path.join(dirP(user, id), 'proyecto.json');
  const objeto = (user, id, h) => path.join(dirP(user, id), 'objetos', h);
  const statsFile = (user) => path.join(raiz(user), 'stats.json');
  const validId = (id) => RE_ID.test(String(id));
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };

  /* ---------- Migración de los fragmentos antiguos ---------- */
  const migrando = new Map();
  async function migra(user) {
    let nombres = []; try { nombres = (await fsp.readdir(raiz(user))).filter(f => /^[a-f0-9]{16}\.json$/.test(f)); } catch { return; }
    for (const f of nombres) {
      const s = await readJson(path.join(raiz(user), f), null); const id = f.slice(0, 16);
      if (!s || typeof s.codigo !== 'string') continue;
      const extL = Object.entries(EXT_LANG).find(([, l]) => l === s.lenguaje); const e = (extL && extL[0]) || 'txt';
      const base = (cleanStr(s.titulo, 80).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'fragmento');
      const ruta = /\.\w{1,6}$/.test(base) ? base : `${base}.${e}`;
      const buf = Buffer.from(String(s.codigo), 'utf8'); const h = hashDe(buf);
      await fsp.mkdir(path.join(dirP(user, id), 'objetos'), { recursive: true });
      await fsp.writeFile(objeto(user, id, h), buf);
      const a = [h, buf.length, lineasDe(buf)];
      const p = { id, nombre: cleanStr(s.titulo, 120).trim() || 'Sin título', descripcion: 'Importado desde un fragmento', etiquetas: limpiaEtiquetas(s.etiquetas), favorito: !!s.favorito, createdAt: s.createdAt || Date.now(), updatedAt: s.updatedAt || Date.now(),
        archivos: { [ruta]: a }, carpetas: [], versiones: [{ id: newId(), n: 1, mensaje: 'Importado desde un fragmento', fecha: s.updatedAt || Date.now(), carpetas: [], archivos: { [ruta]: a } }], siguienteV: 2, objetos: {} };
      recuenta(p);
      await writeJson(fichero(user, id), p);
      await fsp.unlink(path.join(raiz(user), f)).catch(() => {});
    }
  }
  const asegura = (user) => {
    const k = user.username; if (migrando.has(k)) return migrando.get(k);
    const pr = migra(user).catch(() => {}).finally(() => migrando.delete(k)); migrando.set(k, pr); return pr;
  };

  async function lista(user) {
    await asegura(user);
    let nombres = []; try { nombres = (await fsp.readdir(raiz(user))).filter(f => validId(f)); } catch { return []; }
    const out = [];
    for (const id of nombres) { const p = await readJson(fichero(user, id), null); if (p && p.archivos && Array.isArray(p.versiones)) out.push(p); }
    return out;
  }
  async function leer(user, id) {
    if (!validId(id)) throw new HttpError(404, 'No existe'); await asegura(user);
    const p = await readJson(fichero(user, id), null); if (!p || !p.archivos) throw new HttpError(404, 'No existe'); return p;
  }
  const mutar = (user, id, fn) => {
    if (!validId(id)) throw new HttpError(404, 'No existe');
    return updateJson(fichero(user, id), () => null, async (p) => { if (!p || !p.archivos) throw new HttpError(404, 'No existe'); const r = await fn(p); p.updatedAt = Date.now(); return r === undefined ? p : r; });
  };
  // Etiquetas: valores reutilizables (lib/valores.js). Siguen siendo minúsculas; se unifican acentos, guiones y espacios
  valores.registra({
    campo: 'codigo.etiquetas', modulo: 'codigo', prop: 'etiquetas', etiqueta: 'Etiquetas de código', multiple: true, max: 24,
    uso: async (user) => { const r = {}; for (const p of await lista(user)) for (const t of p.etiquetas || []) r[t] = (r[t] || 0) + 1; return r; },
    renombra: async (user, mapea) => {
      let n = 0;
      for (const p of await lista(user)) {
        const nuevas = []; let cambio = false;
        for (const t of p.etiquetas || []) { const nv = mapea(t); const x = limpiaEtiquetas([nv === undefined ? t : nv])[0]; if (nv !== undefined) cambio = true; if (x && !nuevas.includes(x)) nuevas.push(x); }
        if (cambio) { await mutar(user, p.id, (x) => { x.etiquetas = nuevas; }); n++; }
      }
      return n;
    },
  });
  const etq = async (user, arr) => { const o = { etiquetas: limpiaEtiquetas(arr) }; await valores.aplica(user, 'codigo', o); return limpiaEtiquetas(o.etiquetas); };
  const tamTrabajo = (p) => Object.values(p.archivos).reduce((n, a) => n + a[1], 0);
  const ficha = (p) => {
    const langs = {}; for (const r of Object.keys(p.archivos)) { const l = lenguajeDe(r); if (l && l !== 'plaintext') langs[l] = (langs[l] || 0) + 1; }
    return { id: p.id, nombre: p.nombre, descripcion: p.descripcion || '', etiquetas: p.etiquetas || [], favorito: !!p.favorito, nArchivos: Object.keys(p.archivos).length, tam: tamTrabajo(p), nVersiones: p.versiones.length, almacen: Object.values(p.objetos || {}).reduce((n, t) => n + t, 0),
      langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]), actualizado: p.updatedAt };
  };
  const detalle = (p) => ({ ...ficha(p), archivos: Object.fromEntries(Object.entries(p.archivos).map(([r, a]) => [r, { t: a[1], l: a[2], texto: a[2] > 0 || a[1] === 0 }])), carpetas: carpetasDe(p), createdAt: p.createdAt,
    versiones: p.versiones.map(v => ({ id: v.id, n: v.n, mensaje: v.mensaje, fecha: v.fecha, nArchivos: Object.keys(v.archivos).length, tam: Object.values(v.archivos).reduce((n, a) => n + a[1], 0) })).reverse(), limites: { archivos: MAX_ARCHIVOS, bytes: MAX_BYTES, versiones: MAX_VERSIONES } });

  /* ---------- Objetos ---------- */
  async function guardaObjeto(user, p, buf) {
    const h = hashDe(buf);
    if (!(h in p.objetos)) { if (Object.values(p.objetos).reduce((n, t) => n + t, 0) + buf.length > MAX_BYTES) throw new HttpError(400, 'El proyecto supera el límite de 50 MB'); }
    await fsp.mkdir(path.join(dirP(user, p.id), 'objetos'), { recursive: true });
    try { await fsp.writeFile(objeto(user, p.id, h), buf, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    p.objetos[h] = buf.length;
    return h;
  }
  // Un archivo vacío apunta al objeto de 0 bytes; si falta en disco (versiones anteriores lo borraban al limpiar), se recrea
  async function objetoOk(user, id, a) { if (a[1] === 0) { try { await fsp.writeFile(objeto(user, id, a[0]), '', { flag: 'a' }); } catch { /* ya existe o no se puede: la lectura dará el error */ } } }
  async function barre(user, p) {
    let nombres = []; try { nombres = await fsp.readdir(path.join(dirP(user, p.id), 'objetos')); } catch { return; }
    for (const n of nombres) if (RE_HASH.test(n) && !(n in p.objetos)) await fsp.unlink(objeto(user, p.id, n)).catch(() => {});
  }
  async function ponArchivo(user, p, ruta, buf) {
    if (buf.length > MAX_ARCHIVO) throw new HttpError(400, `«${ruta}» supera los 10 MB`);
    if (hijosDe(p.archivos, ruta).length) throw new HttpError(400, `«${ruta}» es una carpeta`);
    for (const c of padres(ruta)) { if (p.archivos[c]) throw new HttpError(400, `«${c}» es un archivo, no una carpeta`); }
    if (!p.archivos[ruta] && Object.keys(p.archivos).length >= MAX_ARCHIVOS) throw new HttpError(400, 'Máximo 1000 archivos por proyecto');
    const h = await guardaObjeto(user, p, buf);
    p.archivos[ruta] = [h, buf.length, esTexto(ruta, buf) ? lineasDe(buf) : 0];
  }
  const manifiesto = (p, vid) => {
    if (!vid) return { archivos: p.archivos, carpetas: carpetasDe(p) };
    const v = p.versiones.find(x => x.id === vid); if (!v) throw new HttpError(404, 'No existe esa versión');
    return { archivos: v.archivos, carpetas: v.carpetas || [], v };
  };
  const instantanea = (p, mensaje) => {
    if (p.versiones.length >= MAX_VERSIONES) throw new HttpError(400, `Máximo ${MAX_VERSIONES} versiones: elimina alguna`);
    const v = { id: newId(), n: p.siguienteV || p.versiones.length + 1, mensaje: cleanStr(mensaje, 200).trim() || `Versión ${p.siguienteV}`, fecha: Date.now(), carpetas: carpetasDe(p).filter(c => p.carpetas.includes(c)), archivos: JSON.parse(JSON.stringify(p.archivos)) };
    p.siguienteV = v.n + 1; p.versiones.push(v); return v;
  };
  const igualQueUltima = (p) => { const u = p.versiones[p.versiones.length - 1]; return !!u && firma(u.archivos, u.carpetas || []) === firma(p.archivos, p.carpetas); };

  const sirve = (res, buf, ruta, descarga) => {
    const e = ext(ruta); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    const tipo = IMAGENES.has(e) ? MIME[e] : esTexto(ruta, buf) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    res.setHeader('Content-Type', tipo);
    if (descarga || tipo === 'application/octet-stream') res.setHeader('Content-Disposition', `attachment; filename="${path.posix.basename(ruta).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"`);
    res.send(buf);
  };


  return { router, vistaRouter, json, topeCuerpo, envuelve, subidaBase, subida, claveVista, raiz, dirP, fichero, objeto, statsFile, validId, cambio, migrando, migra, asegura, lista, leer, mutar, etq, tamTrabajo, ficha, detalle, guardaObjeto, objetoOk, barre, ponArchivo, manifiesto, instantanea, igualQueUltima, sirve };
}

module.exports = monta;
