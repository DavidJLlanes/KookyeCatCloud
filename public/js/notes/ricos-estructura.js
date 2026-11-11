'use strict';
/* notes/ricos-estructura.js: desplegables (toggle). Las columnas viven en ricos-columnas.js.
     :::toggle Título
     texto del cuerpo
     :::                                                                                                              */
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
})();
