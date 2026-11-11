/**
 * KookyeCatCloud - Servidor de archivos y backup de fotos personal, autoalojado
 */
// systemd (EnvironmentFile) no quita los comentarios al final de línea: `OFFICE_TIMEOUT=90000   # en ms`
// llegaba como "90000   # en ms" y Number() daba NaN (TEXT_MAX rompía el visor de texto y OFFICE_TIMEOUT
// mataba LibreOffice al instante). Solo se recorta cuando el valor es un número seguido de un comentario.
for (const k of Object.keys(process.env)) {
  const m = /^(\d+(?:[.,]\d+)?\s*[kmgKMG]?[bB]?)\s+#.*$/.exec(process.env[k]);
  if (m) process.env[k] = m[1].trim();
}
const express = require('express');
// Express 4 no recoge los rechazos de los manejadores async: un error fuera de su try dejaba la petición sin respuesta
// (la app se quedaba «leyendo» hasta agotar el tiempo). Se envía al manejador de errores final, que responde en JSON.
{
  const Layer = require('express/lib/router/layer');
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); }
    catch (err) { next(err); }
  };
}
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
// archiver 8 ya no exporta una función: se instancia la clase del formato
const { ZipArchive } = require('archiver');
const { createDav } = require('./webdav');
const createEvents = require('./lib/events');
const createLabels = require('./lib/labels');
const createValores = require('./lib/valores');
const createCalendar = require('./lib/calendar');
const createPrompts = require('./lib/prompts');
const createClip = require('./lib/clip');
const { createGame } = require('./lib/game');
const store = require('./lib/store');
const { readJson, updateJson, kccDir } = store;
const createContacts = require('./lib/contacts');
const createNotesExtra = require('./lib/notes-extra');
const createPdf = require('./lib/pdf');
const createNotes = require('./lib/notes');
const createAlbums = require('./lib/albums');
const createPapelera = require('./lib/papelera');
const createFotos = require('./lib/fotos');
const createOffice = require('./lib/office');
const createCuentas = require('./lib/cuentas');
const createEnlaces = require('./lib/enlaces');
const createShopping = require('./lib/shopping');
const createGames = require('./lib/games');
const createBases = require('./lib/bases');
const createPagos = require('./lib/pagos');
const createMarcadores = require('./lib/marcadores');
const createPerfil = require('./lib/perfil');
const createAnalisis = require('./lib/analisis');
const createWeb = require('./lib/web');
const { base32Encode, totpVerificar } = require('./lib/totp');
const { isBlocked, registerFailure, clearFailures } = require('./lib/limitador');
const createPush = require('./lib/push');
const createCodigo = require('./lib/codigo');
const createVinculos = require('./lib/vinculos');
const createTransferir = require('./lib/transferir');
const createExportar = require('./lib/exportar');
const createCopias = require('./lib/copias');
const createVersions = require('./lib/versions');
const createVault = require('./lib/vault');
const createShares = require('./lib/shares');
const createWebAuthn = require('./lib/webauthn');

// sharp es opcional: si no está instalado, las miniaturas caen a la imagen original
let sharp = null;
try { sharp = require('sharp'); } catch { /* sin miniaturas optimizadas */ }

// ffmpeg también es opcional: sin él, los vídeos salen con su distintivo en vez de fotograma
const { execFileSync, spawn } = require('child_process');
let ffmpeg = false;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = true; } catch { /* sin miniaturas de vídeo */ }

// LibreOffice, para ver documentos de Office en el navegador. Si no está, esos
// archivos se pueden descargar igual, solo que sin vista previa.
let soffice = null;
for (const cmd of ['soffice', 'libreoffice']) {
  try { execFileSync(cmd, ['--version'], { stdio: 'ignore', timeout: 15000 }); soffice = cmd; break; } catch { /* siguiente */ }
}

const APP_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || '/data/storage';
const USERS_FILE = path.join(APP_DIR, 'users.json');
const SECRET_FILE = path.join(APP_DIR, '.jwt-secret');
const PORT = process.env.PORT || 4000;
// Las cookies van con flag Secure salvo que se desactive a propósito (desarrollo en http://localhost)
const SECURE_COOKIES = process.env.INSECURE_COOKIES !== '1';
// Prefijo de URL si la app vive en una subcarpeta del dominio (p. ej. /cloud para
// midominio.es/cloud). Vacío = raíz del dominio o de un subdominio. Se normaliza para
// admitir "cloud", "/cloud" o "/cloud/".
const BASE_PATH = (() => {
  const limpio = String(process.env.BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
  return limpio ? '/' + limpio : '';
})();
const COOKIE_PATH = BASE_PATH || '/';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024 * 1024);
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;
const MIN_PASSWORD = 8;
// Caché de miniaturas: fuera de DATA_DIR para que no aparezca en los listados
const THUMBS_DIR = process.env.THUMBS_DIR || path.join(APP_DIR, '.thumbs');
// Copia de seguridad: fuera de la web y de DATA_DIR (un único archivo, reemplazado en cada copia)
const COPIAS_DIR = process.env.COPIAS_DIR || '/var/backups/kookyecatcloud';
const THUMB_SIZE = 480;
const { TRASH_DIR, TRASH_SWEEP_HOURS } = createPapelera;
const SEARCH_LIMIT = 300;
const BATCH_LIMIT = 500;
// Enlaces: de subida (otros te dejan archivos) y de descarga (mandas tú algo).
// Comparten archivo y se distinguen por el campo kind.
const ZIP_LIMIT = Number(process.env.ZIP_LIMIT || 200);
// Bloc de notas: vive dentro de la carpeta del usuario, oculto del explorador
const { NOTES_DIR } = createNotes;
// Sesiones (para poder cerrarlas en remoto) y registro de actividad
const SESSIONS_FILE = path.join(APP_DIR, 'sessions.json');
const ACTIVITY_FILE = path.join(APP_DIR, 'activity.log.jsonl');
const ACTIVITY_MAX = Number(process.env.ACTIVITY_MAX || 2000);
const ACTIVITY_DIAS = Number(process.env.ACTIVITY_DIAS || 60);   // los registros más antiguos se borran solos


// --- Setup ---
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
} catch (err) {
  console.error(`No se pudo crear el directorio de datos ${DATA_DIR}:`, err.message);
  process.exit(1);
}
// Raíz canónica: todas las rutas se validan contra ella con los symlinks ya resueltos
const DATA_ROOT = fs.realpathSync(DATA_DIR);

/**
 * Secreto de firma JWT. Nunca hay un valor por defecto conocido: se usa JWT_SECRET
 * si existe, y si no se genera uno aleatorio y se guarda para sobrevivir reinicios.
 */
function loadSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) {
      console.error('JWT_SECRET es demasiado corto: usa al menos 32 caracteres aleatorios.');
      process.exit(1);
    }
    return fromEnv;
  }
  if (fs.existsSync(SECRET_FILE)) {
    const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (saved.length >= 32) return saved;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  console.log(`JWT_SECRET no definido: generado uno aleatorio en ${SECRET_FILE}`);
  return generated;
}
const JWT_SECRET = loadSecret();

function loadUsers() {
  return store.leeJsonSync(USERS_FILE, []);
}
function saveUsers(users) {
  store.escribeJsonSync(USERS_FILE, users, 0o600);
}

// Bootstrap: crea admin por defecto si no hay usuarios
if (!fs.existsSync(USERS_FILE)) {
  const defaultPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = bcrypt.hashSync(defaultPass, 10);
  saveUsers([{ username: 'admin', passwordHash: hash, role: 'admin' }]);
  console.log('==================================================');
  console.log('Usuario admin creado. Usuario: admin  Password:', defaultPass);
  console.log('CAMBIA ESTA CONTRASEÑA DESPUÉS DE ENTRAR.');
  console.log('==================================================');
}

// Hash de descarte: iguala el tiempo de respuesta cuando el usuario no existe,
// para no filtrar por temporización qué nombres de usuario están dados de alta.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

/* ---------------- Sesiones ----------------
   El JWT sigue siendo la cookie, pero ya no basta por sí solo: cada uno lleva
   un jti que apunta a un registro aquí. Cerrar una sesión en remoto borra su
   registro, y el siguiente uso de ese token cae con 401 aunque no haya caducado. */
function loadSessions() {
  return store.leeJsonSync(SESSIONS_FILE, {});
}
function saveSessions(data) {
  store.escribeJsonSync(SESSIONS_FILE, data, 0o600);
}
const sessions = loadSessions();
let sessionsSucio = false;
setInterval(() => { if (sessionsSucio) { sessionsSucio = false; saveSessions(sessions); } }, 5000).unref();

function creaSesion(username, req) {
  const jti = crypto.randomBytes(16).toString('hex');
  sessions[jti] = {
    jti, username,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    ip: req.ip,
    ua: String(req.headers['user-agent'] || '').slice(0, 200),
  };
  sessionsSucio = true;
  return jti;
}
function revocaSesion(jti) {
  if (!sessions[jti]) return false;
  delete sessions[jti];
  vaultMod.cierraSesion(jti);                    // la caja fuerte de esa sesión se vuelve a bloquear
  sessionsSucio = true;
  return true;
}

/* ---------------- Registro de actividad ----------------
   Un evento por línea (JSONL), fácil de seguir con tail -f. Se recorta solo
   para que nadie tenga que acordarse de vaciarlo. */
function registrarActividad(req, accion, detalle) {
  try {
    const entry = {
      t: Date.now(),
      user: (req.user && req.user.username) || (detalle && detalle.username) || null,
      accion,
      ip: req.ip,
      detalle: detalle || {},
    };
    actividadEnVuelo++;
    fs.appendFile(ACTIVITY_FILE, JSON.stringify(entry) + '\n', () => { actividadEnVuelo--; });
  } catch { /* un fallo aquí no debe tumbar la petición real */ }
}
let actividadEnVuelo = 0;   // escrituras pendientes: la poda espera a que terminen para no perder ninguna línea
// Poda el registro: quita lo que supera ACTIVITY_DIAS de antigüedad y recorta a ACTIVITY_MAX líneas
// Síncrona y atómica: mientras corre no puede llegar ninguna línea nueva (el bucle está ocupado) y antes espera a que
// terminen las que estaban escribiéndose; antes una línea registrada durante la poda podía perderse.
function podarActividad() {
  if (actividadEnVuelo) { setTimeout(podarActividad, 250).unref(); return; }
  try {
    let data; try { data = fs.readFileSync(ACTIVITY_FILE, 'utf8'); } catch { return; }
    const desde = Date.now() - ACTIVITY_DIAS * 86400000;
    const todas = data.split('\n').filter(Boolean);
    let lineas = todas.filter((l) => { try { return JSON.parse(l).t >= desde; } catch { return false; } });
    if (lineas.length > ACTIVITY_MAX) lineas = lineas.slice(-ACTIVITY_MAX);
    if (lineas.length === todas.length) return;
    const tmp = `${ACTIVITY_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, lineas.length ? lineas.join('\n') + '\n' : '');
    fs.renameSync(tmp, ACTIVITY_FILE);
  } catch (e) { console.warn('[actividad] no se pudo podar el registro:', e.message); }
}
setTimeout(podarActividad, 5000).unref();
setInterval(podarActividad, 10 * 60 * 1000).unref();

// Módulos nuevos. Se crean aquí, antes de las rutas, porque las rutas de archivos los usan.
const labelsMod = createLabels({ express, userRoot, sendError });
const valoresMod = createValores({ express, userRoot, sendError, registrarActividad, alCambiar: (u) => alCambiarContenido(u) });
const calendarMod = createCalendar({
  express, userRoot, sendError, registrarActividad,
  icalIndexFile: path.join(APP_DIR, 'ical-tokens.json'),   // token de suscripción -> usuario
});
const promptsMod = createPrompts({
  express, multer, sharp, userRoot, sendError, registrarActividad,
  calendar: calendarMod.core, labels: labelsMod,
  papeleraDias: (user) => papeleraDias(user),
  valores: valoresMod.core,
});
const contactsMod = createContacts({ express, sharp, userRoot, sendError, registrarActividad, labels: labelsMod, calendar: calendarMod.core, valores: valoresMod.core });
const shoppingMod = createShopping({ express, multer, sharp, dataRoot: DATA_ROOT, sendError, registrarActividad });
const alCambiarContenido = (user) => { if (typeof gameMod !== 'undefined' && gameMod) gameMod.invalida(user); };   // refresca los logros al instante
const gamesMod = createGames({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar: calendarMod.core, alCambiar: alCambiarContenido, valores: valoresMod.core });
const basesMod = createBases({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido });
const pagosMod = createPagos({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, calendar: calendarMod.core, valores: valoresMod.core });
// KCC_ICONOS_LOCALES=1 solo lo usan las pruebas (permite buscar iconos en un servidor local; en producción está prohibido: SSRF)
const marcadoresMod = createMarcadores({ express, sharp, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, permiteLocal: process.env.KCC_ICONOS_LOCALES === '1' });
const perfilMod = createPerfil({ express, multer, sharp, userRoot, usuarios: () => loadUsers(), sendError, registrarActividad, alCambiar: alCambiarContenido });
// Avisos push (lib/push): leen de Pagos, Calendario y Contactos, que se crean antes. Claves VAPID en <app>/vapid.json
const pushMod = createPush({ express, userRoot, usuarios: () => loadUsers(), sendError, registrarActividad, alCambiar: alCambiarContenido, claveFile: path.join(APP_DIR, 'vapid.json'),
  fuentes: { pagos: pagosMod.core, calendario: calendarMod.core, contactos: contactsMod.core } });
// Módulos que aportan recuentos a la gamificación: todo módulo nuevo se añade aquí (ver CLAUDE.md)
const codigoMod = createCodigo({ express, multer, ZipArchive, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, valores: valoresMod.core });
// Enviar entre secciones (Archivos ⇄ Código): copiar o mover, con deshacer de 1 minuto
const transferMod = createTransferir({ express, userRoot, resuelve: (user, r, write) => resolveFor(user, r, { write }), esCompartida: (r) => !!sharesMod.parse(r), sendError, registrarActividad, alCambiar: alCambiarContenido, codigo: codigoMod.core,
  // Secciones que también pueden enviar: getters porque se crean más abajo (clipMod, contactsMod, notas)
  fuentes: {
    get portapapeles() { return clipMod.core; },
    get contactos() { return contactsMod.core; },
    get notas() { return notasFuente; },
    get bases() { return basesMod.core; },
    get juegos() { return gamesMod.core; },
  } });
const modulosConLogros = [gamesMod, basesMod, codigoMod, transferMod, valoresMod, pagosMod, marcadoresMod, perfilMod, pushMod];

// Versiones de archivos de texto (se crea aquí porque WebDAV y las rutas de archivos la usan)
const versionsMod = createVersions({
  express, auth: (req, res, next) => auth(req, res, next), userRoot, resolveFor, sendError, textMax: bytesDeEntorno(process.env.TEXT_MAX, 512 * 1024),
});

// Passkeys (Face ID, huella, Windows Hello…): entrar sin contraseña. Solo se guardan claves públicas.
const passkeysMod = createWebAuthn({
  express, auth: (req, res, next) => auth(req, res, next), file: path.join(APP_DIR, 'passkeys.json'), loadUsers,
  abreSesion: (req, res, user, accion) => abreSesion(req, res, user, accion),
  isBlocked, registerFailure, clearFailures, sendError, registrarActividad,
});

// Compartir carpetas entre usuarios (solo lectura o edición). Las rutas "@compartido/…" se traducen aquí.
const sharesMod = createShares({
  express, auth: (req, res, next) => auth(req, res, next), file: path.join(APP_DIR, 'shares.json'),
  userRoot, safeResolve, assertVisible, loadUsers, sendError, registrarActividad,
});

// Caja fuerte cifrada (contraseña propia, clave solo en memoria mientras está abierta)
const vaultMod = createVault({
  express, auth: (req, res, next) => auth(req, res, next), multer, sharp, userRoot, resolveFor, sendError, registrarActividad,
  alRetirar: (user, rel) => calendarMod.core.quitaOrigenArchivo(user, limpiaRel(rel)),   // un archivo que entra en la caja deja el calendario
  maxUpload: MAX_UPLOAD_BYTES,
  alCambiar: alCambiarContenido,
});

// Avisos en directo a las pestañas abiertas (ver lib/events.js)
const eventsMod = createEvents({ userRoot: (u) => userRoot(u) });

// Portapapeles compartido entre dispositivos (texto y archivos temporales) y destino del "Compartir" de Android
const clipMod = createClip({
  express, multer, userRoot, sendError, registrarActividad, events: eventsMod,
  resolveFor: (u, rel) => resolveFor(u, rel), freeName,
  alCambiarArchivos: (user, dir, req) => eventsMod.cambio(dir, String(req.get('x-kcc-client') || '').slice(0, 40).replace(/[^\w-]/g, '')),
});

// Gamificación (XP, logros, retos, Tetris). Los recuentos de contenido se calculan aquí porque solo el servidor conoce todos los módulos.
const RE_FOTO = /\.(jpe?g|png|webp|heic|heif|gif|avif|tiff?|dng|bmp)$/i;
const cacheArchivos = new Map();   // usuario -> { t, archivos, fotos }: recorrer el disco entero es caro, se repite cada 10 min como mucho
async function contarArchivos(user) {
  const hit = cacheArchivos.get(user.username);
  if (hit && Date.now() - hit.t < 600000) return hit;
  let archivos = 0, fotos = 0, vistos = 0;
  const pila = [userRoot(user)];
  while (pila.length && vistos < 400000) {
    const dir = pila.pop();
    let lista = [];
    try { lista = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of lista) {
      if (e.name.startsWith('.')) continue;
      vistos++;
      if (e.isDirectory()) pila.push(path.join(dir, e.name));
      else if (e.isFile()) { archivos++; if (RE_FOTO.test(e.name)) fotos++; }
    }
  }
  const v = { t: Date.now(), archivos, fotos };
  cacheArchivos.set(user.username, v);
  return v;
}
// Recuentos de partes sin módulo propio de logros: compra, favoritos, álbumes y seguridad de la cuenta
async function contarExtrasApp(user) {
  const r = {};
  try {
    const c = await readJson(path.join(DATA_ROOT, '.kcc', 'shopping', 'data.json'), { products: [], entries: [] });
    r.compra_prod = (c.products || []).length;
    r.compra_hechas = (c.entries || []).filter(e => e.status === 'bought').length;
  } catch { /* sin compra */ }
  try { r.favoritos = (await readFavs(user)).length; } catch { /* sin favoritos */ }
  try { const al = await readAlbums(user); r.albumes = al.length; r.album_max = al.reduce((m, a) => Math.max(m, (a.items || []).length), 0); } catch { /* sin álbumes */ }
  try { const u = loadUsers().find(x => x.username === user.username); r.seg_2fa = u && u.twofaSecret ? 1 : 0; } catch { r.seg_2fa = 0; }
  try { const pk = await readJson(path.join(APP_DIR, 'passkeys.json'), { users: {} }); r.seg_passkeys = ((pk.users || {})[user.username] || { creds: [] }).creds.length; } catch { r.seg_passkeys = 0; }
  r.seg_capas = (r.seg_2fa ? 1 : 0) + (r.seg_passkeys ? 1 : 0);
  // La bóveda existe cuando se ha configurado su contraseña (vault.json); su contenido va cifrado y no se cuenta
  try { await fsp.access(path.join(userRoot(user), '.vault', 'vault.json')); r.seg_boveda = 1; } catch { r.seg_boveda = 0; }
  return r;
}
async function contarContenido(user) {
  const raiz = kccDir(userRoot(user));
  const [arch, notas, contactos, cal, etq, prompts, extras, extrasApp] = await Promise.all([
    contarArchivos(user),
    readNotes(user).catch(() => ({ items: [] })),
    readJson(path.join(raiz, 'contacts.json'), { contacts: [] }),
    readJson(path.join(raiz, 'calendar.json'), { events: [] }),
    readJson(path.join(raiz, 'labels.json'), { labels: [] }),
    promptsMod.core.contar(user),
    Promise.all(modulosConLogros.map(m => m.core.resumen(user).catch(() => ({})))).then(l => Object.assign({}, ...l)),
    contarExtrasApp(user),
  ]);
  return {
    archivos: arch.archivos, fotos: arch.fotos,
    notas: (notas.items || []).filter(i => i.type === 'note' && !i.deletedAt && !i.trashed).length,
    contactos: (contactos.contacts || []).filter(c => !c.deletedAt).length,
    eventos: (cal.events || []).length,
    etiquetas: (etq.labels || []).length,
    prompts,
    enlaces: loadLinks().filter(l => l.owner === user.username).length,
    ...extras, ...extrasApp,
  };
}
const gameMod = createGame({ express, userRoot, contar: contarContenido, sendError, registrarActividad });

const root = express();
root.set('trust proxy', 1); // detrás de Nginx: necesario para que req.ip sea la IP real
root.disable('x-powered-by');
// Todas las rutas cuelgan de este router, que se monta en BASE_PATH (o en la raíz)
const app = express.Router();
// WebDAV va ANTES del analizador de JSON: un cliente que suba un .json con
// Content-Type: application/json haría que express.json() se comiera el cuerpo
// y el PUT escribiera un archivo vacío.
app.use('/dav', createDav({
  isBlocked, registerFailure, clearFailures,
  resolveFor,
  userRoot,
  loadUsers,
  isHidden,
  base: BASE_PATH,
  // Borrar o sobrescribir desde WebDAV manda lo anterior a la papelera (papeleraMod se crea más abajo; se usa en tiempo de petición)
  aPapelera: (u, rel) => papeleraMod.core.trashItem(u, rel),
  // Sobrescribir un archivo de texto desde un cliente WebDAV también deja la versión anterior
  alMover: async (user, desde, hacia) => { sharesMod.mueve(user.username, desde, hacia); await versionsMod.mueve(user, desde, hacia); await calendarMod.core.mueveOrigenArchivo(user, desde, hacia); },
  alSobrescribir: async (user, rel, abs) => { if (TEXT_RE.test(path.basename(abs))) await versionsMod.snapshot(user, rel, abs); },
  alCambiar: (user) => eventsMod.cambio(userRoot(user)),
  log: (...a) => console.warn(...a),
}));

// El tope del cuerpo JSON depende de la ruta: la API general es pequeña, pero notas,
// prompts y la importación llevan textos largos. Los analizadores propios de cada ruta
// se saltan solos si el cuerpo ya está leído.
const jsonPequeno = express.json({ limit: '100kb' });
const jsonMedio = express.json({ limit: '2mb' });
const jsonGrande = express.json({ limit: '30mb' });
const jsonPdf = express.json({ limit: '8mb' });
app.use((req, res, next) => {
  if (req.path === '/api/prompts/import') return jsonGrande(req, res, next);
  if (req.path === '/api/pdf') return jsonPdf(req, res, next);
  if (/^\/api\/(notes|text|prompts|calendar|labels|clip|shopping|codigo)(\/|$)/.test(req.path)) return jsonMedio(req, res, next);
  return jsonPequeno(req, res, next);
});
app.use(cookieParser());

// Cabeceras de seguridad, plantillas con prefijo, service worker, versión y archivos estáticos (lib/web)
const webMod = createWeb({ express, APP_DIR, BASE_PATH, SECURE_COOKIES, tileOrigin: () => TILE_ORIGIN });
const { enviaPlantilla } = webMod;
app.use(webMod.cabeceras);
webMod.montaEstaticos(app);

// --- Auth middleware ---
function auth(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Los tokens emitidos antes de que existiera esto no llevan jti: se dejan pasar,
    // así el despliegue no cierra la sesión de todo el mundo de golpe.
    if (payload.jti) {
      const s = sessions[payload.jti];
      if (!s) return res.status(401).json({ error: 'Sesión cerrada' });
      s.lastSeenAt = Date.now();
      sessionsSucio = true;
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}
// Toda escritura correcta de la API invalida los recuentos de logros del usuario (así los logros salen al instante,
// no con la caché de 45 s). Cubre todos los módulos sin tener que añadir el aviso en cada uno.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => { if (res.statusCode < 400 && req.user) { try { alCambiarContenido(req.user); } catch { /* sin logros */ } } });
  }
  next();
});
// Cuando alguien cambia archivos (subir, borrar, mover, carpetas, papelera…) se avisa a las demás
// pestañas del mismo espacio. La pestaña que hizo el cambio manda su id y no recibe el aviso.
const RUTAS_ARCHIVOS = /^\/(mkdir|upload|text|files|batch|trash|move|favorites|albums)(\/|$)/;
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && RUTAS_ARCHIVOS.test(req.path)) {
    const origen = String(req.get('x-kcc-client') || '').slice(0, 40).replace(/[^\w-]/g, '');
    res.on('finish', () => {
      if (res.statusCode < 400 && req.user) { try { eventsMod.cambio(userRoot(req.user), origen); } catch { /* sin aviso */ } }
    });
  }
  next();
});

/* Destino del menú "Compartir" de Android (Web Share Target, ver manifest.json). El navegador manda un POST con
   multipart: título, texto, enlace y archivos. Todo va al portapapeles compartido; luego se abre la app ahí.
   Si no hay sesión se manda a la portada (no se puede guardar nada a nombre de nadie). */
app.post('/share-target',
  (req, res, next) => auth(req, { status: () => ({ json: () => res.redirect(303, `${BASE_PATH}/`) }) }, next),
  clipMod.core.sube,
  async (req, res) => {
    try {
      const b = req.body || {};
      const partes = [b.title, b.text, b.url].map(x => String(x || '').trim()).filter(Boolean);
      // Muchas apps repiten el enlace dentro del texto: no se pone dos veces
      const texto = partes.filter((p, i) => !partes.some((q, j) => j !== i && q.length > p.length && q.includes(p))).join('\n');
      await clipMod.core.agrega(req.user, { texto, archivos: clipMod.core.deMulter(req.files), device: clipMod.core.dispositivoDe(req.get('user-agent')) });
      clipMod.core.avisa(req.user, null);
      registrarActividad(req, 'compartir_android', { files: (req.files || []).length });
      res.redirect(303, `${BASE_PATH}/#clip`);
    } catch (err) {
      await clipMod.core.limpiaTemporales(req.files);
      const msg = String(err.message || 'Error').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
      res.status(err.status || 400).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;background:#0b1020;color:#eaf0ff"><h2>No se pudo guardar lo compartido</h2><p>${msg}</p><p><a style="color:#9db4ff" href="${BASE_PATH}/">Abrir KookyeCatCloud</a></p>`);
    }
  });
app.get('/api/events', auth, eventsMod.manejador);

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

// --- Helpers de rutas seguras (evita path traversal) ---
function invalidPath() {
  const err = new Error('Ruta inválida');
  err.status = 400;
  return err;
}

/**
 * Resuelve relPath dentro de root y garantiza que no se sale de ahí.
 * Compara contra root + separador para que un directorio hermano con el mismo
 * prefijo (/data/storage-backup) no cuele, y resuelve symlinks antes de validar.
 */
function safeResolve(root, relPath) {
  const target = path.resolve(root, path.join('.', relPath || ''));
  if (target !== root && !target.startsWith(root + path.sep)) throw invalidPath();
  // El destino puede no existir todavía (mkdir, mover): en ese caso valida el ancestro más cercano
  let probe = target;
  let real = null;
  while (probe.length >= root.length) {
    try { real = fs.realpathSync(probe); break; } catch { probe = path.dirname(probe); }
  }
  if (real && real !== root && !real.startsWith(root + path.sep)) throw invalidPath();
  return target;
}

/**
 * Raíz de cada usuario: el admin ve todo el almacén, cada usuario normal
 * trabaja aislado dentro de <DATA_ROOT>/users/<username>.
 */
function userRoot(user) {
  if (user.role === 'admin') return DATA_ROOT;
  if (!USERNAME_RE.test(user.username)) throw invalidPath();
  const dir = path.join(DATA_ROOT, 'users', user.username);
  fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync(dir);
}
// Los nombres que empiezan por punto son internos (.trash) y no se exponen nunca:
// ni se listan ni se pueden alcanzar desde la API pública.
// Declaración, no constante: se usa al montar WebDAV, que va más arriba del archivo
function isHidden(name) { return name.startsWith('.'); }
function assertVisible(relPath) {
  const parts = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (parts.some(isHidden)) throw invalidPath();
}
// opts.compartidos: acepta rutas "@compartido/<nombre>~<id>/…" (carpetas que otro usuario te compartió).
// WebDAV y los módulos internos no las usan: llaman con 2 argumentos y esas rutas no existen para ellos.
function resolveFor(user, relPath, opts) {
  if (opts && opts.compartidos) {
    const comp = sharesMod.parse(relPath);
    if (comp) {
      if (!comp.id) throw invalidPath();                         // "@compartido" a secas es solo un listado
      return sharesMod.resolver(user, comp, !!opts.write).abs;
    }
  }
  assertVisible(relPath);
  return safeResolve(userRoot(user), relPath);
}
// Una petición que no es GET/HEAD modifica algo: sobre una carpeta compartida exige permiso de edición
function userPath(req, relPath) {
  return resolveFor(req.user, relPath, { compartidos: true, write: req.method !== 'GET' && req.method !== 'HEAD' });
}
// Mover entre tu almacén y una carpeta compartida (o entre dos compartidas) mezclaría almacenes de dueños distintos
function mismoAlmacen(a, b) {
  const x = sharesMod.parse(a), y = sharesMod.parse(b);
  if (!x && !y) return true;
  return !!x && !!y && x.id === y.id;
}
const esCompartida = (rel) => { try { return !!sharesMod.parse(rel); } catch { return true; } };
const sharesMueve = (user, a, b) => { try { if (!sharesMod.parse(a)) sharesMod.mueve(user.username, a, b); } catch { /* ruta virtual */ } };
// Errores del sistema (disco, permisos…) y fallos de programación nunca enseñan su texto: llevaría rutas del servidor.
// Se cuentan en el registro y el cliente recibe un mensaje general.
const ERRORES_SISTEMA = {
  ENOENT: [404, 'No se ha encontrado'], ENOTDIR: [404, 'No se ha encontrado'], EACCES: [403, 'El servidor no tiene permiso para hacerlo'], EPERM: [403, 'El servidor no tiene permiso para hacerlo'],
  ENOSPC: [507, 'No queda espacio en el disco del servidor'], EEXIST: [409, 'Ya existe'], EISDIR: [400, 'Eso es una carpeta'], EMFILE: [503, 'El servidor está ocupado: inténtalo de nuevo'], ENAMETOOLONG: [400, 'El nombre es demasiado largo'],
};
function sendError(res, err) {
  const sistema = err && typeof err.code === 'string' && err.syscall && /^E[A-Z0-9]+$/.test(err.code);
  const fallo = err instanceof TypeError || err instanceof RangeError || err instanceof ReferenceError;
  if (sistema || fallo) {
    const [estado, mensaje] = (sistema && ERRORES_SISTEMA[err.code]) || [500, 'Error interno del servidor'];
    if (estado >= 500 || fallo) console.error('Error al responder:', err && err.stack || err);
    return res.status(estado).json({ error: mensaje });
  }
  res.status(err.status || 400).json({ error: err.message });
}
async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}
// Devuelve una ruta libre añadiendo _1, _2… si el destino ya está ocupado
async function freeName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let target = path.join(dir, name);
  let n = 1;
  while (await exists(target)) target = path.join(dir, `${base}_${n++}${ext}`);
  return target;
}

// --- Login ---
// Abre la sesión: registra el jti, firma el JWT y pone la cookie
function abreSesion(req, res, user, accion) {
  const jti = creaSesion(user.username, req);
  const token = jwt.sign({ username: user.username, role: user.role, jti }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, {
    httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH, maxAge: 30 * 24 * 3600 * 1000,
  });
  registrarActividad({ user: { username: user.username }, ip: req.ip }, accion || 'login', {});
}

const cuentasMod = createCuentas({
  express, auth, adminOnly, jwt, bcrypt, JWT_SECRET, DUMMY_HASH, loadUsers, saveUsers,
  sessions, creaSesion, revocaSesion, marcaSesionesSucias: () => { sessionsSucio = true; },
  isBlocked, registerFailure, clearFailures, totpVerificar, base32Encode,
  USERNAME_RE, MIN_PASSWORD, COOKIE_PATH, SECURE_COOKIES,
  shares: () => sharesMod, passkeys: () => passkeysMod, vault: () => vaultMod, registrarActividad,
});
app.use('/api', cuentasMod.router);


/* ---------------- Registro de actividad ---------------- */
app.get('/api/activity', auth, async (req, res) => {
  try {
    const limite = Math.min(Number(req.query.limit) || 100, 500);
    let datos = '';
    try { datos = await fsp.readFile(ACTIVITY_FILE, 'utf8'); } catch { /* aún no hay actividad registrada */ }
    let entradas = datos.split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    if (req.user.role !== 'admin') entradas = entradas.filter(e => e.user === req.user.username);
    entradas.reverse();
    res.json({ items: entradas.slice(0, limite) });
  } catch (err) { sendError(res, err); }
});

// --- Listar archivos/carpetas ---
app.get('/api/files', auth, async (req, res) => {
  try {
    const rel = req.query.path || '';
    // "@compartido" es la carpeta virtual con lo que otros usuarios te han compartido
    if (limpiaRel(rel) === '@compartido') return res.json({ path: rel, items: sharesMod.entradasPara(req.user), perm: 'read' });
    const dir = userPath(req, rel);
    const entries = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
    const items = await Promise.all(entries.map(async e => {
      const full = path.join(dir, e.name);
      let stat;
      try { stat = await fsp.stat(full); } catch { return null; } // symlink roto o borrado a medias
      return {
        name: e.name,
        isDir: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
      };
    }));
    const visible = items.filter(Boolean);
    visible.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
    if (limpiaRel(rel) === '' && sharesMod.hayPara(req.user)) visible.unshift({ name: '@compartido', isDir: true, size: 0, modified: new Date(), virtual: true });
    const info = sharesMod.permDe(req.user, rel);
    res.json({ path: rel, items: visible, ...(info ? { perm: info.perm, sharedBy: info.owner } : {}) });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Crear carpeta ---
app.post('/api/mkdir', auth, async (req, res) => {
  try {
    const { path: rel, name } = req.body || {};
    if (!name || /[\\/]/.test(name) || name === '.' || name === '..') {
      return res.status(400).json({ error: 'Nombre de carpeta inválido' });
    }
    const dir = userPath(req, path.join(rel || '', name));
    await fsp.mkdir(dir, { recursive: false });
    registrarActividad(req, 'carpeta_creada', { path: path.join(rel || '', name) });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
    sendError(res, err);
  }
});

// --- Subir archivos ---
// Un único constructor para la subida autenticada y la pública: solo cambia
// cómo se resuelve la carpeta de destino.
const nombresEnSubida = new Set();
function makeUploader(resolveDir, limits) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = resolveDir(req);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => {
      try {
        const dir = resolveDir(req);
        // basename() descarta cualquier ruta que venga en el nombre original del cliente
        const safeName = path.basename(file.originalname).replace(/^\.+/, '') || 'archivo';
        const ext = path.extname(safeName);
        const base = path.basename(safeName, ext);
        let target = path.join(dir, safeName);
        let counter = 1;
        // Nombres reservados por subidas en curso: dos subidas del mismo nombre a la vez ya no escriben el mismo archivo
        while (fs.existsSync(target) || nombresEnSubida.has(target)) {
          target = path.join(dir, `${base}_${counter}${ext}`);
          counter++;
        }
        nombresEnSubida.add(target);
        req.once('close', () => nombresEnSubida.delete(target));
        cb(null, path.basename(target));
      } catch (e) { cb(e); }
    }
  });
  return multer({ storage, limits: limits || { fileSize: MAX_UPLOAD_BYTES } });
}

const upload = makeUploader(req => userPath(req, req.query.path || ''));

app.post('/api/upload', auth, (req, res) => {
  upload.array('files')(req, res, err => {
    if (err) return res.status(err.status || 400).json({ error: err.message });
    const subidos = (req.files || []).map(f => f.filename);
    if (subidos.length) registrarActividad(req, 'archivo_subido', { path: req.query.path || '', archivos: subidos });
    res.json({ ok: true, uploaded: subidos });
  });
});

/* --- Descargar carpetas o selecciones como ZIP --- */
// Content-Disposition con acentos: nombre en ASCII y la versión real en filename*
function cabeceraDescarga(res, nombre) {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
}

async function enviarZip(res, entradas, nombreZip) {
  res.setHeader('Content-Type', 'application/zip');
  cabeceraDescarga(res, nombreZip);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on('warning', err => { if (err.code !== 'ENOENT') console.warn('zip', err.message); });
  zip.on('error', err => {
    console.warn('zip', err.message);
    // Ya se están enviando bytes: no queda más que cortar
    res.destroy();
  });
  zip.pipe(res);
  for (const e of entradas) {
    if (e.isDir) zip.directory(e.abs, e.name);
    else zip.file(e.abs, { name: e.name });
  }
  await zip.finalize();
}

app.get('/api/zip', auth, async (req, res) => {
  try {
    const lista = [].concat(req.query.p || []).filter(Boolean);
    if (!lista.length) return res.status(400).json({ error: 'No has indicado qué descargar' });
    if (lista.length > ZIP_LIMIT) return res.status(400).json({ error: `Máximo ${ZIP_LIMIT} elementos por ZIP` });

    const entradas = [];
    for (const rel of lista) {
      const abs = userPath(req, rel);
      const stat = await fsp.stat(abs);
      entradas.push({ abs, name: path.basename(abs), isDir: stat.isDirectory() });
    }
    const nombre = entradas.length === 1
      ? `${entradas[0].name.replace(/\.[^.]+$/, '')}.zip`
      : `KookyeCatCloud-${new Date().toISOString().slice(0, 10)}.zip`;
    await enviarZip(res, entradas, nombre);
  } catch (err) {
    if (!res.headersSent) sendError(res, err);
  }
});

// --- Descargar archivo ---
// ?as=jpg convierte un HEIC al vuelo; ?as=pdf convierte un documento de Office
// con LibreOffice (reutilizando la misma caché que la vista previa). Sin ?as,
// se descarga el original tal cual.
app.get('/api/download', auth, async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    const ext = path.extname(file).toLowerCase();
    const as = String(req.query.as || '').toLowerCase();

    if (as === 'jpg' && HEIC_TYPES[ext]) {
      if (!sharp) return res.status(501).json({ error: 'Este servidor no puede convertir HEIC' });
      const buf = await sharp(file, { failOn: 'none' }).rotate().withMetadata().jpeg({ quality: 92 }).toBuffer();   // conserva EXIF y GPS
      cabeceraDescarga(res, path.basename(file, ext) + '.jpg');
      registrarActividad(req, 'descarga_convertida', { path: req.query.path, as });
      return res.status(200).type('image/jpeg').send(buf);
    }
    if (as === 'pdf' && OFFICE_RE.test(file)) {
      if (!soffice) return res.status(501).json({ error: 'Este servidor no tiene LibreOffice instalado' });
      const stat = await fsp.stat(file);
      const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|office`).digest('hex');
      const cached = path.join(THUMBS_DIR, `${key}.pdf`);
      if (!await exists(cached)) {
        const trabajo = path.join(THUMBS_DIR, `conv-${key}-${process.pid}`);
        await fsp.mkdir(trabajo, { recursive: true });
        try {
          await convertirOffice(file, trabajo);
          const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.pdf'));
          if (!generado) throw new Error('LibreOffice no generó ningún PDF');
          await fsp.rename(path.join(trabajo, generado), cached);
        } finally { fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {}); }
      }
      cabeceraDescarga(res, path.basename(file, ext) + '.pdf');
      registrarActividad(req, 'descarga_convertida', { path: req.query.path, as });
      return res.sendFile(cached, { headers: { 'Content-Type': 'application/pdf' } });
    }

    // Siempre como adjunto y sin tipo interpretable: un .html subido no se ejecuta en el dominio
    res.download(file, path.basename(file), { headers: { 'Content-Type': 'application/octet-stream' } }, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Previsualización y reproducción ---
// Los navegadores no pintan HEIC, así que se convierte al vuelo. El resto se sirve tal cual:
// el servidor de ficheros de Express ya responde a rangos, y con eso el vídeo se puede saltar.
const IMAGE_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
};
const HEIC_TYPES = { '.heic': 'image/heic', '.heif': 'image/heif' };
const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
};
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/opus', '.flac': 'audio/flac',
};
const PREVIEW_TYPES = { ...IMAGE_TYPES, ...HEIC_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES, '.pdf': 'application/pdf' };
// Texto plano y código: se devuelven como JSON y el cliente los pinta con textContent
const TEXT_RE = /\.(txt|md|markdown|csv|tsv|log|json|xml|svg|yml|yaml|ini|conf|cfg|toml|env|js|mjs|cjs|ts|jsx|tsx|css|scss|less|html?|php|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|sh|bash|zsh|sql|ps1|bat|srt|vtt|gitignore|dockerfile|makefile)$/i;
// Admite bytes ("524288") o con sufijo ("512KB", "1MB"); si el valor no vale, usa el de por defecto
// en vez de dejar NaN, que rompía la lectura de cualquier texto.
function bytesDeEntorno(valor, porDefecto) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([kmg]?)b?\s*$/i.exec(String(valor ?? ''));
  if (!m) return porDefecto;
  const n = Number(m[1].replace(',', '.')) * ({ '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase()]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
}
const TEXT_MAX = bytesDeEntorno(process.env.TEXT_MAX, 512 * 1024);
const { OFFICE_RE } = createOffice;

// Mapa de fotos. El servidor de tiles es lo único externo que carga la app, así que
// se declara aquí y de aquí sale el permiso de la CSP: cambiar TILE_URL basta.
const TILE_URL = process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = process.env.TILE_ATTR ||
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TILE_ORIGIN = (() => {
  try { return new URL(TILE_URL.replace(/\{[sxyz]\}/g, '1')).origin; }
  catch { return 'https://tile.openstreetmap.org'; }
})();
const THUMBABLE = { ...IMAGE_TYPES, ...HEIC_TYPES };
const DISPLAY_MAX = Number(process.env.DISPLAY_MAX || 2200);

// Convierte a WebP y cachea; devuelve la ruta del archivo cacheado
async function convertirCache(file, stat, ancho, sufijo) {
  const key = crypto.createHash('sha1')
    .update(`${file}|${stat.size}|${stat.mtimeMs}|${ancho}|${sufijo}`).digest('hex');
  const cached = path.join(THUMBS_DIR, `${key}.webp`);
  if (await exists(cached)) return cached;
  const buf = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize(ancho, ancho, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const tmp = `${cached}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, cached);
  return cached;
}

app.get('/api/preview', auth, async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    const ext = path.extname(file).toLowerCase();
    const type = PREVIEW_TYPES[ext];
    // Sin esta lista blanca, subir un .html y abrirlo por aquí daría XSS en el propio dominio
    if (!type) return res.status(415).json({ error: 'Este tipo de archivo no se puede previsualizar' });

    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (ext === '.pdf') {
      // Solo la restricción de marco. Nada de default-src 'none': el visor de PDF
      // de Chrome monta un <embed> dentro del propio documento, y esa directiva
      // arrastra object-src 'none', con lo que el visor se bloquea a sí mismo y
      // enseña un recuadro gris. Corre en su propio proceso, sin acceso a la sesión.
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Disposition', 'inline');
      return res.sendFile(file, { headers: { 'Content-Type': 'application/pdf' } }, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
      });
    }

    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    if (HEIC_TYPES[ext]) {
      if (!sharp) return res.status(415).json({ error: 'Este servidor no puede convertir HEIC' });
      const stat = await fsp.stat(file);
      const conv = await convertirCache(file, stat, DISPLAY_MAX, 'view');
      return res.sendFile(conv, { headers: { 'Content-Type': 'image/webp' } });
    }
    res.sendFile(file, { headers: { 'Content-Type': type } }, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Miniaturas para la cuadrícula ---
// Saca un fotograma del vídeo con ffmpeg y lo deja cacheado
function fotogramaVideo(file, destino) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-loglevel', 'error',
      '-ss', '1',                 // un segundo dentro: el primer fotograma suele ser negro
      '-i', file,
      '-frames:v', '1',
      '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
      destino,
    ];
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    const temporizador = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.on('error', err => { clearTimeout(temporizador); reject(err); });
    p.on('close', code => {
      clearTimeout(temporizador);
      if (code === 0) return resolve();
      // Vídeo más corto que un segundo: se reintenta desde el principio
      const p2 = spawn('ffmpeg', args.map(a => (a === '1' ? '0' : a)), { stdio: 'ignore' });
      p2.on('error', reject);
      p2.on('close', c2 => (c2 === 0 ? resolve() : reject(new Error('ffmpeg falló'))));
    });
  });
}

app.get('/api/thumb', auth, async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    const ext = path.extname(file).toLowerCase();
    const esVideo = !!VIDEO_TYPES[ext];
    const tipo = THUMBABLE[ext];
    if (!tipo && !esVideo) return res.status(415).json({ error: 'Sin miniatura para este tipo' });
    if (esVideo && !ffmpeg) return res.status(415).json({ error: 'Este servidor no tiene ffmpeg' });

    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');

    // Sin sharp la app sigue funcionando: se envía el original, solo que pesa más
    if (!esVideo && !sharp) return res.sendFile(file, { headers: { 'Content-Type': tipo } });

    const stat = await fsp.stat(file);
    // La clave incluye tamaño y mtime: si el archivo cambia, la miniatura se regenera sola
    const key = crypto.createHash('sha1')
      .update(`${file}|${stat.size}|${stat.mtimeMs}|${THUMB_SIZE}|thumb`).digest('hex');
    const cached = path.join(THUMBS_DIR, `${key}.webp`);

    if (!await exists(cached)) {
      const tmp = `${cached}.${process.pid}.tmp`;
      if (esVideo) {
        const tmpImg = `${tmp}.webp`;
        await fotogramaVideo(file, tmpImg);
        await fsp.rename(tmpImg, cached);
      } else {
        const buf = await sharp(file, { failOn: 'none' })
          .rotate() // respeta la orientación EXIF de las fotos de móvil
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
          .webp({ quality: 78 })
          .toBuffer();
        await fsp.writeFile(tmp, buf);
        await fsp.rename(tmp, cached);
      }
    }
    res.sendFile(cached, { headers: { 'Content-Type': 'image/webp' } }, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No encontrado' });
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Texto plano, Markdown, CSV y código ---
app.get('/api/text', auth, async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    const base = path.basename(file);
    // Se admite por extensión o por nombre completo (Makefile, Dockerfile…)
    if (!TEXT_RE.test(base) && !/^(makefile|dockerfile|licen[cs]e|readme)$/i.test(base)) {
      return res.status(415).json({ error: 'Este archivo no es de texto' });
    }
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Es una carpeta' });

    // Se lee solo el principio: un log de 2 GB no puede tumbar el servidor
    const leer = Math.min(stat.size, TEXT_MAX);
    const fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(leer);
    try { await fh.read(buf, 0, leer, 0); } finally { await fh.close(); }

    res.json({
      text: buf.toString('utf8'),
      truncated: stat.size > TEXT_MAX,
      size: stat.size,
      shown: leer,
      mtime: stat.mtimeMs,   // «base» para el guardado: detecta si el archivo cambió en otro sitio mientras se editaba
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Guardar un archivo de texto editado desde el propio visor
app.put('/api/text', auth, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    const base = path.basename(file);
    if (!TEXT_RE.test(base) && !/^(makefile|dockerfile|licen[cs]e|readme)$/i.test(base)) {
      return res.status(415).json({ error: 'Este archivo no es de texto' });
    }
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Es una carpeta' });
    // Un archivo más grande que lo que el visor carga NO se puede guardar desde aquí: el editor solo tenía el principio y
    // guardar habría cortado el resto del archivo
    if (stat.size > TEXT_MAX) return res.status(413).json({ error: 'Este archivo es demasiado grande para editarlo aquí: solo se mostraba el principio.' });
    const contenido = String(req.body?.text ?? '');
    if (Buffer.byteLength(contenido) > TEXT_MAX) return res.status(400).json({ error: 'Demasiado grande para editar aquí' });
    const baseM = Number(req.body?.base);
    if (Number.isFinite(baseM) && baseM > 0 && stat.mtimeMs > baseM + 1) {
      const actual = await fsp.readFile(file, 'utf8').catch(() => null);
      if (actual !== null && actual !== contenido) return res.status(409).json({ error: 'El archivo se cambió en otro sitio mientras lo editabas. Copia tu texto, cierra y vuelve a abrirlo.' });
    }
    // Si no cambia nada, no se reescribe ni se crea una versión de más
    if (stat.size <= TEXT_MAX * 4 && await fsp.readFile(file, 'utf8').then(t => t === contenido, () => false)) return res.json({ ok: true, unchanged: true });
    await versionsMod.snapshot(req.user, req.query.path, file);     // guarda lo que había antes
    // Escritura atómica: un corte a mitad no deja el archivo truncado
    const tmpE = path.join(path.dirname(file), `.kcc-edicion-${crypto.randomBytes(6).toString('hex')}`);
    try { await fsp.writeFile(tmpE, contenido, 'utf8'); await fsp.rename(tmpE, file); } catch (e) { await fsp.rm(tmpE, { force: true }).catch(() => {}); throw e; }
    registrarActividad(req, 'archivo_editado', { path: req.query.path });
    res.json({ ok: true, mtime: (await fsp.stat(file)).mtimeMs });
  } catch (err) {
    sendError(res, err);
  }
});

const officeMod = createOffice({ express, auth, userPath, soffice, thumbsDir: THUMBS_DIR, exists, sendError });
const { convertirOffice } = officeMod.core;
app.use('/api', officeMod.router);

const fotosMod = createFotos({ express, auth, userRoot, userPath, isHidden, sharp, thumbsDir: THUMBS_DIR, IMAGE_TYPES, HEIC_TYPES, sendError });
app.use('/api', fotosMod.router);

// Qué sabe hacer este servidor: el cliente lo usa para no ofrecer lo que no hay
app.get('/api/capabilities', auth, (req, res) => {
  res.json({
    sharp: !!sharp, ffmpeg, office: !!soffice, textMax: TEXT_MAX,
    tileUrl: TILE_URL, tileAttr: TILE_ATTR,
  });
});

// --- Buscar (recursivo desde la carpeta indicada) ---
app.get('/api/search', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ items: [], truncated: false });
    const startRel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const base = userPath(req, startRel);
    const results = [];

    async function walk(dir, rel) {
      if (results.length >= SEARCH_LIMIT) return;
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (results.length >= SEARCH_LIMIT) return;
        if (isHidden(e.name)) continue;
        const full = path.join(dir, e.name);
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.name.toLowerCase().includes(q)) {
          try {
            const stat = await fsp.stat(full);
            results.push({
              name: e.name, isDir: stat.isDirectory(), size: stat.size,
              modified: stat.mtime, dir: rel,
            });
          } catch { /* desaparecido a mitad del recorrido */ }
        }
        if (e.isDirectory()) await walk(full, childRel);
      }
    }

    await walk(base, startRel);
    res.json({ items: results, truncated: results.length >= SEARCH_LIMIT });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Eliminar (va a la papelera) ---
app.delete('/api/files', auth, async (req, res) => {
  try {
    await trashItem(req.user, req.query.path);
    registrarActividad(req, 'enviado_papelera', { path: req.query.path });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Operaciones por lotes (mover / eliminar / renombrar varios) ---
app.post('/api/batch', auth, async (req, res) => {
  try {
    const { op, paths, dest, pattern, start } = req.body || {};
    if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ error: 'No hay nada seleccionado' });
    if (paths.length > BATCH_LIMIT) return res.status(400).json({ error: `Máximo ${BATCH_LIMIT} elementos por operación` });
    if (!['move', 'delete', 'rename'].includes(op)) return res.status(400).json({ error: 'Operación no válida' });

    // Renombrado en lote: patrón con {n} (número de secuencia) y {name} (nombre original sin extensión)
    if (op === 'rename') {
      const pat = String(pattern || '').trim();
      if (!pat) return res.status(400).json({ error: 'Falta el patrón de nombres' });
      const errores = [];
      let hechos = 0;
      const pad = String(paths.length).length;
      let n = Number(start) > 0 ? Math.floor(Number(start)) : 1;
      for (const rel of paths) {
        try {
          const from = userPath(req, rel);
          const stat = await fsp.stat(from);
          const dir = path.dirname(from);
          const ext = stat.isDirectory() ? '' : path.extname(from);
          const nombreOriginal = path.basename(from, ext);
          const numero = String(n).padStart(pad, '0');
          let nuevo = pat.replace(/\{n\}/g, numero).replace(/\{name\}/g, nombreOriginal);
          nuevo = nuevo.replace(/[\\/]/g, '-').trim() || nombreOriginal;
          let to = path.join(dir, nuevo + ext);
          if (to !== from && await exists(to)) to = await freeName(dir, nuevo + ext);
          if (to !== from) {
            await fsp.rename(from, to);
            const nuevaRel = path.posix.join(path.posix.dirname(limpiaRel(rel)), path.basename(to));
            calendarMod.core.mueveOrigenArchivo(req.user, limpiaRel(rel), limpiaRel(nuevaRel)).catch(() => {});
            versionsMod.mueve(req.user, rel, nuevaRel);
            sharesMueve(req.user, rel, nuevaRel);
          }
          n++;
          hechos++;
        } catch (e) { errores.push({ path: rel, error: e.message }); }
      }
      registrarActividad(req, 'renombrado_lote', { cantidad: hechos, patron: pat });
      return res.json({ ok: errores.length === 0, done: hechos, errors: errores });
    }

    const errors = [];
    let done = 0;
    // En serie a propósito: el índice de la papelera es un único archivo JSON
    for (const rel of paths) {
      try {
        if (op === 'delete') {
          await trashItem(req.user, rel);
        } else {
          const name = path.basename(String(rel).replace(/\\/g, '/'));
          if (!mismoAlmacen(rel, dest || '')) throw new Error('No se puede mover entre tus archivos y una carpeta compartida, ni entre dos compartidas');
          const from = userPath(req, rel);
          const destDir = userPath(req, dest || '');
          const to = path.join(destDir, name);
          if (from === to) { done++; continue; }
          // Mover una carpeta dentro de sí misma dejaría el árbol inaccesible
          if (to === from || to.startsWith(from + path.sep)) throw new Error('No puedes mover una carpeta dentro de sí misma');
          if (await exists(to)) throw new Error(`Ya existe "${name}" en el destino`);
          await fsp.mkdir(destDir, { recursive: true });
          await fsp.rename(from, to);
          calendarMod.core.mueveOrigenArchivo(req.user, limpiaRel(rel), limpiaRel(path.posix.join(String(dest || ''), name))).catch(() => {});
          versionsMod.mueve(req.user, rel, path.posix.join(String(dest || ''), name));
          sharesMueve(req.user, rel, path.posix.join(String(dest || ''), name));
        }
        done++;
      } catch (e) {
        errors.push({ path: rel, error: e.message });
      }
    }
    if (done) registrarActividad(req, op === 'delete' ? 'enviado_papelera_lote' : 'movido_lote', { cantidad: done });
    res.json({ ok: errors.length === 0, done, errors });
  } catch (err) {
    sendError(res, err);
  }
});

const papeleraMod = createPapelera({ express, auth, userRoot, resolveFor, shares: () => sharesMod, calendar: () => calendarMod.core, freeName: (...a) => freeName(...a), barridoUsuario: () => barridoUsuario, sendError, registrarActividad });
app.use('/api', papeleraMod.router);

// --- Renombrar / mover ---
app.post('/api/move', auth, async (req, res) => {
  try {
    if (!mismoAlmacen(req.body?.from, req.body?.to)) return res.status(400).json({ error: 'No se puede mover entre tus archivos y una carpeta compartida, ni entre dos compartidas. Copia y borra.' });
    const from = userPath(req, req.body?.from);
    const to = userPath(req, req.body?.to);
    if (from === to) return res.json({ ok: true });
    // rename() machaca el destino en silencio: comprobarlo antes evita perder archivos
    try {
      await fsp.access(to);
      return res.status(409).json({ error: 'Ya existe un archivo con ese nombre' });
    } catch { /* destino libre, seguimos */ }
    await fsp.rename(from, to);
    calendarMod.core.mueveOrigenArchivo(req.user, limpiaRel(req.body?.from), limpiaRel(req.body?.to)).catch(() => {});
    versionsMod.mueve(req.user, req.body?.from, req.body?.to);
    sharesMueve(req.user, req.body?.from, req.body?.to);
    registrarActividad(req, 'renombrado', { from: req.body?.from, to: req.body?.to });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

const albumsMod = createAlbums({ express, auth, userRoot, resolveFor, enviarZip: (...a) => enviarZip(...a), sendError });
const { readFavs, readAlbums, albumArchivos, nombreSeguro } = albumsMod.core;
app.use('/api', albumsMod.router);
const enlacesMod = createEnlaces({
  express, auth, jsonMedio, bcrypt, appDir: APP_DIR, thumbsDir: THUMBS_DIR, loadUsers, sendError, registrarActividad,
  resolveFor, userPath, assertVisible, safeResolve, isHidden, esCompartida, exists,
  enviaPlantilla, enviarZip, cabeceraDescarga, makeUploader, MAX_UPLOAD_BYTES,
  albums: albumsMod.core, promptsCore: promptsMod.core, events: eventsMod,
  IMAGE_TYPES, HEIC_TYPES, VIDEO_TYPES, THUMBABLE, PREVIEW_TYPES, THUMB_SIZE, DISPLAY_MAX,
  sharp, ffmpeg, fotogramaVideo, convertirCache,
});
const { loadLinks } = enlacesMod.core;
app.use('/api', enlacesMod.router);
app.use('/', enlacesMod.paginas);



const analisisMod = createAnalisis({ express, auth, userRoot, userPath, isHidden, sendError, DATA_ROOT, TRASH_DIR, NOTES_DIR });
app.use(analisisMod.router);   // sus rutas ya llevan /api

/* ---------------- Bloc de notas ----------------
   Vive en lib/notes.js; aquí se crea y se exponen sus funciones al resto del servidor. */
const { trashItem, papeleraDias, purgeExpired } = papeleraMod.core;
const notesMod = createNotes({ express, auth, userRoot, sendError, papeleraDias, calendar: () => calendarMod.core, extraeLinks: (b) => notesExtra.extraeLinks(b) });
const { readNotes, writeNotes, notaFile, descendientes, notasFuente, purgarNotasCaducadas, enCola: enColaNotas } = notesMod.core;
app.use('/api', notesMod.router);

/* ---------------- Vaciado programado de las papeleras ----------------
   Hasta ahora lo caducado solo se borraba al abrir la papelera. Este barrido lo hace por su cuenta, para
   todos los usuarios, al arrancar y cada TRASH_SWEEP_HOURS horas: archivos, notas y prompts. */
async function barridoUsuario(user) {
  await purgeExpired(user);
  await purgarNotasCaducadas(user);
  await promptsMod.core.limpiaPapelera(user);
  await clipMod.core.caduca(user);
}
async function barridoPapeleras() {
  for (const u of loadUsers()) {
    try { await barridoUsuario({ username: u.username, role: u.role }); }
    catch (err) { console.warn(`Barrido de papelera (${u.username}):`, err.message); }
  }
}
if (TRASH_SWEEP_HOURS > 0) {
  setTimeout(barridoPapeleras, 2 * 60 * 1000).unref();
  setInterval(barridoPapeleras, TRASH_SWEEP_HOURS * 3600 * 1000).unref();
}

/* ---------------- Módulos: etiquetas, calendario y prompts ---------------- */
const limpiaRel = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

// Suscripción iCal: sin cookie ni sesión (Google/Apple/Outlook no pueden enviarlas); el acceso
// lo da un token de 256 bits en la URL, que el usuario puede regenerar o apagar cuando quiera.
app.get(/^\/ical\/([a-f0-9]{64})\.ics$/, async (req, res) => {
  try {
    const user = await calendarMod.core.userPorToken(req.params[0]);
    const feed = user && await calendarMod.core.icsFeed(user, `${req.protocol}://${req.get('host')}${BASE_PATH}/`);
    if (!feed) return res.status(404).type('text/plain').send('No encontrado');
    res.set({ 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="calendario.ics"' });
    res.type('text/calendar; charset=utf-8').send(feed);
  } catch (err) { res.status(500).type('text/plain').send('Error'); }
});

// Extras de notas: backlinks, exportación y plantillas (cada ruta lleva su propio auth)
const notesExtra = createNotesExtra({ express, auth, userRoot, sendError, readNotes, writeNotes, enCola: enColaNotas, notaFile, descendientes, resolveFor, ZipArchive });
app.use('/api', notesExtra.router);
app.use('/api', createPdf({ express, auth, resolveFor, sendError, registrarActividad, sharp }).router);
app.use('/api', versionsMod.router);
app.use('/api', vaultMod.router);
app.use('/api', sharesMod.router);
app.use('/api', passkeysMod.router);

app.use('/api/labels', auth, labelsMod.router);
app.use('/api/valores', auth, valoresMod.router);
app.use('/api/calendar', auth, calendarMod.router);
app.use('/api/prompts', auth, promptsMod.router);
app.use('/api/clip', auth, clipMod.router);
modulosConLogros.push(clipMod);   // Portapapeles aporta recuentos a la gamificación (ver CLAUDE.md)
app.use('/api/game', auth, gameMod.router);
app.use('/api/contacts', auth, contactsMod.router);
app.use('/api/shopping', auth, shoppingMod);
app.use('/api/games', auth, gamesMod.router);
app.use('/api/bases', auth, basesMod.router);
app.use('/api/pagos', auth, pagosMod.router);
app.use('/api/marcadores', auth, marcadoresMod.router);
app.use('/api/perfil', auth, perfilMod.router);
app.use('/api/push', auth, pushMod.router);
app.use('/api/codigo-vista', codigoMod.vistaRouter); // enlaces firmados y caducan: el iframe aislado no envía cookies
app.use('/api/codigo', auth, codigoMod.router);
app.use('/api/vinculos', auth, createVinculos({ express, prompts: promptsMod.core, codigo: codigoMod.core, sendError, registrarActividad }));
app.use('/api/transferir', auth, transferMod.router);
app.use('/api', createExportar({ express, auth, adminOnly, userRoot, dataRoot: DATA_ROOT, loadUsers, ZipArchive, registrarActividad, sendError }).router);
// Copia de seguridad (solo administradores): rutas /api/admin/copias y programación diaria (ver lib/copias.js)
const copiasMod = createCopias({ express, auth, adminOnly, sendError, registrarActividad, alCambiar: alCambiarContenido, dataRoot: DATA_ROOT, appDir: APP_DIR, copiasDir: COPIAS_DIR });
app.use('/api/admin/copias', copiasMod.router);
modulosConLogros.push(copiasMod);   // Copias a mano aportan recuentos a la gamificación (ver CLAUDE.md)
calendarMod.core.registraOrigen('prompt', (user, id, ev) => promptsMod.core.setCal(user, id, ev));
calendarMod.core.registraOrigen('game', (user, id, ev) => gamesMod.core.setCal(user, id, ev));
calendarMod.core.registraOrigen('note', async (user, id, ev) => {
  const data = await readNotes(user);
  const it = data.items.find(i => i.id === id);
  if (!it) return;
  if (ev) it.cal = { date: ev.start.slice(0, 10), time: ev.allDay ? '' : ev.start.slice(11, 16) };
  else delete it.cal;
  await writeNotes(user, data);
});
labelsMod.registrarContador((user) => calendarMod.core.usoEtiquetas(user));
labelsMod.registrarLimpieza((user, id) => calendarMod.core.quitaEtiqueta(user, id));
labelsMod.registrarContador(async (user) => {
  const uso = {};
  (await readNotes(user)).items.forEach(i => (i.labels || []).forEach(l => { uso[l] = (uso[l] || 0) + 1; }));
  return uso;
});
labelsMod.registrarLimpieza(async (user, id) => {
  const data = await readNotes(user);
  let tocado = false;
  data.items.forEach(i => { if ((i.labels || []).includes(id)) { i.labels = i.labels.filter(l => l !== id); tocado = true; } });
  if (tocado) await writeNotes(user, data);
});

// Pone, mueve o quita la fecha de calendario de archivos ya subidos. Con pocos archivos
// cada uno tiene su evento; con muchos (una subida de fotos) se crea uno solo para la carpeta.
app.post('/api/files/calendar', auth, async (req, res) => {
  try {
    const { paths, calendar } = req.body || {};
    if (!Array.isArray(paths) || !paths.length || paths.length > 500) return res.status(400).json({ error: 'Selección no válida' });
    const rels = [];
    for (const rel of paths) {
      const abs = userPath(req, rel);
      await fsp.stat(abs);
      rels.push(limpiaRel(rel));
    }
    if (!calendar || rels.length <= 3) {
      for (const rel of rels) await calendarMod.core.sincronizaOrigen(req.user, 'file', rel, path.posix.basename(rel), calendar || null);
    } else {
      const carpetas = new Set(rels.map(r => path.posix.dirname(r)));
      const dir = carpetas.size === 1 ? [...carpetas][0] : '.';
      const ref = dir === '.' ? '' : dir;
      const titulo = `${rels.length} archivos subidos${ref ? ' a ' + ref : ''}`;
      await calendarMod.core.sincronizaOrigen(req.user, 'file', ref || '/', titulo, calendar);
    }
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// Búsqueda global: notas, prompts y eventos (los archivos ya tienen /api/search)
app.get('/api/omni', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim().slice(0, 100);
    if (q.length < 2) return res.json({ notes: [], prompts: [], events: [] });
    const data = await readNotes(req.user);
    const notes = [];
    for (const it of data.items) {
      if (notes.length >= 20) break;
      if (it.title.toLowerCase().includes(q)) { notes.push({ id: it.id, title: it.title, type: it.type }); continue; }
      if (it.type === 'note') {
        try {
          const body = await fsp.readFile(notaFile(req.user, it.id), 'utf8');
          if (body.toLowerCase().includes(q)) notes.push({ id: it.id, title: it.title, type: it.type });
        } catch {}
      }
    }
    const [prompts, events] = await Promise.all([
      promptsMod.core.buscar(req.user, q),
      calendarMod.core.buscar(req.user, q),
    ]);
    res.json({ notes, prompts, events: events.map(e => ({ id: e.id, title: e.title, start: e.start, allDay: e.allDay, calendarId: e.calendarId })) });
  } catch (err) { sendError(res, err); }
});

// SPA fallback
app.get('*', (req, res) => {
  enviaPlantilla(res, 'index.html', 'html');
});

// Último recurso: cualquier error que llegue aquí (JSON mal formado, cuerpo demasiado grande, fallo inesperado)
// se responde en JSON y sin rutas ni trazas del servidor.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err && (err.status || err.statusCode);
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido es demasiado grande' });
  if (status && status < 500) return res.status(status).json({ error: err.expose || (err.constructor && err.constructor.name === 'HttpError') ? err.message : 'Petición no válida' });
  console.error('Error no controlado en', req.method, req.originalUrl, '-', err && err.stack || err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
// Un fallo suelto en una promesa no debe tumbar el servidor entero
process.on('unhandledRejection', (e) => console.error('Promesa rechazada sin capturar:', e && e.stack || e));

root.use(BASE_PATH || '/', app);

root.listen(PORT, () => { console.log(
  `KookyeCatCloud escuchando en puerto ${PORT}${BASE_PATH ? `, bajo ${BASE_PATH}/` : ''}, datos en ${DATA_ROOT}`); pushMod.arranca(); });
