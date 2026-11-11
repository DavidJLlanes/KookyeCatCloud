'use strict';
/* notes/ricos-diagrama.js: diagramas Mermaid. Es un bloque de código con lenguaje «mermaid» (```mermaid), así que el
   Markdown no cambia; debajo se dibuja el diagrama (la librería se carga solo cuando hace falta). */
(function () {
  const C = (K._notes = K._notes || {});
  const EJEMPLO = 'flowchart LR\n  A[Idea] --> B{¿Funciona?}\n  B -- Sí --> C[Listo]\n  B -- No --> A';
  let n = 0, iniciado = false;

  const oscuro = () => { const m = /\d+/g, c = (getComputedStyle(document.body).backgroundColor.match(m) || [255, 255, 255]).map(Number); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 128; };
  async function dibuja(w) {
    const vista = w.querySelector('.nb-mm'); if (!vista) return;
    const src = C.contentOf(w).textContent.replace(/​/g, '').trim();
    if (!src) { vista.textContent = ''; return; }
    try {
      await C.cargaLibreria('mermaid', { js: '/vendor/mermaid/mermaid.min.js' });
      if (!iniciado) { window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: oscuro() ? 'dark' : 'default', fontFamily: 'inherit' }); iniciado = true; }
      const { svg } = await window.mermaid.render('nb-mm-' + (++n), src);
      vista.classList.remove('error'); vista.innerHTML = svg;
    } catch (e) {
      vista.classList.add('error'); vista.textContent = String((e && e.message) || e).split('\n')[0].slice(0, 160);
      document.querySelectorAll('#dnb-mm-' + n + ',#nb-mm-' + n).forEach(x => x.remove());     // Mermaid deja un nodo de error suelto en el cuerpo
    }
  }
  const esperas = new WeakMap();
  const programa = (w) => { clearTimeout(esperas.get(w)); esperas.set(w, setTimeout(() => dibuja(w), 400)); };

  // Llamado desde decorate(): un bloque de código «mermaid» lleva su vista; si deja de serlo, se quita
  C.ricoDecora = function (w) {
    const es = w.dataset.t === 'code' && w.dataset.lang === 'mermaid', vista = w.querySelector('.nb-mm');
    if (es && !vista) { const v = document.createElement('div'); v.className = 'nb-mm'; v.contentEditable = 'false'; w.appendChild(v); programa(w); }
    else if (!es && vista) vista.remove();
  };
  C.alEscribir.push((e) => { const w = e.target.closest && e.target.closest('.nb-block[data-lang="mermaid"]'); if (w) programa(w); });

  C.ACCIONES.mermaid = (w) => {
    const vacio = !C.contentOf(w).textContent.trim();
    const nuevo = C.makeBlock({ t: 'code', lang: 'mermaid', text: EJEMPLO });
    if (vacio) w.replaceWith(nuevo); else w.after(nuevo);
    if (!nuevo.nextElementSibling) C.insertAfter(nuevo, { t: 'p', text: '' });
    C.focusBlock(nuevo, true); C.change(true);
  };
  C.SLASH.push(['mermaid', 'Diagrama', 'Diagrama de flujo, secuencia… (Mermaid)', '⬡']);
})();
