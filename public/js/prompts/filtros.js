'use strict';
/* filtros: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S } = C;
  const kindDefs = (...a) => C.kindDefs(...a);
  const load = (...a) => C.load(...a);

  /* ---------- Filtros avanzados ---------- */
  function openFilters(anchor) {
    const q = S.q;
    const w = el('div'); w.style.cssText = 'padding:6px;display:flex;flex-direction:column;gap:12px;width:290px';
    const tipo = el('label', 'field tight'); tipo.appendChild(el('span', null, 'Tipo de prompt'));
    const tipoSel = el('select');
    const allKinds = el('option', null, 'Todos los tipos'); allKinds.value = ''; tipoSel.appendChild(allKinds);
    kindDefs().forEach(k => { const o = el('option', null, k.name); o.value = k.id; tipoSel.appendChild(o); });
    tipoSel.value = q.kind; tipoSel.addEventListener('change', () => { q.kind = tipoSel.value; load(); }); tipo.appendChild(tipoSel);
    const categoria = el('label', 'field tight'); categoria.appendChild(el('span', null, 'Categoría'));
    const categoriaSel = el('select');
    const allCategories = el('option', null, 'Todas las categorías'); allCategories.value = ''; categoriaSel.appendChild(allCategories);
    const noCategory = el('option', null, 'Sin categoría'); noCategory.value = '__none'; categoriaSel.appendChild(noCategory);
    const addCats = (parent, depth) => S.M.categories.filter(c => (c.parent || '') === parent).forEach(c => {
      const o = el('option', null, `${'　'.repeat(depth)}${c.emoji || ''} ${c.name}`.trim()); o.value = c.id; categoriaSel.appendChild(o); addCats(c.id, depth + 1);
    });
    addCats('', 0); categoriaSel.value = q.category; categoriaSel.addEventListener('change', () => { q.category = categoriaSel.value; load(); }); categoria.appendChild(categoriaSel);
    const f1 = el('div'); f1.append(el('div', 'head', 'Valoración mínima'));
    const st = K.stars(q.minRating, (v) => { q.minRating = v; load(); }); st.style.padding = '2px 8px'; f1.appendChild(st);
    const f2 = el('div'); f2.appendChild(el('div', 'head', 'Imágenes'));
    const sg = el('div', 'seg'); sg.style.cssText = 'width:auto;margin:2px 8px';
    for (const [v, l] of [['', 'Todos'], ['1', 'Con'], ['0', 'Sin']]) { const b = el('button', q.images === v ? 'is-active' : '', l); b.type = 'button'; b.style.cssText = 'width:auto;padding:0 12px;font-size:12.5px'; b.addEventListener('click', () => { q.images = v; sg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); load(); }); sg.appendChild(b); }
    f2.appendChild(sg);
    const f3 = el('div'); f3.appendChild(el('div', 'head', 'Fecha de creación'));
    const r = el('div', 'k-row'); r.style.cssText = 'padding:0 8px;flex-wrap:nowrap';
    const d1 = el('input'); d1.type = 'date'; d1.value = q.from; const d2 = el('input'); d2.type = 'date'; d2.value = q.to;
    [d1, d2].forEach(i => { i.style.cssText = 'padding:7px 8px;font-size:13px'; });
    d1.addEventListener('change', () => { q.from = d1.value; load(); }); d2.addEventListener('change', () => { q.to = d2.value; load(); });
    r.append(d1, d2); f3.appendChild(r);
    const f4 = el('div'); f4.style.padding = '0 8px';
    const sw = el('label', 'k-switch'); const ck = el('input'); ck.type = 'checkbox'; ck.checked = q.cal; sw.append(ck, el('span', 'track'), el('span', null, 'Solo con fecha en el calendario'));
    ck.addEventListener('change', () => { q.cal = ck.checked; load(); }); f4.appendChild(sw);
    const clear = el('button', 'btn sm', 'Limpiar todos los filtros'); clear.type = 'button'; clear.addEventListener('click', () => { clearAll(); p.close(); });
    w.append(tipo, categoria, f1, f2, f3, f4, clear);
    const p = K.pop(anchor, w, { width: 310 });
  }
  function clearAll() {
    Object.assign(S.q, { q: '', category: '', list: '', kind: '', status: '', model: '', tool: '', language: '', fav: false, minRating: 0, images: '', cal: false, from: '', to: '', trash: false });
    S.labels.clear(); R.si.value = ''; load();
  }


  Object.assign(C, { openFilters, clearAll });
})();
