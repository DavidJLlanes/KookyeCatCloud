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
const { readJson, kccDir } = store;
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
const { resumenEnlaces } = require('./lib/enlaces-resumen');
const createShopping = require('./lib/shopping');
const createGames = require('./lib/games');
const createBases = require('./lib/bases');
const createPagos = require('./lib/pagos');
const createBusqueda = require('./lib/busqueda');
const createIA = require('./lib/ia');
const createImportar = require('./lib/importar');
const createDocumentos = require('./lib/documentos');
const createMarcadores = require('./lib/marcadores');
const createSincronizados = require('./lib/sincronizados');
const { resumenBloques } = require('./lib/notas-bloques');
const createRecordatorios = require('./lib/recordatorios');
const createPerfil = require('./lib/perfil');
const createAnalisis = require('./lib/analisis');
const createWeb = require('./lib/web');
const createRutas = require('./lib/rutas');
const createExplorador = require('./lib/explorador');
const montaTransversal = require('./lib/transversal');
const { sendError } = require('./lib/errores');
const createArchivos = require('./lib/archivos');
const { IMAGE_TYPES, HEIC_TYPES, VIDEO_TYPES, PREVIEW_TYPES, TEXT_RE, TEXT_MAX, THUMBABLE, DISPLAY_MAX, THUMB_SIZE, TILE_URL, TILE_ATTR, TILE_ORIGIN, bytesDeEntorno } = require('./lib/archivos/tipos');
const createSesiones = require('./lib/sesiones');
const createActividad = require('./lib/actividad');
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
const { execFileSync } = require('child_process');
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
const { TRASH_DIR, TRASH_SWEEP_HOURS } = createPapelera;
// Enlaces: de subida (otros te dejan archivos) y de descarga (mandas tú algo).
// Comparten archivo y se distinguen por el campo kind.
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
// Rutas seguras de cada usuario (las carpetas compartidas se consultan al usarlas: shares se crea más abajo)
const {
  safeResolve, userRoot, isHidden, assertVisible, resolveFor, userPath, mismoAlmacen,
  esCompartida, sharesMueve, exists, freeName, limpiaRel,
} = createRutas({ DATA_ROOT, USERNAME_RE, shares: () => sharesMod });

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

// Sesiones y registro de actividad (la caja fuerte se crea más abajo: se usa al cerrar una sesión)
const { sessions, creaSesion, revocaSesion, toca: tocaSesion, marcaSucias: marcaSesionesSucias } = createSesiones({ SESSIONS_FILE, cierraCaja: (jti) => vaultMod.cierraSesion(jti) });
const actividadMod = createActividad({ express, auth, sendError, ACTIVITY_FILE, ACTIVITY_MAX, ACTIVITY_DIAS });
const { registrarActividad } = actividadMod;

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
const alCambiarLogros = (user) => { if (typeof gameMod !== 'undefined' && gameMod) gameMod.invalida(user); };   // refresca los logros al instante
const alCambiarContenido = (user) => { alCambiarLogros(user); if (typeof busquedaMod !== 'undefined' && busquedaMod) busquedaMod.core.invalida(user); };   // y deja que la búsqueda reconstruya su índice
const gamesMod = createGames({ express, multer, sharp, userRoot, sendError, registrarActividad, calendar: calendarMod.core, alCambiar: alCambiarContenido, valores: valoresMod.core });
const basesMod = createBases({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido });
const pagosMod = createPagos({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, calendar: calendarMod.core, valores: valoresMod.core });
// KCC_ICONOS_LOCALES=1 solo lo usan las pruebas (permite buscar iconos en un servidor local; en producción está prohibido: SSRF)
const marcadoresMod = createMarcadores({ express, sharp, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, permiteLocal: process.env.KCC_ICONOS_LOCALES === '1' });
const perfilMod = createPerfil({ express, multer, sharp, userRoot, usuarios: () => loadUsers(), sendError, registrarActividad, alCambiar: alCambiarContenido });
const recordatoriosMod = createRecordatorios({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido, calendar: calendarMod.core });
// Avisos push (lib/push): leen de Pagos, Calendario, Contactos y Recordatorios, que se crean antes. Claves VAPID en <app>/vapid.json
const pushMod = createPush({ express, userRoot, usuarios: () => loadUsers(), sendError, registrarActividad, alCambiar: alCambiarContenido, claveFile: path.join(APP_DIR, 'vapid.json'),
  fuentes: { pagos: pagosMod.core, calendario: calendarMod.core, contactos: contactsMod.core, recordatorios: recordatoriosMod.core } });
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
const sincronizadosMod = createSincronizados({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido });
const modulosConLogros = [sincronizadosMod, gamesMod, basesMod, codigoMod, transferMod, valoresMod, pagosMod, marcadoresMod, recordatoriosMod, perfilMod, pushMod];

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
  try { r.nt_plantillas = ((await readJson(path.join(kccDir(userRoot(user)), 'note-templates.json'), { templates: [] })).templates || []).length; } catch { r.nt_plantillas = 0; }
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
    ...resumenEnlaces(loadLinks().filter(l => l.owner === user.username), enlacesMod.core.stats(user)),
    ...resumenBloques(notas.items),
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
  if (req.path.startsWith('/api/documentos')) return jsonPdf(req, res, next);   // un documento puede llegar a ~1,5 M de caracteres
  if (req.path === '/api/pdf' || req.path === '/api/bases/import') return jsonPdf(req, res, next);   // 8 MB (el PDF y la importación de una base)
  if (/^\/api\/(notes|text|prompts|calendar|labels|clip|shopping|codigo|bases)(\/|$)/.test(req.path)) return jsonMedio(req, res, next);
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
      if (!tocaSesion(payload.jti)) return res.status(401).json({ error: 'Sesión cerrada' });
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
  sessions, creaSesion, revocaSesion, marcaSesionesSucias,
  isBlocked, registerFailure, clearFailures, totpVerificar, base32Encode,
  USERNAME_RE, MIN_PASSWORD, COOKIE_PATH, SECURE_COOKIES,
  shares: () => sharesMod, passkeys: () => passkeysMod, vault: () => vaultMod, registrarActividad,
});
app.use('/api', cuentasMod.router);
app.use(actividadMod.router);   // /api/activity

// Explorador: listar, carpetas, subir, buscar, borrar, mover y lotes (lib/explorador)
const exploradorMod = createExplorador({
  express, multer, auth, userPath, isHidden, limpiaRel, mismoAlmacen, sharesMueve, exists, freeName, sendError, registrarActividad, MAX_UPLOAD_BYTES,
  trash: () => papeleraMod.core.trashItem, shares: () => sharesMod, calendar: () => calendarMod.core, versions: () => versionsMod,
});
const { makeUploader } = exploradorMod.core;
app.use(exploradorMod.router);


const officeMod = createOffice({ express, auth, userPath, soffice, thumbsDir: THUMBS_DIR, exists, sendError });
const { convertirOffice } = officeMod.core;
app.use('/api', officeMod.router);

// Descargas, ZIP, vista previa, miniaturas y texto (lib/archivos)
const archivosMod = createArchivos({ express, ZipArchive, auth, userPath, sendError, registrarActividad, sharp, ffmpeg, soffice, THUMBS_DIR, exists, convertirOffice, versions: () => versionsMod });
const { cabeceraDescarga, enviarZip, convertirCache, fotogramaVideo } = archivosMod.core;
app.use(archivosMod.router);

const fotosMod = createFotos({ express, auth, userRoot, userPath, isHidden, sharp, thumbsDir: THUMBS_DIR, IMAGE_TYPES, HEIC_TYPES, sendError });
app.use('/api', fotosMod.router);

// Qué sabe hacer este servidor: el cliente lo usa para no ofrecer lo que no hay
app.get('/api/capabilities', auth, (req, res) => {
  res.json({
    sharp: !!sharp, ffmpeg, office: !!soffice, textMax: TEXT_MAX,
    tileUrl: TILE_URL, tileAttr: TILE_ATTR,
  });
});

const papeleraMod = createPapelera({ express, auth, userRoot, resolveFor, shares: () => sharesMod, calendar: () => calendarMod.core, freeName: (...a) => freeName(...a), barridoUsuario: () => barridoUsuario, sendError, registrarActividad });
app.use('/api', papeleraMod.router);

const albumsMod = createAlbums({ express, auth, userRoot, resolveFor, enviarZip: (...a) => enviarZip(...a), sendError });
const { readFavs, readAlbums } = albumsMod.core;
app.use('/api', albumsMod.router);
const enlacesMod = createEnlaces({
  express, auth, jsonMedio, bcrypt, userRoot, appDir: APP_DIR, thumbsDir: THUMBS_DIR, loadUsers, sendError, registrarActividad,
  resolveFor, userPath, assertVisible, safeResolve, isHidden, esCompartida, exists,
  enviaPlantilla, enviarZip, cabeceraDescarga, makeUploader, MAX_UPLOAD_BYTES,
  albums: albumsMod.core, promptsCore: promptsMod.core, events: eventsMod, alCambiar: alCambiarContenido,
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
const { papeleraDias, purgeExpired } = papeleraMod.core;
const notesMod = createNotes({ express, auth, userRoot, sendError, papeleraDias, calendar: () => calendarMod.core, extraeLinks: (b) => notesExtra.extraeLinks(b) });
const { readNotes, writeNotes, notaFile, descendientes, notasFuente, purgarNotasCaducadas, enCola: enColaNotas } = notesMod.core;
app.use('/api', notesMod.router);
// Búsqueda global sin IA + capa de IA opcional (lib/busqueda, lib/ia). Se crean aquí porque leen las notas.
const busquedaMod = createBusqueda({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarLogros, notas: () => ({ readNotes, notaFile }) });
const iaMod = createIA({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarLogros, secreto: JWT_SECRET, busqueda: busquedaMod.core });
const importarMod = createImportar({ express, multer, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido,
  notas: () => ({ ...notesMod.core, extraeLinks: (b) => notesExtra.extraeLinks(b) }), bases: basesMod.core, contactos: contactsMod.core });
const documentosMod = createDocumentos({ express, userRoot, sendError, registrarActividad, alCambiar: alCambiarContenido });
modulosConLogros.push(busquedaMod, iaMod, importarMod, documentosMod);

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
app.use('/api/busqueda', auth, busquedaMod.router);
app.use('/api/ia', auth, iaMod.router);
app.use('/api/importar', auth, importarMod.router);
app.use('/api/documentos', auth, documentosMod.router);
app.use('/api/marcadores', auth, marcadoresMod.router);
app.use('/api/sincronizados', auth, sincronizadosMod.router);
app.use('/api/recordatorios', auth, recordatoriosMod.router);
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
// Rutas y conexiones entre módulos (lib/transversal)
montaTransversal({
  app, auth, sendError, userPath, limpiaRel, BASE_PATH,
  labels: labelsMod, calendar: calendarMod.core, prompts: promptsMod.core, games: gamesMod.core,
  readNotes, writeNotes, notaFile,
});

// Una ruta de la API que no existe es un 404 en JSON, no la página de la app con un 200
app.all('/api/*', (req, res) => res.status(404).json({ error: 'No existe' }));

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
  console.error('Error no controlado en', req.method, req.baseUrl + req.path, '-', err && err.stack || err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
// Un fallo suelto en una promesa no debe tumbar el servidor entero
process.on('unhandledRejection', (e) => console.error('Promesa rechazada sin capturar:', e && e.stack || e));

root.use(BASE_PATH || '/', app);

root.listen(PORT, () => { console.log(
  `KookyeCatCloud escuchando en puerto ${PORT}${BASE_PATH ? `, bajo ${BASE_PATH}/` : ''}, datos en ${DATA_ROOT}`); pushMod.arranca(); });
