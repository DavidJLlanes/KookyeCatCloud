'use strict';
// Importar · traer lo que tenías en otras apps: Notion, Evernote, Google Docs, Apple Notes y CSV con asignación de columnas.
// Dos pasos: POST /analizar lee el archivo y enseña lo que encontró (nada se escribe) y POST /ejecutar lo importa de verdad.
// Datos propios: <raíz>/.kcc/importar/stats.json (solo contadores para la gamificación).
const crypto = require('crypto');
const path = require('path');
const store = require('../nucleo/store');
const { kccDir, readJson, updateJson, HttpError } = store;
const C = require('./constantes');
const plan = require('./plan');
const csv = require('./csv');
const contactosCsv = require('./contactos-csv');
const { ejecutaNotas } = require('./ejecuta-notas');
const { ejecutaTabla } = require('./ejecuta-tablas');
const { analizaEnHilo } = require('./hilo');

function createImportar({ express, multer, userRoot, sendError, registrarActividad, alCambiar, notas, bases, contactos }) {
  const router = express.Router();
  const json = express.json({ limit: '1mb' });
  const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: C.MAX_SUBIDA, files: 1 } });
  const statsFile = (user) => path.join(kccDir(userRoot(user), 'importar'), 'stats.json');
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper la importación */ } };

  // Paquetes analizados a la espera de confirmar (en memoria: se pierden al reiniciar y caducan solos)
  const espera = new Map();
  const barre = () => { const t = Date.now(); for (const [k, v] of espera) if (v.expira < t) espera.delete(k); };
  const guarda = (user, paquete) => {
    barre();
    const suyos = [...espera.entries()].filter(([, v]) => v.user === user.username);
    for (const [k] of suyos.slice(0, Math.max(0, suyos.length - C.PAQUETES_POR_USUARIO + 1))) espera.delete(k);
    const token = crypto.randomBytes(16).toString('hex');
    espera.set(token, { user: user.username, paquete, expira: Date.now() + C.PAQUETE_TTL, peso: pesoDe(paquete) });
    return token;
  };

  // Memoria: un análisis puede ocupar cientos de MB (ZIP de 100 MB descomprimido hasta 300 MB). Como mucho dos a la vez en todo
  // el servidor y un tope global de lo que esperan confirmación; si no, se pide esperar en vez de arriesgar quedarse sin memoria.
  let enCurso = 0;
  const pesoDe = (p) => p.adj.total + p.notas.reduce((a, n) => a + n.md.length * 2, 0) + p.tablas.reduce((a, t) => a + t.total * t.cabecera.length * 24, 0);
  const pesoEspera = () => { let s = 0; for (const v of espera.values()) s += v.peso || 0; return s; };
  const turno = (req, res, next) => {
    barre();
    if (enCurso >= C.ANALISIS_A_LA_VEZ || pesoEspera() > C.MAX_EN_ESPERA) return res.status(503).set('Retry-After', '30').json({ error: 'Hay otra importación grande en marcha. Espera un minuto y vuelve a intentarlo.' });
    enCurso++; let hecho = false; const fin = () => { if (!hecho) { hecho = true; enCurso--; } };
    res.on('finish', fin); res.on('close', fin); next();
  };

  const suma = (user, cambios) => updateJson(statsFile(user), () => ({}), (d) => {
    for (const [k, n] of Object.entries(cambios)) if (n) d[k] = (d[k] || 0) + n;
  }).catch(() => {});

  router.post('/analizar', turno, subida.single('archivo'), async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, 'Sube un archivo');
      const nombre = Buffer.from(req.file.originalname || 'archivo', 'latin1').toString('utf8');   // multer entrega el nombre en latin1
      const p = await analizaEnHilo(req.file.buffer, nombre, String(req.body.fuente || ''));   // en otro hilo: el servidor sigue atendiendo
      const citados = p.adj.citados(p.notas.map(n => n.md));
      const todas = await bases.lista(req.user);
      res.json({
        token: guarda(req.user, p),
        ...plan.resumen(p, citados),
        tablasDetalle: p.tablas.map((t, i) => ({
          i, nombre: t.nombre, separador: t.separador, total: t.total, truncado: t.truncado, cabecera: t.cabecera, muestra: t.filas.slice(0, 5),
          tipos: t.cabecera.map((_, k) => csv.sugiereTipo(t.filas.slice(0, 500).map(f => f[k]))),
          campos: contactosCsv.sugiere(t.cabecera),
        })),
        camposContacto: contactosCsv.CAMPOS,
        bases: todas.map(b => ({ id: b.id, nombre: b.name, columnas: b.columns.map((c, i) => ({ i, nombre: c.nombre, tipo: c.tipo })) })),
      });
    } catch (e) { sendError(res, e); }
  });

  router.post('/ejecutar', json, async (req, res) => {
    try {
      const b = req.body || {};
      barre();
      const ent = espera.get(String(b.token));
      if (!ent || ent.user !== req.user.username) throw new HttpError(404, 'El análisis caducó: vuelve a subir el archivo');
      const p = ent.paquete;
      const hoy = new Date().toISOString().slice(0, 10);
      const out = { fuente: p.fuente, notas: null, tablas: [], errores: [] };
      if (b.notas !== false && p.notas.length) {
        try {
          out.notas = await ejecutaNotas({
            user: req.user, paquete: p, destino: String(b.destino || ''), notes: notas(), extraeLinks: notas().extraeLinks, cuentaBloques: require('../notes/bloques').cuentaBloques,
            userRoot, nombreRaiz: `Importado de ${plan.NOMBRES[p.fuente] || 'archivo'} · ${hoy}`,
          });
        } catch (e) { out.errores.push(`Notas: ${e.message}`); if (!(e instanceof HttpError)) console.error('[importar] notas:', e); }
      }
      for (const aj of Array.isArray(b.tablas) ? b.tablas.slice(0, 50) : []) {
        const t = p.tablas[aj && aj.tabla];
        if (!t) continue;
        try { out.tablas.push(await ejecutaTabla({ user: req.user, tabla: t, ajuste: aj, bases, contactos })); }
        catch (e) { out.errores.push(`${t.nombre}: ${e.message}`); }
      }
      const hechas = out.tablas.length > 0 || !!out.notas;
      if (hechas) {
        espera.delete(String(b.token));
        await suma(req.user, {
          importaciones: 1, notas: out.notas ? out.notas.notas : 0, adjuntos: out.notas ? out.notas.adjuntos : 0,
          filas: out.tablas.reduce((a, t) => a + (t.filas || 0), 0), [`f_${p.fuente}`]: 1,
        });
        registrarActividad(req, 'importacion', { fuente: p.fuente, notas: out.notas ? out.notas.notas : 0, tablas: out.tablas.length });
        cambio(req.user);
      }
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  return {
    router,
    core: {
      async resumen(user) {
        const s = await readJson(statsFile(user), {});
        const fuentes = Object.keys(s).filter(k => k.startsWith('f_') && s[k] > 0).length;
        return { im_importaciones: s.importaciones || 0, im_notas: s.notas || 0, im_filas: s.filas || 0, im_adjuntos: s.adjuntos || 0, im_fuentes: fuentes };
      },
    },
  };
}

module.exports = createImportar;
