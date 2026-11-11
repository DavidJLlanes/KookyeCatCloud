'use strict';
/* notes/ricos.js: marco de los bloques ricos de las notas (desplegables, columnas, índice, ecuaciones, incrustados…).
   Cada tipo vive en su propio archivo (notes/ricos-*.js) y se registra en C.RICOS con esta forma:
     { parse(lines, i) → { b, next } | null,   // Markdown → bloque
       md(b) → string,                          // bloque → Markdown
       pinta(w, c, b),                          // dibuja el contenido en el .nb-c del bloque (que no es editable)
       lee(w, b) → b,                           // lee el bloque desde el DOM
       nuevo() → b,                             // contenido inicial al crearlo desde el menú «/»
       slash: [código, nombre, descripción, icono] }
   Lo que se escribe dentro de un bloque rico va en «.nb-sub» (zonas editables propias): el editor de bloques no las toca. */
(function () {
  const C = (K._notes = K._notes || {});
  const RICOS = C.RICOS = C.RICOS || {};
  const { EST } = C;
  const quitaBr = (s) => String(s || '').replace(/^(<br>)+|(<br>)+$/g, '');

  // Zona editable propia de un bloque rico (título de un desplegable, columna…); `md` es Markdown en línea
  C.subEditable = function (cls, md, ph) {
    const d = document.createElement('div'); d.className = 'nb-sub ' + cls; d.contentEditable = 'true'; d.spellcheck = true;
    d.innerHTML = C.inlineHtml(md || ''); if (ph) d.dataset.ph = ph;
    return d;
  };
  C.leeSub = (nodo) => quitaBr(C.inlineMd(nodo));
  // Líneas de un texto en línea con saltos (<br>) → líneas de Markdown; ':::' y '::x' al principio se escapan para no cerrar el bloque
  C.lineasMd = (txt) => (txt ? String(txt).split('<br>') : []).map(l => l.replace(/^(?=:{2,3}|\$\$)/, '\\'));

  C.desescapa = (lineas) => lineas.map(l => l.replace(/^\\(?=:|\$)/, '')).join('<br>');

  C.parseRico = function (lines, i) {
    for (const k of Object.keys(RICOS)) { const r = RICOS[k].parse && RICOS[k].parse(lines, i); if (r) return r; }
    return null;
  };
  // Hasta el cierre «:::» (sin incluirlo). Devuelve { cuerpo, next }
  C.hastaCierre = function (lines, i) {
    const cuerpo = [];
    while (i < lines.length && !/^:::\s*$/.test(lines[i])) cuerpo.push(lines[i++]);
    return { cuerpo, next: i + 1 };
  };

  // Un bloque rico nuevo desde el menú «/»: sustituye al párrafo vacío o va debajo
  C.insertaRico = function (w, tipo) {
    const def = RICOS[tipo]; if (!def) return;
    const n = C.makeBlock({ t: tipo, ...(def.nuevo ? def.nuevo() : {}) });
    const vacio = !C.contentOf(w).textContent.trim();
    if (vacio) w.replaceWith(n); else w.after(n);
    if (!n.nextElementSibling) C.insertAfter(n, { t: 'p', text: '' });
    C.focusBlock(n); C.change(true);
    if (def.alCrear) def.alCrear(n);
  };

  // Foco al llegar a un bloque rico desde otro (flechas, Retroceso…): su primera zona editable, o el propio bloque
  C.ricoFoco = function (w, fin) {
    const subs = w.querySelectorAll('.nb-sub');
    const s = subs.length ? (fin ? subs[subs.length - 1] : subs[0]) : null;
    if (!s) { w.tabIndex = 0; w.focus(); return; }
    s.focus(); const r = document.createRange(); r.selectNodeContents(s); r.collapse(!fin);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  };

  // Teclas dentro de un bloque rico. true = ya atendida
  C.ricoTecla = function (e, w) {
    const sub = e.target.closest && e.target.closest('.nb-sub');
    const t = w.dataset.t;
    if (sub) {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (sub.classList.contains('nb-una-linea')) { const sig = RICOS[t] && RICOS[t].tras && RICOS[t].tras(w, sub); if (sig) return true; }
        if (sub.classList.contains('nb-plano')) document.execCommand('insertText', false, '\n'); else document.execCommand('insertLineBreak');
        C.change(); return true;
      }
      if (e.key === 'Escape') { const n = w.nextElementSibling || C.insertAfter(w, { t: 'p', text: '' }); C.focusBlock(n); return true; }
      if (e.key === 'Tab') { e.preventDefault(); const subs = [...w.querySelectorAll('.nb-sub')], k = subs.indexOf(sub) + (e.shiftKey ? -1 : 1); if (subs[k]) C.ricoFoco({ querySelectorAll: () => [subs[k]] }); return true; }
      return true;     // el resto lo hace el navegador dentro de la zona (no se parten ni se juntan bloques)
    }
    if (e.key === 'Enter') { e.preventDefault(); const n = w.nextElementSibling && w.nextElementSibling.dataset.t === 'p' && !w.nextElementSibling.textContent ? w.nextElementSibling : C.insertAfter(w, { t: 'p', text: '' }); C.focusBlock(n); C.change(true); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); const prev = w.previousElementSibling || w.nextElementSibling; w.remove();
      if (!EST.host.querySelector('.nb-block')) EST.host.appendChild(C.makeBlock({ t: 'p', text: '' }));
      if (prev) C.focusBlock(prev, true); C.change(true); return true;
    }
    if (e.key === 'ArrowDown' && w.nextElementSibling) { e.preventDefault(); C.focusBlock(w.nextElementSibling); return true; }
    if (e.key === 'ArrowUp' && w.previousElementSibling) { e.preventDefault(); C.focusBlock(w.previousElementSibling, true); return true; }
    return false;
  };

  // Menú «/»: cada tipo añade su entrada. Los que no son bloques (p. ej. el diagrama, que es código) usan ACCIONES
  C.ACCIONES = C.ACCIONES || {};
  C.registraRico = function (tipo, def) {
    RICOS[tipo] = def;
    if (def.slash && C.SLASH) C.SLASH.push([tipo, def.slash[0], def.slash[1], def.slash[2]]);
  };
  C.slashRico = function (code, w) {
    if (RICOS[code]) { C.insertaRico(w, code); return true; }
    if (C.ACCIONES[code]) { C.ACCIONES[code](w); return true; }
    return false;
  };

  // Carga perezosa de una librería externa de /vendor (solo se pide cuando una nota la necesita)
  const cargas = {};
  C.cargaLibreria = function (id, { js, css }) {
    if (cargas[id]) return cargas[id];
    cargas[id] = new Promise((ok, fallo) => {
      if (css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + css; document.head.appendChild(l); }
      const s = document.createElement('script'); s.src = BASE + js; s.onload = ok; s.onerror = () => { delete cargas[id]; fallo(new Error('No se pudo cargar ' + id)); };
      document.head.appendChild(s);
    });
    return cargas[id];
  };

  // Funciones que reaccionan a lo que se escribe (alEscribir) y a cualquier cambio del documento (alCambiar, con espera)
  C.alEscribir = C.alEscribir || [];
  C.alCambiar = C.alCambiar || [];
  let esperaRefresco = 0;
  C.ricosRefresca = function () { clearTimeout(esperaRefresco); esperaRefresco = setTimeout(() => C.alCambiar.forEach(f => { try { f(); } catch { /* un bloque roto no debe parar al resto */ } }), 350); };

  // Un solo oyente para todo lo que se escribe dentro de las zonas «.nb-sub»
  C.ricosMonta = function (host) {
    host.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('.nb-sub')) C.change(); C.alEscribir.forEach(f => f(e)); });
    host.addEventListener('paste', (e) => {
      if (!(e.target.closest && e.target.closest('.nb-sub'))) return;
      e.preventDefault(); document.execCommand('insertText', false, ((e.clipboardData || window.clipboardData).getData('text/plain') || '').replace(/\r?\n/g, ' '));
    }, true);
  };
})();
