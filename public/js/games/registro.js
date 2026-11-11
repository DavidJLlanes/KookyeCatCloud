'use strict';
/* games/registro.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { ESTADOS, FILTROS, S } = C;
  const coincide = (...a) => C.coincide(...a);
  const ficha = (...a) => C.ficha(...a);
  const guarda = (...a) => C.guarda(...a);
  const load = (...a) => C.load(...a);
  const pinta = (...a) => C.pinta(...a);

  /* ---------- Integración ---------- */
  // Un chip de plataforma, género, estudio, saga, tienda o etiqueta de cualquier parte filtra la colección
  K.filtros.games = (prop, valor) => {
    const fl = FILTROS[prop]; if (!fl) return;
    switchTab('games');
    load().then(() => {
      Object.assign(S, { q: '', genero: '', plataforma: '', estudio: '', saga: '', tienda: '', etiqueta: '', stats: false });
      S[fl[0]] = valor;
      const n = (k) => S.items.filter(g => g.status === k && coincide(g)).length;
      if (!n(S.tab)) { const t = ESTADOS.find(e => n(e[0])); if (t) S.tab = t[0]; }
      guarda(); pinta();
    });
  };
  K.openers.game = id => { switchTab('games'); load().then(() => ficha(id)); };
  K.srcIcon.game = 'i-gamepad'; K.srcName.game = 'Juego';
  K.bus.on('games', () => { if (S.built) load(); });
  K.registerView('games', { open() { load(); }, close() {} });

  Object.assign(C, {  });
})();
