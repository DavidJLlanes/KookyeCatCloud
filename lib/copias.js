'use strict';
// Copia de seguridad de los datos (Administración → Copia de seguridad).
// Mantiene UN solo archivo, que se reemplaza en cada copia (sin historial de versiones), en COPIAS_DIR: fuera de la web.
// Pasos: comprobar espacio → empaquetar en un temporal → verificar → sustituir el anterior. Si algo falla, la copia buena
// anterior no se toca. El registro de intentos vive en estado.json dentro de COPIAS_DIR (no forma parte de la copia).
const fsp = require('fs/promises');
const path = require('path');
const { readJson, updateJson, HttpError } = require('./store');
const archivo = require('./copias-archivo');
const { ahoraMadrid, arrancaPrograma, HORAS } = require('./copias-programa');

const MARGEN = 200 * 1024 * 1024;   // espacio libre extra que se exige además del tamaño de los datos
const HISTORIAL = 20;
const ALERTA_MS = 26 * 3600 * 1000;

function tam(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function createCopias({ express, auth, adminOnly, sendError, registrarActividad, alCambiar, dataRoot, appDir, copiasDir }) {
  const router = express.Router();
  const estadoFile = path.join(copiasDir, 'estado.json');
  const destino = path.join(copiasDir, archivo.NOMBRE);
  const vacio = () => ({ historial: [], ultima: null, ultimaOk: null, total: 0, manuales: {} });
  const leeEstado = () => readJson(estadoFile, vacio);
  let enCurso = null;

  async function asegura() { await fsp.mkdir(copiasDir, { recursive: true, mode: 0o700 }); }

  // Quita los restos de una copia interrumpida (temporal o carpeta de trabajo a medias)
  async function limpiaRestos() {
    const nombres = await fsp.readdir(copiasDir).catch(() => []);
    for (const n of nombres) {
      if (n === archivo.NOMBRE + '.tmp' || n.startsWith('.trabajo-')) await fsp.rm(path.join(copiasDir, n), { recursive: true, force: true }).catch(() => {});
    }
  }

  // Hace una copia. No lanza: el resultado (correcto o fallido) queda en el registro y en estado.json
  async function crea({ origen, usuario }) {
    enCurso = { origen, desde: Date.now() };
    const t0 = Date.now();
    const tmp = path.join(copiasDir, archivo.NOMBRE + '.tmp');
    const trabajo = path.join(copiasDir, `.trabajo-${process.pid}-${t0}`);
    const reg = { fecha: new Date(t0).toISOString(), fechaMadrid: ahoraMadrid().fecha, origen, usuario: usuario || null, resultado: 'error' };
    try {
      await asegura();
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
      Object.assign(reg, { resultado: 'ok', tamano: st.size, archivos, json, incluyeApp: app });
    } catch (e) {
      reg.error = String(e.message || e).slice(0, 400);
      await fsp.rm(tmp, { force: true }).catch(() => {});
    } finally {
      await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
      reg.duracionMs = Date.now() - t0;
      enCurso = null;
    }
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
    } catch { /* si ni siquiera se puede escribir el registro, el panel seguirá mostrando lo anterior */ }
  }

  function alertaDe(s) {
    if (!s.ultima) return 'Todavía no hay ninguna copia. La primera se hará a las 3:00 o puedes crearla ahora.';
    if (s.ultima.resultado === 'error') return `La última copia falló: ${s.ultima.error}`;
    if (!s.ultimaOk || Date.now() - new Date(s.ultimaOk.fecha).getTime() > ALERTA_MS) return 'La última copia correcta tiene más de 26 horas.';
    return null;
  }

  async function estado() {
    const s = await leeEstado();
    const st = await fsp.stat(destino).catch(() => null);
    return {
      enCurso,
      ultima: s.ultima,
      ultimaOk: s.ultimaOk,
      historial: (s.historial || []).slice(0, 10),
      total: s.total || 0,
      archivo: st ? { tamano: st.size, fecha: st.mtime.toISOString() } : null,
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
      if (enCurso) throw new HttpError(409, 'Ya hay una copia en marcha');
      registrarActividad(req, 'copia_iniciada', {});
      crea({ origen: 'manual', usuario: req.user.username }).catch(() => {});
      res.status(202).json({ ok: true, enCurso });
    } catch (e) { sendError(res, e); }
  });

  router.get('/descarga', auth, adminOnly, async (req, res) => {
    try {
      const st = await fsp.stat(destino).catch(() => null);
      if (!st) throw new HttpError(404, 'Todavía no hay ninguna copia');
      registrarActividad(req, 'copia_descargada', { tamano: st.size });
      res.download(destino, archivo.NOMBRE);
    } catch (e) { sendError(res, e); }
  });

  // ---------- Programación diaria (3:00, reintentos 4:00 y 5:00, hora de Madrid) ----------
  limpiaRestos().catch(() => {});
  arrancaPrograma({
    copia: () => crea({ origen: 'programada' }),
    ultimaOk: async () => { const s = await leeEstado(); return s.ultimaOk ? ahoraMadrid(new Date(s.ultimaOk.fecha)).fecha : null; },
    enMarcha: () => !!enCurso,
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
