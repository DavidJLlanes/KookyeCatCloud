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
  ['g_partidas', '2048', 'cube', 'Cuadrícula viciosa', 'g_partidas', [1, 10, 50, 200, 1000], 'Juega {n} partidas de 2048'],
  ['g_mejor', '2048', 'trophy', 'Suma y sigue', 'g_mejor', [1000, 5000, 20000, 60000, 150000], 'Consigue {n} puntos en una partida de 2048'],
  ['g_ficha', '2048', 'gem', 'Potencias de dos', 'g_ficha', [64, 256, 1024, 2048, 4096], 'Forma la ficha {n} en el 2048'],
  ['g_fusiones', '2048', 'cog', 'Fusionista', 'g_fusiones', [100, 1000, 5000, 20000, 80000], 'Fusiona {n} fichas en el 2048'],
  ['g_poder', '2048', 'wizard', 'Alquimista', 'g_poder', [1, 20, 100, 500, 2500], 'Usa {n} potenciadores en el 2048'],
  ['b_partidas', 'Breakout', 'gamepad', 'Rompe-muros', 'b_partidas', [1, 10, 50, 200, 1000], 'Juega {n} partidas de Breakout'],
  ['b_mejor', 'Breakout', 'trophy', 'Demoledor', 'b_mejor', [1000, 5000, 15000, 40000, 100000], 'Consigue {n} puntos en una partida de Breakout'],
  ['b_ladrillos', 'Breakout', 'cube', 'Pared abajo', 'b_ladrillos', [50, 500, 3000, 15000, 60000], 'Rompe {n} ladrillos'],
  ['b_niveles', 'Breakout', 'crown', 'Nivel tras nivel', 'b_niveles', [2, 4, 6, 8, 12], 'Llega al nivel {n} en una partida de Breakout'],
  ['b_perfectos', 'Breakout', 'shield', 'Sin rasguños', 'b_perfectos', [1, 5, 20, 60, 200], 'Supera {n} niveles sin perder ninguna vida'],
  ['b_poder', 'Breakout', 'wizard', 'Ingeniero de bolas', 'b_poder', [1, 20, 100, 500, 2500], 'Usa {n} potenciadores en el Breakout'],
  ['a_partidas', 'Arcade', 'archive', 'Sala de recreativas', 'a_partidas', [5, 25, 100, 400, 1500], 'Juega {n} partidas entre Tetris, 2048 y Breakout'],
  ['a_juegos', 'Arcade', 'medal', 'Jugador completo', 'a_juegos', [1, 2, 3], 'Juega a {n} juegos arcade distintos'],
  ['db_bases', 'Bases', 'abacus', 'Arquitecto de datos', 'db_bases', [1, 3, 6, 12, 25], 'Crea {n} bases de datos'],
  ['db_filas', 'Bases', 'books', 'Registro tras registro', 'db_filas', [10, 50, 250, 1000, 5000], 'Guarda {n} filas en tus bases'],
  ['db_columnas', 'Bases', 'cog', 'Esquema a medida', 'db_columnas', [5, 20, 50, 120, 300], 'Define {n} columnas en tus bases'],
  ['db_mov', 'Bases', 'cycle', 'Maestro del tablero', 'db_mov', [5, 30, 150, 600, 2500], 'Mueve {n} tarjetas entre columnas de un tablero'],
  ['db_hechas', 'Bases', 'medal', 'Tarea cumplida', 'db_hechas', [5, 25, 100, 400, 1500], 'Marca {n} casillas en tus bases'],
  ['compra_prod', 'Contenido', 'purse', 'Despensa organizada', 'compra_prod', [5, 25, 100, 300, 1000], 'Ten {n} productos en el catálogo de la compra'],
  ['compra_hechas', 'Contenido', 'coins', 'Compra hecha', 'compra_hechas', [5, 30, 150, 600, 2500], 'Marca {n} compras como hechas'],
  ['favoritos', 'Contenido', 'star', 'Lo mejor de lo mejor', 'favoritos', [3, 15, 50, 150, 500], 'Marca {n} favoritos'],
  ['albumes', 'Contenido', 'photos', 'Curador de álbumes', 'albumes', [1, 3, 8, 20, 50], 'Crea {n} álbumes de fotos'],
  ['seg_capas', 'Seguridad', 'shield', 'Fortaleza', 'seg_capas', [1, 2], 'Protege tu cuenta con {n} capa(s) extra (verificación en dos pasos y huella)'],
  ['cod_snips', 'Código', 'anvil', 'Taller de fragmentos', 'cod_snips', [3, 10, 30, 80, 200], 'Guarda {n} fragmentos de código'],
  ['cod_lineas', 'Código', 'quill', 'Líneas con sentido', 'cod_lineas', [50, 500, 2500, 10000, 40000], 'Escribe {n} líneas de código en tus fragmentos'],
  ['cod_langs', 'Código', 'globe', 'Políglota', 'cod_langs', [2, 4, 6, 9, 12], 'Guarda fragmentos en {n} lenguajes distintos'],
  ['cod_prev', 'Código', 'crystal', 'Ojo en la vista previa', 'cod_prev', [1, 10, 50, 200, 1000], 'Usa la vista previa {n} veces'],
  ['cod_copias', 'Código', 'clip', 'Copia y pega', 'cod_copias', [1, 10, 50, 200, 1000], 'Copia código de tus fragmentos {n} veces'],
  ['juegos', 'Juegos', 'archive', 'Colección gamer', 'juegos', [5, 25, 100, 300, 1000], 'Ten {n} juegos en tu colección'],
  ['j_jugados', 'Juegos', 'laurels', 'Jugador de fondo', 'j_jugados', [3, 15, 50, 150, 400], 'Marca {n} juegos como jugados'],
  ['j_horas', 'Juegos', 'stopwatch', 'Horas de vicio', 'j_horas', [10, 100, 500, 2000, 10000], 'Registra {n} horas jugadas'],
  ['j_resenas', 'Juegos', 'quill', 'Crítico de sofá', 'j_resenas', [1, 10, 40, 120, 300], 'Escribe {n} reseñas de juegos'],
  ['j_deseos', 'Juegos', 'heart', 'Lista infinita', 'j_deseos', [3, 15, 40, 100, 250], 'Ten {n} juegos en tu lista de deseos'],
  ['j_completos', 'Juegos', 'medal', 'Platino', 'j_completos', [1, 5, 20, 60, 150], 'Completa al 100 % {n} juegos'],
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
  ['retro', 'sands', 'Arqueólogo retro', 'Añade un juego lanzado antes del año 2000', 'retro', false],
  ['plataformas', 'globe', 'Todas las plataformas', 'Ten juegos en 5 plataformas distintas', 'plataformas', false],
  ['recreativa', 'laurels', 'Salón recreativo', 'Juega al menos una partida de Tetris, 2048 y Breakout', 'recreativa', false],
  ['ficha2048', 'gem', '¡2048!', 'Forma la ficha 2048', 'ficha2048', false],
  ['barrido', 'shield', 'Barrido total', 'Supera 5 niveles seguidos del Breakout sin perder ninguna vida', 'barrido', true],
  ['maestro', 'crown', 'Maestro recreativo', 'Consigue 5000 puntos o más en una partida de cada juego arcade', 'maestro', true],
  ['db_completa', 'gem', 'Esquema completo', 'Crea una base con los 7 tipos de columna distintos', 'db_completa', false],
  ['db_grande', 'archive', 'Gran biblioteca', 'Ten una base con 100 filas o más', 'db_grande', false],
  ['doble_cerradura', 'key', 'Doble cerradura', 'Activa la verificación en dos pasos', 'doble_cerradura', false],
  ['huella', 'vault', 'Entrada biométrica', 'Registra una huella o Face ID (passkey)', 'huella', false],
  ['gran_album', 'photos', 'Gran exposición', 'Ten un álbum con 50 fotos o más', 'gran_album', false],
  ['cod_trio', 'cog', 'Trío web', 'Ten un fragmento de HTML, otro de CSS y otro de JavaScript', 'cod_trio', false],
  ['cod_larga', 'scroll', 'Maratón de código', 'Escribe un fragmento de 200 líneas o más', 'cod_larga', false],
  ['sesion', 'bed', 'Una más y a dormir', 'Registra una sesión de juego de 6 horas o más', 'sesion', true],
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
  { id: 'titulo-2048', tipo: 'titulo', nombre: 'Señor de las potencias', precio: 0, logro: ['g_ficha', 4] },
  { id: 'titulo-breakout', tipo: 'titulo', nombre: 'Rompemuros', precio: 0, logro: ['b_mejor', 3] },
  { id: 'titulo-arcade', tipo: 'titulo', nombre: 'Rey de la recreativa', precio: 0, logro: ['a_partidas', 4] },
  { id: 'titulo-compra', tipo: 'titulo', nombre: 'Despensa llena', precio: 0, logro: ['compra_prod', 3] },
  { id: 'titulo-curador', tipo: 'titulo', nombre: 'Curador de álbumes', precio: 0, logro: ['albumes', 3] },
  { id: 'titulo-guardian', tipo: 'titulo', nombre: 'Guardián', precio: 0, logro: ['seg_capas', 2] },
  { id: 'titulo-codigo', tipo: 'titulo', nombre: 'Artesano del código', precio: 0, logro: ['cod_snips', 3] },
  { id: 'titulo-bases', tipo: 'titulo', nombre: 'Arquitecto de datos', precio: 0, logro: ['db_bases', 3] },
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
  ['t_partidas', 'arcade', 'gamepad', 'Juega {n} partidas de Tetris', 't_partidas', [2, 4, 7]],
  ['t_lineas', 'arcade', 'cube', 'Limpia {n} líneas', 't_lineas', [20, 50, 100]],
  ['t_tetrises', 'arcade', 'swords', 'Haz {n} Tetris', 't_tetrises', [1, 2, 4]],
  ['t_poder', 'arcade', 'wizard', 'Usa {n} potenciadores', 't_poder', [2, 5, 10]],
  ['t_semana', 'arcade', 'trophy', 'Consigue {n} puntos en una partida', 't_semana', [1500, 4000, 9000]],
  ['g_partidas', 'arcade', 'cube', 'Juega {n} partidas de 2048', 'g_partidas', [2, 4, 7]],
  ['g_fusiones', 'arcade', 'cog', 'Fusiona {n} fichas en el 2048', 'g_fusiones', [100, 300, 800]],
  ['g_poder', 'arcade', 'wizard', 'Usa {n} potenciadores en el 2048', 'g_poder', [2, 5, 10]],
  ['g_semana', 'arcade', 'trophy', 'Consigue {n} puntos en una partida de 2048', 'g_semana', [1000, 3000, 8000]],
  ['b_partidas', 'arcade', 'gamepad', 'Juega {n} partidas de Breakout', 'b_partidas', [2, 4, 7]],
  ['b_ladrillos', 'arcade', 'cube', 'Rompe {n} ladrillos', 'b_ladrillos', [60, 150, 300]],
  ['b_poder', 'arcade', 'wizard', 'Usa {n} potenciadores en el Breakout', 'b_poder', [2, 5, 10]],
  ['b_semana', 'arcade', 'trophy', 'Consigue {n} puntos en una partida de Breakout', 'b_semana', [1500, 4000, 9000]],
  ['compra_hechas', 'contenido', 'coins', 'Marca {n} compras como hechas', 'compra_hechas', [3, 8, 15]],
  ['favoritos', 'contenido', 'star', 'Marca {n} favoritos', 'favoritos', [2, 5, 10]],
  ['cod_snips', 'contenido', 'anvil', 'Guarda {n} fragmentos de código', 'cod_snips', [1, 3, 6]],
  ['db_filas', 'contenido', 'books', 'Añade {n} filas a tus bases', 'db_filas', [3, 10, 25]],
  ['db_mov', 'contenido', 'cycle', 'Mueve {n} tarjetas en un tablero', 'db_mov', [3, 8, 15]],
  ['j_nuevos', 'contenido', 'archive', 'Añade {n} juegos a tu colección', 'juegos', [1, 3, 6]],
  ['j_horas', 'contenido', 'stopwatch', 'Registra {n} horas jugadas', 'j_horas', [2, 6, 15]],
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

const ARC_BASE = () => ({
  g2048: { partidas: 0, mejor: 0, total: 0, tiempo: 0, poderes: 0, ficha: 0, fusiones: 0, movs: 0, ganadas: 0, historial: [] },
  breakout: { partidas: 0, mejor: 0, total: 0, tiempo: 0, poderes: 0, ladrillos: 0, niveles: 0, perfectos: 0, mejorPerfectos: 0, historial: [] },
});
// Las cuentas anteriores no tienen estos contadores: se completan al leer
const arc = (s) => { const b = ARC_BASE(); s.arcade = s.arcade || {}; for (const k of Object.keys(b)) s.arcade[k] = { ...b[k], ...(s.arcade[k] || {}) }; return s.arcade; };
const ESTADO_BASE = () => ({
  v: 1, xp: 0, monedas: 0, monedasTotal: 0, segundos: 0, restoXp: 0,
  diario: {}, xpTiempo: {}, ultimoDia: '', racha: 0, mejorRacha: 0, dias: 0, escudos: 0, sabado: 0, domingo: 0, noche: 0, madrugada: 0,
  logros: {}, cuando: {}, especiales: {},
  tetris: { partidas: 0, mejor: 0, total: 0, lineas: 0, tetrises: 0, combo: 0, poderes: 0, tiempo: 0, historial: [] },
  arcade: ARC_BASE(),
  eventos: { tarjeta: 0 }, retos: 0,
  semana: { clave: '', base: {}, retos: [], hechos: [], bonus: false, mejorPartida: 0, mejorG: 0, mejorB: 0 },
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
    const A = arc(s), G2 = A.g2048, BR = A.breakout;
    return {
      archivos: c.archivos || 0, fotos: c.fotos || 0, notas: c.notas || 0, prompts: c.prompts || 0, contactos: c.contactos || 0,
      eventos: c.eventos || 0, etiquetas: c.etiquetas || 0, enlaces: c.enlaces || 0,
      horas: s.segundos / 3600, minutos: s.segundos / 60, dias: s.dias, racha: s.mejorRacha, nivel: nivelDe(s.xp), retos: s.retos,
      cosmeticos: s.propios.length, tarjetas: s.eventos.tarjeta || 0,
      t_partidas: s.tetris.partidas, t_mejor: s.tetris.mejor, t_lineas: s.tetris.lineas, t_tetrises: s.tetris.tetrises,
      t_combo: s.tetris.combo, t_poder: s.tetris.poderes, monedas: s.monedasTotal,
      g_partidas: G2.partidas, g_mejor: G2.mejor, g_ficha: G2.ficha, g_fusiones: G2.fusiones, g_poder: G2.poderes,
      b_partidas: BR.partidas, b_mejor: BR.mejor, b_ladrillos: BR.ladrillos, b_niveles: BR.niveles, b_perfectos: BR.perfectos, b_poder: BR.poderes,
      a_partidas: s.tetris.partidas + G2.partidas + BR.partidas, a_juegos: (s.tetris.partidas > 0) + (G2.partidas > 0) + (BR.partidas > 0),
      compra_prod: c.compra_prod || 0, compra_hechas: c.compra_hechas || 0, favoritos: c.favoritos || 0, albumes: c.albumes || 0, seg_capas: c.seg_capas || 0,
      cod_snips: c.cod_snips || 0, cod_lineas: c.cod_lineas || 0, cod_langs: c.cod_langs || 0, cod_prev: c.cod_prev || 0, cod_copias: c.cod_copias || 0,
      db_bases: c.db_bases || 0, db_filas: c.db_filas || 0, db_columnas: c.db_columnas || 0, db_mov: c.db_mov || 0, db_hechas: c.db_hechas || 0,
      juegos: c.juegos || 0, j_jugados: c.j_jugados || 0, j_horas: c.j_horas || 0, j_resenas: c.j_resenas || 0, j_deseos: c.j_deseos || 0, j_completos: c.j_completos || 0,
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
        recreativa: s.tetris.partidas > 0 && arc(s).g2048.partidas > 0 && arc(s).breakout.partidas > 0,
        ficha2048: arc(s).g2048.ficha >= 2048, barrido: arc(s).breakout.mejorPerfectos >= 5,
        maestro: s.tetris.mejor >= 5000 && arc(s).g2048.mejor >= 5000 && arc(s).breakout.mejor >= 5000,
        cod_trio: !!c.cod_web, cod_larga: (c.cod_max || 0) >= 200,
        doble_cerradura: (c.seg_2fa || 0) > 0, huella: (c.seg_passkeys || 0) > 0, gran_album: (c.album_max || 0) >= 50,
        db_completa: (c.db_tipos || 0) >= 7, db_grande: (c.db_maxfilas || 0) >= 100,
        retro: (c.j_retro || 0) > 0, plataformas: (c.j_plataformas || 0) >= 5, sesion: (c.j_sesion || 0) >= 6,
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
    const picks = [elige('contenido'), elige('uso'), elige('arcade')];
    s.semana = {
      clave, base: Object.fromEntries(Object.keys(m).map(k => [k, m[k]])), mejorPartida: 0, mejorG: 0, mejorB: 0, bonus: false, hechos: [],
      retos: picks.map(r => ({ id: r[0], dif, objetivo: r[5][dif] })),
    };
  }
  function progresoReto(s, c, r) {
    const def = RETOS.find(x => x[0] === r.id);
    const m = metricas(s, c);
    const actual = def[4] === 't_semana' ? s.semana.mejorPartida : def[4] === 'g_semana' ? (s.semana.mejorG || 0) : def[4] === 'b_semana' ? (s.semana.mejorB || 0) : Math.max(0, m[def[4]] - (s.semana.base[def[4]] || 0));
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
      recuentos: Object.fromEntries(['archivos', 'fotos', 'notas', 'prompts', 'contactos', 'eventos', 'etiquetas', 'enlaces', 'juegos', 'bases', 'compra_prod', 'favoritos', 'albumes', 'cod_snips'].map(k => [k, c[k] || 0])),
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
      arcade: Object.fromEntries(Object.entries(arc(s)).map(([k, v]) => [k, { ...v, ultima: undefined, historial: v.historial.slice(-12).reverse() }])),
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

  // Resultado de una partida de 2048 o de Breakout (mismas reglas que el Tetris: tiempo mínimo entre partidas y topes por duración)
  const JUEGOS_ARCADE = {
    g2048: { durMax: 3600 },
    breakout: { durMax: 1800 },
  };
  router.post('/arcade/:juego', jsonPeq, async (req, res) => {
    try {
      const juego = String(req.params.juego);
      const def = JUEGOS_ARCADE[juego];
      if (!def) throw new HttpError(404, 'Juego desconocido');
      const b = req.body || {};
      const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
      const dur = num(b.duration, def.durMax), puntos = num(b.score, 5000000), poderes = num(b.powerups, 200);
      if (dur < 5) throw new HttpError(400, 'Partida demasiado corta para contar');
      if (puntos > 1500 * dur) throw new HttpError(400, 'Resultado no válido');
      let extra = {};
      if (juego === 'g2048') {
        const movs = num(b.moves, 100000), ficha = num(b.maxTile, 131072), fus = num(b.merges, 400000);
        if (movs < 1 || movs > dur * 14 + 5) throw new HttpError(400, 'Resultado no válido');
        if (puntos > 100 * (movs + 4) || fus > movs * 8) throw new HttpError(400, 'Resultado no válido');
        if (ficha < 2 || (ficha & (ficha - 1)) !== 0 || (ficha >= 256 && puntos < ficha / 2)) throw new HttpError(400, 'Resultado no válido');
        extra = { movs, ficha, fus };
      } else {
        const lad = num(b.bricks, 100000), niv = Math.max(1, num(b.level, 99)), perf = num(b.perfect, 99), racha = num(b.perfectRun, 99);
        if (lad > dur * 8 + 10 || niv > Math.floor(lad / 8) + 1 || perf > niv || racha > perf) throw new HttpError(400, 'Resultado no válido');
        extra = { lad, niv, perf, racha };
      }
      const fin = ['fin', 'abandono', 'victoria'].includes(b.ended) ? b.ended : 'fin';
      const dia = diaCliente(b.day) || new Date().toISOString().slice(0, 10);
      const c = await recuentos(req.user);
      const nuevos = []; let out; let record = false; let ganado;
      await updateJson(archivo(req.user), ESTADO_BASE, (s) => {
        const antes = nivelDe(s.xp);
        const t = arc(s)[juego];
        if (t.ultima && Date.now() - t.ultima < dur * 800) throw new HttpError(429, 'Demasiado rápido: espera a que termine la partida anterior');
        t.ultima = Date.now();
        record = puntos > t.mejor;
        t.partidas++; t.total += puntos; t.tiempo += dur; t.poderes += poderes; if (record) t.mejor = puntos;
        if (juego === 'g2048') {
          t.movs += extra.movs; t.fusiones += extra.fus; t.ficha = Math.max(t.ficha, extra.ficha); if (extra.ficha >= 2048) t.ganadas++;
        } else {
          t.ladrillos += extra.lad; t.niveles = Math.max(t.niveles, extra.niv); t.perfectos += extra.perf; t.mejorPerfectos = Math.max(t.mejorPerfectos, extra.racha);
        }
        t.historial.push({ at: Date.now(), score: puntos, dur, fin });
        if (t.historial.length > 40) t.historial.splice(0, t.historial.length - 40);
        prepararSemana(s, dia, c);
        if (juego === 'g2048') s.semana.mejorG = Math.max(s.semana.mejorG || 0, puntos); else s.semana.mejorB = Math.max(s.semana.mejorB || 0, puntos);
        const xp = Math.min(150, Math.floor(puntos / (juego === 'g2048' ? 150 : 200))) + 10;
        const monedas = Math.min(120, Math.floor(puntos / 500) + (juego === 'g2048' ? Math.floor(extra.ficha / 256) : Math.floor(extra.lad / 40)));
        const bonus = nivelDe(s.xp) >= 35 && b.bonusMonedas ? Math.round(monedas * 0.5) : 0;   // pasivo «Lluvia de monedas»
        s.xp += xp; s.monedas += monedas + bonus; s.monedasTotal += monedas + bonus;
        ganado = { xp, monedas: monedas + bonus };
        cierra(s, c, nuevos, antes, dia);
        out = vista(s, c);
      });
      if (registrarActividad) registrarActividad(req, juego, { score: puntos });
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

  // Los módulos avisan al cambiar su contenido para que los logros no esperen a que caduque la caché
  const invalida = (user) => { if (user && user.username) cacheContar.delete(user.username); };
  return { router, nivelDe, readJson, archivo, invalida };
}

module.exports = { createGame, nivelDe, xpAcumulada, rangoDe, semanaIso, COSMETICOS, FAMILIAS };
