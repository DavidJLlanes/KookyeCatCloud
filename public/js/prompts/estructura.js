'use strict';
/* prompts/estructura.js: parte del módulo (se carga con el resto de prompts/ en index.html). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S, SORTS } = C;
  const load = (...a) => C.load(...a);
  const manageKinds = (...a) => C.manageKinds(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const openFilters = (...a) => C.openFilters(...a);
  const openImport = (...a) => C.openImport(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Estructura ---------- */
  function build() {
    const v = $('view-prompts');
    v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); const h2 = el('h2', null, 'Prompts'); const sub = el('p', 'sub', ''); t.append(h2, sub);
    const search = el('div', 'kv-search'); search.appendChild(icon('i-search'));
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar en títulos, textos, notas…  ( / )'; si.autocomplete = 'off'; search.appendChild(si);
    const nuevo = el('button', 'btn primary'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', 'lbl', 'Nuevo prompt'));
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.title = 'Importar, exportar y más';
    head.append(t, el('span', 'grow'), search, nuevo, mas);

    const wrap = el('div', 'pr');
    const rail = el('aside', 'pr-rail');
    const main = el('section', 'pr-main');
    const tools = el('div', 'pr-tools');
    const sort = el('select'); SORTS.forEach(([v2, l]) => { const o = el('option', null, l); o.value = v2; sort.appendChild(o); }); sort.value = S.q.sort;
    const seg = el('div', 'seg'); seg.style.width = 'auto';
    for (const [id, ic, tt] of [['grid', 'i-grid', 'Tarjetas'], ['list', 'i-list', 'Lista'], ['board', 'i-columns', 'Tablero por estado']]) {
      const b = el('button'); b.type = 'button'; b.dataset.v = id; b.title = tt; b.appendChild(icon(ic));
      b.addEventListener('click', () => { S.view = id; try { localStorage.setItem('kcc-pr-view', id); } catch {} load(); });
      seg.appendChild(b);
    }
    const filt = el('button', 'btn sm'); filt.type = 'button'; filt.append(icon('i-filter'), el('span', null, 'Filtros'));
    const selb = el('button', 'btn sm'); selb.type = 'button'; selb.append(icon('i-check-square'), el('span', null, 'Seleccionar'));
    const count = el('span', 'pr-count');
    // En pantallas estrechas la barra de categorías se esconde tras este botón
    const railBtn = el('button', 'btn sm pr-railbtn'); railBtn.type = 'button'; railBtn.append(icon('i-sidebar'), el('span', null, 'Categorías'));
    railBtn.addEventListener('click', () => { wrap.classList.toggle('rail-open'); railBtn.classList.toggle('is-on'); });
    tools.append(railBtn, sort, seg, filt, selb, count);
    const active = el('div', 'pr-active');
    const content = el('div', 'pr-content');
    main.append(tools, active, content);
    wrap.append(rail, main);
    v.append(head, wrap);
    const selbar = el('div', 'pr-selbar'); selbar.hidden = true; v.appendChild(selbar);
    Object.assign(R, { head, sub, rail, content, active, count, sort, seg, si, selbar, selb, filt });

    si.addEventListener('input', K.debounce(() => { S.q.q = si.value.trim(); load(); }, 220));
    sort.addEventListener('change', () => { S.q.sort = sort.value; try { localStorage.setItem('kcc-pr-sort', sort.value); } catch {} load(); });
    nuevo.addEventListener('click', () => openEditor(null));
    mas.addEventListener('click', () => K.menu(mas, [
      { label: 'Importar prompts…', icon: 'i-upload', onClick: openImport },
      { label: 'Exportar todo (JSON)', icon: 'i-download', onClick: () => { K.guardarUrl('/api/prompts/export/all', { nombre: 'prompts.json' }); } },
      { label: 'Editar nombres e iconos de tipos…', icon: 'i-palette', onClick: manageKinds },
      ...((K.prompts && K.prompts.extraMenu) || []),
      '-', { label: 'Gestionar etiquetas…', icon: 'i-tag', onClick: () => K.manageLabels() },
    ], { align: 'end' }));
    filt.addEventListener('click', () => openFilters(filt));
    selb.addEventListener('click', () => { S.selMode = !S.selMode; if (!S.selMode) S.sel.clear(); render(); });
    document.addEventListener('keydown', (e) => {
      if ($('view-prompts').hidden || e.target.closest('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey) return;
      if (e.key === '/') { e.preventDefault(); si.focus(); }
      else if (e.key === 'n' && !document.querySelector('.overlay')) { e.preventDefault(); openEditor(null); }
    });
    S.built = true;
  }


  Object.assign(C, { build });
})();
