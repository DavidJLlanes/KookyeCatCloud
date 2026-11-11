'use strict';
/* notes/ricos-sincronizado.js: bloque sincronizado (::sync <id>). El texto vive en el servidor (/api/sincronizados) y se ve,
   igual, en todas las notas que lo usan: al cambiarlo en una, cambia en todas.                                       */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;
  const nodo = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
  const marca = (w, txt) => { const e = w.querySelector('.nb-sy-estado'); if (e) e.textContent = txt; };
  const iguales = (ref) => [...EST.host.querySelectorAll('.nb-block[data-t="sync"]')].filter(x => x.dataset.ref === ref);
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 800);

  async function carga(w) {
    const sub = w.querySelector('.nb-sy-texto');
    try {
      const { bloque } = await K.get('/api/sincronizados/' + w.dataset.ref);
      w._base = bloque.updatedAt; sub.innerHTML = C.inlineHtml(bloque.texto); sub.contentEditable = 'true'; w.classList.remove('is-roto'); marca(w, 'Sincronizado');
    } catch (e) {
      w.classList.add('is-roto'); sub.contentEditable = 'false'; sub.textContent = ''; marca(w, e && e.status === 404 ? 'Bloque no disponible (se eliminó)' : 'No se pudo cargar');
    }
  }
  // Guarda el texto y lo muestra en las demás copias de la misma nota
  async function guarda(w) {
    clearTimeout(w._espera); if (w.classList.contains('is-roto') || !w.isConnected) return;
    const texto = C.leeSub(w.querySelector('.nb-sy-texto'));
    if (texto === w._guardado) return;
    marca(w, 'Guardando…');
    try {
      const { bloque } = await K.put('/api/sincronizados/' + w.dataset.ref, { texto, base: w._base });
      w._base = bloque.updatedAt; w._guardado = texto; marca(w, 'Sincronizado'); logros();
      iguales(w.dataset.ref).forEach(o => { if (o !== w && !o.contains(document.activeElement)) { o._base = bloque.updatedAt; o._guardado = texto; o.querySelector('.nb-sy-texto').innerHTML = C.inlineHtml(texto); } });
    } catch (e) {
      if (e && e.status === 409) { K.toast('Ese bloque se cambió en otro dispositivo: se ha recargado'); await carga(w); w._guardado = C.leeSub(w.querySelector('.nb-sy-texto')); } else { marca(w, 'Sin guardar'); K.fail(e); }
    }
  }

  function elige(alElegir, alCancelar) {
    let elegido = false;
    const caja = nodo('div', 'nb-emb-lista');
    const m = K.modal({ title: 'Bloque sincronizado', content: caja, actions: [{ label: 'Cancelar' }], onClose: () => { if (!elegido) alCancelar(); } });
    const usa = (id) => { elegido = true; alElegir(id); m.close(); };
    const nuevo = nodo('button', 'btn primary', 'Crear un bloque nuevo'); nuevo.type = 'button';
    nuevo.addEventListener('click', async () => { try { const r = await K.post('/api/sincronizados', { texto: '' }); usa(r.bloque.id); logros(); } catch (e) { K.fail(e); } });
    caja.append(nuevo, nodo('small', 'k-faint', 'O usa uno que ya tengas (se verá igual en todas las notas donde esté):'));
    K.get('/api/sincronizados').then(r => {
      if (!r.bloques.length) caja.appendChild(nodo('p', 'k-faint', 'Todavía no hay bloques sincronizados.'));
      r.bloques.forEach(b => {
        const t = (b.texto || '').replace(/<br>/g, ' ').replace(/[*~=`\\]|\]\([^)]*\)|\[/g, '').trim().slice(0, 70) || 'Bloque vacío';
        const x = nodo('button', 'btn', t); x.type = 'button'; x.addEventListener('click', () => usa(b.id)); caja.appendChild(x);
      });
    }).catch(K.fail);
  }

  C.registraRico('sync', {
    slash: ['Bloque sincronizado', 'El mismo texto en varias notas, siempre al día', '⇄'],
    parse(lines, i) { const m = /^::sync\s+([a-f0-9]{16})\s*$/.exec(lines[i]); return m ? { b: { t: 'sync', ref: m[1] }, next: i + 1 } : null; },
    md: (b) => '::sync ' + (b.ref || ''),
    pinta(w, c, b) {
      w.dataset.ref = b.ref || '';
      const cab = nodo('div', 'nb-sy-cab'), estado = nodo('span', 'nb-sy-estado k-faint', 'Cargando…');
      const des = nodo('button', 'btn ghost sm', 'Desvincular'); des.type = 'button'; des.title = 'Dejarlo como texto normal de esta nota';
      des.addEventListener('click', () => {
        const texto = C.leeSub(w.querySelector('.nb-sy-texto')), n = C.makeBlock({ t: 'p', text: texto }); w.replaceWith(n); C.focusBlock(n); C.change(true);
      });
      cab.append(nodo('span', 'nb-sy-ic', '⇄'), estado, des);
      const texto = C.subEditable('nb-sy-texto', '', 'Escribe aquí: este texto es el mismo en todas las notas donde lo uses');
      texto.contentEditable = 'false';
      texto.addEventListener('input', () => { clearTimeout(w._espera); w._espera = setTimeout(() => guarda(w), 900); });
      texto.addEventListener('blur', () => guarda(w));
      c.append(cab, texto);
      if (b.ref) setTimeout(async () => { await carga(w); w._guardado = C.leeSub(texto); }, 0);
    },
    lee: (w, b) => ({ ...b, ref: w.dataset.ref || b.ref }),
    alCrear(w) {
      const quita = () => { if (!w.isConnected) return; w.remove(); if (!EST.host.querySelector('.nb-block')) EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); C.change(true); };
      elige(async (id) => { w.dataset.ref = id; await carga(w); w._guardado = C.leeSub(w.querySelector('.nb-sy-texto')); C.change(true); const t = w.querySelector('.nb-sy-texto'); if (t) t.focus(); }, quita);
    },
  });
  // Al cambiar de nota (NB.flush) se guardan antes los bloques sincronizados con cambios sin enviar
  const flush0 = C.NB.flush;
  C.NB.flush = function () { if (EST.host) EST.host.querySelectorAll('.nb-block[data-t="sync"]').forEach(guarda); return flush0.apply(this, arguments); };
  window.addEventListener('pagehide', () => EST.host && EST.host.querySelectorAll('.nb-block[data-t="sync"]').forEach(guarda), true);
})();
