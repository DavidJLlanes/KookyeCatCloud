'use strict';
// Retos semanales y sus recompensas.
// [id, grupo, icono, texto, métrica, objetivos por dificultad]
const RETOS = [
  ['notas', 'contenido', 'notes', 'Escribe {n} notas', 'notas', [2, 4, 8]],
  ['portapapeles', 'contenido', 'clip', 'Guarda {n} elementos en el portapapeles', 'clip_envios', [2, 4, 8]],
  ['mudanzas', 'contenido', 'arrow', 'Haz {n} envío(s) entre secciones', 'mud_envios', [1, 3, 5]],
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
  ['cod_snips', 'contenido', 'anvil', 'Crea {n} proyectos de código', 'cod_snips', [1, 3, 6]],
  ['val_total', 'contenido', 'labels', 'Guarda {n} valores reutilizables', 'val_total', [3, 8, 20]],
  ['db_filas', 'contenido', 'books', 'Añade {n} filas a tus bases', 'db_filas', [3, 10, 25]],
  ['db_calc', 'contenido', 'wizard', 'Crea {n} columnas de fórmula o de resumen', 'db_calc', [1, 2, 4]],
  ['db_mov', 'contenido', 'cycle', 'Mueve {n} tarjetas en un tablero', 'db_mov', [3, 8, 15]],
  ['pg_pagados', 'contenido', 'coins', 'Marca {n} pagos como pagados', 'pg_pagados', [1, 2, 4]],
  ['push_avisos', 'contenido', 'lantern', 'Recibe {n} avisos push', 'push_avisos', [1, 3, 6]],
  ['rc_total', 'contenido', 'lantern', 'Crea {n} recordatorios', 'rc_total', [2, 5, 10]],
  ['rc_hechos', 'contenido', 'laurels', 'Completa {n} recordatorios', 'rc_hechos', [2, 5, 10]],
  ['mk_total', 'contenido', 'star', 'Guarda {n} marcadores web', 'mk_total', [2, 5, 10]],
  ['mk_visitas', 'contenido', 'globe', 'Abre {n} marcadores', 'mk_visitas', [5, 15, 30]],
  ['j_nuevos', 'contenido', 'archive', 'Añade {n} juegos a tu colección', 'juegos', [1, 3, 6]],
  ['j_horas', 'contenido', 'stopwatch', 'Registra {n} horas jugadas', 'j_horas', [2, 6, 15]],
];
const RECOMPENSA_RETO = [{ xp: 120, monedas: 15 }, { xp: 180, monedas: 30 }, { xp: 260, monedas: 50 }];
const BONUS_SEMANA = { xp: 300, monedas: 100 };

module.exports = { RETOS, RECOMPENSA_RETO, BONUS_SEMANA };
