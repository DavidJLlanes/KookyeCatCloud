/**
 * KookyeCatCloud - Servidor de archivos y backup de fotos personal, autoalojado
 */
const express = require('express');
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
const createCalendar = require('./lib/calendar');
const createPrompts = require('./lib/prompts');
const createClip = require('./lib/clip');
const { createGame } = require('./lib/game');
const { readJson, updateJson, kccDir } = require('./lib/store');
const createContacts = require('./lib/contacts');
const createNotesExtra = require('./lib/notes-extra');
const createShopping = require('./lib/shopping');
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
const MIN_PASSWORD = 6;
// Caché de miniaturas: fuera de DATA_DIR para que no aparezca en los listados
const THUMBS_DIR = process.env.THUMBS_DIR || path.join(APP_DIR, '.thumbs');
const THUMB_SIZE = 480;
const TRASH_DIR = '.trash';                                    // dentro de la carpeta de cada usuario
const TRASH_TTL_DAYS = Number(process.env.TRASH_TTL_DAYS || 30);
const TRASH_SWEEP_HOURS = Number(process.env.TRASH_SWEEP_HOURS || 6);   // cada cuánto se revisan las papeleras de todos
// Días que aguanta cada usuario lo que borra (0 = nunca se vacía sola). Lo elige él en Papelera.
const PAPELERA_OPCIONES = [0, 7, 14, 30, 60, 90, 180];
const SEARCH_LIMIT = 300;
const BATCH_LIMIT = 500;
// Enlaces: de subida (otros te dejan archivos) y de descarga (mandas tú algo).
// Comparten archivo y se distinguen por el campo kind.
const LINKS_FILE = path.join(APP_DIR, 'uploadlinks.json');
const ZIP_LIMIT = Number(process.env.ZIP_LIMIT || 200);
const LINK_MAX_FILES = Number(process.env.LINK_MAX_FILES || 50);
const LINK_MAX_BYTES = Number(process.env.LINK_MAX_BYTES || 2 * 1024 * 1024 * 1024);
const LINK_IP_HOURLY = Number(process.env.LINK_IP_HOURLY || 200);
// Bloc de notas: vive dentro de la carpeta del usuario, oculto del explorador
const NOTES_DIR = '.notes';
const NOTES_LIMIT = Number(process.env.NOTES_LIMIT || 5000);
const NOTE_MAX_CHARS = Number(process.env.NOTE_MAX_CHARS || 500000);
// Álbumes: colecciones con nombre que apuntan a fotos sin moverlas de sitio
const ALBUMS_DIR = '.albums';
const ALBUM_LIMIT = 200;
const ALBUM_ITEMS_LIMIT = 2000;
// Sesiones (para poder cerrarlas en remoto) y registro de actividad
const SESSIONS_FILE = path.join(APP_DIR, 'sessions.json');
const ACTIVITY_FILE = path.join(APP_DIR, 'activity.log.jsonl');
const ACTIVITY_MAX = Number(process.env.ACTIVITY_MAX || 5000);
// Buscador de duplicados: tope de archivos a examinar por si el árbol es enorme
const DUP_LIMIT = Number(process.env.DUP_LIMIT || 20000);

// Categorías para el reparto de espacio del panel de administración
const TYPE_RE = [
  ['image', /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|svg|tiff?)$/i],
  ['video', /\.(mp4|mov|avi|mkv|webm|m4v|mpe?g|wmv|flv)$/i],
  ['audio', /\.(mp3|wav|flac|aac|ogg|m4a|wma|opus)$/i],
  ['doc',   /\.(pdf|docx?|txt|rtf|odt|md|pages|xlsx?|csv|ods|pptx?|odp|epub)$/i],
];
const typeOf = (name) => (TYPE_RE.find(([, re]) => re.test(name)) || ['other'])[0];

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
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
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
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return {}; }
}
function saveSessions(data) {
  const tmp = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, SESSIONS_FILE);
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
    fs.appendFile(ACTIVITY_FILE, JSON.stringify(entry) + '\n', () => {});
  } catch { /* un fallo aquí no debe tumbar la petición real */ }
}
setInterval(() => {
  fs.readFile(ACTIVITY_FILE, 'utf8', (err, data) => {
    if (err) return;
    const lineas = data.split('\n').filter(Boolean);
    if (lineas.length <= ACTIVITY_MAX) return;
    fs.writeFile(ACTIVITY_FILE, lineas.slice(-ACTIVITY_MAX).join('\n') + '\n', () => {});
  });
}, 10 * 60 * 1000).unref();

/* ---------------- TOTP (RFC 6238), para la verificación en dos pasos ----------------
   Implementado a mano para no añadir una dependencia solo por esto: son
   40 líneas de base32 y HMAC-SHA1, ambos ya presentes en Node. */
function base32Encode(buf) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '', salida = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) salida += alfabeto[parseInt(bits.slice(i, i + 5), 2)];
  const resto = bits.length % 5;
  if (resto) salida += alfabeto[parseInt(bits.slice(-resto).padEnd(5, '0'), 2)];
  while (salida.length % 8) salida += '=';
  return salida;
}
function base32Decode(str) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpio = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of limpio) {
    const v = alfabeto.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpEn(secretBuf, contador) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codigo = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 |
                  (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return String(codigo).padStart(6, '0');
}
// Ventana de ±1 paso (30 s): cubre el desfase de reloj típico entre servidor y móvil
function totpVerificar(secretB32, token) {
  if (!token) return false;
  const secretBuf = base32Decode(secretB32);
  const contador = Math.floor(Date.now() / 30000);
  for (let e = -1; e <= 1; e++) {
    if (totpEn(secretBuf, contador + e) === String(token).trim()) return true;
  }
  return false;
}


// Módulos nuevos. Se crean aquí, antes de las rutas, porque las rutas de archivos los usan.
const labelsMod = createLabels({ express, userRoot, sendError });
const calendarMod = createCalendar({
  express, userRoot, sendError, registrarActividad,
  icalIndexFile: path.join(APP_DIR, 'ical-tokens.json'),   // token de suscripción -> usuario
});
const promptsMod = createPrompts({
  express, multer, sharp, userRoot, sendError, registrarActividad,
  calendar: calendarMod.core, labels: labelsMod,
  papeleraDias: (user) => papeleraDias(user),
});
const contactsMod = createContacts({ express, sharp, userRoot, sendError, registrarActividad, labels: labelsMod, calendar: calendarMod.core });
const shoppingMod = createShopping({ express, multer, sharp, dataRoot: DATA_ROOT, sendError, registrarActividad });

// Versiones de archivos de texto (se crea aquí porque WebDAV y las rutas de archivos la usan)
const versionsMod = createVersions({
  express, auth: (req, res, next) => auth(req, res, next), userRoot, resolveFor, sendError, textMax: Number(process.env.TEXT_MAX || 512 * 1024),
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
async function contarContenido(user) {
  const raiz = kccDir(userRoot(user));
  const [arch, notas, contactos, cal, etq, prompts] = await Promise.all([
    contarArchivos(user),
    readNotes(user).catch(() => ({ items: [] })),
    readJson(path.join(raiz, 'contacts.json'), { contacts: [] }),
    readJson(path.join(raiz, 'calendar.json'), { events: [] }),
    readJson(path.join(raiz, 'labels.json'), { labels: [] }),
    promptsMod.core.contar(user),
  ]);
  return {
    archivos: arch.archivos, fotos: arch.fotos,
    notas: (notas.items || []).filter(i => i.type === 'note' && !i.deletedAt && !i.trashed).length,
    contactos: (contactos.contacts || []).filter(c => !c.deletedAt).length,
    eventos: (cal.events || []).length,
    etiquetas: (etq.labels || []).length,
    prompts,
    enlaces: loadLinks().filter(l => l.owner === user.username).length,
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
  resolveFor,
  userRoot,
  loadUsers,
  isHidden,
  base: BASE_PATH,
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
app.use((req, res, next) => {
  if (req.path === '/api/prompts/import') return jsonGrande(req, res, next);
  if (/^\/api\/(notes|text|prompts|calendar|labels|clip|shopping)(\/|$)/.test(req.path)) return jsonMedio(req, res, next);
  return jsonPequeno(req, res, next);
});
app.use(cookieParser());

// --- Cabeceras de seguridad ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN y no DENY: el visor de PDF va dentro de un marco de la propia web.
  // Otro sitio sigue sin poder enmarcarnos, que es de lo que protege esto.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // object-src 'self' y no 'none': para enseñar un PDF dentro de un marco, Chrome lo
  // trata como contenido de complemento y mira esta directiva del documento que lo
  // enmarca. Con 'none' sale el recuadro gris de "no se pudo cargar". Sigue limitado
  // al propio dominio, y todo se sirve con nosniff y con el tipo declarado.
  // img-src incluye el servidor de tiles del mapa: es lo ÚNICO externo de toda la app.
  // blob: es solo para la vista previa local de las imágenes que se están a punto de subir.
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; img-src 'self' data: blob: ${TILE_ORIGIN}; style-src 'self' 'unsafe-inline'; ` +
    "script-src 'self'; object-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'"
  );
  next();
});

// Las páginas HTML y el manifest llevan rutas absolutas ("/app.js"): se reescriben con el
// prefijo al servirlas. El resto de estáticos se sirven tal cual.
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const plantillas = new Map();
function enviaPlantilla(res, nombre, tipo) {
  // Se cachea la plantilla ya reescrita, pero se vuelve a generar si el archivo cambia
  const archivo = path.join(PUBLIC_DIR, nombre);
  const mtime = fs.statSync(archivo).mtimeMs;
  let hit = plantillas.get(nombre);
  let texto = hit && hit.mtime === mtime ? hit.texto : undefined;
  if (texto === undefined) {
    texto = fs.readFileSync(archivo, 'utf8');
    if (BASE_PATH) {
      texto = nombre.endsWith('.json')
        ? texto.replace(/("(?:id|start_url|scope|src|action|url)": ")\//g, `$1${BASE_PATH}/`)
        : texto.replace(/((?:href|src)=")\/(?!\/)/g, `$1${BASE_PATH}/`);
    }
    if (nombre.endsWith('.html')) {
      texto = texto.replace('<head>', `<head>
<meta name="kcc-base" content="${BASE_PATH}">`);
    }
    plantillas.set(nombre, { texto, mtime });
  }
  // Las imágenes OG necesitan URL absoluta y el prefijo real de despliegue.
  if (nombre === 'index.html') {
    const proto = (res.req.headers['x-forwarded-proto'] || res.req.protocol || 'https').toString().split(',')[0].trim();
    const host = res.req.get('host');
    const origin = proto + '://' + host;
    texto = texto.replaceAll('__KCC_OG_URL__', origin + BASE_PATH + '/og-image.jpg')
      .replaceAll('__KCC_PAGE_URL__', origin + BASE_PATH + '/');
  }
  res.type(tipo).send(texto);
}
app.get('/manifest.json', (req, res) => enviaPlantilla(res, 'manifest.json', 'application/manifest+json'));
// Identificador de la versión instalada: sale de la versión del paquete y del tamaño y la fecha de
// cada archivo de public/. Cambia solo cuando se actualiza el código, y con él cambia el nombre de
// la caché del service worker: así los navegadores detectan la actualización sin que haya que
// acordarse de subir ningún número a mano.
const APP_VERSION = require('./package.json').version;
const ARRANQUE = Date.now();
// Firma inmutable por proceso: el despliegue reinicia Node para activar el nuevo commit.
// Prioridad: BUILD_ID del despliegue, HEAD de Git (lectura única), versión del paquete.
function buildId() {
  return BUILD_ID;
}
function readGitHead() {
  try {
    const dot = path.join(__dirname, '.git');
    const gitDir = fs.statSync(dot).isDirectory() ? dot : path.resolve(__dirname, fs.readFileSync(dot, 'utf8').trim().replace(/^gitdir:\\s*/, ''));
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[a-f0-9]{40}$/i.test(head)) return head;
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      try { return fs.readFileSync(path.join(gitDir, ref), 'utf8').trim(); } catch {}
      const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
      const line = packed.split('\\n').find(l => l.endsWith(' ' + ref));
      if (line) return line.split(' ')[0];
    }
  } catch {}
  return '';
}
const BUILD_ID = String(process.env.KCC_BUILD_ID || process.env.BUILD_ID || readGitHead() || APP_VERSION).trim().slice(0, 40);

app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/javascript').send(fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8').split('__BUILD__').join(buildId()));
});
// Versión instalada: pública y sin datos sensibles (la usa la tarjeta "Acerca de" y las comprobaciones)
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION, build: buildId(), startedAt: ARRANQUE });
});
app.use(express.static(PUBLIC_DIR, { index: false }));

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

// --- Limitador de intentos de login (en memoria) ---
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // clave -> { count, expires }

function isBlocked(key) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (Date.now() > entry.expires) { attempts.delete(key); return 0; }
  if (entry.count < MAX_ATTEMPTS) return 0;
  return Math.ceil((entry.expires - Date.now()) / 1000);
}
function registerFailure(key) {
  const entry = attempts.get(key);
  if (entry && Date.now() <= entry.expires) {
    entry.count++;
    entry.expires = Date.now() + LOCK_MS;
  } else {
    attempts.set(key, { count: 1, expires: Date.now() + LOCK_MS });
  }
}
function clearFailures(key) { attempts.delete(key); }
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (now > entry.expires) attempts.delete(key);
}, 5 * 60 * 1000).unref();

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
function sendError(res, err) {
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

/* ---------------- Enlaces de subida ---------------- */
function loadLinks() {
  try { return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8')); } catch { return []; }
}
function saveLinks(links) {
  const tmp = `${LINKS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(links, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, LINKS_FILE);
}
const linkExpired = (l) => !!l.expiresAt && Date.now() > l.expiresAt;
// Los enlaces creados antes de que existieran los de descarga no llevan kind
const linkKind = (l) => l.kind || 'upload';
function linkPublic(l) {
  // Lo único que ve quien recibe el enlace: nunca la ruta ni el dueño
  return { id: l.id, label: l.label, expiresAt: l.expiresAt, files: l.files, maxFiles: LINK_MAX_FILES };
}
// El rol puede haber cambiado desde que se creó el enlace, así que se relee
function ownerOf(link) {
  const u = loadUsers().find(u => u.username === link.owner);
  return u ? { username: u.username, role: u.role } : null;
}

// Tope por IP para el endpoint público de subida
const publicHits = new Map();
function publicAllowed(ip) {
  const now = Date.now();
  const e = publicHits.get(ip);
  if (!e || now > e.reset) { publicHits.set(ip, { n: 1, reset: now + 3600000 }); return true; }
  e.n++;
  return e.n <= LINK_IP_HOURLY;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of publicHits) if (now > v.reset) publicHits.delete(k);
}, 10 * 60 * 1000).unref();

/* ---------------- Papelera ---------------- */
function trashRoot(user) {
  const dir = path.join(userRoot(user), TRASH_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
async function readTrash(user) {
  try { return JSON.parse(await fsp.readFile(path.join(trashRoot(user), 'index.json'), 'utf8')); }
  catch { return []; }
}
async function writeTrash(user, entries) {
  const file = path.join(trashRoot(user), 'index.json');
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(entries, null, 2));
  await fsp.rename(tmp, file);
}
// Mueve a la papelera en lugar de borrar: un rm -rf recursivo sin vuelta atrás
// es demasiado fácil de disparar por accidente desde el móvil.
async function trashItem(user, relPath) {
  // Borrar dentro de una carpeta compartida con permiso de edición: va a la papelera de su dueño
  const comp = sharesMod.parse(relPath);
  if (comp) {
    const r = sharesMod.resolver(user, comp, true);
    if (!comp.resto) { const e = new Error('No puedes borrar la carpeta compartida entera: pídeselo a su dueño o deja de verla'); e.status = 403; throw e; }
    return trashItem(r.owner, r.ownerRel);
  }
  const target = resolveFor(user, relPath);
  if (target === userRoot(user)) {
    const err = new Error('No puedes borrar la carpeta raíz');
    err.status = 400;
    throw err;
  }
  const stat = await fsp.stat(target);
  const id = crypto.randomBytes(8).toString('hex');
  await fsp.rename(target, path.join(trashRoot(user), id));
  const clean = String(relPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const from = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : '';
  calendarMod.core.quitaOrigenArchivo(user, clean).catch(() => {});
  sharesMod.quita(user.username, clean);                                // lo que se borra deja de estar compartido   // un archivo en la papelera no ocupa el calendario
  const entries = await readTrash(user);
  entries.unshift({
    id,
    name: path.basename(target),
    from,
    isDir: stat.isDirectory(),
    size: stat.isDirectory() ? 0 : stat.size,
    deletedAt: Date.now(),
  });
  await writeTrash(user, entries);
}
const prefsFile = (user) => path.join(kccDir(userRoot(user)), 'prefs.json');
async function papeleraDias(user) {
  const p = await readJson(prefsFile(user), {});
  return PAPELERA_OPCIONES.includes(p.trashDays) ? p.trashDays : TRASH_TTL_DAYS;
}
async function purgeExpired(user) {
  const entries = await readTrash(user);
  const dias = await papeleraDias(user);
  if (!dias) return entries;
  const cutoff = Date.now() - dias * 86400000;
  const expired = entries.filter(e => e.deletedAt < cutoff);
  if (!expired.length) return entries;
  for (const e of expired) {
    await fsp.rm(path.join(trashRoot(user), e.id), { recursive: true, force: true });
  }
  const kept = entries.filter(e => e.deletedAt >= cutoff);
  await writeTrash(user, kept);
  return kept;
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

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ipKey = `ip:${req.ip}`;
  const userKey = `user:${username.toLowerCase()}`;

  const wait = isBlocked(ipKey) || isBlocked(userKey);
  if (wait) {
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({ error: `Demasiados intentos fallidos. Prueba en ${Math.ceil(wait / 60)} min.` });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username);
  const ok = bcrypt.compareSync(password, user ? user.passwordHash : DUMMY_HASH) && !!user;
  if (!ok) {
    registerFailure(ipKey);
    if (username) registerFailure(userKey);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  clearFailures(ipKey);
  clearFailures(userKey);

  // Con verificación en dos pasos activada, esto solo confirma la contraseña:
  // la sesión de verdad no se abre hasta validar el código en /api/login/2fa
  if (user.twofaSecret) {
    const pendiente = jwt.sign({ username: user.username, stage: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
    res.cookie('pending2fa', pendiente, {
      httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH, maxAge: 5 * 60 * 1000,
    });
    return res.json({ ok: true, need2fa: true });
  }

  const jti = creaSesion(user.username, req);
  const token = jwt.sign({ username: user.username, role: user.role, jti }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: SECURE_COOKIES,
    path: COOKIE_PATH,
    maxAge: 30 * 24 * 3600 * 1000,
  });
  registrarActividad({ user: { username: user.username }, ip: req.ip }, 'login', {});
  res.json({ ok: true, username: user.username, role: user.role });
});

// Segundo paso del login: el código de la app de autenticación
app.post('/api/login/2fa', (req, res) => {
  const pendiente = req.cookies.pending2fa;
  if (!pendiente) return res.status(401).json({ error: 'Vuelve a iniciar sesión' });
  let payload;
  try { payload = jwt.verify(pendiente, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Vuelve a iniciar sesión' }); }
  if (payload.stage !== '2fa') return res.status(401).json({ error: 'Vuelve a iniciar sesión' });

  const ipKey = `ip:${req.ip}`;
  const wait = isBlocked(ipKey);
  if (wait) {
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({ error: `Demasiados intentos. Prueba en ${Math.ceil(wait / 60)} min.` });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === payload.username);
  if (!user || !user.twofaSecret || !totpVerificar(user.twofaSecret, req.body?.code)) {
    registerFailure(ipKey);
    return res.status(401).json({ error: 'Código incorrecto' });
  }
  clearFailures(ipKey);
  res.clearCookie('pending2fa', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });

  const jti = creaSesion(user.username, req);
  const token = jwt.sign({ username: user.username, role: user.role, jti }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, {
    httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH, maxAge: 30 * 24 * 3600 * 1000,
  });
  registrarActividad({ user: { username: user.username }, ip: req.ip }, 'login', {});
  res.json({ ok: true, username: user.username, role: user.role });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies.token;
  if (token) {
    try { const p = jwt.verify(token, JWT_SECRET); if (p.jti) revocaSesion(p.jti); } catch { /* token ya inválido */ }
  }
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });
  res.clearCookie('pending2fa', { httpOnly: true, sameSite: 'strict', secure: SECURE_COOKIES, path: COOKIE_PATH });
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// --- Gestión de usuarios (solo admin) ---
app.get('/api/users', auth, adminOnly, (req, res) => {
  const users = loadUsers().map(u => ({ username: u.username, role: u.role }));
  res.json(users);
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Usuario inválido: 3-32 caracteres, solo letras, números y . _ -' });
  }
  if (String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });
  }
  const users = loadUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Usuario ya existe' });
  users.push({ username, passwordHash: bcrypt.hashSync(password, 10), role: role === 'admin' ? 'admin' : 'user' });
  saveUsers(users);
  registrarActividad(req, 'usuario_creado', { username });
  res.json({ ok: true });
});

app.delete('/api/users/:username', auth, adminOnly, (req, res) => {
  let users = loadUsers();
  if (req.params.username === 'admin') return res.status(400).json({ error: 'No puedes borrar admin' });
  users = users.filter(u => u.username !== req.params.username);
  saveUsers(users);
  sharesMod.quitaUsuario(req.params.username);
  passkeysMod.quitaUsuario(req.params.username);
  registrarActividad(req, 'usuario_eliminado', { username: req.params.username });
  res.json({ ok: true });
});

app.post('/api/users/:username/password', auth, (req, res) => {
  if (req.user.username !== req.params.username && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const { password } = req.body || {};
  if (!password || password.length < MIN_PASSWORD) return res.status(400).json({ error: 'Contraseña muy corta' });
  const users = loadUsers();
  const u = users.find(u => u.username === req.params.username);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  u.passwordHash = bcrypt.hashSync(password, 10);
  saveUsers(users);
  registrarActividad(req, 'password_cambiada', { username: req.params.username });
  res.json({ ok: true });
});

/* ---------------- Sesiones abiertas ---------------- */
app.get('/api/sessions', auth, (req, res) => {
  const mias = Object.values(sessions)
    .filter(s => s.username === req.user.username)
    .map(s => ({ ...s, current: s.jti === req.user.jti }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  res.json(mias);
});
app.delete('/api/sessions/:jti', auth, (req, res) => {
  const s = sessions[req.params.jti];
  if (!s || s.username !== req.user.username) return res.status(404).json({ error: 'No encontrada' });
  revocaSesion(req.params.jti);
  registrarActividad(req, 'sesion_cerrada_remoto', { jti: req.params.jti });
  res.json({ ok: true });
});
app.delete('/api/sessions', auth, (req, res) => {
  let n = 0;
  for (const [jti, s] of Object.entries(sessions)) {
    if (s.username === req.user.username && jti !== req.user.jti) { delete sessions[jti]; vaultMod.cierraSesion(jti); n++; }
  }
  if (n) sessionsSucio = true;
  registrarActividad(req, 'sesiones_cerradas_todas', { cantidad: n });
  res.json({ ok: true, removed: n });
});

/* ---------------- Verificación en dos pasos (TOTP) ---------------- */
app.get('/api/2fa/status', auth, (req, res) => {
  const u = loadUsers().find(x => x.username === req.user.username);
  res.json({ enabled: !!(u && u.twofaSecret) });
});

app.post('/api/2fa/setup', auth, (req, res) => {
  const secreto = base32Encode(crypto.randomBytes(20));
  const users = loadUsers();
  const u = users.find(x => x.username === req.user.username);
  u.twofaPending = secreto;                 // no se activa hasta confirmar con un código válido
  saveUsers(users);
  const uri = `otpauth://totp/${encodeURIComponent('KookyeCatCloud:' + u.username)}` +
    `?secret=${secreto}&issuer=${encodeURIComponent('KookyeCatCloud')}&digits=6&period=30`;
  res.json({ secret: secreto, uri });
});

app.post('/api/2fa/confirm', auth, (req, res) => {
  const users = loadUsers();
  const u = users.find(x => x.username === req.user.username);
  if (!u.twofaPending) return res.status(400).json({ error: 'Primero pide un código nuevo' });
  if (!totpVerificar(u.twofaPending, req.body?.code)) return res.status(400).json({ error: 'Código incorrecto' });
  u.twofaSecret = u.twofaPending;
  delete u.twofaPending;
  saveUsers(users);
  registrarActividad(req, '2fa_activado', {});
  res.json({ ok: true });
});

app.post('/api/2fa/disable', auth, (req, res) => {
  const users = loadUsers();
  const u = users.find(x => x.username === req.user.username);
  if (!bcrypt.compareSync(String(req.body?.password || ''), u.passwordHash)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  delete u.twofaSecret;
  delete u.twofaPending;
  saveUsers(users);
  registrarActividad(req, '2fa_desactivado', {});
  res.json({ ok: true });
});

/* ---------------- Tokens de aplicación ----------------
   Para WebDAV o scripts, sin usar la contraseña de la cuenta: se pueden
   revocar uno a uno sin tener que cambiarla. */
app.get('/api/apptokens', auth, (req, res) => {
  const u = loadUsers().find(x => x.username === req.user.username);
  const tokens = (u?.apptokens || []).map(t => ({ id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt || null }));
  res.json(tokens);
});
app.post('/api/apptokens', auth, (req, res) => {
  const nombre = String(req.body?.name || '').slice(0, 60) || 'Sin nombre';
  const users = loadUsers();
  const u = users.find(x => x.username === req.user.username);
  u.apptokens = u.apptokens || [];
  if (u.apptokens.length >= 20) return res.status(400).json({ error: 'Máximo 20 tokens. Revoca alguno antes de crear otro.' });
  const token = crypto.randomBytes(24).toString('base64url');
  const entrada = { id: crypto.randomBytes(8).toString('hex'), name: nombre, hash: bcrypt.hashSync(token, 10), createdAt: Date.now() };
  u.apptokens.push(entrada);
  saveUsers(users);
  registrarActividad(req, 'apptoken_creado', { name: nombre });
  // El valor real solo se ve esta vez: a partir de aquí solo se guarda su hash
  res.json({ ok: true, id: entrada.id, token });
});
app.delete('/api/apptokens/:id', auth, (req, res) => {
  const users = loadUsers();
  const u = users.find(x => x.username === req.user.username);
  const antes = (u.apptokens || []).length;
  u.apptokens = (u.apptokens || []).filter(t => t.id !== req.params.id);
  if (u.apptokens.length === antes) return res.status(404).json({ error: 'No encontrado' });
  saveUsers(users);
  registrarActividad(req, 'apptoken_revocado', { id: req.params.id });
  res.json({ ok: true });
});

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
        while (fs.existsSync(target)) {
          target = path.join(dir, `${base}_${counter}${ext}`);
          counter++;
        }
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

/* --- Enlaces de subida: gestión (con sesión) --- */
app.get('/api/uploadlinks', auth, (req, res) => {
  const soloDe = req.query.kind;
  const mine = loadLinks()
    .filter(l => l.owner === req.user.username)
    .filter(l => !soloDe || linkKind(l) === soloDe)
    .map(l => ({ ...l, kind: linkKind(l), expired: linkExpired(l), password: undefined,
                 passwordHash: undefined, protegido: !!l.passwordHash }));
  res.json(mine);
});

/* --- Enlaces de descarga: compartir un archivo o una carpeta --- */
app.post('/api/sharelinks', auth, async (req, res) => {
  try {
    const { path: rel, label, days, password, album: albumId } = req.body || {};
    let abs = '', stat = null, albumTitulo = '';
    if (albumId) {
      // Un álbum se comparte como una galería plana con sus fotos, estén en la carpeta que estén
      const album = (await readAlbums(req.user)).find(a => a.id === String(albumId));
      if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
      if (!(await albumArchivos(req.user, album)).length) return res.status(400).json({ error: 'El álbum no tiene archivos que compartir' });
      albumTitulo = album.title;
    } else {
      if (esCompartida(rel)) return res.status(400).json({ error: 'Lo que otro usuario te ha compartido no se puede volver a compartir con un enlace' });
      abs = userPath(req, rel);
      stat = await fsp.stat(abs);
    }
    const d = Number(days);
    const links = loadLinks();
    const entrada = {
      id: crypto.randomBytes(16).toString('hex'),
      kind: 'share',
      owner: req.user.username,
      path: albumId ? '' : String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
      label: String(label || '').slice(0, 80) || (albumId ? albumTitulo : path.basename(abs)),
      isDir: albumId ? true : stat.isDirectory(),
      ...(albumId ? { album: String(albumId) } : {}),
      createdAt: Date.now(),
      expiresAt: d > 0 ? Date.now() + d * 86400000 : null,
      downloads: 0,
    };
    if (password) entrada.passwordHash = bcrypt.hashSync(String(password), 10);
    links.unshift(entrada);
    saveLinks(links);
    registrarActividad(req, 'enlace_compartido_creado', { path: entrada.path || `álbum ${entrada.label}`, isDir: entrada.isDir });
    res.json({ ok: true, link: { ...entrada, passwordHash: undefined, protegido: !!entrada.passwordHash } });
  } catch (err) {
    sendError(res, err);
  }
});

// Datos públicos del enlace: nunca la ruta ni el dueño
app.get('/api/public/share/:id', async (req, res) => {
  const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
  if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
  if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
  const owner = ownerOf(link);
  if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

  let size = 0;
  try {
    if (link.album) {
      const album = (await readAlbums(owner)).find(a => a.id === link.album);
      if (!album) throw new Error('álbum borrado');
    } else {
      const abs = resolveFor(owner, link.path);
      const stat = await fsp.stat(abs);
      size = stat.isDirectory() ? 0 : stat.size;
    }
  } catch {
    return res.status(410).json({ error: link.album ? 'El álbum ya no está disponible' : 'El archivo ya no está disponible' });
  }
  res.json({
    id: link.id, label: link.label, isDir: link.isDir, album: !!link.album, size,
    expiresAt: link.expiresAt, downloads: link.downloads, protegido: !!link.passwordHash,
  });
});

app.get('/api/public/share/:id/download', async (req, res) => {
  try {
    if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas descargas desde tu conexión' });
    const links = loadLinks();
    const link = links.find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    if (link.passwordHash && !bcrypt.compareSync(String(req.query.pw || ''), link.passwordHash)) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    const owner = ownerOf(link);
    if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

    if (link.album) {
      const album = (await readAlbums(owner)).find(a => a.id === link.album);
      if (!album) return res.status(410).json({ error: 'El álbum ya no está disponible' });
      const archivos = await albumArchivos(owner, album);
      if (!archivos.length) return res.status(410).json({ error: 'El álbum está vacío' });
      link.downloads = (link.downloads || 0) + 1;
      link.lastDownloadAt = Date.now();
      saveLinks(links);
      return enviarZip(res, archivos.map(a => ({ abs: a.abs, name: a.name, isDir: false })), `${nombreSeguro(album.title)}.zip`);
    }
    const abs = resolveFor(owner, link.path);
    const stat = await fsp.stat(abs);

    link.downloads = (link.downloads || 0) + 1;
    link.lastDownloadAt = Date.now();
    saveLinks(links);

    if (stat.isDirectory()) {
      return enviarZip(res, [{ abs, name: path.basename(abs), isDir: true }], `${path.basename(abs)}.zip`);
    }
    cabeceraDescarga(res, path.basename(abs));
    res.sendFile(abs, { headers: { 'Content-Type': 'application/octet-stream' } });
  } catch (err) {
    if (!res.headersSent) sendError(res, err);
  }
});

/* --- Galería pública de una carpeta compartida ---
   Antes, compartir una carpeta solo ofrecía el ZIP entero. Esto deja navegarla
   y ver las fotos igual que en la propia app, sin sesión y sin salir de la ruta
   que se compartió: dentroDeLink() nunca deja subir por encima de link.path. */
function dentroDeLink(owner, link, subrel) {
  const base = resolveFor(owner, link.path);           // ya es de fiar: es el dueño real del enlace
  const sub = String(subrel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  assertVisible(sub);
  return safeResolve(base, sub);
}
/* Ruta real de lo que se pide en un enlace público. En un enlace de álbum "sub" es el nombre de una foto
   del álbum (nunca una ruta): se busca entre sus archivos, así no se puede salir de lo compartido. */
async function rutaPublica(owner, link, subrel) {
  if (!link.album) return dentroDeLink(owner, link, subrel);
  const album = (await readAlbums(owner)).find(a => a.id === link.album);
  if (!album) throw new Error('álbum borrado');
  const nombre = String(subrel || '');
  const a = (await albumArchivos(owner, album)).find(x => x.name === nombre);
  if (!a) throw new Error('no está en el álbum');
  return a.abs;
}
function claveCompartida(link, req) {
  return !link.passwordHash || bcrypt.compareSync(String(req.query.pw || ''), link.passwordHash);
}
function esMediaPublico(name) {
  const ext = path.extname(name).toLowerCase();
  return !!(IMAGE_TYPES[ext] || HEIC_TYPES[ext] || VIDEO_TYPES[ext]);
}

app.get('/api/public/share/:id/list', async (req, res) => {
  try {
    const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    if (!link.isDir) return res.status(400).json({ error: 'Este enlace no es una carpeta' });
    if (!claveCompartida(link, req)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const owner = ownerOf(link);
    if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

    if (link.album) {
      if (req.query.sub) return res.status(404).json({ error: 'No encontrado' });
      const album = (await readAlbums(owner)).find(a => a.id === link.album);
      if (!album) return res.status(410).json({ error: 'El álbum ya no está disponible' });
      const archivos = await albumArchivos(owner, album);
      return res.json({ items: archivos.map(a => ({ name: a.name, isDir: false, size: a.size, modified: a.modified,
        viewable: esMediaPublico(a.name) })) });
    }
    const dir = dentroDeLink(owner, link, req.query.sub || '');
    const entradas = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
    const items = (await Promise.all(entradas.map(async e => {
      try {
        const stat = await fsp.stat(path.join(dir, e.name));
        return { name: e.name, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtime,
                 viewable: !stat.isDirectory() && esMediaPublico(e.name) };
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'es'));
    res.json({ items });
  } catch (err) { sendError(res, err); }
});

app.get('/api/public/share/:id/thumb', async (req, res) => {
  try {
    const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link || linkExpired(link) || !link.isDir || !claveCompartida(link, req)) return res.status(404).end();
    const owner = ownerOf(link);
    if (!owner) return res.status(404).end();
    const file = await rutaPublica(owner, link, req.query.sub || '');
    const ext = path.extname(file).toLowerCase();
    const esVideo = !!VIDEO_TYPES[ext];
    const tipo = THUMBABLE[ext];
    if (!tipo && !esVideo) return res.status(415).end();
    if (esVideo && !ffmpeg) return res.status(415).end();

    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (!esVideo && !sharp) return res.sendFile(file, { headers: { 'Content-Type': tipo } });

    const stat = await fsp.stat(file);
    const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|${THUMB_SIZE}|thumb`).digest('hex');
    const cached = path.join(THUMBS_DIR, `${key}.webp`);
    if (!await exists(cached)) {
      const tmp = `${cached}.${process.pid}.tmp`;
      if (esVideo) {
        const tmpImg = `${tmp}.webp`;
        await fotogramaVideo(file, tmpImg);
        await fsp.rename(tmpImg, cached);
      } else {
        const buf = await sharp(file, { failOn: 'none' }).rotate()
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 78 }).toBuffer();
        await fsp.writeFile(tmp, buf);
        await fsp.rename(tmp, cached);
      }
    }
    res.sendFile(cached, { headers: { 'Content-Type': 'image/webp' } });
  } catch { res.status(404).end(); }
});

app.get('/api/public/share/:id/view', async (req, res) => {
  try {
    const link = loadLinks().find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link || linkExpired(link) || !link.isDir || !claveCompartida(link, req)) return res.status(404).end();
    const owner = ownerOf(link);
    if (!owner) return res.status(404).end();
    const file = await rutaPublica(owner, link, req.query.sub || '');
    const ext = path.extname(file).toLowerCase();
    const type = PREVIEW_TYPES[ext];
    if (!type || ext === '.pdf') return res.status(415).end();   // la galería pública es solo fotos y vídeos

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (HEIC_TYPES[ext]) {
      if (!sharp) return res.status(415).end();
      const stat = await fsp.stat(file);
      const conv = await convertirCache(file, stat, DISPLAY_MAX, 'view');
      return res.sendFile(conv, { headers: { 'Content-Type': 'image/webp' } });
    }
    res.sendFile(file, { headers: { 'Content-Type': type } });
  } catch { res.status(404).end(); }
});

// Descarga de UN archivo dentro de la galería, sin tener que bajarte el ZIP entero
app.get('/api/public/share/:id/file', async (req, res) => {
  try {
    if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas descargas desde tu conexión' });
    const links = loadLinks();
    const link = links.find(l => l.id === req.params.id && linkKind(l) === 'share');
    if (!link || linkExpired(link) || !link.isDir) return res.status(404).end();
    if (!claveCompartida(link, req)) return res.status(401).end();
    const owner = ownerOf(link);
    if (!owner) return res.status(404).end();
    const file = await rutaPublica(owner, link, req.query.sub || '');
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return res.status(400).end();
    link.downloads = (link.downloads || 0) + 1;
    saveLinks(links);
    cabeceraDescarga(res, path.basename(file));
    res.sendFile(file, { headers: { 'Content-Type': 'application/octet-stream' } });
  } catch { res.status(404).end(); }
});

// Página pública del enlace de descarga
app.get('/s/:id', (req, res) => {
  enviaPlantilla(res, 'share.html', 'html');
});

/* --- Enlace público de solo lectura a uno o varios prompts (con los fragmentos ya sustituidos) --- */
app.post('/api/prompts-share', auth, jsonMedio, async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].slice(0, 100);
    if (!ids.length) return res.status(400).json({ error: 'Elige al menos un prompt' });
    const lista = await promptsMod.core.paraCompartir(req.user, ids);
    if (!lista.length) return res.status(404).json({ error: 'Los prompts no existen' });
    const d = Number(req.body.days);
    const entrada = {
      id: crypto.randomBytes(16).toString('hex'), kind: 'prompts', owner: req.user.username,
      label: String(req.body.title || '').slice(0, 80) || (lista.length === 1 ? lista[0].title : `${lista.length} prompts`),
      ids: lista.map(x => x.id), createdAt: Date.now(), expiresAt: d > 0 ? Date.now() + d * 86400000 : null, views: 0,
    };
    const links = loadLinks(); links.unshift(entrada); saveLinks(links);
    registrarActividad(req, 'prompts_compartidos', { n: lista.length });
    res.json({ ok: true, link: { id: entrada.id, label: entrada.label, expiresAt: entrada.expiresAt, count: lista.length } });
  } catch (err) { sendError(res, err); }
});
app.get('/api/public/prompts/:id', async (req, res) => {
  try {
    if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas peticiones desde tu conexión' });
    const links = loadLinks();
    const link = links.find(l => l.id === req.params.id && l.kind === 'prompts');
    if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
    if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
    const owner = ownerOf(link);
    if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });
    const prompts = await promptsMod.core.paraCompartir(owner, link.ids);
    if (!prompts.length) return res.status(410).json({ error: 'Estos prompts ya no están disponibles' });
    link.views = (link.views || 0) + 1; saveLinks(links);
    res.json({ label: link.label, expiresAt: link.expiresAt, prompts: prompts.map(({ id, ...resto }) => resto) });
  } catch (err) { sendError(res, err); }
});
app.get('/p/:id', (req, res) => {
  enviaPlantilla(res, 'prompts-share.html', 'html');
});

app.post('/api/uploadlinks', auth, (req, res) => {
  try {
    const { path: rel, label, days } = req.body || {};
    if (esCompartida(rel || '')) return res.status(400).json({ error: 'No se puede crear un enlace de subida en una carpeta compartida contigo' });
    const dir = userPath(req, rel || '');           // valida que la ruta es suya y visible
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ error: 'La carpeta de destino no existe' });
    }
    const d = Number(days);
    const links = loadLinks();
    links.unshift({
      id: crypto.randomBytes(16).toString('hex'),
      owner: req.user.username,
      path: String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
      label: String(label || '').slice(0, 80) || 'Envío de archivos',
      createdAt: Date.now(),
      expiresAt: d > 0 ? Date.now() + d * 86400000 : null,
      files: 0,
      bytes: 0,
    });
    saveLinks(links);
    res.json({ ok: true, link: links[0] });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/uploadlinks/:id', auth, (req, res) => {
  const links = loadLinks();
  const link = links.find(l => l.id === req.params.id);
  if (!link || link.owner !== req.user.username) return res.status(404).json({ error: 'No encontrado' });
  saveLinks(links.filter(l => l.id !== link.id));
  res.json({ ok: true });
});

/* --- Enlaces de subida: uso público, sin sesión --- */
app.get('/api/public/link/:id', (req, res) => {
  const link = loadLinks().find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
  if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
  if (!ownerOf(link)) return res.status(410).json({ error: 'Este enlace ya no está disponible' });
  res.json(linkPublic(link));
});

app.post('/api/public/link/:id/upload', (req, res) => {
  if (!publicAllowed(req.ip)) return res.status(429).json({ error: 'Demasiadas subidas desde tu conexión. Inténtalo más tarde.' });

  const links = loadLinks();
  const link = links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'Este enlace no existe' });
  if (linkExpired(link)) return res.status(410).json({ error: 'Este enlace ha caducado' });
  if (link.files >= LINK_MAX_FILES) return res.status(429).json({ error: 'Este enlace ha alcanzado su límite de archivos' });
  if (link.bytes >= LINK_MAX_BYTES) return res.status(429).json({ error: 'Este enlace ha alcanzado su límite de tamaño' });

  const owner = ownerOf(link);
  if (!owner) return res.status(410).json({ error: 'Este enlace ya no está disponible' });

  const uploader = makeUploader(
    () => resolveFor(owner, link.path),
    { fileSize: MAX_UPLOAD_BYTES, files: LINK_MAX_FILES }
  );
  uploader.array('files')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const subidos = req.files || [];
    if (!subidos.length) return res.status(400).json({ error: 'No has adjuntado ningún archivo' });
    // Se releen los enlaces por si cambiaron durante la subida
    const actuales = loadLinks();
    const actual = actuales.find(l => l.id === link.id);
    if (actual) {
      actual.files += subidos.length;
      actual.bytes += subidos.reduce((n, f) => n + f.size, 0);
      actual.lastUploadAt = Date.now();
      saveLinks(actuales);
    }
    try { eventsMod.cambio(resolveFor(owner, link.path)); } catch { /* sin aviso */ }
    res.json({ ok: true, uploaded: subidos.length });
  });
});

// Página pública del enlace
app.get('/u/:id', (req, res) => {
  enviaPlantilla(res, 'upload.html', 'html');
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
const TEXT_MAX = Number(process.env.TEXT_MAX || 512 * 1024);
// Lo que LibreOffice sabe convertir a PDF (documentos y presentaciones)
const OFFICE_RE = /\.(docx?|pptx?|odt|odp|rtf|pages|key)$/i;
// Las hojas de cálculo van por otro camino: se leen y se pintan como rejilla,
// porque convertirlas a PDF las pagina y deja de parecer una hoja de cálculo
const SHEET_RE = /\.(xlsx|xlsm|xls|ods|numbers)$/i;
const SHEET_NATIVE_RE = /\.(xlsx|xlsm)$/i;      // lo que exceljs abre directamente
const OFFICE_TIMEOUT = Number(process.env.OFFICE_TIMEOUT || 90000);
const SHEET_MAX_ROWS = Number(process.env.SHEET_MAX_ROWS || 2000);
const SHEET_MAX_COLS = Number(process.env.SHEET_MAX_COLS || 60);

// Mapa de fotos. El servidor de tiles es lo único externo que carga la app, así que
// se declara aquí y de aquí sale el permiso de la CSP: cambiar TILE_URL basta.
const TILE_URL = process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = process.env.TILE_ATTR ||
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TILE_ORIGIN = (() => {
  try { return new URL(TILE_URL.replace(/\{[sxyz]\}/g, '1')).origin; }
  catch { return 'https://tile.openstreetmap.org'; }
})();
const MAP_LIMIT = Number(process.env.MAP_LIMIT || 5000);
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
    const contenido = String(req.body?.text ?? '');
    if (contenido.length > TEXT_MAX) return res.status(400).json({ error: 'Demasiado grande para editar aquí' });
    // Si no cambia nada, no se reescribe ni se crea una versión de más
    if (stat.size <= TEXT_MAX * 4 && await fsp.readFile(file, 'utf8').then(t => t === contenido, () => false)) return res.json({ ok: true, unchanged: true });
    await versionsMod.snapshot(req.user, req.query.path, file);     // guarda lo que había antes
    await fsp.writeFile(file, contenido, 'utf8');
    registrarActividad(req, 'archivo_editado', { path: req.query.path });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Documentos de Office, convertidos a PDF con LibreOffice ---
function convertirOffice(file, salidaDir, formato = 'pdf') {
  return new Promise((resolve, reject) => {
    // Perfil de usuario propio por conversión: sin esto, dos a la vez chocan
    const perfil = path.join(salidaDir, 'perfil');
    const args = [
      '--headless', '--norestore', '--invisible', '--nolockcheck', '--nodefault',
      `-env:UserInstallation=file:///${perfil.replace(/\\/g, '/')}`,
      '--convert-to', formato, '--outdir', salidaDir, file,
    ];
    const p = spawn(soffice, args, { stdio: 'ignore' });
    const temporizador = setTimeout(() => p.kill('SIGKILL'), OFFICE_TIMEOUT);
    p.on('error', err => { clearTimeout(temporizador); reject(err); });
    p.on('close', code => {
      clearTimeout(temporizador);
      code === 0 ? resolve() : reject(new Error('La conversión falló'));
    });
  });
}

app.get('/api/office', auth, async (req, res) => {
  let trabajo = null;
  try {
    const file = userPath(req, req.query.path);
    if (!OFFICE_RE.test(file)) return res.status(415).json({ error: 'Formato no convertible' });
    if (!soffice) return res.status(501).json({ error: 'Este servidor no tiene LibreOffice instalado' });

    const stat = await fsp.stat(file);
    const key = crypto.createHash('sha1')
      .update(`${file}|${stat.size}|${stat.mtimeMs}|office`).digest('hex');
    const cached = path.join(THUMBS_DIR, `${key}.pdf`);

    if (!await exists(cached)) {
      trabajo = path.join(THUMBS_DIR, `conv-${key}-${process.pid}`);
      await fsp.mkdir(trabajo, { recursive: true });
      await convertirOffice(file, trabajo);
      const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.pdf'));
      if (!generado) throw new Error('LibreOffice no generó ningún PDF');
      await fsp.rename(path.join(trabajo, generado), cached);
    }

    // Mismo motivo que en /api/preview: el visor necesita poder montar su <embed>
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(cached, { headers: { 'Content-Type': 'application/pdf' } });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (trabajo) fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
});

/* ---------------- Hojas de cálculo ----------------
   Se leen y se devuelven como datos, no como PDF: así el cliente puede pintar
   una rejilla de verdad, con sus columnas, sus filas y sus pestañas de hoja. */

// Convierte el valor de una celda a algo que se pueda enseñar tal cual
function celdaATexto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return v.getHours() || v.getMinutes()
      ? v.toLocaleString('es-ES')
      : v.toLocaleDateString('es-ES');
  }
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');   // texto con formatos
    if (v.text !== undefined) return String(v.text);               // hipervínculo
    if (v.result !== undefined) return String(v.result);           // fórmula ya calculada
    if (v.formula) return '';                                      // fórmula sin resultado guardado
    if (v.error) return String(v.error);
    return '';
  }
  return String(v);
}
const esNumero = (v) => typeof v === 'number' ||
  (v && typeof v === 'object' && typeof v.result === 'number');

app.get('/api/sheet', auth, async (req, res) => {
  let trabajo = null;
  try {
    const file = userPath(req, req.query.path);
    if (!SHEET_RE.test(file)) return res.status(415).json({ error: 'No es una hoja de cálculo' });

    let aLeer = file;
    // .xls y .ods no los abre exceljs: LibreOffice los pasa antes a xlsx
    if (!SHEET_NATIVE_RE.test(file)) {
      if (!soffice) return res.status(501).json({ error: 'Este formato necesita LibreOffice en el servidor' });
      const stat = await fsp.stat(file);
      const key = crypto.createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|sheet`).digest('hex');
      const cached = path.join(THUMBS_DIR, `${key}.xlsx`);
      if (!await exists(cached)) {
        trabajo = path.join(THUMBS_DIR, `sheet-${key}-${process.pid}`);
        await fsp.mkdir(trabajo, { recursive: true });
        await convertirOffice(file, trabajo, 'xlsx');
        const generado = (await fsp.readdir(trabajo)).find(f => f.toLowerCase().endsWith('.xlsx'));
        if (!generado) throw new Error('No se pudo leer la hoja');
        await fsp.rename(path.join(trabajo, generado), cached);
      }
      aLeer = cached;
    }

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(aLeer);
    } catch {
      // El mensaje de la librería habla de directorios centrales y de zips: no ayuda a nadie
      return res.status(422).json({ error: 'No se pudo leer la hoja. Puede que el archivo esté dañado.' });
    }

    let recortado = false;
    const hojas = wb.worksheets.map(ws => {
      const totalFilas = Math.min(ws.rowCount || 0, SHEET_MAX_ROWS);
      const totalCols = Math.min(ws.columnCount || 0, SHEET_MAX_COLS);
      if ((ws.rowCount || 0) > totalFilas || (ws.columnCount || 0) > totalCols) recortado = true;

      const filas = [];
      for (let r = 1; r <= totalFilas; r++) {
        const fila = ws.getRow(r);
        const celdas = [];
        for (let c = 1; c <= totalCols; c++) {
          const celda = fila.getCell(c);
          celdas.push({ t: celdaATexto(celda.value), n: esNumero(celda.value) || undefined });
        }
        // Se recorta la cola vacía de cada fila, que en Excel suele ser larga
        while (celdas.length && !celdas[celdas.length - 1].t) celdas.pop();
        filas.push(celdas);
      }
      while (filas.length && !filas[filas.length - 1].length) filas.pop();

      const anchos = [];
      for (let c = 1; c <= totalCols; c++) anchos.push(ws.getColumn(c).width || null);

      return { nombre: ws.name, filas, anchos, filasTotales: ws.rowCount || 0, colsTotales: ws.columnCount || 0 };
    });

    res.json({ hojas, recortado, maxFilas: SHEET_MAX_ROWS, maxCols: SHEET_MAX_COLS });
  } catch (err) {
    sendError(res, err);
  } finally {
    if (trabajo) fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
});

/* ---------------- EXIF de las fotos ----------------
   Dos usos: el panel de detalles de una foto, y las fechas de captura con las
   que se agrupan por meses. Lo segundo se cachea, porque leer el EXIF de una
   carpeta con miles de fotos en cada listado sería insufrible. */
const EXIF_CACHE = path.join(THUMBS_DIR, 'exif-cache.json');
let exifCache = null;
let exifCacheSucio = false;

function cargarExifCache() {
  if (exifCache) return exifCache;
  try { exifCache = JSON.parse(fs.readFileSync(EXIF_CACHE, 'utf8')); }
  catch { exifCache = {}; }
  return exifCache;
}
// Se guarda en diferido: un listado de 500 fotos no debe escribir 500 veces
setInterval(() => {
  if (!exifCacheSucio || !exifCache) return;
  exifCacheSucio = false;
  const tmp = `${EXIF_CACHE}.tmp`;
  fs.writeFile(tmp, JSON.stringify(exifCache), err => {
    if (!err) fs.rename(tmp, EXIF_CACHE, () => {});
  });
}, 5000).unref();

const claveExif = (file, stat) => crypto.createHash('sha1')
  .update(`${file}|${stat.size}|${stat.mtimeMs}`).digest('hex');

// Los grados vienen a veces como [g, m, s] y a veces ya en decimal
function aDecimal(valor, ref) {
  let d = valor;
  if (Array.isArray(valor)) d = valor[0] + (valor[1] || 0) / 60 + (valor[2] || 0) / 3600;
  if (typeof d !== 'number' || !isFinite(d)) return null;
  if (ref === 'S' || ref === 'W') d = -d;
  return Math.round(d * 1e6) / 1e6;
}

const EXIF_OPCIONES = {
    tiff: true, exif: true, gps: true, ifd0: true,
    pick: ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'CreateDate', 'ModifyDate',
           'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'FocalLengthIn35mmFormat',
           'Orientation', 'ExifImageWidth', 'ExifImageHeight', 'Flash', 'WhiteBalance',
           'Software', 'latitude', 'longitude', 'GPSLatitude', 'GPSLatitudeRef',
           'GPSLongitude', 'GPSLongitudeRef', 'GPSAltitude'],
};

// exifr no lee el EXIF de algunos HEIC/HEIF (devuelve solo { errors }). En ese caso se extrae el bloque
// con sharp (que sí entiende el contenedor) y se le pasa a exifr ya como TIFF.
async function exifDeHeic(file) {
  if (!sharp) return null;
  const exifr = require('exifr');
  const m = await sharp(file).metadata();
  if (!m.exif || m.exif.length < 12) return null;
  const buf = m.exif;
  const off = buf.readUInt32BE(0);                 // cabecera HEIF: desplazamiento hasta el TIFF
  let tiff = buf.subarray(4 + (off < buf.length - 4 ? off : 0));
  if (tiff.subarray(0, 4).toString('latin1') === 'Exif') tiff = tiff.subarray(6);
  const datos = await exifr.parse(tiff, EXIF_OPCIONES).catch(() => null);
  return datos && !datos.errors ? datos : null;
}

// Devuelve null si la foto no tiene EXIF y lanza si no se ha podido leer (para no darlo por vacío)
async function leerExif(file) {
  const exifr = require('exifr');
  let datos = await exifr.parse(file, EXIF_OPCIONES).catch(() => undefined);
  const vacio = !datos || datos.errors;
  if (vacio && HEIC_TYPES[path.extname(file).toLowerCase()]) {
    try { datos = await exifDeHeic(file) || datos; } catch { /* se queda con lo de exifr */ }
  }
  if (datos && datos.errors) {
    if (HEIC_TYPES[path.extname(file).toLowerCase()]) throw new Error('EXIF ilegible');   // se reintentará
    return null;
  }
  if (!datos) return null;

  const lat = datos.latitude !== undefined
    ? datos.latitude : aDecimal(datos.GPSLatitude, datos.GPSLatitudeRef);
  const lon = datos.longitude !== undefined
    ? datos.longitude : aDecimal(datos.GPSLongitude, datos.GPSLongitudeRef);
  // Algunas cámaras escriben 0,0 cuando no hay posición: no es una coordenada real
  const sinPos = lat === 0 && lon === 0;
  const fecha = datos.DateTimeOriginal || datos.CreateDate || datos.ModifyDate || null;

  return {
    tomada: fecha ? new Date(fecha).getTime() : null,
    camara: [datos.Make, datos.Model].filter(Boolean).join(' ').trim() || null,
    objetivo: datos.LensModel || null,
    exposicion: datos.ExposureTime || null,
    diafragma: datos.FNumber || null,
    iso: datos.ISO || null,
    focal: datos.FocalLength || null,
    focal35: datos.FocalLengthIn35mmFormat || null,
    ancho: datos.ExifImageWidth || null,
    alto: datos.ExifImageHeight || null,
    software: datos.Software || null,
    lat: !sinPos && typeof lat === 'number' && isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lon: !sinPos && typeof lon === 'number' && isFinite(lon) && Math.abs(lon) <= 180 ? lon : null,
    altitud: typeof datos.GPSAltitude === 'number' ? Math.round(datos.GPSAltitude) : null,
  };
}

// Versión cacheada y reducida: solo lo que hace falta para agrupar y para el mapa
async function exifResumido(file, stat) {
  const cache = cargarExifCache();
  const clave = claveExif(file, stat);
  // Las entradas anteriores a la versión 2 ("g") se vuelven a leer una vez: algunas se guardaron vacías por un fallo de lectura
  if (cache[clave] && 'c' in cache[clave] && cache[clave].g === 2) return cache[clave];
  let r = { t: null, lat: null, lon: null, c: null, g: 2 };
  try {
    const e = await leerExif(file);
    if (e) r = { t: e.tomada, lat: e.lat, lon: e.lon, c: e.camara ? e.camara.slice(0, 60) : null, g: 2 };
  } catch {
    return { t: null, lat: null, lon: null, c: null };   // fallo de lectura: no se guarda, se reintenta la próxima vez
  }
  cache[clave] = r;
  exifCacheSucio = true;
  return r;
}

// EXIF completo de una foto, para el panel de detalles
app.get('/api/exif', auth, async (req, res) => {
  try {
    const file = userPath(req, req.query.path);
    if (!IMAGE_TYPES[path.extname(file).toLowerCase()] && !HEIC_TYPES[path.extname(file).toLowerCase()]) {
      return res.status(415).json({ error: 'Solo las imágenes tienen EXIF' });
    }
    const stat = await fsp.stat(file);
    const datos = await leerExif(file);
    res.json({
      ...(datos || {}),
      nombre: path.basename(file),
      tamano: stat.size,
      modificada: stat.mtimeMs,
      hayExif: !!datos,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Fechas de captura y coordenadas de las fotos de una carpeta, para agrupar
app.get('/api/photometa', auth, async (req, res) => {
  try {
    const rel = req.query.path || '';
    const dir = userPath(req, rel);
    const entradas = (await fsp.readdir(dir, { withFileTypes: true }))
      .filter(e => !isHidden(e.name) && e.isFile() &&
        (IMAGE_TYPES[path.extname(e.name).toLowerCase()] || HEIC_TYPES[path.extname(e.name).toLowerCase()]));

    const salida = {};
    // De cuatro en cuatro: leer 500 EXIF a la vez satura el disco
    for (let i = 0; i < entradas.length; i += 4) {
      const grupo = entradas.slice(i, i + 4);
      await Promise.all(grupo.map(async e => {
        const full = path.join(dir, e.name);
        try {
          const stat = await fsp.stat(full);
          const r = await exifResumido(full, stat);
          salida[e.name] = { t: r.t || stat.mtimeMs, exif: !!r.t, lat: r.lat, lon: r.lon };
        } catch { /* archivo desaparecido */ }
      }));
    }
    res.json({ path: rel, fotos: salida });
  } catch (err) {
    sendError(res, err);
  }
});

// Todas las fotos con coordenadas, recorriendo el árbol entero
app.get('/api/photomap', auth, async (req, res) => {
  try {
    const raiz = userRoot(req.user);
    const fotos = [];
    let conFecha = 0, total = 0, cortado = false, conExif = 0;

    async function recorrer(dir, rel) {
      if (fotos.length >= MAP_LIMIT) { cortado = true; return; }
      let entradas;
      try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entradas) {
        if (fotos.length >= MAP_LIMIT) { cortado = true; return; }
        if (isHidden(e.name)) continue;
        const full = path.join(dir, e.name);
        const hijoRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { await recorrer(full, hijoRel); continue; }

        const ext = path.extname(e.name).toLowerCase();
        if (!IMAGE_TYPES[ext] && !HEIC_TYPES[ext]) continue;
        total++;
        try {
          const stat = await fsp.stat(full);
          const meta = await exifResumido(full, stat);
          if (meta.t || meta.c) conExif++;          // la foto conserva metadatos (aunque no tenga GPS)
          if (meta.lat === null || meta.lon === null) continue;
          if (meta.t) conFecha++;
          fotos.push({ rel: hijoRel, nombre: e.name, lat: meta.lat, lon: meta.lon,
                       t: meta.t || stat.mtimeMs, size: stat.size });
        } catch { /* archivo desaparecido */ }
      }
    }

    await recorrer(raiz, '');
    fotos.sort((a, b) => b.t - a.t);
    res.json({ fotos, total, conCoordenadas: fotos.length, conFecha, conExif, cortado, limite: MAP_LIMIT });
  } catch (err) {
    sendError(res, err);
  }
});

/* Índice de todas las fotos (fecha de captura, cámara y coordenadas): alimenta la línea de tiempo y
   los álbumes inteligentes. Se apoya en la misma caché de EXIF que el mapa, así que solo la primera
   vez es lenta. Se recorre de cuatro en cuatro por carpeta para no saturar el disco. */
const PHOTOS_INDEX_LIMIT = Number(process.env.PHOTOS_INDEX_LIMIT || 50000);
app.get('/api/photoindex', auth, async (req, res) => {
  try {
    const raiz = userRoot(req.user);
    const fotos = [];
    let cortado = false;

    async function recorrer(dir, rel) {
      if (cortado) return;
      let entradas;
      try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      const archivos = [];
      for (const e of entradas) {
        if (isHidden(e.name)) continue;
        if (e.isDirectory()) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (IMAGE_TYPES[ext] || HEIC_TYPES[ext]) archivos.push(e.name);
      }
      for (let i = 0; i < archivos.length; i += 4) {
        if (fotos.length >= PHOTOS_INDEX_LIMIT) { cortado = true; return; }
        await Promise.all(archivos.slice(i, i + 4).map(async nombre => {
          const full = path.join(dir, nombre);
          try {
            const stat = await fsp.stat(full);
            const m = await exifResumido(full, stat);
            fotos.push({ rel: rel ? `${rel}/${nombre}` : nombre, name: nombre, t: m.t || stat.mtimeMs, exif: !!m.t,
                         lat: m.lat, lon: m.lon, c: m.c || null, size: stat.size });
          } catch { /* archivo desaparecido */ }
        }));
      }
      for (const e of entradas) {
        if (cortado) return;
        if (isHidden(e.name) || !e.isDirectory()) continue;
        await recorrer(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      }
    }

    await recorrer(raiz, '');
    fotos.sort((a, b) => b.t - a.t);
    res.json({ fotos, total: fotos.length, cortado, limite: PHOTOS_INDEX_LIMIT });
  } catch (err) {
    sendError(res, err);
  }
});

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

// --- Papelera ---
app.get('/api/trash', auth, async (req, res) => {
  try {
    const entries = await purgeExpired(req.user);
    res.json({ items: entries, ttlDays: await papeleraDias(req.user) });
  } catch (err) {
    sendError(res, err);
  }
});

// Cuántos días se conserva lo borrado antes de vaciarse solo (papelera de archivos, notas y prompts)
app.get('/api/trash/settings', auth, async (req, res) => {
  try { res.json({ days: await papeleraDias(req.user), options: PAPELERA_OPCIONES, sweepHours: TRASH_SWEEP_HOURS }); }
  catch (err) { sendError(res, err); }
});
app.put('/api/trash/settings', auth, async (req, res) => {
  try {
    const days = Number(req.body && req.body.days);
    if (!PAPELERA_OPCIONES.includes(days)) return res.status(400).json({ error: 'Valor no válido' });
    await updateJson(prefsFile(req.user), {}, (p) => { p.trashDays = days; });
    registrarActividad(req, 'papelera_ajuste', { days });
    // Se aplica ya, sin esperar al siguiente barrido
    await barridoUsuario(req.user);
    res.json({ ok: true, days });
  } catch (err) { sendError(res, err); }
});

app.post('/api/trash/restore', auth, async (req, res) => {
  try {
    const { id } = req.body || {};
    const entries = await readTrash(req.user);
    const entry = entries.find(e => e.id === id);
    if (!entry) return res.status(404).json({ error: 'No está en la papelera' });

    const destDir = resolveFor(req.user, entry.from);
    await fsp.mkdir(destDir, { recursive: true });
    const target = await freeName(destDir, entry.name);
    await fsp.rename(path.join(trashRoot(req.user), entry.id), target);
    await writeTrash(req.user, entries.filter(e => e.id !== id));
    registrarActividad(req, 'restaurado_papelera', { name: entry.name });
    res.json({ ok: true, restoredAs: path.basename(target) });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/trash/:id', auth, async (req, res) => {
  try {
    const entries = await readTrash(req.user);
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'No está en la papelera' });
    await fsp.rm(path.join(trashRoot(req.user), entry.id), { recursive: true, force: true });
    await writeTrash(req.user, entries.filter(e => e.id !== entry.id));
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/trash', auth, async (req, res) => {
  try {
    const entries = await readTrash(req.user);
    for (const e of entries) {
      await fsp.rm(path.join(trashRoot(req.user), e.id), { recursive: true, force: true });
    }
    await writeTrash(req.user, []);
    res.json({ ok: true, removed: entries.length });
  } catch (err) {
    sendError(res, err);
  }
});

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

/* ---------------- Favoritos ----------------
   Solo una lista de rutas por usuario: marcar y quitar tiene que ser instantáneo,
   así que no hace falta nada más elaborado que un JSON pequeño. */
const favFile = (user) => path.join(userRoot(user), '.favorites.json');
async function readFavs(user) {
  try { return JSON.parse(await fsp.readFile(favFile(user), 'utf8')); } catch { return []; }
}
async function writeFavs(user, list) {
  const file = favFile(user);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list));
  await fsp.rename(tmp, file);
}
app.get('/api/favorites', auth, async (req, res) => {
  try {
    const favs = await readFavs(req.user);
    const vivos = [];
    for (const rel of favs) {
      try { await fsp.access(resolveFor(req.user, rel)); vivos.push(rel); } catch { /* ya no existe: se depura */ }
    }
    if (vivos.length !== favs.length) await writeFavs(req.user, vivos);
    res.json({ items: vivos });
  } catch (err) { sendError(res, err); }
});
app.post('/api/favorites', auth, async (req, res) => {
  try {
    const rel = String(req.body?.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    resolveFor(req.user, rel);       // valida que es suya y que existe
    const favs = await readFavs(req.user);
    if (!favs.includes(rel)) favs.unshift(rel);
    await writeFavs(req.user, favs);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});
app.delete('/api/favorites', auth, async (req, res) => {
  try {
    const rel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const favs = await readFavs(req.user);
    await writeFavs(req.user, favs.filter(f => f !== rel));
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Álbumes ----------------
   Colecciones con nombre que apuntan a fotos por ruta, sin moverlas: la misma
   foto puede estar en varios álbumes y seguir viviendo en una sola carpeta. */
function albumsFile(user) {
  const dir = path.join(userRoot(user), ALBUMS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'index.json');
}
async function readAlbums(user) {
  try { return JSON.parse(await fsp.readFile(albumsFile(user), 'utf8')); } catch { return []; }
}
async function writeAlbums(user, list) {
  const file = albumsFile(user);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
  await fsp.rename(tmp, file);
}
const nombreSeguro = (n) => String(n || 'album').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80) || 'album';
/* Archivos de un álbum (las carpetas y lo que ya no existe se saltan). Dos fotos con el mismo nombre
   en carpetas distintas se distinguen con un sufijo, para el ZIP y para la galería pública. */
async function albumArchivos(user, album) {
  const salida = [];
  const usados = new Set();
  for (const rel of album.items) {
    try {
      const abs = resolveFor(user, rel);
      const stat = await fsp.stat(abs);
      if (stat.isDirectory()) continue;
      const ext = path.extname(abs);
      const base = path.basename(abs, ext);
      let name = path.basename(abs), n = 2;
      while (usados.has(name.toLowerCase())) name = `${base} (${n++})${ext}`;
      usados.add(name.toLowerCase());
      salida.push({ rel, abs, name, size: stat.size, modified: stat.mtime });
    } catch { /* ya no se puede alcanzar */ }
  }
  return salida;
}
app.get('/api/albums/:id/zip', auth, async (req, res) => {
  try {
    const album = (await readAlbums(req.user)).find(a => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'No encontrado' });
    const archivos = await albumArchivos(req.user, album);
    if (!archivos.length) return res.status(400).json({ error: 'El álbum no tiene archivos' });
    await enviarZip(res, archivos.map(a => ({ abs: a.abs, name: a.name, isDir: false })), `${nombreSeguro(album.title)}.zip`);
  } catch (err) {
    if (!res.headersSent) sendError(res, err);
  }
});
app.get('/api/albums', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    res.json({ items: albums.map(a => ({ id: a.id, title: a.title, createdAt: a.createdAt, count: a.items.length })) });
  } catch (err) { sendError(res, err); }
});
app.post('/api/albums', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    if (albums.length >= ALBUM_LIMIT) return res.status(400).json({ error: `Máximo ${ALBUM_LIMIT} álbumes` });
    const album = {
      id: crypto.randomBytes(8).toString('hex'),
      title: String(req.body?.title || '').slice(0, 80) || 'Álbum sin título',
      createdAt: Date.now(),
      items: [].concat(req.body?.paths || []).map(r => String(r).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')),
    };
    for (const r of album.items) resolveFor(req.user, r);   // valida cada ruta antes de guardar
    albums.unshift(album);
    await writeAlbums(req.user, albums);
    res.json({ ok: true, album: { id: album.id, title: album.title, createdAt: album.createdAt, count: album.items.length } });
  } catch (err) { sendError(res, err); }
});
app.get('/api/albums/:id', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    const album = albums.find(a => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'No encontrado' });
    const items = [];
    for (const rel of album.items) {
      try {
        const abs = resolveFor(req.user, rel);
        const stat = await fsp.stat(abs);
        items.push({ name: path.basename(abs), rel, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtime });
      } catch { /* se dejó de poder alcanzar: se ignora, no se borra del álbum por si vuelve */ }
    }
    res.json({ id: album.id, title: album.title, items });
  } catch (err) { sendError(res, err); }
});
app.put('/api/albums/:id', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    const album = albums.find(a => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'No encontrado' });
    if (req.body?.title !== undefined) album.title = String(req.body.title).slice(0, 80) || album.title;
    await writeAlbums(req.user, albums);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});
app.delete('/api/albums/:id', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    await writeAlbums(req.user, albums.filter(a => a.id !== req.params.id));
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});
app.post('/api/albums/:id/items', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    const album = albums.find(a => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'No encontrado' });
    const rutas = [].concat(req.body?.paths || []).map(r => String(r).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    for (const r of rutas) {
      resolveFor(req.user, r);
      if (!album.items.includes(r)) album.items.push(r);
    }
    album.items = album.items.slice(0, ALBUM_ITEMS_LIMIT);
    await writeAlbums(req.user, albums);
    res.json({ ok: true, count: album.items.length });
  } catch (err) { sendError(res, err); }
});
app.delete('/api/albums/:id/items', auth, async (req, res) => {
  try {
    const albums = await readAlbums(req.user);
    const album = albums.find(a => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'No encontrado' });
    const rel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    album.items = album.items.filter(i => i !== rel);
    await writeAlbums(req.user, albums);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Buscador de duplicados ----------------
   Primero se agrupa por tamaño (gratis, ya se recorre el árbol) y solo se
   calcula el hash de los que comparten tamaño con otro: es lo que hace viable
   pasarlo por una nube con miles de archivos sin tardar minutos. */
app.get('/api/duplicates', auth, async (req, res) => {
  try {
    const raiz = userRoot(req.user);
    const porTamano = new Map();
    let escaneados = 0, cortado = false;

    async function recorrer(dir, rel) {
      if (cortado) return;
      let entradas;
      try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entradas) {
        if (cortado) return;
        if (isHidden(e.name)) continue;
        const full = path.join(dir, e.name);
        const hijoRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { await recorrer(full, hijoRel); continue; }
        if (++escaneados > DUP_LIMIT) { cortado = true; return; }
        try {
          const stat = await fsp.stat(full);
          if (!stat.size) continue;
          if (!porTamano.has(stat.size)) porTamano.set(stat.size, []);
          porTamano.get(stat.size).push({ abs: full, rel: hijoRel, size: stat.size, modified: stat.mtime });
        } catch { /* desaparecido a mitad del recorrido */ }
      }
    }
    await recorrer(raiz, '');

    const candidatos = [...porTamano.values()].filter(g => g.length > 1).flat();
    const porHash = new Map();
    for (const f of candidatos) {
      try {
        const hash = await new Promise((resolve, reject) => {
          const h = crypto.createHash('sha1');
          fs.createReadStream(f.abs).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
        });
        if (!porHash.has(hash)) porHash.set(hash, []);
        porHash.get(hash).push({ rel: f.rel, name: path.basename(f.abs), size: f.size, modified: f.modified });
      } catch { /* archivo ilegible: se ignora en vez de tumbar todo el escaneo */ }
    }
    const grupos = [...porHash.values()].filter(g => g.length > 1)
      .sort((a, b) => (b[0].size * b.length) - (a[0].size * a.length));
    const espacioRecuperable = grupos.reduce((n, g) => n + g[0].size * (g.length - 1), 0);
    res.json({ grupos, espacioRecuperable, escaneados, cortado });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Analizador de espacio por carpeta ----------------
   Reparto de tamaños de lo que hay DENTRO de una carpeta (un nivel), con el
   tamaño de cada subcarpeta ya sumado recursivamente: sirve para encontrar
   qué está llenando el disco sin tener que adivinarlo por tipo de archivo.
   Dos cuidados que la primera versión no tenía y que en un almacén grande
   sí se notan: un tope de archivos examinados (si no, una carpeta enorme
   podía agotar los descriptores de archivo o tardar minutos) y concurrencia
   limitada al sumar las subcarpetas del nivel, en vez de lanzarlas todas
   a la vez con Promise.all. */
const DU_LIMIT = Number(process.env.DU_LIMIT || 200000);

async function tamanoDir(p, contador) {
  let total = 0, entradas;
  if (contador.cortado) return 0;
  try { entradas = await fsp.readdir(p, { withFileTypes: true }); } catch { return 0; }
  for (const e of entradas) {
    if (isHidden(e.name)) continue;
    if (++contador.n > DU_LIMIT) { contador.cortado = true; return total; }
    const full = path.join(p, e.name);
    try { total += e.isDirectory() ? await tamanoDir(full, contador) : (await fsp.stat(full)).size; }
    catch { /* desaparecido a mitad del recorrido */ }
  }
  return total;
}
app.get('/api/diskusage', auth, async (req, res) => {
  try {
    const rel = req.query.path || '';
    const dir = userPath(req, rel);
    const entradas = (await fsp.readdir(dir, { withFileTypes: true })).filter(e => !isHidden(e.name));
    const contador = { n: 0, cortado: false };
    const items = [];
    // De cuatro en cuatro: sumar todas las subcarpetas del nivel a la vez agota
    // los descriptores de archivo en un almacén con muchas carpetas grandes.
    for (let i = 0; i < entradas.length; i += 4) {
      const grupo = entradas.slice(i, i + 4);
      const parciales = await Promise.all(grupo.map(async e => {
        const full = path.join(dir, e.name);
        try {
          const stat = await fsp.stat(full);
          const size = stat.isDirectory() ? await tamanoDir(full, contador) : stat.size;
          return { name: e.name, isDir: stat.isDirectory(), size };
        } catch { return null; }
      }));
      items.push(...parciales.filter(Boolean));
    }
    // En la raíz también salen los datos de la app (no son carpetas navegables)
    if (!rel) for (const d of await datosApp(req.user)) if (d.bytes) items.push({ name: d.nombre, isDir: false, app: true, size: d.bytes });
    items.sort((a, b) => b.size - a.size);
    res.json({
      path: rel, items, total: items.reduce((n, i) => n + i.size, 0),
      cortado: contador.cortado,
    });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Bloc de notas ----------------
   Índice con la estructura (lista plana con punteros al padre, que admite
   cualquier anidamiento) y el cuerpo de cada nota en su propio .md, para que
   una nota larga no engorde el índice y siga siendo texto recuperable a mano. */
function notesRoot(user) {
  const dir = path.join(userRoot(user), NOTES_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
async function readNotes(user) {
  try { return JSON.parse(await fsp.readFile(path.join(notesRoot(user), 'index.json'), 'utf8')); }
  catch { return { items: [] }; }
}
async function writeNotes(user, data) {
  const file = path.join(notesRoot(user), 'index.json');
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}
const notaFile = (user, id) => path.join(notesRoot(user), `${id}.md`);
function descendientes(items, id) {
  const hijos = items.filter(i => i.parent === id);
  return hijos.reduce((acc, h) => acc.concat(h, descendientes(items, h.id)), []);
}
function padreValido(items, parent) {
  if (!parent) return true;                       // raíz
  const p = items.find(i => i.id === parent);
  return !!p && p.type === 'folder';
}

// Campos de presentación que comparten notas y carpetas: color, icono, etiquetas, fijada…
const HEX6 = /^#[0-9a-f]{6}$/i;
function aplicaDecoracion(item, b) {
  if (b.color !== undefined) item.color = HEX6.test(String(b.color)) ? String(b.color).toLowerCase() : '';
  if (b.icon !== undefined) item.icon = String(b.icon).slice(0, 8);
  if (b.pinned !== undefined) item.pinned = !!b.pinned;
  if (b.labels !== undefined) {
    item.labels = [...new Set((Array.isArray(b.labels) ? b.labels : []).map(x => String(x).slice(0, 40)))].slice(0, 30);
  }
}

app.get('/api/notes', auth, async (req, res) => {
  try { res.json(await readNotes(req.user)); }
  catch (err) { sendError(res, err); }
});

app.get('/api/notes/:id', auth, async (req, res) => {
  try {
    const data = await readNotes(req.user);
    const item = data.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrada' });
    let body = '';
    if (item.type === 'note') {
      try { body = await fsp.readFile(notaFile(req.user, item.id), 'utf8'); } catch {}
    }
    res.json({ ...item, body });
  } catch (err) { sendError(res, err); }
});

app.post('/api/notes', auth, async (req, res) => {
  try {
    const { type, title, parent } = req.body || {};
    if (type !== 'note' && type !== 'folder') return res.status(400).json({ error: 'Tipo no válido' });
    const data = await readNotes(req.user);
    if (!padreValido(data.items, parent || '')) return res.status(400).json({ error: 'Carpeta padre no válida' });
    if (data.items.length >= NOTES_LIMIT) return res.status(400).json({ error: `Máximo ${NOTES_LIMIT} elementos` });

    const item = {
      id: crypto.randomBytes(8).toString('hex'),
      type,
      title: String(title || '').slice(0, 120) || (type === 'folder' ? 'Nueva carpeta' : 'Nota sin título'),
      parent: parent || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    aplicaDecoracion(item, req.body);
    if (type === 'note') item.links = notesExtra.extraeLinks(req.body.body);
    if (req.body.calendar && req.body.calendar.date) item.cal = { date: req.body.calendar.date, time: req.body.calendar.time || '' };
    data.items.push(item);
    if (type === 'note') await fsp.writeFile(notaFile(req.user, item.id), String(req.body.body || '').slice(0, NOTE_MAX_CHARS));
    if (item.cal) await calendarMod.core.sincronizaOrigen(req.user, 'note', item.id, item.title, req.body.calendar);
    await writeNotes(req.user, data);
    res.json({ ok: true, item });
  } catch (err) { sendError(res, err); }
});

// Cuerpo grande solo aquí: el resto de la API sigue con el tope de 100 kB
const notesBody = express.json({ limit: '2mb' });

async function actualizarNota(req, res) {
  try {
    const { title, body, parent } = req.body || {};
    const data = await readNotes(req.user);
    const item = data.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrada' });

    if (parent !== undefined) {
      if (!padreValido(data.items, parent)) return res.status(400).json({ error: 'Carpeta padre no válida' });
      // Mover una carpeta dentro de sí misma o de un hijo suyo dejaría el árbol suelto
      if (parent === item.id || descendientes(data.items, item.id).some(d => d.id === parent)) {
        return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma' });
      }
      item.parent = parent;
    }
    if (title !== undefined) item.title = String(title).slice(0, 120);
    if (body !== undefined && item.type === 'note') {
      if (String(body).length > NOTE_MAX_CHARS) return res.status(400).json({ error: 'Nota demasiado larga' });
      await fsp.writeFile(notaFile(req.user, item.id), String(body));
      item.chars = String(body).length;
      item.links = notesExtra.extraeLinks(body);
    }
    aplicaDecoracion(item, req.body || {});
    const cal = (req.body || {}).calendar;
    if (cal !== undefined) item.cal = cal && cal.date ? { date: cal.date, time: cal.time || '' } : undefined;
    item.updatedAt = Date.now();
    await writeNotes(req.user, data);
    if (cal !== undefined) await calendarMod.core.sincronizaOrigen(req.user, 'note', item.id, item.title, cal);
    else if (title !== undefined && item.cal) await calendarMod.core.renombraOrigen(req.user, 'note', item.id, item.title);
    if (title !== undefined) await calendarMod.core.renombraVinculos(req.user, 'note', item.id, item.title).catch(() => {});
    res.json({ ok: true, item });
  } catch (err) { sendError(res, err); }
}

app.put('/api/notes/:id', auth, notesBody, actualizarNota);
// Alias en POST: sendBeacon (el guardado al cerrar la pestaña) solo sabe hacer POST
app.post('/api/notes/:id', auth, notesBody, actualizarNota);

// Los .md de las notas eliminadas se guardan aparte hasta que caduquen
const notaTrashFile = (user, id) => path.join(notesRoot(user), 'trash', `${id}.md`);

// Borra (a la papelera) varias notas o carpetas de golpe: { ids: [...] }
app.post('/api/notes-bulk-delete', auth, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 5000) return res.status(400).json({ error: 'Selección no válida' });
    const data = await readNotes(req.user);
    const pedidas = new Set(ids.map(String));
    const raices = data.items.filter(i => pedidas.has(i.id));
    if (!raices.length) return res.status(404).json({ error: 'No encontradas' });
    await fsp.mkdir(path.join(notesRoot(req.user), 'trash'), { recursive: true });
    const cuando = Date.now();
    data.trash = data.trash || [];
    const quitados = new Set();
    for (const raiz of raices) {
      if (quitados.has(raiz.id)) continue;       // ya salió con una carpeta padre
      for (const f of [raiz, ...descendientes(data.items, raiz.id)]) {
        if (quitados.has(f.id)) continue;
        quitados.add(f.id);
        if (f.type === 'note') {
          try { await fsp.rename(notaFile(req.user, f.id), notaTrashFile(req.user, f.id)); } catch {}
        }
        data.trash.unshift({ ...f, deletedAt: cuando, grupo: raiz.id });
        if (f.cal) await calendarMod.core.quitaOrigen(req.user, 'note', f.id);
      }
    }
    data.items = data.items.filter(i => !quitados.has(i.id));
    await writeNotes(req.user, data);
    res.json({ ok: true, borrados: quitados.size });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  try {
    const data = await readNotes(req.user);
    const item = data.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrada' });

    const fuera = [item, ...descendientes(data.items, item.id)];
    await fsp.mkdir(path.join(notesRoot(req.user), 'trash'), { recursive: true });
    const cuando = Date.now();
    data.trash = data.trash || [];
    for (const f of fuera) {
      if (f.type === 'note') {
        try { await fsp.rename(notaFile(req.user, f.id), notaTrashFile(req.user, f.id)); } catch {}
      }
      // Se guarda el grupo entero para poder restaurar la rama completa de una vez
      data.trash.unshift({ ...f, deletedAt: cuando, grupo: item.id });
      if (f.cal) await calendarMod.core.quitaOrigen(req.user, 'note', f.id);
    }
    const ids = new Set(fuera.map(f => f.id));
    data.items = data.items.filter(i => !ids.has(i.id));
    await writeNotes(req.user, data);
    res.json({ ok: true, borrados: fuera.length });
  } catch (err) { sendError(res, err); }
});

async function purgarNotasCaducadas(user) {
  const data = await readNotes(user);
  const dias = await papeleraDias(user);
  if (!dias) return data;
  const corte = Date.now() - dias * 86400000;
  const caducadas = (data.trash || []).filter(t => t.deletedAt < corte);
  if (!caducadas.length) return data;
  for (const t of caducadas) {
    if (t.type === 'note') { await fsp.rm(notaTrashFile(user, t.id), { force: true }); await calendarMod.core.quitaVinculos(user, 'note', t.id).catch(() => {}); }
  }
  data.trash = (data.trash || []).filter(t => t.deletedAt >= corte);
  await writeNotes(user, data);
  return data;
}

app.get('/api/notes-trash', auth, async (req, res) => {
  try {
    const data = await purgarNotasCaducadas(req.user);
    res.json({ items: data.trash || [], ttlDays: await papeleraDias(req.user) });
  } catch (err) { sendError(res, err); }
});

app.post('/api/notes-trash/restore', auth, async (req, res) => {
  try {
    const { id } = req.body || {};
    const data = await readNotes(req.user);
    const entrada = (data.trash || []).find(t => t.id === id);
    if (!entrada) return res.status(404).json({ error: 'No está en la papelera' });

    // Se restaura el grupo entero: una carpeta sin sus hijos no sirve de nada
    const grupo = (data.trash || []).filter(t => t.grupo === entrada.grupo);
    const idsVivos = new Set(data.items.map(i => i.id));
    for (const t of grupo) {
      if (t.type === 'note') {
        try { await fsp.rename(notaTrashFile(req.user, t.id), notaFile(req.user, t.id)); } catch {}
      }
      const { deletedAt, grupo: g, ...limpio } = t;
      // Si su carpeta padre ya no existe, vuelve a la raíz en vez de quedar huérfana
      if (limpio.parent && !idsVivos.has(limpio.parent) && !grupo.some(x => x.id === limpio.parent)) {
        limpio.parent = '';
      }
      data.items.push(limpio);
      idsVivos.add(limpio.id);
      if (limpio.cal) await calendarMod.core.sincronizaOrigen(req.user, 'note', limpio.id, limpio.title, limpio.cal);
    }
    const ids = new Set(grupo.map(t => t.id));
    data.trash = (data.trash || []).filter(t => !ids.has(t.id));
    await writeNotes(req.user, data);
    res.json({ ok: true, restaurados: grupo.length });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/notes-trash/:id', auth, async (req, res) => {
  try {
    const data = await readNotes(req.user);
    const entrada = (data.trash || []).find(t => t.id === req.params.id);
    if (!entrada) return res.status(404).json({ error: 'No está en la papelera' });
    const grupo = (data.trash || []).filter(t => t.grupo === entrada.grupo);
    for (const t of grupo) {
      if (t.type === 'note') { await fsp.rm(notaTrashFile(req.user, t.id), { force: true }); await calendarMod.core.quitaVinculos(req.user, 'note', t.id).catch(() => {}); }
    }
    const ids = new Set(grupo.map(t => t.id));
    data.trash = (data.trash || []).filter(t => !ids.has(t.id));
    await writeNotes(req.user, data);
    res.json({ ok: true, borrados: grupo.length });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/notes-trash', auth, async (req, res) => {
  try {
    const data = await readNotes(req.user);
    for (const t of data.trash || []) {
      if (t.type === 'note') { await fsp.rm(notaTrashFile(req.user, t.id), { force: true }); await calendarMod.core.quitaVinculos(req.user, 'note', t.id).catch(() => {}); }
    }
    const n = (data.trash || []).length;
    data.trash = [];
    await writeNotes(req.user, data);
    res.json({ ok: true, removed: n });
  } catch (err) { sendError(res, err); }
});

// --- Estadísticas de almacenamiento ---
/* Datos de la propia app que viven en carpetas ocultas de cada usuario (papelera, notas, prompts,
   contactos y sus fotos, versiones, caja fuerte, calendario y etiquetas). El recorrido de archivos
   de arriba las salta a propósito, pero ocupan disco y deben contar en el total. */
const DATOS_APP = [
  { id: 'trash',    nombre: 'Papelera' },
  { id: 'notes',    nombre: 'Notas' },
  { id: 'prompts',  nombre: 'Prompts' },
  { id: 'contacts', nombre: 'Contactos' },
  { id: 'versions', nombre: 'Versiones' },
  { id: 'clip',     nombre: 'Portapapeles' },
  { id: 'vault',    nombre: 'Caja fuerte' },
  { id: 'datos',    nombre: 'Calendario y ajustes' },
];
async function tamanoTodo(p) {
  let bytes = 0, count = 0, st;
  try { st = await fsp.lstat(p); } catch { return { bytes, count }; }
  if (!st.isDirectory()) return { bytes: st.size, count: 1 };
  let entradas;
  try { entradas = await fsp.readdir(p, { withFileTypes: true }); } catch { return { bytes, count }; }
  for (const e of entradas) {
    const r = await tamanoTodo(path.join(p, e.name));
    bytes += r.bytes; count += r.count;
  }
  return { bytes, count };
}
async function datosApp(user) {
  const raiz = userRoot(user);
  const acum = Object.fromEntries(DATOS_APP.map(d => [d.id, { bytes: 0, count: 0 }]));
  const suma = async (id, ruta) => { const r = await tamanoTodo(ruta); acum[id].bytes += r.bytes; acum[id].count += r.count; };
  let ocultos = [];
  try { ocultos = (await fsp.readdir(raiz, { withFileTypes: true })).filter(e => isHidden(e.name)); } catch { /* sin carpeta */ }
  for (const e of ocultos) {
    const ruta = path.join(raiz, e.name);
    if (e.name === TRASH_DIR) await suma('trash', ruta);
    else if (e.name === NOTES_DIR) await suma('notes', ruta);
    else if (e.name === '.vault') await suma('vault', ruta);
    else if (e.name === '.kcc' && e.isDirectory()) {
      for (const h of await fsp.readdir(ruta, { withFileTypes: true }).catch(() => [])) {
        const hp = path.join(ruta, h.name);
        if (h.name === 'prompts') await suma('prompts', hp);
        else if (h.name === 'contacts.json' || h.name === 'contact-photos') await suma('contacts', hp);
        else if (h.name === 'versions') await suma('versions', hp);
        else if (h.name === 'clip') await suma('clip', hp);
        else await suma('datos', hp);
      }
    } else await suma('datos', ruta);
  }
  return DATOS_APP.map(d => ({ ...d, ...acum[d.id] }));
}

app.get('/api/stats', auth, async (req, res) => {
  try {
    // Recorrido asíncrono: con readdirSync el panel de admin bloqueaba el proceso entero
    const byType = { image: { bytes: 0, count: 0 }, video: { bytes: 0, count: 0 },
                     audio: { bytes: 0, count: 0 }, doc: { bytes: 0, count: 0 },
                     other: { bytes: 0, count: 0 } };
    async function walk(dir) {
      let total = 0, count = 0;
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (isHidden(e.name)) continue; // la papelera se contabiliza aparte
        const full = path.join(dir, e.name);
        try {
          if (e.isDirectory()) {
            const r = await walk(full);
            total += r.total; count += r.count;
          } else {
            const size = (await fsp.stat(full)).size;
            total += size; count++;
            const t = byType[typeOf(e.name)];
            t.bytes += size; t.count++;
          }
        } catch { /* archivo desaparecido a mitad del recorrido */ }
      }
      return { total, count };
    }
    const { total, count } = await walk(userRoot(req.user));
    const app = await datosApp(req.user);
    const appBytes = app.reduce((n, d) => n + d.bytes, 0);
    // totalBytes incluye ahora TODO lo que el usuario guarda; filesBytes son solo sus archivos
    const payload = { totalBytes: total + appBytes, filesBytes: total, appBytes, fileCount: count, byType, app };
    try {
      if (fsp.statfs) {
        const disk = await fsp.statfs(DATA_ROOT);
        payload.diskTotal = disk.blocks * disk.bsize;
        payload.diskFree = disk.bavail * disk.bsize;
      }
    } catch { /* statfs no disponible en este Node */ }
    res.json(payload);
  } catch (err) {
    sendError(res, err);
  }
});

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
const notesExtra = createNotesExtra({ express, auth, userRoot, sendError, readNotes, writeNotes, notaFile, descendientes, resolveFor, ZipArchive });
app.use('/api', notesExtra.router);
app.use('/api', versionsMod.router);
app.use('/api', vaultMod.router);
app.use('/api', sharesMod.router);
app.use('/api', passkeysMod.router);

app.use('/api/labels', auth, labelsMod.router);
app.use('/api/calendar', auth, calendarMod.router);
app.use('/api/prompts', auth, promptsMod.router);
app.use('/api/clip', auth, clipMod.router);
app.use('/api/game', auth, gameMod.router);
app.use('/api/contacts', auth, contactsMod.router);
app.use('/api/shopping', auth, shoppingMod);
calendarMod.core.registraOrigen('prompt', (user, id, ev) => promptsMod.core.setCal(user, id, ev));
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
  if (status && status < 500) return res.status(status).json({ error: err.expose ? err.message : 'Petición no válida' });
  console.error('Error no controlado en', req.method, req.originalUrl, '-', err && err.stack || err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
// Un fallo suelto en una promesa no debe tumbar el servidor entero
process.on('unhandledRejection', (e) => console.error('Promesa rechazada sin capturar:', e && e.stack || e));

root.use(BASE_PATH || '/', app);

root.listen(PORT, () => console.log(
  `KookyeCatCloud escuchando en puerto ${PORT}${BASE_PATH ? `, bajo ${BASE_PATH}/` : ''}, datos en ${DATA_ROOT}`));
