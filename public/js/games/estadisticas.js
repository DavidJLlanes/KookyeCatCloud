'use strict';
/* games/estadisticas.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { S } = C;
  const eur = (...a) => C.eur(...a);
  const nf = (...a) => C.nf(...a);

  /* ---------- Estadísticas ---------- */
  function resumenStats() {
    const it = S.items, jug = it.filter(g => g.status === 'jugado');
    const notas = it.filter(g => g.rating != null);
    const horas = it.reduce((a, g) => a + (g.hours || 0), 0);
    const gasto = it.reduce((a, g) => a + (g.price || 0), 0);
    const porGenero = {}; it.forEach(g => (g.genres || []).forEach(x => { porGenero[x] = (porGenero[x] || 0) + (g.hours || 0); }));
    const porAno = {}; jug.forEach(g => { const y = (g.finished || '').slice(0, 4); if (y) porAno[y] = (porAno[y] || 0) + 1; });
    const horasAno = {}; it.forEach(g => (g.sessions || []).forEach(s => { const y = String(s.d || s.date || '').slice(0, 4); if (y) horasAno[y] = (horasAno[y] || 0) + (s.h || 0); }));
    return {
      total: it.length, jugados: jug.length, horas, gasto, backlog: it.filter(g => g.status === 'pendiente').length,
      media: notas.length ? notas.reduce((a, g) => a + g.rating, 0) / notas.length : null,
      euroHora: gasto && horas ? gasto / horas : null,
      generos: Object.entries(porGenero).sort((a, b) => b[1] - a[1]), porAno, horasAno,
      top: [...notas].sort((a, b) => b.rating - a.rating || (b.hours || 0) - (a.hours || 0)).slice(0, 5),
    };
  }
  function barras(datos, fmt = x => nf(x)) {
    const w = el('div', 'gms-bars'); const max = Math.max(1, ...datos.map(d => d[1]));
    datos.forEach(([n, v]) => { const r = el('div', 'gms-bar-r'); const b = el('span', 'gms-bar-b'); b.style.width = Math.max(3, v / max * 100) + '%'; r.append(el('span', 'gms-bar-n', n), b, el('span', 'gms-bar-v', fmt(v))); w.appendChild(r); });
    return w;
  }
  function panelStats() {
    const s = resumenStats(), w = el('div', 'gms-stats');
    const kpis = el('div', 'gms-kpis');
    [['Juegos', s.total], ['Jugados', s.jugados], ['Horas', nf(s.horas)], ['Nota media', s.media != null ? nf(s.media) : '–'], ['Backlog', s.backlog], ['Gasto', s.gasto ? eur(s.gasto) : '–'], ['€ por hora', s.euroHora != null ? eur(s.euroHora) : '–']].forEach(([n, v]) => {
      const k = el('div', 'gms-kpi'); k.append(el('strong', null, String(v)), el('small', 'k-muted', n)); kpis.appendChild(k);
    });
    w.appendChild(kpis);
    const bloque = (t, nodo) => { const b = el('section', 'gms-block'); b.append(el('h3', null, t), nodo); w.appendChild(b); };
    if (s.generos.length) bloque('Horas por género', barras(s.generos.slice(0, 8), v => nf(v) + ' h'));
    const anos = Object.entries(s.porAno).sort(); if (anos.length) bloque('Jugados por año', barras(anos, v => String(v)));
    const hAnos = Object.entries(s.horasAno).sort(); if (hAnos.length) bloque('Horas registradas por año', barras(hAnos, v => nf(v) + ' h'));
    if (s.top.length) bloque('Mejor valorados', barras(s.top.map(g => [g.title, g.rating]), v => '★ ' + nf(v)));
    if (!s.total) w.appendChild(el('p', 'k-muted', 'Añade juegos para ver tus estadísticas.'));
    return w;
  }


  Object.assign(C, { resumenStats, barras, panelStats });
})();
