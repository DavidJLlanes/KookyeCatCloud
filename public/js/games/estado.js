'use strict';
/* games/estado.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const pinta = (...a) => C.pinta(...a);

  const root = document.getElementById('view-games');
  if (!root || !window.K) return;
  const ESTADOS = [
    ['proximo', 'Próximos', 'Aún no han salido'],
    ['deseado', 'Deseados', 'Lista de deseos'],
    ['pendiente', 'Pendientes', 'Backlog: comprados sin jugar'],
    ['jugando', 'Jugando', 'En marcha'],
    ['jugado', 'Jugados', 'Terminados'],
    ['abandonado', 'Abandonados', 'Dejados a medias'],
  ];
  const NOMBRE = Object.fromEntries(ESTADOS.map(e => [e[0], e[1]]));
  const S = { items: [], rawg: false, tab: 'jugando', q: '', genero: '', plataforma: '', estudio: '', saga: '', tienda: '', etiqueta: '', orden: 'reciente', stats: false, built: false, loading: null };
  try { Object.assign(S, JSON.parse(localStorage.getItem('kcc-games-ui') || '{}'), { q: '', stats: false }); } catch { /* sin preferencias */ }
  const guarda = () => { try { localStorage.setItem('kcc-games-ui', JSON.stringify({ tab: S.tab, orden: S.orden })); } catch { /* ignorar */ } };
  const portada = g => `${BASE}/api/games/${g.id}/cover?v=${g.coverV || 0}`;
  const nf = n => (Math.round(Number(n) * 10) / 10).toString().replace('.', ',');
  const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  // Valores sin variantes repetidas (una entrada por clave) para los selectores
  const unicos = f => { const m = new Map(); S.items.flatMap(f).forEach(v => { const k = K.valores.clave(v); if (k && !m.has(k)) m.set(k, v); }); return [...m.values()].sort((a, b) => a.localeCompare(b, 'es')); };
  const igual = (a, b) => K.valores.clave(a) === K.valores.clave(b);
  // Filtros que se activan desde un valor: propiedad del juego → filtro de la vista
  const FILTROS = { platforms: ['plataforma', 'Plataforma'], genres: ['genero', 'Género'], developer: ['estudio', 'Estudio'], series: ['saga', 'Saga'], store: ['tienda', 'Tienda'], tags: ['etiqueta', 'Etiqueta'] };
  const coincide = (g) => (!S.genero || (g.genres || []).some(x => igual(x, S.genero)))
    && (!S.plataforma || (g.platforms || []).some(x => igual(x, S.plataforma)))
    && (!S.estudio || igual(g.developer, S.estudio)) && (!S.saga || igual(g.series, S.saga)) && (!S.tienda || igual(g.store, S.tienda))
    && (!S.etiqueta || (g.tags || []).some(x => igual(x, S.etiqueta)));
  // Chips que filtran, en línea separados por comas
  const chips = (campo, vals, cls) => { const w = el('span', 'gms-chips ' + (cls || '')); (vals || []).forEach(v => w.appendChild(K.chipValor(campo, v))); return w; };
  const fechaTxt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };

  async function load() {
    if (S.loading) return S.loading;
    S.loading = K.get('/api/games').then(d => { S.items = d.items || []; S.rawg = !!d.rawg; S.built = true; pinta(); }).catch(K.fail).finally(() => { S.loading = null; });
    return S.loading;
  }
  // Tras cambiar algo se refrescan los logros (el servidor recalcula con los nuevos recuentos)
  const logros = () => { if (K.game && K.game.load) K.game.load(); K.bus.emit('calendar'); };
  async function guardar(fn) { try { const r = await fn(); await load(); logros(); return r; } catch (e) { K.fail(e); return null; } }


  Object.assign(C, { root, ESTADOS, NOMBRE, S, guarda, portada, nf, eur, lista, unicos, igual, FILTROS, coincide, chips, fechaTxt, btn, load, logros, guardar });
})();
