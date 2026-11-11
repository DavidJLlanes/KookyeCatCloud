'use strict';
/* Bases · línea de tiempo: una barra por fila entre su fecha de inicio y la de fin (o un punto si solo tiene una fecha). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const DIA_MS = 86400000, ESCALAS = [3, 6, 12, 24, 48];
  const ms = (d) => Date.parse(d + 'T00:00:00Z');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  B.pintaLinea = (cont, v) => {
    const fi = B.col(v.fecha), ff = B.col(v.fechaFin);
    if (!fi) { cont.appendChild(el('p', 'k-muted bs-vacio', 'La línea de tiempo necesita una columna de tipo «Fecha». Añádela en «Columnas» y elígela en «Vista».')); return; }
    const filas = B.filas(v); const con = [], sin = [];
    filas.forEach(r => { const a = r.c[fi.id]; if (!a) { sin.push(r); return; } let b = ff ? r.c[ff.id] : ''; if (!b || b < a) b = a; con.push({ r, a, b }); });
    con.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : 0));
    let esc = S.escala = S.escala || 12;
    const barra = el('div', 'bs-linea-barra');
    const zoom = (n) => { const i = Math.max(0, Math.min(ESCALAS.length - 1, ESCALAS.indexOf(S.escala) + n)); S.escala = ESCALAS[i]; B.repinta(); };
    const mas = B.btn('+', null, () => zoom(1), 'btn sm'), menos = B.btn('−', null, () => zoom(-1), 'btn sm'); mas.setAttribute('aria-label', 'Acercar'); menos.setAttribute('aria-label', 'Alejar');
    barra.append(el('span', 'k-muted', 'Zoom'), menos, mas); cont.appendChild(barra);
    if (con.length) {
      const hoy = ms(new Date().toISOString().slice(0, 10));
      let ini = Math.min(ms(con[0].a), hoy) - 7 * DIA_MS, fin = Math.max(...con.map(x => ms(x.b)), hoy) + 21 * DIA_MS;
      if (fin - ini < 60 * DIA_MS) fin = ini + 60 * DIA_MS;      // siempre se ve un par de meses, aunque todo caiga en pocos días
      while (esc > ESCALAS[0] && (fin - ini) / DIA_MS * esc > 20000) esc = ESCALAS[ESCALAS.indexOf(esc) - 1];   // nunca más ancho de lo que el navegador dibuja bien
      const ancho = Math.ceil((fin - ini) / DIA_MS) * esc; const x = (t) => Math.round((t - ini) / DIA_MS * esc);
      const wrap = el('div', 'bs-linea'); const lienzo = el('div', 'bs-linea-in'); lienzo.style.width = ancho + 'px';
      const meses = el('div', 'bs-linea-meses');
      for (let d = new Date(ini); d.getTime() < fin; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) { const m = el('span', null, `${MES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`); m.style.left = Math.max(0, x(d.getTime())) + 'px'; meses.appendChild(m); }
      lienzo.appendChild(meses);
      const l = el('div', 'bs-linea-hoy'); l.style.left = x(hoy) + 'px'; l.title = 'Hoy'; lienzo.appendChild(l);
      con.forEach(({ r, a, b }) => {
        const fila = el('div', 'bs-linea-fila'); const bar = el('button', 'bs-barra'); bar.type = 'button';
        const w = Math.max(14, x(ms(b) + DIA_MS) - x(ms(a))); bar.style.left = x(ms(a)) + 'px'; bar.style.width = w + 'px';
        const col = B.colorFila(r); if (col) bar.style.setProperty('--o', col);
        bar.append(el('span', null, B.titulo(r))); if (w < 110) bar.classList.add('corta');   // las barras cortas llevan el título a su derecha bar.title = `${B.titulo(r)} · ${B.fechaTxt(a)}${b !== a ? ' → ' + B.fechaTxt(b) : ''}`;
        bar.addEventListener('click', () => B.editaFila(r)); fila.appendChild(bar); lienzo.appendChild(fila);
      });
      wrap.appendChild(lienzo); cont.appendChild(wrap);
      setTimeout(() => { wrap.scrollLeft = Math.max(0, x(hoy) - wrap.clientWidth / 3); }, 0);
    } else cont.appendChild(el('p', 'k-muted bs-vacio', S.base.rows.length ? 'Ninguna fila tiene fecha todavía.' : 'Aún no hay filas.'));
    if (sin.length) { const d = el('details', 'bs-sinfecha'); d.appendChild(el('summary', null, `Sin fecha (${sin.length})`)); sin.forEach(r => { const a = el('button', 'bs-fila-ar', B.titulo(r)); a.type = 'button'; a.addEventListener('click', () => B.editaFila(r)); d.appendChild(a); }); cont.appendChild(d); }
    cont.appendChild(B.btn('Nueva fila', 'i-plus', async () => { const r = await B.nuevaFila(); if (r) B.editaFila(r); }, 'btn bs-nueva'));
  };
})();
