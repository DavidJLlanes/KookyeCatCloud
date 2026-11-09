'use strict';
/* Paquetes de sonidos de la interfaz. Cada evento es una lista de notas sintetizadas con Web Audio (no hay archivos):
   f = frecuencia (Hz), d = duración (s), g = volumen relativo (0-1), at = retraso (s), glide = frecuencia final (deslizamiento).
   Los volúmenes son bajos a propósito: lo normal es que casi no se noten. */
(function () {
  if (!window.K) return;
  const GRUPO = { toque: 'ui', tab: 'ui', tic: 'ui', abrir: 'ui', borrar: 'ui', ok: 'avisos', aviso: 'avisos', error: 'avisos', logro: 'logros' };

  const PAQUETES = {
    suave: {
      nombre: 'Suave', desc: 'Tonos redondos y discretos', onda: 'sine',
      eventos: {
        toque: [{ f: 520, d: 0.06, g: 0.5 }], tab: [{ f: 440, d: 0.05, g: 0.35 }], tic: [{ f: 660, d: 0.05, g: 0.4 }],
        abrir: [{ f: 392, d: 0.07, g: 0.3 }], borrar: [{ f: 300, d: 0.14, g: 0.45, glide: 200 }],
        ok: [{ f: 523, d: 0.09, g: 0.5 }, { f: 659, d: 0.13, g: 0.5, at: 0.07 }],
        aviso: [{ f: 587, d: 0.1, g: 0.5 }, { f: 440, d: 0.14, g: 0.45, at: 0.08 }],
        error: [{ f: 196, d: 0.16, g: 0.6, onda: 'triangle' }, { f: 165, d: 0.22, g: 0.6, at: 0.1, onda: 'triangle' }],
        logro: [{ f: 523, d: 0.12, g: 0.5 }, { f: 659, d: 0.12, g: 0.5, at: 0.1 }, { f: 784, d: 0.12, g: 0.5, at: 0.2 }, { f: 1047, d: 0.32, g: 0.5, at: 0.3 }],
      },
    },
    cristal: {
      nombre: 'Cristal', desc: 'Campanitas claras y breves', onda: 'sine', campana: true,
      eventos: {
        toque: [{ f: 1175, d: 0.1, g: 0.4 }], tab: [{ f: 988, d: 0.08, g: 0.3 }], tic: [{ f: 1319, d: 0.08, g: 0.32 }],
        abrir: [{ f: 880, d: 0.1, g: 0.28 }], borrar: [{ f: 740, d: 0.16, g: 0.35, glide: 554 }],
        ok: [{ f: 1047, d: 0.12, g: 0.4 }, { f: 1319, d: 0.18, g: 0.4, at: 0.09 }],
        aviso: [{ f: 1175, d: 0.14, g: 0.4 }, { f: 880, d: 0.2, g: 0.36, at: 0.1 }],
        error: [{ f: 392, d: 0.2, g: 0.5 }, { f: 311, d: 0.28, g: 0.5, at: 0.12 }],
        logro: [{ f: 1047, d: 0.16, g: 0.4 }, { f: 1319, d: 0.16, g: 0.4, at: 0.1 }, { f: 1568, d: 0.16, g: 0.4, at: 0.2 }, { f: 2093, d: 0.4, g: 0.4, at: 0.3 }],
      },
    },
    madera: {
      nombre: 'Madera', desc: 'Golpecitos secos y cálidos', onda: 'triangle',
      eventos: {
        toque: [{ f: 260, d: 0.05, g: 0.7, glide: 170 }], tab: [{ f: 220, d: 0.04, g: 0.5, glide: 150 }], tic: [{ f: 330, d: 0.04, g: 0.55, glide: 220 }],
        abrir: [{ f: 196, d: 0.06, g: 0.5, glide: 150 }], borrar: [{ f: 180, d: 0.12, g: 0.7, glide: 90 }],
        ok: [{ f: 294, d: 0.06, g: 0.65, glide: 200 }, { f: 392, d: 0.08, g: 0.65, at: 0.08, glide: 270 }],
        aviso: [{ f: 349, d: 0.07, g: 0.65, glide: 240 }, { f: 262, d: 0.1, g: 0.6, at: 0.09, glide: 170 }],
        error: [{ f: 150, d: 0.12, g: 0.8, glide: 90 }, { f: 130, d: 0.16, g: 0.8, at: 0.1, glide: 80 }],
        logro: [{ f: 294, d: 0.08, g: 0.65, glide: 200 }, { f: 370, d: 0.08, g: 0.65, at: 0.1, glide: 250 }, { f: 440, d: 0.08, g: 0.65, at: 0.2, glide: 300 }, { f: 587, d: 0.22, g: 0.65, at: 0.3, glide: 400 }],
      },
    },
    burbuja: {
      nombre: 'Burbuja', desc: 'Pop suaves que suben de tono', onda: 'sine',
      eventos: {
        toque: [{ f: 400, d: 0.07, g: 0.5, glide: 620 }], tab: [{ f: 350, d: 0.06, g: 0.35, glide: 480 }], tic: [{ f: 500, d: 0.06, g: 0.4, glide: 700 }],
        abrir: [{ f: 300, d: 0.08, g: 0.3, glide: 450 }], borrar: [{ f: 600, d: 0.14, g: 0.45, glide: 260 }],
        ok: [{ f: 420, d: 0.08, g: 0.5, glide: 640 }, { f: 560, d: 0.1, g: 0.5, at: 0.08, glide: 860 }],
        aviso: [{ f: 520, d: 0.09, g: 0.5, glide: 760 }, { f: 400, d: 0.12, g: 0.45, at: 0.1, glide: 560 }],
        error: [{ f: 260, d: 0.16, g: 0.6, glide: 170 }, { f: 220, d: 0.2, g: 0.6, at: 0.12, glide: 140 }],
        logro: [{ f: 400, d: 0.1, g: 0.5, glide: 600 }, { f: 520, d: 0.1, g: 0.5, at: 0.1, glide: 780 }, { f: 660, d: 0.1, g: 0.5, at: 0.2, glide: 990 }, { f: 880, d: 0.28, g: 0.5, at: 0.3, glide: 1300 }],
      },
    },
  };

  K.sonidos = Object.assign(K.sonidos || {}, { PAQUETES, GRUPO });
})();
