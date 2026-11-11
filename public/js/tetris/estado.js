'use strict';
/* tetris/estado.js: parte del módulo (se carga con el resto de tetris/ en index.html). Comparte el espacio K._tetris. */
(function () {
  if (!window.K || !K.game) return;
  const C = (K._tetris = K._tetris || {});

  if (!window.K || !K.game) return; const EST = {};
  const G = K.game;
  const COLS = 10, ROWS = 22, HID = 2;                 // las 2 primeras filas están ocultas (por ahí aparecen las piezas)
  const TIPOS = 'IOTSZJL';
  const FORMAS = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const LADO = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  const ROT = {};
  for (const t of TIPOS) {
    ROT[t] = [FORMAS[t]];
    for (let r = 1; r < 4; r++) ROT[t].push(t === 'O' ? FORMAS[t] : ROT[t][r - 1].map(([x, y]) => [LADO[t] - 1 - y, x]));
  }
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -2]];
  const SEGUNDOS = 180;

  // Potenciadores activos (gastan energía, que se carga limpiando líneas) y pasivos (siempre activos). Se desbloquean por nivel.
  const PODERES = [
    { id: 'limpieza', nombre: 'Limpieza', icono: 'bomb', nivel: 3, coste: 2, txt: 'Elimina las 2 filas de abajo' },
    { id: 'congelar', nombre: 'Congelar', icono: 'snow', nivel: 5, coste: 1, txt: 'Detiene la caída 6 segundos' },
    { id: 'tiempo', nombre: '+15 s', icono: 'hourglass', nivel: 8, coste: 2, txt: 'Añade 15 segundos al reloj' },
    { id: 'comodin', nombre: 'Barra', icono: 'cube', nivel: 10, coste: 1, txt: 'La siguiente pieza será la barra larga' },
    { id: 'doble', nombre: 'Puntos x2', icono: 'star', nivel: 15, coste: 2, txt: 'Doble puntuación durante 10 segundos' },
    { id: 'deshacer', nombre: 'Deshacer', icono: 'cycle', nivel: 20, coste: 3, txt: 'Devuelve la última pieza colocada' },
    { id: 'rayo', nombre: 'Rayo', icono: 'lightning', nivel: 25, coste: 2, txt: 'Borra la columna más alta' },
  ];
  const PASIVOS = [
    { id: 'reloj', nombre: 'Reloj de arena', icono: 'sands', nivel: 4, txt: '+10 s al empezar' },
    { id: 'cargador', nombre: 'Cargador rápido', icono: 'cog', nivel: 7, txt: 'Energía cada 4 líneas en vez de 5' },
    { id: 'combo', nombre: 'Maestro del combo', icono: 'fireray', nivel: 11, txt: 'Los combos puntúan un 50 % más' },
    { id: 'aire', nombre: 'Segundo aire', icono: 'heart', nivel: 16, txt: 'Una vez por partida, si te quedas sin sitio se limpian 8 filas' },
    { id: 'oro', nombre: 'Reloj de oro', icono: 'gem', nivel: 22, txt: '+20 s al empezar' },
    { id: 'tetrisx', nombre: 'Golpe cuádruple', icono: 'swords', nivel: 28, txt: 'Los Tetris puntúan un 50 % más' },
    { id: 'monedas', nombre: 'Lluvia de monedas', icono: 'purse', nivel: 35, txt: '+50 % de monedas al terminar' },
  ];

  const S = { built: false, abierta: false };
  const R = {};
  Object.assign(EST, { g: null });                 // partida en curso (o la última terminada)
  Object.assign(EST, { raf: 0, ultimo: 0, celda: 24 });
  const nivelJugador = () => (G.state ? G.state.nivel : 1);


  Object.assign(C, { EST, G, COLS, ROWS, HID, TIPOS, FORMAS, LADO, ROT, KICKS, SEGUNDOS, PODERES, PASIVOS, S, R, nivelJugador });
})();
