'use strict';
/* notes/ricos-indice.js: índice automático (::toc). Lista los títulos de la nota y se actualiza solo. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;

  function pintaIndice(w) {
    const lista = w.querySelector('.nb-toc-lista'); if (!lista) return;
    const titulos = [...EST.host.querySelectorAll('.nb-block[data-t="h1"],.nb-block[data-t="h2"],.nb-block[data-t="h3"]')];
    lista.textContent = '';
    if (!titulos.length) { const p = document.createElement('p'); p.className = 'k-faint'; p.textContent = 'Aquí saldrán los títulos de la nota.'; lista.appendChild(p); return; }
    titulos.forEach((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nb-toc-i nb-toc-' + t.dataset.t;
      b.textContent = (C.contentOf(t).textContent || '').trim() || 'Sin título';
      b.addEventListener('click', (e) => { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      lista.appendChild(b);
    });
  }
  const todos = () => EST.host && EST.host.querySelectorAll('.nb-block[data-t="toc"]').forEach(pintaIndice);
  C.alCambiar.push(todos);

  C.registraRico('toc', {
    slash: ['Índice', 'Lista automática de los títulos de la nota', '☷'],
    parse: (lines, i) => (/^::toc\s*$/.test(lines[i]) ? { b: { t: 'toc' }, next: i + 1 } : null),
    md: () => '::toc',
    pinta(w, c) {
      const caja = document.createElement('nav'); caja.className = 'nb-toc'; caja.setAttribute('aria-label', 'Índice de la nota');
      const t = document.createElement('b'); t.textContent = 'Índice'; const l = document.createElement('div'); l.className = 'nb-toc-lista';
      caja.append(t, l); c.appendChild(caja);
      setTimeout(() => pintaIndice(w), 0);          // cuando ya están los demás bloques
    },
    lee: (w, b) => b,
  });
})();
