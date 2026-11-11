'use strict';
/* Bases · celdas de la tabla: una por tipo de columna (texto, número, fecha, casilla, selección, etiquetas, enlace, correo,
   teléfono, archivo, relación y las calculadas —fórmula y resumen—, que son de solo lectura). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases;
  const ENLACE = { url: ['↗', 'Abrir enlace', (v) => v], email: ['✉', 'Escribir un correo', (v) => 'mailto:' + v], phone: ['☎', 'Llamar', (v) => 'tel:' + String(v).replace(/[^\d+]/g, '')] };

  const entrada = (c, v, tipo, r) => {
    const i = el('input'); i.type = tipo; i.value = v || ''; i.setAttribute('aria-label', c.nombre);
    i.addEventListener('change', () => B.guardaCelda(r, c, i.value)); return i;
  };
  const enlace = (c, v) => { const [txt, titulo, href] = ENLACE[c.tipo]; const a = el('a', 'bs-ext', txt); a.href = href(v); a.title = titulo; if (c.tipo === 'url') { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };

  function celdaCalculada(r, c, td) {
    td.classList.add('bs-calc');
    const err = B.error(r, c);
    if (err) { td.appendChild(el('span', 'bs-err', err.e)); td.title = err.m; } else { td.appendChild(el('span', 'bs-calc-v', B.texto(r, c))); td.title = c.tipo === 'formula' ? 'Resultado de la fórmula' : 'Resumen de las filas enlazadas'; }
  }
  function celdaRelacion(r, c, td) {
    const b = el('button', 'bs-multi'); b.type = 'button'; b.setAttribute('aria-label', c.nombre);
    const items = (r.f || {})[c.id] || [];
    if (!items.length) b.appendChild(el('span', 'k-faint', '—')); items.forEach(x => b.appendChild(B.chipTexto(x.t)));
    b.addEventListener('click', () => B.eligeFilas(c, r.c[c.id] || [], async (ids) => { await B.guardaCelda(r, c, ids); B.repinta(); }));
    td.appendChild(b);
  }
  function celdaArchivo(r, c, td) {
    const v = r.c[c.id]; const b = el('button', 'bs-multi'); b.type = 'button'; b.setAttribute('aria-label', c.nombre);
    b.appendChild(v ? el('span', 'bs-archivo', '📎 ' + v.split('/').pop()) : el('span', 'k-faint', 'Elegir archivo…')); if (v) b.title = v;
    b.addEventListener('click', () => B.eligeArchivo(v, async (p) => { await B.guardaCelda(r, c, p); B.repinta(); }));
    td.appendChild(b);
    if (v) { const a = el('a', 'bs-ext', '↗'); a.href = '#'; a.title = 'Ver en Archivos'; a.addEventListener('click', (e) => { e.preventDefault(); K.open('file', v); }); td.appendChild(a); }
  }

  B.celda = (r, c) => {
    const v = r.c[c.id]; const td = el('td'); td.dataset.t = c.tipo; td.dataset.cid = c.id;
    if (B.esCalc(c)) celdaCalculada(r, c, td);
    else if (c.tipo === 'relation') celdaRelacion(r, c, td);
    else if (c.tipo === 'file') celdaArchivo(r, c, td);
    else if (c.tipo === 'text' || c.tipo === 'url' || c.tipo === 'email' || c.tipo === 'phone') {
      const i = entrada(c, v, c.tipo === 'text' ? 'text' : c.tipo === 'phone' ? 'tel' : c.tipo, r); if (c.tipo === 'url') i.placeholder = 'https://…';
      td.appendChild(i); if (ENLACE[c.tipo] && v) td.appendChild(enlace(c, v));
    } else if (c.tipo === 'number') {
      const i = el('input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal'; i.value = v === null || v === undefined ? '' : v; i.setAttribute('aria-label', c.nombre); i.addEventListener('change', () => B.guardaCelda(r, c, i.value === '' ? null : Number(i.value))); td.appendChild(i);
    } else if (c.tipo === 'date') {
      td.appendChild(entrada(c, v, 'date', r));
    } else if (c.tipo === 'checkbox') {
      const i = el('input'); i.type = 'checkbox'; i.checked = v === true; i.setAttribute('aria-label', c.nombre); i.addEventListener('change', () => B.guardaCelda(r, c, i.checked)); td.appendChild(i); td.classList.add('centro');
    } else if (c.tipo === 'select') {
      const s = el('select'); s.setAttribute('aria-label', c.nombre); const o0 = el('option', null, '—'); o0.value = ''; s.appendChild(o0);
      (c.opciones || []).forEach(o => { const x = el('option', null, o.nombre); x.value = o.id; s.appendChild(x); }); s.value = v || '';
      const pinta2 = () => { const o = B.opcion(c, s.value); if (o) s.style.setProperty('--o', o.color); else s.style.removeProperty('--o'); s.classList.toggle('con', !!o); };
      pinta2(); s.addEventListener('change', () => { pinta2(); B.guardaCelda(r, c, s.value); }); td.appendChild(s);
    } else if (c.tipo === 'multiselect') {
      const b = el('button', 'bs-multi'); b.type = 'button'; b.setAttribute('aria-label', c.nombre);
      const pinta2 = () => { b.textContent = ''; const ids = r.c[c.id] || []; if (!ids.length) b.appendChild(el('span', 'k-faint', '—')); ids.forEach(i => { const ch = B.chip(c, i); if (ch) b.appendChild(ch); }); };
      pinta2(); b.addEventListener('click', () => B.eligeVarios(c, r.c[c.id] || [], (nuevo) => { B.guardaCelda(r, c, nuevo); pinta2(); })); td.appendChild(b);
    }
    return td;
  };
})();
