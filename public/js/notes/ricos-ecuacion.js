'use strict';
/* notes/ricos-ecuacion.js: ecuaciones LaTeX con KaTeX (se carga solo al usarlas).
     $$
     E = mc^2
     $$                                           */
(function () {
  const C = (K._notes = K._notes || {});
  const katex = () => C.cargaLibreria('katex', { js: '/vendor/katex/katex.min.js', css: '/vendor/katex/katex.min.css' });

  async function dibuja(w) {
    const prev = w.querySelector('.nb-eq-vista'), src = w.querySelector('.nb-eq-src').textContent.trim();
    if (!src) { prev.textContent = ''; prev.classList.remove('error'); return; }
    try {
      await katex();
      window.katex.render(src, prev, { displayMode: true, throwOnError: true, trust: false, output: 'html', maxExpand: 200, maxSize: 20 });
      prev.classList.remove('error');
    } catch (e) { prev.classList.add('error'); prev.textContent = String(e && e.message || e).replace(/^KaTeX parse error:\s*/, '').slice(0, 160); }
  }
  const esperas = new WeakMap();
  C.alEscribir.push((e) => {
    const w = e.target.closest && e.target.closest('.nb-block[data-t="eq"]'); if (!w) return;
    clearTimeout(esperas.get(w)); esperas.set(w, setTimeout(() => dibuja(w), 250));
  });

  C.registraRico('eq', {
    slash: ['Ecuación', 'Fórmula matemática en LaTeX', '∑'],
    nuevo: () => ({ src: '' }),
    alCrear: (w) => { const s = w.querySelector('.nb-eq-src'); if (s) s.focus(); },
    parse(lines, i) {
      let m = /^\$\$(.+)\$\$\s*$/.exec(lines[i]);
      if (m) return { b: { t: 'eq', src: m[1].trim() }, next: i + 1 };
      if (!/^\$\$\s*$/.test(lines[i])) return null;
      const cuerpo = []; i++;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) cuerpo.push(lines[i++]);
      return { b: { t: 'eq', src: cuerpo.join('\n') }, next: i + 1 };
    },
    md: (b) => '$$\n' + String(b.src || '').replace(/^\s*\$\$\s*$/gm, '') + '\n$$',
    pinta(w, c, b) {
      const src = C.subEditable('nb-eq-src nb-plano', '', 'Escribe la fórmula en LaTeX, p. ej. \\frac{a}{b} + \\sqrt{x}');
      src.textContent = b.src || '';
      if (C.plano) src.contentEditable = 'plaintext-only';
      const vista = document.createElement('div'); vista.className = 'nb-eq-vista'; vista.setAttribute('aria-live', 'polite');
      c.append(vista, src); setTimeout(() => dibuja(w), 0);
    },
    lee: (w, b) => ({ ...b, src: w.querySelector('.nb-eq-src').textContent.replace(/​/g, '') }),
  });
})();
