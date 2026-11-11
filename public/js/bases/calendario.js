'use strict';
/* Bases · vista de calendario: un mes con las filas que tienen fecha en la columna elegida, y el detalle del día que se pulsa. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${p2(m + 1)}-${p2(d)}`;
  const hoyTxt = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // Color de una fila: el de la primera columna de selección con valor (así el tablero y el calendario se ven igual)
  B.colorFila = (r) => { for (const c of S.base.columns) if (c.tipo === 'select' && r.c[c.id]) { const o = B.opcion(c, r.c[c.id]); if (o) return o.color; } return ''; };
  const pill = (r, txt) => { const x = el('span', 'bs-pill', txt); const c = B.colorFila(r); if (c) x.style.setProperty('--o', c); return x; };

  B.pintaCalendario = (cont, v) => {
    const fc = B.col(v.fecha);
    if (!fc) { cont.appendChild(el('p', 'k-muted bs-vacio', 'El calendario necesita una columna de tipo «Fecha». Añádela en «Columnas» y elígela en «Vista».')); return; }
    const filas = B.filas(v); const porDia = new Map(); const sin = [];
    filas.forEach(r => { const d = r.c[fc.id]; if (d) { if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(r); } else sin.push(r); });
    if (!S.mes) { const h = new Date(); S.mes = { y: h.getFullYear(), m: h.getMonth() }; if (!S.dia) S.dia = hoyTxt(); }
    const { y, m } = S.mes; const mueveMes = (n) => { const d = new Date(y, m + n, 1); S.mes = { y: d.getFullYear(), m: d.getMonth() }; S.dia = ''; B.repinta(); };
    const nav = el('div', 'bs-cal-nav'); const tit = el('strong', null, `${MESES[m]} ${y}`);
    const bPrev = B.btn('‹', null, () => mueveMes(-1), 'btn sm'), bNext = B.btn('›', null, () => mueveMes(1), 'btn sm');
    bPrev.setAttribute('aria-label', 'Mes anterior'); bNext.setAttribute('aria-label', 'Mes siguiente');
    nav.append(bPrev, tit, bNext, B.btn('Hoy', null, () => { const h = new Date(); S.mes = { y: h.getFullYear(), m: h.getMonth() }; S.dia = hoyTxt(); B.repinta(); }, 'btn sm'));
    cont.appendChild(nav);
    const rej = el('div', 'bs-cal'); DIAS.forEach(d => rej.appendChild(el('div', 'bs-cal-dh', d)));
    const desfase = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), total = Math.ceil((desfase + dim) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const dn = i - desfase + 1; const celda = el('button', 'bs-cal-d'); celda.type = 'button';
      if (dn < 1 || dn > dim) { celda.classList.add('fuera'); celda.disabled = true; rej.appendChild(celda); continue; }
      const f = ymd(y, m, dn), rs = porDia.get(f) || [];
      celda.classList.toggle('hoy', f === hoyTxt()); celda.classList.toggle('sel', f === S.dia); celda.setAttribute('aria-label', `${dn} de ${MESES[m]}: ${rs.length} fila${rs.length === 1 ? '' : 's'}`);
      celda.appendChild(el('span', 'bs-cal-n', String(dn)));
      const pills = el('div', 'bs-pills'); rs.slice(0, 3).forEach(r => pills.appendChild(pill(r, B.titulo(r)))); if (rs.length > 3) pills.appendChild(el('span', 'bs-mas', `+${rs.length - 3}`)); celda.appendChild(pills);
      celda.addEventListener('click', () => { S.dia = f === S.dia ? '' : f; B.repinta(); });
      rej.appendChild(celda);
    }
    cont.appendChild(rej);
    if (S.dia) {
      const rs = porDia.get(S.dia) || []; const det = el('section', 'bs-cal-det');
      det.appendChild(el('h3', null, B.fechaTxt(S.dia)));
      rs.forEach(r => { const a = el('article', 'bs-tarjeta'); a.tabIndex = 0; a.appendChild(el('strong', null, B.titulo(r))); const meta = B.metaFila(r, v, [fc.id]); if (meta.childNodes.length) a.appendChild(meta); a.addEventListener('click', () => B.editaFila(r)); a.addEventListener('keydown', e => { if (e.key === 'Enter') B.editaFila(r); }); det.appendChild(a); });
      if (!rs.length) det.appendChild(el('p', 'k-muted', 'Nada este día.'));
      det.appendChild(B.btn('Añadir aquí', 'i-plus', async () => { const r = await B.nuevaFila({ [fc.id]: S.dia }); if (r) B.editaFila(r); }, 'btn'));
      cont.appendChild(det);
    }
    if (sin.length) { const d = el('details', 'bs-sinfecha'); d.appendChild(el('summary', null, `Sin fecha (${sin.length})`)); sin.forEach(r => { const a = el('button', 'bs-fila-ar', B.titulo(r)); a.type = 'button'; a.addEventListener('click', () => B.editaFila(r)); d.appendChild(a); }); cont.appendChild(d); }
  };
  B.pillFila = pill;
})();
