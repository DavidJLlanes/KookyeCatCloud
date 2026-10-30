'use strict';

// Enviar entre secciones: Archivos ⇄ Código. Copiar o mover, con deshacer durante 1 minuto e historial.
// Datos (un JSON propio): <raíz>/.kcc/transferencias/ops.json  →  { total, ops: [...] }
// Lo que se aparta para poder deshacer un «mover» vive en <raíz>/.kcc/transferencias/stg/<op>/ y se borra al caducar.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { kccDir, readJson, updateJson, newId, HttpError, cleanStr } = require('./store');

const VENTANA = 60 * 1000;     // tiempo para deshacer
const MAX_HISTORIAL = 50;
const MAX_ELEMENTOS = 1000;

function createTransferir({ express, userRoot, resuelve, esCompartida, sendError, registrarActividad, alCambiar, codigo }) {
  const router = express.Router();
  const json = express.json({ limit: '100kb' });
  const base = (user) => kccDir(userRoot(user), 'transferencias');
  const archivo = (user) => path.join(base(user), 'ops.json');
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* sin logros */ } };
  const aguarda = (user, fn) => updateJson(archivo(user), () => ({ total: 0, ops: [] }), fn);

  const rel = (r) => String(r ?? '').replace(/\\/g, '/').split('/').filter(x => x && x !== '.').join('/');
  const nombreDe = (r) => r.split('/').pop();
  const padreDe = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');

  // Rutas de Archivos del usuario (nunca compartidas: esas no son tuyas para mover)
  const absDe = (user, r, write) => {
    if (esCompartida(r)) throw new HttpError(400, 'Las carpetas compartidas no se pueden enviar: copia el contenido a tus archivos');
    return resuelve(user, r, write);
  };

  // Lista los archivos de una ruta de Archivos (carpeta o archivo) con su ruta relativa al padre de la selección
  async function recorre(absRaiz, relRaiz) {
    const out = [];
    const st = await fsp.lstat(absRaiz);
    if (st.isSymbolicLink()) throw new HttpError(400, 'No se envían enlaces simbólicos');
    if (st.isFile()) { out.push({ rel: relRaiz, abs: absRaiz, tam: st.size }); return out; }
    if (!st.isDirectory()) return out;
    for (const e of await fsp.readdir(absRaiz, { withFileTypes: true })) {
      if (e.name === '.kcc' || e.name.startsWith('.~')) continue;
      out.push(...await recorre(path.join(absRaiz, e.name), relRaiz + '/' + e.name));
    }
    return out;
  }
  async function listaOrigen(user, origen) {
    if (origen.tipo === 'archivos') {
      const rutas = (origen.rutas || []).map(rel).filter(Boolean);
      if (!rutas.length) throw new HttpError(400, 'No has elegido nada');
      if (rutas.length > MAX_ELEMENTOS) throw new HttpError(400, 'Demasiados elementos a la vez');
      const out = [];
      for (const r of rutas) {
        const abs = absDe(user, r, false);
        out.push(...await recorre(abs, r));
      }
      return { archivos: out, tam: out.reduce((n, f) => n + f.tam, 0) };
    }
    if (origen.tipo === 'codigo') {
      const d = await codigo.exporta(user, origen.id, origen.vid || '', origen.rutas);
      return { proyecto: d, archivos: d.archivos.map(a => ({ rel: a.ruta, tam: a.buf.length })), tam: d.archivos.reduce((n, a) => n + a.buf.length, 0) };
    }
    throw new HttpError(400, 'Origen no válido');
  }

  function valida(origen, destino, modo) {
    if (!['copiar', 'mover'].includes(modo)) throw new HttpError(400, 'Elige copiar o mover');
    if (!origen || !['archivos', 'codigo'].includes(origen.tipo)) throw new HttpError(400, 'Origen no válido');
    if (!destino || !['archivos', 'codigo'].includes(destino.tipo)) throw new HttpError(400, 'Destino no válido');
    if (origen.tipo === 'codigo' && destino.tipo === 'codigo') throw new HttpError(400, 'Entre proyectos de Código todavía no se puede enviar');
    if (origen.tipo === 'codigo' && modo === 'mover' && (origen.vid || (Array.isArray(origen.rutas) && origen.rutas.length))) throw new HttpError(400, 'Para mover de Código, elige el proyecto entero; lo demás, cópialo');
  }

  /* ---------- Caducidad: lo que ya no se puede deshacer se limpia ---------- */
  async function limpia(user) {
    const dir = path.join(base(user), 'stg');
    const ahora = Date.now();
    await aguarda(user, (x) => {
      for (const o of x.ops) {
        if (o.expira <= ahora && o.staging && !o.limpio) { o.limpio = true; fsp.rm(path.join(dir, o.id), { recursive: true, force: true }).catch(() => {}); }
        if (o.expira <= ahora && o.aparcado && !o.limpio) { o.limpio = true; codigo.borraAparcado(user, o.aparcado).catch(() => {}); }
      }
      x.ops = x.ops.slice(-MAX_HISTORIAL);
    });
  }

  /* ---------- Previa ---------- */
  router.post('/previa', json, async (req, res) => {
    try {
      valida(req.body?.origen, req.body?.destino || { tipo: 'archivos' }, req.body?.modo || 'copiar');
      const l = await listaOrigen(req.user, req.body.origen);
      const avisos = [];
      if (req.body.origen.tipo === 'codigo') avisos.push('Los archivos se guardan como una carpeta con el nombre del proyecto. El historial de versiones no se envía.');
      if (req.body.origen.tipo === 'archivos' && req.body.destino.tipo === 'codigo') avisos.push('Las fechas y los favoritos no se conservan en Código.');
      if (req.body.modo === 'mover') avisos.push('Al mover, el original se quita de su sección. Puedes deshacerlo durante 1 minuto.');
      res.json({ archivos: l.archivos.length, tam: l.tam, avisos });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Enviar ---------- */
  router.post('/', json, async (req, res) => {
    try {
      const b = req.body || {};
      const origen = b.origen, destino = b.destino, modo = b.modo || 'copiar';
      valida(origen, destino, modo);
      await limpia(req.user);
      const id = newId();
      const deshacer = [];           // pasos para deshacer, en orden inverso
      let n = 0, tam = 0, creado = null, dest = '';
      const nota = {};

      if (origen.tipo === 'archivos' && destino.tipo === 'archivos') {
        const carpeta = rel(destino.carpeta || '');
        const dirDest = absDe(req.user, carpeta, true);
        const st = await fsp.stat(dirDest).catch(() => null);
        if (st && !st.isDirectory()) throw new HttpError(400, 'El destino es un archivo, no una carpeta');
        if (!st) await fsp.mkdir(dirDest, { recursive: true });   // si no existe, se crea
        const rutas = (origen.rutas || []).map(rel).filter(Boolean);
        for (const r of rutas) {
          const abs = absDe(req.user, r, false);
          const dest1 = carpeta ? carpeta + '/' + nombreDe(r) : nombreDe(r);
          if (dest1 === r || dest1.startsWith(r + '/')) throw new HttpError(400, 'No puedes enviar algo dentro de sí mismo');
          const absDest = absDe(req.user, dest1, true);
          const l = await recorre(abs, r); tam += l.reduce((x, f) => x + f.tam, 0); n += l.length;
          if (modo === 'mover') {
            if (await fsp.stat(absDest).catch(() => null)) throw new HttpError(409, `Ya existe «${nombreDe(r)}» en el destino`);
            await fsp.rename(abs, absDest);
            deshacer.push({ k: 'mover', de: dest1, a: r });
          } else {
            let final = dest1, absFinal = absDest, k = 2;
            while (await fsp.stat(absFinal).catch(() => null)) {
              const ext = path.extname(nombreDe(dest1)); const sin = nombreDe(dest1).slice(0, nombreDe(dest1).length - ext.length);
              final = (carpeta ? carpeta + '/' : '') + `${sin} (${k})${ext}`; absFinal = absDe(req.user, final, true); k++;
            }
            await fsp.cp(abs, absFinal, { recursive: true, errorOnExist: true, force: false });
            deshacer.push({ k: 'crear', rutas: [final] });
          }
        }
        dest = carpeta || 'Mis archivos';
      }

      else if (origen.tipo === 'archivos' && destino.tipo === 'codigo') {
        const rutas = (origen.rutas || []).map(rel).filter(Boolean);
        if (!rutas.length) throw new HttpError(400, 'No has elegido nada');
        const archivos = [];
        for (const r of rutas) {
          const abs = absDe(req.user, r, false);
          const l = await recorre(abs, r);
          // En el proyecto la ruta empieza en el elemento elegido (una carpeta «web» queda como «web/…»)
          for (const f of l) {
            const buf = await fsp.readFile(f.abs);
            archivos.push({ ruta: f.rel, buf, abs: f.abs, rel: f.rel });
          }
        }
        if (!archivos.length) throw new HttpError(400, 'No hay archivos que enviar');
        const sub = rel(destino.carpeta || '');
        const res1 = await codigo.importa(req.user, {
          id: destino.nuevo ? null : destino.id, nombre: cleanStr(destino.nombre, 120).trim() || 'Proyecto desde Archivos',
          carpeta: sub, archivos: archivos.map(a => ({ ruta: a.ruta, buf: a.buf })),
        });
        n = res1.anadidos.length; tam = archivos.reduce((x, a) => x + a.buf.length, 0);
        if (res1.creado) deshacer.push({ k: 'proyecto', id: res1.id }); else deshacer.push({ k: 'quitaProyecto', id: res1.id, rutas: res1.anadidos });
        dest = res1.nombre;
        if (modo === 'mover') {
          // Los originales se apartan (no se borran) hasta que caduque el deshacer
          const stg = path.join(base(req.user), 'stg', id);
          await fsp.mkdir(stg, { recursive: true });
          const pares = [];
          for (let i = 0; i < archivos.length; i++) {
            const a = archivos[i];
            const destStg = path.join(stg, String(i));
            await fsp.rename(a.abs, destStg);
            pares.push([a.rel, String(i)]);
          }
          deshacer.push({ k: 'restauraArchivos', stg: id, pares });
          nota.staging = true;
        }
      }

      else if (origen.tipo === 'codigo' && destino.tipo === 'archivos') {
        const d = await codigo.exporta(req.user, origen.id, origen.vid || '', origen.rutas);
        const carpetaDestino = rel(destino.carpeta || '');
        const raiz = carpetaDestino ? carpetaDestino + '/' : '';
        const nombre = (d.nombre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'proyecto');
        // Carpeta nueva con el nombre del proyecto (si ya existe, (2), (3)…)
        let carpeta = raiz + nombre, k = 2;
        while (await fsp.stat(absDe(req.user, carpeta, true)).catch(() => null)) { carpeta = raiz + `${nombre} (${k})`; k++; }
        const creadas = [];
        for (const a of d.archivos) {
          const r = carpeta + '/' + a.ruta;
          const abs = absDe(req.user, r, true);
          await fsp.mkdir(path.dirname(abs), { recursive: true });
          await fsp.writeFile(abs, a.buf, { flag: 'wx' });
          creadas.push(r); n++; tam += a.buf.length;
        }
        deshacer.push({ k: 'crear', rutas: [carpeta] });
        dest = carpeta;
        if (modo === 'mover') {
          // Se aparta el proyecto (no se borra) hasta que caduque el deshacer
          const token = await codigo.aparta(req.user, origen.id);
          nota.aparcado = token;
          deshacer.push({ k: 'restauraProyecto', token, id: origen.id });
        }
      }

      const ahora = Date.now();
      const op = { id, fecha: ahora, modo, origen: { tipo: origen.tipo, texto: origen.tipo === 'codigo' ? 'Código' : 'Archivos' }, destino: { tipo: destino.tipo, texto: dest },
        n, tam, expira: ahora + VENTANA, pasos: deshacer, ...nota, limpio: false };
      await aguarda(req.user, (x) => { x.total = (x.total || 0) + 1; x.ops.push(op); x.ops = x.ops.slice(-MAX_HISTORIAL); });
      registrarActividad(req, 'transferencia', { modo, origen: origen.tipo, destino: destino.tipo, n });
      cambio(req.user);
      res.json({ id, modo, n, tam, destino: dest, expira: op.expira, deshacible: true });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Historial ---------- */
  router.get('/historial', async (req, res) => {
    try {
      await limpia(req.user);
      const d = await readJson(archivo(req.user), { total: 0, ops: [] });
      const ahora = Date.now();
      res.json({ total: d.total || 0, ops: d.ops.slice().reverse().map(o => ({ id: o.id, fecha: o.fecha, modo: o.modo, origen: o.origen.texto, destino: o.destino.texto, n: o.n, tam: o.tam, deshacible: !o.deshecha && o.expira > ahora, expira: o.expira, deshecha: !!o.deshecha })) });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Deshacer (solo durante el minuto) ---------- */
  router.post('/:id/deshacer', async (req, res) => {
    try {
      if (!/^[a-f0-9]{16}$/.test(req.params.id)) throw new HttpError(404, 'No existe ese envío');
      await limpia(req.user);
      let op = null;
      await aguarda(req.user, (x) => {
        op = x.ops.find(o => o.id === req.params.id);
        if (!op) throw new HttpError(404, 'No existe ese envío');
        if (op.deshecha) throw new HttpError(400, 'Ya está deshecho');
        if (op.expira <= Date.now()) throw new HttpError(410, 'Ya no se puede deshacer (pasó 1 minuto)');
        op.deshecha = true;
      });
      // Pasos en orden inverso
      for (const p of op.pasos.slice().reverse()) {
        if (p.k === 'mover') { const de = absDe(req.user, p.de, true), a = absDe(req.user, p.a, true); await fsp.mkdir(path.dirname(a), { recursive: true }); await fsp.rename(de, a); }
        else if (p.k === 'crear') { for (const r of p.rutas) await fsp.rm(absDe(req.user, r, true), { recursive: true, force: true }); }
        else if (p.k === 'proyecto') await codigo.borra(req.user, p.id);
        else if (p.k === 'quitaProyecto') await codigo.quitaRutas(req.user, p.id, p.rutas);
        else if (p.k === 'restauraArchivos') {
          const stg = path.join(base(req.user), 'stg', p.stg);
          for (const [origenRel, i] of p.pares) {
            const a = absDe(req.user, origenRel, true);
            await fsp.mkdir(path.dirname(a), { recursive: true });
            await fsp.rename(path.join(stg, i), a);
          }
        }
        else if (p.k === 'restauraProyecto') await codigo.restaura(req.user, p.token, p.id);
      }
      await fsp.rm(path.join(base(req.user), 'stg', req.params.id), { recursive: true, force: true });
      await aguarda(req.user, (x) => { const o = x.ops.find(y => y.id === req.params.id); if (o) { o.staging = false; o.aparcado = null; o.limpio = true; } });
      cambio(req.user);
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  return { router, core: { resumen: async (user) => { const d = await readJson(archivo(user), { total: 0 }); return { mud_envios: d.total || 0 }; } } };
}

module.exports = createTransferir;
