'use strict';
// Copia de seguridad de los datos (Administración → Copia de seguridad).
// Conserva una copia verificada por día de Madrid durante 14 días, en COPIAS_DIR: fuera de la web.
// Pasos: comprobar espacio → empaquetar en un temporal → verificar → publicar el archivo del día → purgar los caducados.
// Si algo falla, las copias buenas anteriores no se tocan. El registro de intentos vive en estado.json.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { readJson, updateJson, HttpError } = require('../nucleo/store');
const archivo = require('./archivo');
const recuperacion = require('./recuperar');
const { ahoraMadrid, arrancaPrograma, HORAS } = require('./programa');

const MARGEN = 200 * 1024 * 1024;   // espacio libre extra que se exige además del tamaño de los datos
const HISTORIAL = 20;
const ALERTA_MS = 26 * 3600 * 1000;
const DIAS_COPIAS = 14;
const DIA_MS = 86400000;

function tam(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function createCopias({ express, auth, adminOnly, sendError, registrarActividad, alCambiar, dataRoot, appDir, copiasDir }) {
  const router = express.Router();
  const estadoFile = path.join(copiasDir, 'estado.json');
  const vacio = () => ({ historial: [], ultima: null, ultimaOk: null, total: 0, manuales: {} });
  let enCurso = null;
  let restauracion = null;
  let reciente = null;   // último intento en memoria: se muestra aunque no se haya podido guardar en estado.json

  // Registro de intentos. Si el último intento solo está en memoria (no se pudo escribir), se añade para que el panel lo muestre
  async function leeEstado() {
    const s = await readJson(estadoFile, vacio);
    if (reciente && (!s.ultima || reciente.fecha > s.ultima.fecha)) {
      s.ultima = reciente;
      s.historial = [reciente, ...(s.historial || [])];
      if (reciente.resultado === 'ok') s.ultimaOk = reciente;
    }
    return s;
  }

  async function asegura() { await fsp.mkdir(copiasDir, { recursive: true, mode: 0o700 }); }

  const diaNumero = (dia) => Date.parse(`${dia}T00:00:00Z`);
  async function migraCopiaAnterior() {
    const anterior = path.join(copiasDir, archivo.NOMBRE);
    const st = await fsp.stat(anterior).catch(e => { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; });
    if (!st) return;
    const dia = ahoraMadrid(st.mtime).fecha;
    const destino = path.join(copiasDir, archivo.nombreDelDia(dia));
    try { await fsp.access(destino); } catch (e) { if (e.code !== 'ENOENT') throw e; await fsp.rename(anterior, destino); }
  }

  async function listaCopias() {
    await migraCopiaAnterior();
    const nombres = await fsp.readdir(copiasDir).catch(e => { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []; throw e; });
    const copias = await Promise.all(nombres.map(async nombre => {
      const dia = archivo.diaDelNombre(nombre);
      if (!dia || !Number.isFinite(diaNumero(dia))) return null;
      const st = await fsp.stat(path.join(copiasDir, nombre)).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      return st && st.isFile() ? { fecha: dia, nombre, tamano: st.size, creada: st.mtime.toISOString() } : null;
    }));
    return copias.filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async function purgaCopias() {
    const hoy = diaNumero(ahoraMadrid().fecha);
    for (const copia of await listaCopias()) {
      if (diaNumero(copia.fecha) < hoy - (DIAS_COPIAS - 1) * DIA_MS) await fsp.rm(path.join(copiasDir, copia.nombre));
    }
  }

  // Mensaje claro cuando el sistema impide escribir en COPIAS_DIR (típico: la ruta no está en ReadWritePaths de systemd)
  function explica(e) {
    if (['EROFS', 'EACCES', 'EPERM'].includes(e && e.code)) {
      return `El servicio no puede escribir en ${copiasDir} (${e.code}). Añade esa ruta a ReadWritePaths de la unidad systemd y reinicia el servicio.`;
    }
    return String((e && e.message) || e);
  }

  // Quita los restos de una copia interrumpida (temporal o carpeta de trabajo a medias)
  async function limpiaRestos() {
    const nombres = await fsp.readdir(copiasDir).catch(() => []);
    for (const n of nombres) {
      if (n.endsWith('.tar.gz.tmp') || n.startsWith('.trabajo-')) await fsp.rm(path.join(copiasDir, n), { recursive: true, force: true }).catch(() => {});
    }
  }

  // Hace una copia. No lanza: el resultado (correcto o fallido) queda en el registro y en estado.json
  async function crea({ origen, usuario }) {
    if (restauracion && restauracion.estado === 'en_curso') throw new HttpError(409, 'Hay una recuperación en marcha');
    enCurso = { origen, desde: Date.now() };
    const t0 = Date.now();
    console.log(`[copias] iniciada (${origen}${usuario ? ', ' + usuario : ''})`);
    const dia = ahoraMadrid(new Date(t0)).fecha;
    const nombre = archivo.nombreDelDia(dia);
    const destino = path.join(copiasDir, nombre);
    const tmp = destino + '.tmp';
    const trabajo = path.join(copiasDir, `.trabajo-${process.pid}-${t0}`);
    const reg = { fecha: new Date(t0).toISOString(), fechaMadrid: ahoraMadrid().fecha, origen, usuario: usuario || null, resultado: 'error' };
    try {
      await asegura();
      await fsp.access(copiasDir, fs.constants.W_OK);
      await limpiaRestos();
      const tamDatos = await archivo.tamanoDe(dataRoot);
      const libre = await archivo.espacioLibre(copiasDir);
      if (libre < tamDatos + MARGEN) throw new Error(`Falta espacio: hacen falta unos ${tam(tamDatos + MARGEN)} libres y hay ${tam(libre)}`);
      const { app } = await archivo.preparaStaging({ dataRoot, appDir, staging: path.join(trabajo, 'staging') });
      await archivo.empaqueta({ staging: path.join(trabajo, 'staging'), destino: tmp, app });
      const { archivos, json, jsonMalos } = await archivo.verifica({ archivo: tmp, trabajo: path.join(trabajo, 'verifica') });
      if (jsonMalos) throw new Error(`${jsonMalos} de ${json} archivos JSON no se pueden leer`);
      await fsp.chmod(tmp, 0o600);
      await fsp.rename(tmp, destino);
      const st = await fsp.stat(destino);
      Object.assign(reg, { resultado: 'ok', tamano: st.size, archivos, json, incluyeApp: app, copia: dia });
      await purgaCopias().catch(e => console.error('[copias] no se pudo limpiar el historial:', e));
    } catch (e) {
      reg.error = explica(e).slice(0, 400);
      console.error('[copias] fallo:', e && e.stack ? e.stack : e);
      await fsp.rm(tmp, { force: true }).catch(() => {});
    } finally {
      await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
      reg.duracionMs = Date.now() - t0;
      enCurso = null;
    }
    reciente = reg;
    console.log(`[copias] terminada: ${reg.resultado} en ${Math.round(reg.duracionMs / 1000)} s${reg.error ? ' — ' + reg.error : ''}`);
    await anota(reg);
    return reg;
  }

  async function anota(reg) {
    try {
      await asegura();
      await updateJson(estadoFile, vacio, (s) => {
        s.historial = [reg, ...(s.historial || [])].slice(0, HISTORIAL);
        s.ultima = reg;
        if (reg.resultado === 'ok') {
          s.ultimaOk = reg;
          s.total = (s.total || 0) + 1;
          if (reg.origen === 'manual' && reg.usuario) {
            s.manuales = { ...(s.manuales || {}), [reg.usuario]: ((s.manuales || {})[reg.usuario] || 0) + 1 };
          }
        }
      });
      if (reg.resultado === 'ok' && reg.usuario && alCambiar) alCambiar({ username: reg.usuario });
    } catch (e) {
      // Sin poder escribir el registro, el panel usa el intento en memoria (ver leeEstado) y el fallo queda en el diario
      console.error('[copias] no se pudo guardar el registro:', e && e.message);
    }
  }

  function alertaDe(s) {
    if (!s.ultima) return 'Todavía no hay ninguna copia. La primera se hará a las 3:00 o puedes crearla ahora.';
    if (s.ultima.resultado === 'error') return `La última copia falló: ${s.ultima.error}`;
    if (!s.ultimaOk || Date.now() - new Date(s.ultimaOk.fecha).getTime() > ALERTA_MS) return 'La última copia correcta tiene más de 26 horas.';
    return null;
  }

  async function estado() {
    const s = await leeEstado();
    const copias = await listaCopias();
    return {
      enCurso,
      restauracion,
      ultima: s.ultima,
      ultimaOk: s.ultimaOk,
      historial: (s.historial || []).slice(0, 10),
      total: s.total || 0,
      archivo: copias[0] ? { tamano: copias[0].tamano, fecha: copias[0].creada } : null,
      copias,
      retencionDias: DIAS_COPIAS,
      alerta: alertaDe(s),
      programacion: { zona: 'Europe/Madrid', horas: HORAS.map(h => `${String(h).padStart(2, '0')}:00`) },
    };
  }

  // ---------- Rutas (solo administradores) ----------
  router.get('/', auth, adminOnly, async (req, res) => {
    try { res.json(await estado()); } catch (e) { sendError(res, e); }
  });

  // Arranca la copia a mano y responde enseguida: el panel consulta GET / para ver cuándo termina
  router.post('/', auth, adminOnly, (req, res) => {
    try {
      if (enCurso || (restauracion && restauracion.estado === 'en_curso')) throw new HttpError(409, 'Ya hay una copia o recuperación en marcha');
      registrarActividad(req, 'copia_iniciada', {});
      crea({ origen: 'manual', usuario: req.user.username }).catch(() => {});
      res.status(202).json({ ok: true, enCurso });
    } catch (e) { sendError(res, e); }
  });

  router.post('/recuperar', auth, adminOnly, express.json({ limit: '10kb' }), async (req, res) => {
    try {
      if (enCurso || (restauracion && restauracion.estado === 'en_curso')) throw new HttpError(409, 'Ya hay una copia o recuperación en marcha');
      const fecha = req.body && req.body.fecha;
      if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new HttpError(400, 'Fecha inválida');
      const copia = (await listaCopias()).find(c => c.fecha === fecha);
      if (!copia) throw new HttpError(404, 'No existe esa copia');
      if (enCurso || (restauracion && restauracion.estado === 'en_curso')) throw new HttpError(409, 'Ya hay una copia o recuperación en marcha');
      restauracion = { estado: 'en_curso', fecha, desde: new Date().toISOString() };
      registrarActividad(req, 'copia_recuperacion_iniciada', { fecha });
      const elegido = path.join(copiasDir, copia.nombre);
      recuperacion.recuperar({ archivo: elegido, dataRoot, appDir, copiasDir }).then(resumen => {
        restauracion = { estado: 'ok', fecha, desde: restauracion.desde, fin: new Date().toISOString(), ...resumen };
        console.log(`[copias] recuperación de ${fecha}: ${resumen.archivos} archivos y ${resumen.registros} registros añadidos`);
      }).catch(e => {
        restauracion = { estado: 'error', fecha, desde: restauracion.desde, fin: new Date().toISOString(), error: explica(e).slice(0, 300) };
        console.error('[copias] recuperación fallida:', e);
      });
      res.status(202).json({ ok: true, restauracion });
    } catch (e) { sendError(res, e); }
  });

  router.get('/descarga', auth, adminOnly, async (req, res) => {
    try {
      const copias = await listaCopias();
      const fecha = req.query.fecha;
      if (fecha !== undefined && (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) throw new HttpError(400, 'Fecha inválida');
      const copia = fecha ? copias.find(c => c.fecha === fecha) : copias[0];
      if (!copia) throw new HttpError(404, 'No existe esa copia');
      registrarActividad(req, 'copia_descargada', { fecha: copia.fecha, tamano: copia.tamano });
      res.download(path.join(copiasDir, copia.nombre), copia.nombre);
    } catch (e) { sendError(res, e); }
  });

  // ---------- Programación diaria (3:00, reintentos 4:00 y 5:00, hora de Madrid) ----------
  limpiaRestos().catch(() => {});
  arrancaPrograma({
    copia: () => crea({ origen: 'programada' }),
    ultimaOk: async () => { const s = await leeEstado(); return s.ultimaOk ? ahoraMadrid(new Date(s.ultimaOk.fecha)).fecha : null; },
    enMarcha: () => !!enCurso || !!(restauracion && restauracion.estado === 'en_curso'),
  });

  return {
    router,
    core: {
      // Contador para los logros: copias que ha creado a mano este usuario (las programadas no cuentan)
      async resumen(user) {
        const s = await leeEstado();
        return { copias_manuales: (s.manuales || {})[user.username] || 0 };
      },
      estado,
    },
  };
}

module.exports = createCopias;
