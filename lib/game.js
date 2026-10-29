'use strict';
/* Gamificación: XP, niveles y rangos, racha diaria, logros por cantidad de elementos y por uso, retos semanales,
   cosméticos y estadísticas del Tetris. Todo es personal y vive en <usuario>/.kcc/game.json.
   El servidor es quien calcula y concede los puntos, así que la pestaña solo pinta lo que devuelve. */
const path = require('path');
const { kccDir, updateJson, readJson, HttpError, cleanStr } = require('./store');

/* ---------- Niveles y rangos ---------- */
const MAX_NIVEL = 100;
const xpAcumulada = (nivel) => (nivel <= 1 ? 0 : Math.round(40 * Math.pow(nivel - 1, 1.8)));
function nivelDe(xp) {
  let n = 1;
  while (n < MAX_NIVEL && xp >= xpAcumulada(n + 1)) n++;
  return n;
}
const RANGOS = [
  [1, 'Novato', 'quill', '#94a3b8'], [5, 'Aprendiz', 'lantern', '#22c55e'], [10, 'Explorador', 'compass', '#06b6d4'],
  [15, 'Organizador', 'abacus', '#3b82f6'], [20, 'Archivista', 'books', '#6366f1'], [30, 'Curador', 'archive', '#8b5cf6'],
  [40, 'Maestro', 'anvil', '#d946ef'], [50, 'Sabio', 'owl', '#f59e0b'], [65, 'Gran maestro', 'crystal', '#f97316'],
  [80, 'Leyenda', 'dragon', '#ef4444'], [100, 'Mítico', 'crown', '#facc15'],
];
const rangoDe = (nivel) => { let r = RANGOS[0]; for (const x of RANGOS) if (nivel >= x[0]) r = x; return { desde: r[0], nombre: r[1], icono: r[2], color: r[3] }; };

/* ---------- Logros ---------- */
const TIERS = ['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante'];
const XP_TIER = [50, 150, 400, 1000, 2500];
// [id, grupo, icono, nombre, métrica, umbrales, plantilla de la descripción ({n} = umbral)]
const FAMILIAS = [
  ['archivos', 'Contenido', 'files', 'Coleccionista de archivos', 'archivos', [10, 100, 500, 2000, 10000], 'Ten {n} archivos en tu nube'],
  ['fotos', 'Contenido', 'photos', 'Ojo de fotógrafo', 'fotos', [10, 100, 500, 2000, 10000], 'Guarda {n} fotos'],
  ['notas', 'Contenido', 'notes', 'Cuaderno lleno', 'notas', [5, 25, 100, 400, 1500], 'Escribe {n} notas'],
  ['prompts', 'Contenido', 'prompts', 'Biblioteca de prompts', 'prompts', [5, 25, 100, 500, 2500], 'Guarda {n} prompts'],
  ['contactos', 'Contenido', 'contacts', 'Agenda con vida', 'contactos', [5, 25, 100, 400, 1500], 'Guarda {n} contactos'],
  ['eventos', 'Contenido', 'calendar', 'Siempre a tiempo', 'eventos', [5, 25, 100, 400, 1500], 'Crea {n} eventos en el calendario'],
  ['etiquetas', 'Contenido', 'labels', 'Orden y etiquetas', 'etiquetas', [3, 10, 25, 60, 150], 'Crea {n} etiquetas'],
  ['enlaces', 'Contenido', 'share', 'Compartir es vivir', 'enlaces', [1, 5, 20, 50, 150], 'Crea {n} enlaces para compartir'],
  ['tiempo', 'Uso', 'hourglass', 'Tiempo bien invertido', 'horas', [1, 5, 20, 60, 200], 'Usa la app durante {n} h'],
  ['dias', 'Uso', 'sunrise', 'Hábito', 'dias', [3, 10, 30, 100, 365], 'Entra {n} días distintos'],
  ['racha', 'Uso', 'flame', 'Sin parar', 'racha', [3, 7, 14, 30, 100], 'Encadena {n} días seguidos'],
  ['nivel', 'Uso', 'crown', 'Ascenso', 'nivel', [5, 10, 25, 50, 100], 'Llega al nivel {n}'],
  ['retos', 'Uso', 'scroll', 'Cazador de retos', 'retos', [1, 5, 20, 60, 200], 'Completa {n} retos semanales'],
  ['cosmeticos', 'Uso', 'palette', 'Con estilo', 'cosmeticos', [1, 3, 6, 12, 20], 'Consigue {n} cosméticos'],
  ['tarjetas', 'Uso', 'share', 'Presumir un poco', 'tarjetas', [1, 3, 10, 30, 100], 'Comparte {n} tarjetas de logros o puntuación'],
  ['t_partidas', 'Tetris', 'gamepad', 'Jugón', 't_partidas', [1, 10, 50, 200, 1000], 'Juega {n} partidas de Tetris'],
  ['t_mejor', 'Tetris', 'trophy', 'Récord personal', 't_mejor', [1000, 5000, 15000, 40000, 100000], 'Consigue {n} puntos en una partida'],
  ['t_lineas', 'Tetris', 'cube', 'Constructor', 't_lineas', [50, 500, 2500, 10000, 50000], 'Limpia {n} líneas en total'],
  ['t_tetrises', 'Tetris', 'swords', 'Cuatro de golpe', 't_tetrises', [1, 10, 50, 200, 1000], 'Haz {n} Tetris (4 líneas a la vez)'],
  ['t_combo', 'Tetris', 'lightning', 'Cadena de combos', 't_combo', [3, 5, 8, 12, 20], 'Encadena un combo de {n}'],
  ['t_poder', 'Tetris', 'wizard', 'Aprendiz de mago', 't_poder', [1, 20, 100, 500, 2500], 'Usa {n} potenciadores'],
  ['monedas', 'Tetris', 'coins', 'Cofre de monedas', 'monedas', [100, 500, 2500, 10000, 40000], 'Gana {n} monedas en total'],
];
// Logros únicos (algunos secretos hasta que se consiguen)
const ESPECIALES = [
  ['bienvenida', 'star', 'Primer paso', 'Entra por primera vez', 'bienvenida', false],
  ['todoterreno', 'tower', 'Todoterreno', 'Ten al menos un elemento en archivos, notas, prompts, contactos, calendario y etiquetas', 'todoterreno', false],
  ['noctambulo', 'owl', 'Noctámbulo', 'Usa la app entre medianoche y las 5 de la mañana', 'noctambulo', true],
  ['madrugador', 'coffee', 'Madrugador', 'Usa la app entre las 5 y las 7 de la mañana', 'madrugador', true],
  ['maraton', 'bed', 'Maratón', 'Pasa 3 horas en un mismo día dentro de la app', 'maraton', true],
  ['finde', 'cat', 'Finde productivo', 'Entra un sábado y un domingo', 'finde', true],
  ['fantasma', 'ghost', 'Cero errores', 'Termina una partida de Tetris sin que se llene el tablero y con 1500 puntos o más', 'fantasma', true],
];
const XP_ESPECIAL = 100;

/* ---------- Cosméticos ---------- */
const PIEZAS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const COSMETICOS = [
  // skins de piezas
  { id: 'skin-clasico', tipo: 'skin', nombre: 'Clásico', precio: 0, colores: ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'], estilo: 'normal' },
  { id: 'skin-neon', tipo: 'skin', nombre: 'Neón', precio: 150, colores: ['#00f5ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100'], estilo: 'brillo' },
  { id: 'skin-pastel', tipo: 'skin', nombre: 'Pastel', precio: 200, colores: ['#a5f3fc', '#fde68a', '#d8b4fe', '#bbf7d0', '#fecaca', '#bfdbfe', '#fed7aa'], estilo: 'normal' },
  { id: 'skin-retro', tipo: 'skin', nombre: 'Retro verde', precio: 300, colores: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#0f380f', '#306230', '#8bac0f'], estilo: 'plano' },
  { id: 'skin-hielo', tipo: 'skin', nombre: 'Hielo', precio: 400, nivel: 10, colores: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#a5b4fc', '#c7d2fe'], estilo: 'brillo' },
  { id: 'skin-lava', tipo: 'skin', nombre: 'Lava', precio: 500, nivel: 20, colores: ['#fef08a', '#fde047', '#fb923c', '#f97316', '#ef4444', '#dc2626', '#b91c1c'], estilo: 'brillo' },
  { id: 'skin-oro', tipo: 'skin', nombre: 'Oro macizo', precio: 1200, nivel: 40, colores: ['#fde68a', '#facc15', '#eab308', '#ca8a04', '#fbbf24', '#f59e0b', '#d97706'], estilo: 'brillo' },
  // fondos del tablero
  { id: 'fondo-noche', tipo: 'fondo', nombre: 'Noche', precio: 0, colores: ['#070b16', '#0d1424'] },
  { id: 'fondo-rejilla', tipo: 'fondo', nombre: 'Rejilla', precio: 100, colores: ['#0b1020', '#16213e'], estilo: 'rejilla' },
  { id: 'fondo-aurora', tipo: 'fondo', nombre: 'Aurora', precio: 250, nivel: 8, colores: ['#042f2e', '#4c1d95'] },
  { id: 'fondo-atardecer', tipo: 'fondo', nombre: 'Atardecer', precio: 350, nivel: 15, colores: ['#7c2d12', '#312e81'] },
  { id: 'fondo-matrix', tipo: 'fondo', nombre: 'Código verde', precio: 600, nivel: 25, colores: ['#001a0a', '#003b14'], estilo: 'rejilla' },
  // marcos de tarjeta y perfil
  { id: 'marco-ninguno', tipo: 'marco', nombre: 'Sin marco', precio: 0, colores: ['transparent', 'transparent'] },
  { id: 'marco-bronce', tipo: 'marco', nombre: 'Bronce', precio: 0, nivel: 5, colores: ['#b45309', '#f59e0b'] },
  { id: 'marco-plata', tipo: 'marco', nombre: 'Plata', precio: 0, nivel: 15, colores: ['#94a3b8', '#e2e8f0'] },
  { id: 'marco-oro', tipo: 'marco', nombre: 'Oro', precio: 0, nivel: 30, colores: ['#ca8a04', '#fde047'] },
  { id: 'marco-diamante', tipo: 'marco', nombre: 'Diamante', precio: 0, nivel: 50, colores: ['#06b6d4', '#e0f2fe'] },
  { id: 'marco-aurora', tipo: 'marco', nombre: 'Aurora', precio: 200, colores: ['#22d3ee', '#a855f7'] },
  { id: 'marco-fuego', tipo: 'marco', nombre: 'Fuego', precio: 400, colores: ['#ef4444', '#facc15'] },
  // títulos (se obtienen al cumplir un logro)
  { id: 'titulo-novato', tipo: 'titulo', nombre: 'Recién llegado', precio: 0 },
  { id: 'titulo-archivista', tipo: 'titulo', nombre: 'El Archivista', precio: 0, logro: ['archivos', 3] },
  { id: 'titulo-fotografo', tipo: 'titulo', nombre: 'Cazador de luz', precio: 0, logro: ['fotos', 3] },
  { id: 'titulo-escriba', tipo: 'titulo', nombre: 'Escriba incansable', precio: 0, logro: ['notas', 3] },
  { id: 'titulo-prompter', tipo: 'titulo', nombre: 'Susurrador de IA', precio: 0, logro: ['prompts', 3] },
  { id: 'titulo-agenda', tipo: 'titulo', nombre: 'Agenda de hierro', precio: 0, logro: ['eventos', 3] },
  { id: 'titulo-constante', tipo: 'titulo', nombre: 'Constante', precio: 0, logro: ['racha', 3] },
  { id: 'titulo-tetris', tipo: 'titulo', nombre: 'Rey de los bloques', precio: 0, logro: ['t_mejor', 4] },
  { id: 'titulo-cazador', tipo: 'titulo', nombre: 'Cazador de retos', precio: 0, logro: ['retos', 3] },
  { id: 'titulo-mitico', tipo: 'titulo', nombre: 'Mítico', precio: 0, nivel: 100 },
];
const POR_DEFECTO = { skin: 'skin-clasico', fondo: 'fondo-noche', marco: 'marco-ninguno', titulo: 'titulo-novato' };

/* ---------- Retos semanales ---------- */
// [id, grupo, icono, texto, métrica, objetivos por dificultad]
const RETOS = [
  ['notas', 'contenido', 'notes', 'Escribe {n} notas', 'notas', [2, 4, 8]],
  ['prompts', 'contenido', 'prompts', 'Guarda {n} prompts', 'prompts', [2, 4, 8]],
  ['contactos', 'contenido', 'contacts', 'Añade {n} contactos', 'contactos', [1, 3, 5]],
  ['eventos', 'contenido', 'calendar', 'Crea {n} eventos', 'eventos', [2, 4, 8]],
  ['archivos', 'contenido', 'files', 'Sube {n} archivos', 'archivos', [5, 15, 40]],
  ['fotos', 'contenido', 'photos', 'Sube {n} fotos', 'fotos', [5, 15, 40]],
  ['minutos', 'uso', 'hourglass', 'Usa la app {n} minutos', 'minutos', [20, 45, 90]],
  ['dias', 'uso', 'sunrise', 'Entra {n} días distintos esta semana', 'dias', [3, 4, 5]],
  ['t_partidas', 'tetris', 'gamepad', 'Juega {n} partidas de Tetris', 't_partidas', [2, 4, 7]],
  ['t_lineas', 'tetris', 'cube', 'Limpia {n} líneas', 't_lineas', [20, 50, 100]],
  ['t_tetrises', 'tetris', 'swords', 'Haz {n} Tetris', 't_tetrises', [1, 2, 4]],
  ['t_poder', 'tetris', 'wizard', 'Usa {n} potenciadores', 't_poder', [2, 5, 10]],
  ['t_semana', 'tetris', 'trophy', 'Consigue {n} puntos en una partida', 't_semana', [1500, 4000, 9000]],
];
const RECOMPENSA_RETO = [{ xp: 120, monedas: 15 }, { xp: 180, monedas: 30 }, { xp: 260, monedas: 50 }];
const BONUS_SEMANA = { xp: 300, monedas: 100 };

/* ---------- Utilidades ---------- */
const diaOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const msDia = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const difDias = (a, b) => Math.round((msDia(b) - msDia(a)) / 86400000);
function semanaIso(d) {
  const t = new Date(msDia(d));
  const dow = (t.getUTCDay() + 6) % 7;            // lunes = 0
  t.setUTCDate(t.getUTCDate() - dow + 3);          // jueves de esa semana
  const y = t.getUTCFullYear();
  const primero = new Date(Date.UTC(y, 0, 4));
  const n = 1 + Math.round(((t - primero) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(n).padStart(2, '0')}`;
}
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const ESTADO_BASE = () => ({
  v: 1, xp: 0, monedas: 0, monedasTotal: 0, segundos: 0, restoXp: 0,
  diario: {}, xpTiempo: {}, ultimoDia: '', racha: 0, mejorRacha: 0, dias: 0, escudos: 0, sabado: 0, domingo: 0, noche: 0, madrugada: 0,
  logros: {}, cuando: {}, especiales: {},
  tetris: { partidas: 0, mejor: 0, total: 0, lineas: 0, tetrises: 0, combo: 0, poderes: 0, tiempo: 0, historial: [] },
  eventos: { tarjeta: 0 }, retos: 0,
  semana: { clave: '', base: {}, retos: [], hechos: [], bonus: false, mejorPartida: 0 },
  propios: [], equipado: { ...POR_DEFECTO },
});

function createGame({ userRoot, contar, sendError, registrarActividad, express }) {
  const router = express.Router();
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'game.json');
  const jsonPeq = express.json({ limit: '20kb' });
  const cacheContar = new Map();

  async function recuentos(user) {
    const hit = cacheContar.get(user.username);
    if (hit && Date.now() - hit.t < 45000) return hit.v;
    let v = {};
    try { v = await contar(user); } catch { /* sin recuentos: los logros de contenido esperan */ }
    cacheContar.set(user.username, { t: Date.now(), v });
    return v;
  }

  const catalogo = (id) => COSMETICOS.find(c => c.id === id);
  const gotDe = (s, id) => s.logros[id] || 0;
  function metricas(s, c) {
    return {
      archivos: c.archivos || 0, fotos: c.fotos || 0, notas: c.notas || 0, prompts: c.prompts || 0, contactos: c.contactos || 0,
      eventos: c.eventos || 0, etiquetas: c.etiquetas || 0, enlaces: c.enlaces || 0,
      horas: s.segundos / 3600, minutos: s.segundos / 60, dias: s.dias, racha: s.mejorRacha, nivel: nivelDe(s.xp), retos: s.retos,
      cosmeticos: s.propios.length, tarjetas: s.eventos.tarjeta || 0,
      t_partidas: s.tetris.partidas, t_mejor: s.tetris.mejor, t_lineas: s.tetris.lineas, t_tetrises: s.tetris.tetrises,
      t_combo: s.tetris.combo, t_poder: s.tetris.poderes, monedas: s.monedasTotal,
    };
  }
  const reqOk = (item, s) => (!item.nivel || nivelDe(s.xp) >= item.nivel) && (!item.logro || gotDe(s, item.logro[0]) >= item.logro[1]);
  const esPropio = (item, s) => s.propios.includes(item.id) || (item.precio === 0 && reqOk(item, s));

  // Concede lo que toque con las métricas actuales. Se repite porque subir de nivel puede abrir logros de nivel.
  function evalua(s, c, nuevos, ahora) {
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let cambio = false;
      const m = metricas(s, c);
      for (const [id, , icono, nombre, met, umbrales] of FAMILIAS) {
        for (let i = gotDe(s, id); i < umbrales.length; i++) {
          if (m[met] >= umbrales[i]) {
            s.logros[id] = i + 1; s.cuando[`${id}:${i}`] = ahora; s.xp += XP_TIER[i]; cambio = true;
            nuevos.push({ tipo: 'logro', id, nombre, icono, tramo: TIERS[i], xp: XP_TIER[i] });
          } else break;
        }
      }
      const esp = {
        bienvenida: s.dias >= 1,
        todoterreno: ['archivos', 'notas', 'prompts', 'contactos', 'eventos', 'etiquetas'].every(k => (c[k] || 0) > 0),
        noctambulo: s.noche >= 1800, madrugador: s.madrugada >= 1800,
        maraton: Object.values(s.diario).some(x => x >= 3 * 3600),
        finde: s.sabado > 0 && s.domingo > 0,
        fantasma: !!s.especiales.fantasma,
      };
      for (const [id, icono, nombre, , clave] of ESPECIALES) {
        if (!s.especiales[id] && esp[clave]) {
          s.especiales[id] = ahora; s.xp += XP_ESPECIAL; cambio = true;
          nuevos.push({ tipo: 'logro', id, nombre, icono, tramo: 'Especial', xp: XP_ESPECIAL });
        }
      }
      if (!cambio) break;
    }
  }

  function prepararSemana(s, dia, c) {
    const clave = semanaIso(dia);
    if (s.semana.clave === clave) return;
    const m = metricas(s, c);
    const nv = nivelDe(s.xp);
    const dif = nv < 10 ? 0 : nv < 30 ? 1 : 2;
    const azar = rng(hash(clave + s.xp.toString().length + (s.semana.clave || '')));
    const elige = (g) => { const l = RETOS.filter(r => r[1] === g); return l[Math.floor(azar() * l.length)]; };
    const picks = [elige('contenido'), elige('uso'), elige('tetris')];
    s.semana = {
      clave, base: Object.fromEntries(Object.keys(m).map(k => [k, m[k]])), mejorPartida: 0, bonus: false, hechos: [],
      retos: picks.map(r => ({ id: r[0], dif, objetivo: r[5][dif] })),
    };
  }
  function progresoReto(s, c, r) {
    const def = RETOS.find(x => x[0] === r.id);
    const m = metricas(s, c);
    const actual = def[4] === 't_semana' ? s.semana.mejorPartida : Math.max(0, m[def[4]] - (s.semana.base[def[4]] || 0));
    return Math.min(r.objetivo, Math.floor(actual));
  }
  function evaluaRetos(s, c, nuevos) {
    let todos = true;
    for (const r of s.semana.retos) {
      if (s.semana.hechos.includes(r.id)) continue;
      if (progresoReto(s, c, r) >= r.objetivo) {
        const rec = RECOMPENSA_RETO[r.dif];
        s.semana.hechos.push(r.id); s.retos++; s.xp += rec.xp; s.monedas += rec.monedas; s.monedasTotal += rec.monedas;
        const def = RETOS.find(x => x[0] === r.id);
        nuevos.push({ tipo: 'reto', id: r.id, nombre: def[3].replace('{n}', r.objetivo), icono: def[2], xp: rec.xp, monedas: rec.monedas });
      } else todos = false;
    }
    if (todos && s.semana.retos.length && !s.semana.bonus) {
      s.semana.bonus = true; s.xp += BONUS_SEMANA.xp; s.monedas += BONUS_SEMANA.monedas; s.monedasTotal += BONUS_SEMANA.monedas;
      nuevos.push({ tipo: 'semana', nombre: 'Semana completa', icono: 'trophy', xp: BONUS_SEMANA.xp, monedas: BONUS_SEMANA.monedas });
    }
  }

  // Lo que se hace siempre que se toca el estado: comprobar logros y retos y avisar de subidas de nivel
  function cierra(s, c, nuevos, nivelAntes, dia) {
    const ahora = Date.now();
    if (dia) prepararSemana(s, dia, c);
    for (let i = 0; i < 3; i++) { evalua(s, c, nuevos, ahora); evaluaRetos(s, c, nuevos); }
    evalua(s, c, nuevos, ahora);
    const nivelDespues = nivelDe(s.xp);
    if (nivelDespues > nivelAntes) nuevos.push({ tipo: 'nivel', nivel: nivelDespues, rango: rangoDe(nivelDespues).nombre, icono: rangoDe(nivelDespues).icono });
  }

  function vista(s, c) {
    const m = metricas(s, c);
    const nv = nivelDe(s.xp);
    const desde = xpAcumulada(nv), hasta = nv >= MAX_NIVEL ? desde : xpAcumulada(nv + 1);
    const familias = FAMILIAS.map(([id, grupo, icono, nombre, met, umbrales, texto]) => ({
      id, grupo, icono, nombre, valor: Math.floor(m[met] * (met === 'horas' ? 10 : 1)) / (met === 'horas' ? 10 : 1), umbrales, texto, tramos: gotDe(s, id),
      cuando: umbrales.map((_, i) => s.cuando[`${id}:${i}`] || 0),
    }));
    const especiales = ESPECIALES.map(([id, icono, nombre, texto, , secreto]) => ({ id, icono, nombre, texto: s.especiales[id] || !secreto ? texto : 'Logro secreto', secreto, cuando: s.especiales[id] || 0 }));
    const total = FAMILIAS.reduce((a, f) => a + f[5].length, 0) + ESPECIALES.length;
    const hechos = familias.reduce((a, f) => a + f.tramos, 0) + especiales.filter(e => e.cuando).length;
    return {
      xp: s.xp, nivel: nv, xpNivel: s.xp - desde, xpSiguiente: hasta - desde, maxNivel: nv >= MAX_NIVEL, rango: rangoDe(nv), rangos: RANGOS.map(r => ({ desde: r[0], nombre: r[1], icono: r[2], color: r[3] })),
      monedas: s.monedas, racha: s.racha, mejorRacha: s.mejorRacha, escudos: s.escudos, dias: s.dias, segundos: s.segundos,
      hoy: s.diario[s.ultimoDia] || 0, ultimoDia: s.ultimoDia, diario: s.diario,
      recuentos: Object.fromEntries(['archivos', 'fotos', 'notas', 'prompts', 'contactos', 'eventos', 'etiquetas', 'enlaces'].map(k => [k, c[k] || 0])),
      logros: { total, hechos, familias, especiales, tramos: TIERS, xpTramo: XP_TIER },
      semana: {
        clave: s.semana.clave, bonus: s.semana.bonus, premioBonus: BONUS_SEMANA,
        retos: s.semana.retos.map(r => {
          const def = RETOS.find(x => x[0] === r.id);
          return { id: r.id, icono: def[2], texto: def[3].replace('{n}', r.objetivo), objetivo: r.objetivo, progreso: progresoReto(s, c, r), hecho: s.semana.hechos.includes(r.id), premio: RECOMPENSA_RETO[r.dif] };
        }),
      },
      cosmeticos: COSMETICOS.map(it => ({ ...it, propio: esPropio(it, s), disponible: reqOk(it, s), puesto: s.equipado[it.tipo] === it.id })),
      equipado: s.equipado,
      tetris: { ...s.tetris, ultima: undefined, historial: s.tetris.historial.slice(-12).reverse() },
      tarjetas: s.eventos.tarjeta || 0, version: 1,
    };
  }

  /* ---------- Rutas ---------- */
  const HOY_VALIDO = 2;   // días de diferencia admitidos entre el reloj del cliente y el del servidor
  function diaCliente(d) {
    if (!diaOk(d)) return null;
    const hoy = new Date().toISOString().slice(0, 10);
    return Math.abs(difDias(hoy, d)) <= HOY_VALIDO ? d : null;
  }

  router.get('/', async (req, res) => {
    try {
      const c = await recuentos(req.user);
      const dia = diaCliente(req.query.day);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        cierra(s, c, nuevos, antes, dia || s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

  // La pestaña avisa cada minuto mientras está a la vista: así se mide el tiempo de uso y se mantiene la racha
  router.post('/ping', jsonPeq, async (req, res) => {
    try {
      let seg = Math.max(0, Math.min(90, Math.floor(Number(req.body.seconds) || 0)));
      const dia = diaCliente(req.body.day);
      if (!dia) throw new HttpError(400, 'Fecha no válida');
      const hora = Math.max(0, Math.min(23, Math.floor(Number(req.body.hour) || 0)));
      const dow = Math.max(0, Math.min(6, Math.floor(Number(req.body.dow) || 0)));   // 0 = domingo
      const c = await recuentos(req.user);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        if (s.ultimoDia !== dia) {
          const salto = s.ultimoDia ? difDias(s.ultimoDia, dia) : 0;
          if (!s.ultimoDia) s.racha = 1;
          else if (salto === 1) s.racha += 1;
          else if (salto === 2 && s.escudos > 0) { s.escudos -= 1; s.racha += 1; nuevos.push({ tipo: 'escudo', nombre: 'Un escudo ha salvado tu racha', icono: 'shield' }); }
          else if (salto > 0) s.racha = 1;
          if (s.racha > s.mejorRacha) s.mejorRacha = s.racha;
          if (s.racha > 0 && s.racha % 7 === 0 && s.escudos < 2) s.escudos += 1;
          s.ultimoDia = dia; s.dias += 1;
          if (dow === 6) s.sabado += 1; if (dow === 0) s.domingo += 1;
          const bono = 20 + Math.min(s.racha, 30) * 2;
          s.xp += bono; nuevos.push({ tipo: 'diario', nombre: `Bono diario · racha de ${s.racha}`, icono: 'flame', xp: bono });
        }
        // El tiempo contado no puede superar el que de verdad ha pasado desde el aviso anterior (evita inflarlo con avisos repetidos)
        const ahora = Date.now();
        const permitido = s.ultimoPing ? Math.min(seg, Math.floor((ahora - s.ultimoPing) / 1000) + 5) : Math.min(seg, 60);
        s.ultimoPing = ahora;
        seg = Math.max(0, permitido);
        if (seg) {
          s.segundos += seg; s.diario[dia] = (s.diario[dia] || 0) + seg;
          if (hora < 5) s.noche += seg; else if (hora < 7) s.madrugada += seg;
          // 1 XP por minuto de uso, hasta 120 al día
          s.restoXp += seg;
          const minutos = Math.floor(s.restoXp / 60); s.restoXp -= minutos * 60;
          const dado = s.xpTiempo[dia] || 0;
          const gana = Math.max(0, Math.min(minutos, 120 - dado));
          if (gana) { s.xp += gana; s.xpTiempo[dia] = dado + gana; }
          // Solo se guardan las últimas 60 jornadas
          const claves = Object.keys(s.diario).sort();
          for (const k of claves.slice(0, Math.max(0, claves.length - 60))) { delete s.diario[k]; delete s.xpTiempo[k]; }
        }
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

  // Resultado de una partida de Tetris
  router.post('/tetris', jsonPeq, async (req, res) => {
    try {
      const b = req.body || {};
      const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
      const dur = num(b.duration, 600), lineas = num(b.lines, 400), puntos = num(b.score, 5000000);
      if (dur < 5) throw new HttpError(400, 'Partida demasiado corta para contar');
      if (lineas > dur * 2 + 4) throw new HttpError(400, 'Resultado no válido');
      if (puntos > 1500 * dur) throw new HttpError(400, 'Resultado no válido');
      const partida = {
        at: Date.now(), score: puntos, lines: lineas, level: num(b.level, 60), tetrises: Math.min(num(b.tetrises, 100), Math.floor(lineas / 4)),
        combo: num(b.maxCombo, 40), poderes: num(b.powerups, 200), dur, fin: b.ended === 'top' ? 'top' : b.ended === 'abandono' ? 'abandono' : 'tiempo',
      };
      const dia = diaCliente(b.day) || new Date().toISOString().slice(0, 10);
      const c = await recuentos(req.user);
      const nuevos = []; let out; let record = false; let ganado;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        const t = s.tetris;
        // Una partida no puede terminar antes de haber durado lo que dice: se exige un tiempo mínimo desde la anterior
        if (t.ultima && Date.now() - t.ultima < dur * 800) throw new HttpError(429, 'Demasiado rápido: espera a que termine la partida anterior');
        t.ultima = Date.now();
        record = puntos > t.mejor;
        t.partidas++; t.total += puntos; t.lineas += lineas; t.tetrises += partida.tetrises; t.tiempo += dur;
        t.combo = Math.max(t.combo, partida.combo); t.poderes += partida.poderes; if (record) t.mejor = puntos;
        t.historial.push({ at: partida.at, score: puntos, lines: lineas, level: partida.level, dur });
        if (t.historial.length > 40) t.historial.splice(0, t.historial.length - 40);
        prepararSemana(s, dia, c);
        s.semana.mejorPartida = Math.max(s.semana.mejorPartida, puntos);
        if (partida.fin === 'tiempo' && puntos >= 1500) s.especiales.fantasma = s.especiales.fantasma || Date.now();
        const xp = Math.min(150, Math.floor(puntos / 200)) + 10;
        const monedas = Math.min(120, Math.floor(puntos / 500) + Math.floor(lineas / 10));
        const extra = Math.round(monedas * (b.bonusMonedas ? 0.5 : 0));
        s.xp += xp; s.monedas += monedas + extra; s.monedasTotal += monedas + extra;
        ganado = { xp, monedas: monedas + extra };
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      if (registrarActividad) registrarActividad(req, 'tetris', { score: puntos });
      res.json({ ...out, nuevos, ganado, record });
    } catch (err) { sendError(res, err); }
  });

  router.post('/buy', jsonPeq, async (req, res) => {
    try {
      const it = catalogo(String(req.body.id || ''));
      if (!it) throw new HttpError(404, 'No existe');
      const c = await recuentos(req.user);
      let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        if (esPropio(it, s)) throw new HttpError(400, 'Ya lo tienes');
        if (!reqOk(it, s)) throw new HttpError(400, it.nivel ? `Se desbloquea en el nivel ${it.nivel}` : 'Todavía no cumples el requisito');
        if (it.precio <= 0) throw new HttpError(400, 'Se consigue cumpliendo su logro');
        if (s.monedas < it.precio) throw new HttpError(400, 'Te faltan monedas');
        s.monedas -= it.precio; s.propios.push(it.id);
        const nuevos = []; cierra(s, c, nuevos, nivelDe(s.xp), s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = { ...vista(s, c), nuevos };
      });
      res.json(out);
    } catch (err) { sendError(res, err); }
  });

  router.post('/equip', jsonPeq, async (req, res) => {
    try {
      const it = catalogo(String(req.body.id || ''));
      if (!it) throw new HttpError(404, 'No existe');
      const c = await recuentos(req.user);
      let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        if (!esPropio(it, s)) throw new HttpError(400, 'Aún no lo tienes');
        s.equipado[it.tipo] = it.id;
        out = vista(s, c);
      });
      res.json(out);
    } catch (err) { sendError(res, err); }
  });

  // Hechos que solo conoce el navegador (por ahora, compartir una tarjeta)
  router.post('/event', jsonPeq, async (req, res) => {
    try {
      const tipo = cleanStr(req.body.type, 20);
      if (tipo !== 'tarjeta') throw new HttpError(400, 'Evento desconocido');
      const c = await recuentos(req.user);
      const nuevos = []; let out;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        s.eventos.tarjeta = (s.eventos.tarjeta || 0) + 1;
        cierra(s, c, nuevos, nivelDe(s.xp), s.ultimoDia || new Date().toISOString().slice(0, 10));
        out = vista(s, c);
      });
      res.json({ ...out, nuevos });
    } catch (err) { sendError(res, err); }
  });

  return { router, nivelDe, readJson, archivo };
}

module.exports = { createGame, nivelDe, xpAcumulada, rangoDe, semanaIso, COSMETICOS, FAMILIAS };
