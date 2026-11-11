'use strict';
/* Pagos · gráfico del gasto de un año: lo pagado cada mes (del historial) y lo que falta por pagar según los pagos activos. */
(function () {
  if (!window.K || !K.pagos) return;
  const P = K.pagos, S = P.S;
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const NF = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
  const corto = (n) => (n >= 10000 ? NF.format(Math.round(n / 1000)) + ' k' : NF.format(Math.round(n)));
  S.anio = S.anio || 0;

  // Gasto por mes del año `anio`: { pagado[12], previsto[12], categorias: Map nombre → total }
  P.gastoAnual = (anio, pagos) => {
    const pagado = Array(12).fill(0), previsto = Array(12).fill(0), cats = new Map();
    const suma = (cat, n) => cats.set(cat || 'Sin categoría', (cats.get(cat || 'Sin categoría') || 0) + n);
    const hoyMes = S.hoy ? Number(S.hoy.slice(0, 4)) * 12 + Number(S.hoy.slice(5, 7)) - 1 : 0;
    for (const p of pagos) {
      for (const h of (p.historial || [])) {
        if (String(h.fecha).slice(0, 4) !== String(anio) || !h.importe) continue;
        const m = Number(String(h.fecha).slice(5, 7)) - 1; pagado[m] += h.importe; suma(p.categoria, h.importe);
      }
      // Lo que falta: desde el próximo vencimiento, cada periodo, hasta fin de año (nunca en meses ya pasados)
      if (p.activo === false || !p.fechaProxima || !p.importe) continue;
      const meses = P.MESES[p.frecuencia]; let k = Number(p.fechaProxima.slice(0, 4)) * 12 + Number(p.fechaProxima.slice(5, 7)) - 1;
      for (let i = 0; i < 400 && k <= anio * 12 + 11; i++) {
        if (k >= anio * 12 && k >= hoyMes) { previsto[k - anio * 12] += p.importe; suma(p.categoria, p.importe); }
        if (!meses) break; k += meses;
      }
    }
    return { pagado, previsto, categorias: [...cats.entries()].sort((a, b) => b[1] - a[1]) };
  };

  P.graficoAnual = () => {
    const hoyAnio = S.hoy ? Number(S.hoy.slice(0, 4)) : new Date().getFullYear();
    if (!S.anio) S.anio = hoyAnio;
    const det = el('details', 'pg-grafico'); det.open = true;
    const sum = el('summary', null, 'Gasto del año'); det.appendChild(sum);
    const cuerpo = el('div', 'pg-graf-cuerpo'); det.appendChild(cuerpo);
    const dibuja = () => {
      cuerpo.textContent = '';
      const g = P.gastoAnual(S.anio, S.pagos);
      const totP = g.pagado.reduce((a, b) => a + b, 0), totF = g.previsto.reduce((a, b) => a + b, 0);
      const nav = el('div', 'pg-graf-nav');
      const ant = el('button', 'icon-btn', '‹'); ant.type = 'button'; ant.setAttribute('aria-label', 'Año anterior');
      const sig = el('button', 'icon-btn', '›'); sig.type = 'button'; sig.setAttribute('aria-label', 'Año siguiente');
      ant.addEventListener('click', () => { S.anio--; dibuja(); }); sig.addEventListener('click', () => { S.anio++; dibuja(); });
      nav.append(ant, el('b', null, String(S.anio)), sig);
      const tot = el('div', 'pg-graf-tot'); tot.append(
        el('span', null, `Pagado ${P.euros(totP)}`), el('span', 'prev', `Por pagar ${P.euros(totF)}`), el('b', null, `Total ${P.euros(totP + totF)}`));
      cuerpo.append(nav, tot);
      if (!totP && !totF) { cuerpo.appendChild(el('p', 'k-muted', 'Aún no hay pagos anotados ni previstos en este año. Al marcar un pago como pagado, aparecerá aquí.')); return; }
      const max = Math.max(1, ...g.pagado.map((v, i) => v + g.previsto[i]));
      const barras = el('div', 'pg-barras'); barras.setAttribute('role', 'img'); barras.setAttribute('aria-label', `Gasto mensual de ${S.anio}: pagado ${P.euros(totP)} y por pagar ${P.euros(totF)}`);
      g.pagado.forEach((v, i) => {
        const col = el('div', 'pg-bcol'); const t = v + g.previsto[i];
        col.title = `${MES[i]} ${S.anio}: pagado ${P.euros(v)}${g.previsto[i] ? ` · por pagar ${P.euros(g.previsto[i])}` : ''}`;
        col.appendChild(el('span', 'pg-bval', t ? corto(t) : ''));
        const pila = el('div', 'pg-bpila');
        const prev = el('i', 'prev'); prev.style.height = (100 * g.previsto[i] / max) + '%'; prev.hidden = !g.previsto[i];
        const pag = el('i', 'pag'); pag.style.height = (100 * v / max) + '%'; pag.hidden = !v;
        pila.append(prev, pag); col.append(pila, el('span', 'pg-bmes', MES[i])); barras.appendChild(col);
      });
      cuerpo.appendChild(barras);
      if (g.categorias.length) {
        const cs = el('div', 'pg-cats'); const cmax = g.categorias[0][1];
        g.categorias.slice(0, 6).forEach(([n, v]) => { const f = el('div', 'pg-cat'); const b = el('i'); b.style.width = (100 * v / cmax) + '%'; f.append(el('span', null, n), el('div', 'pg-cat-b', ''), el('b', null, P.euros(v))); f.querySelector('.pg-cat-b').appendChild(b); cs.appendChild(f); });
        cuerpo.append(el('h4', null, 'Por categoría'), cs);
      }
    };
    dibuja(); return det;
  };
})();
