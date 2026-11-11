'use strict';
/* notes/ricos-estructura.js: desplegables (toggle) y columnas.
     :::toggle Título            :::columns
     texto del cuerpo            texto de la columna 1
     :::                         :::col
                                 texto de la columna 2
                                 :::                                                                                      */
(function () {
  const C = (K._notes = K._notes || {});
  const el2 = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
  const boton = (cls, titulo, texto, fn) => { const b = el2('button', cls, texto); b.type = 'button'; b.title = titulo; b.setAttribute('aria-label', titulo); b.addEventListener('click', (e) => { e.preventDefault(); fn(); }); return b; };

  /* ---------- Desplegable ---------- */
  C.registraRico('toggle', {
    slash: ['Desplegable', 'Un título que oculta o muestra su contenido', '▸'],
    nuevo: () => ({ text: '', body: '', open: true }),
    alCrear: (w) => { const t = w.querySelector('.nb-tt'); if (t) t.focus(); },
    parse(lines, i) {
      const m = /^:::toggle(?:\s+(.*))?$/.exec(lines[i]); if (!m) return null;
      const { cuerpo, next } = C.hastaCierre(lines, i + 1);
      return { b: { t: 'toggle', text: (m[1] || '').trim(), body: C.desescapa(cuerpo), open: false }, next };
    },
    md: (b) => [':::toggle ' + String(b.text || '').replace(/<br>/g, ' ').trim(), ...C.lineasMd(b.body), ':::'].join('\n'),
    pinta(w, c, b) {
      const cab = el2('div', 'nb-tg-cab'), flecha = boton('nb-tg-flecha', 'Mostrar u ocultar', '▸', () => { w.classList.toggle('is-open'); flecha.setAttribute('aria-expanded', w.classList.contains('is-open')); });
      flecha.setAttribute('aria-expanded', !!b.open); if (b.open) w.classList.add('is-open');
      const t = C.subEditable('nb-tt nb-una-linea', b.text, 'Título del desplegable');
      const cuerpo = C.subEditable('nb-tb', b.body, 'Contenido (Intro para otra línea)');
      cab.append(flecha, t); c.append(cab, cuerpo);
    },
    tras: (w) => { w.classList.add('is-open'); const b = w.querySelector('.nb-tb'); if (b) C.ricoFoco({ querySelectorAll: () => [b] }); return true; },
    lee: (w, b) => ({ ...b, text: C.leeSub(w.querySelector('.nb-tt')).replace(/<br>/g, ' '), body: C.leeSub(w.querySelector('.nb-tb')), open: w.classList.contains('is-open') }),
  });

  /* ---------- Columnas ---------- */
  const MAX_COLS = 4;
  C.registraRico('columns', {
    slash: ['Columnas', 'Texto en 2 columnas (hasta 4)', '▥'],
    nuevo: () => ({ cols: ['', ''] }),
    alCrear: (w) => { const s = w.querySelector('.nb-sub'); if (s) s.focus(); },
    parse(lines, i) {
      if (!/^:::columns\s*$/.test(lines[i])) return null;
      const cols = [[]]; i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { if (/^:::col\s*$/.test(lines[i])) { if (cols.length < MAX_COLS) cols.push([]); } else cols[cols.length - 1].push(lines[i]); i++; }
      while (cols.length < 2) cols.push([]);
      return { b: { t: 'columns', cols: cols.map(C.desescapa) }, next: i + 1 };
    },
    md: (b) => [':::columns', ...(b.cols || ['', '']).flatMap((c, k) => [...(k ? [':::col'] : []), ...C.lineasMd(c)]), ':::'].join('\n'),
    pinta(w, c, b) {
      const rejilla = el2('div', 'nb-cols');
      const dibuja = (cols) => {
        rejilla.textContent = ''; rejilla.dataset.n = cols.length;
        cols.forEach(txt => rejilla.appendChild(C.subEditable('nb-col', txt, 'Escribe aquí')));
      };
      dibuja(b.cols && b.cols.length ? b.cols : ['', '']);
      const barra = el2('div', 'nb-cols-tools');
      const mas = boton('btn ghost sm', 'Añadir una columna', '+ Columna', () => { const v = [...rejilla.querySelectorAll('.nb-col')].map(C.leeSub); if (v.length < MAX_COLS) { v.push(''); dibuja(v); C.change(true); } });
      const menos = boton('btn ghost sm', 'Quitar la última columna', '− Columna', () => { const v = [...rejilla.querySelectorAll('.nb-col')].map(C.leeSub); if (v.length > 2) { v.pop(); dibuja(v); C.change(true); } });
      barra.append(mas, menos); c.append(rejilla, barra);
    },
    lee: (w, b) => ({ ...b, cols: [...w.querySelectorAll('.nb-col')].map(C.leeSub) }),
  });
})();
