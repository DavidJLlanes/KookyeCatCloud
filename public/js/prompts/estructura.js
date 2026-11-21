'use strict';
/* prompts/estructura.js: parte del módulo (se carga con el resto de prompts/ en index.html). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S, SORTS, mobileColumns, columnKeys } = C;
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
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar prompts…'; si.autocomplete = 'off'; search.appendChild(si);
    const nuevo = el('button', 'btn primary'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', 'lbl', 'Nuevo prompt'));
    const vista = el('button', 'pr-view-toggle'); vista.type = 'button';
    vista.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx=".8"/><rect x="14" y="3" width="7" height="7" rx=".8"/><rect x="3" y="14" width="7" height="7" rx=".8"/><rect x="14" y="14" width="7" height="7" rx=".8"/></svg>';
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.title = 'Importar, exportar y más';
    const actions = el('div', 'pr-head-actions'); actions.append(vista, nuevo, mas);
    head.classList.add('pr-head'); head.append(t, el('span', 'grow'), search, actions);
    const updateColumns = () => {
      const mode = mobileColumns.matches ? 'mobile' : 'desktop', n = S.columns[mode], next = n % (mobileColumns.matches ? 3 : 5) + 1;
      vista.title = `${n} ${n === 1 ? 'columna' : 'columnas'} · pulsar para ${next}`;
      vista.setAttribute('aria-label', `Cambiar columnas: ${n} ${n === 1 ? 'actual' : 'actuales'}, siguiente ${next}`);
      const grid = R.content?.querySelector('.pr-grid');
      if (grid) { grid.style.setProperty('--pr-cols', String(n)); grid.dataset.columns = String(n); }
    };
    vista.addEventListener('click', () => {
      const mode = mobileColumns.matches ? 'mobile' : 'desktop';
      S.columns[mode] = S.columns[mode] % (mobileColumns.matches ? 3 : 5) + 1;
      try { localStorage.setItem(columnKeys[mode], String(S.columns[mode])); } catch { /* almacenamiento privado */ }
      if (S.view !== 'grid') { S.view = 'grid'; try { localStorage.setItem('kcc-pr-view', 'grid'); } catch {} render(); }
      updateColumns();
    });
    mobileColumns.addEventListener('change', updateColumns);

    const wrap = el('div', 'pr');
    const rail = el('aside', 'pr-rail');
    const main = el('section', 'pr-main');
    const tools = el('div', 'pr-tools');
    const sort = el('select'); SORTS.forEach(([v2, l]) => { const o = el('option', null, l); o.value = v2; sort.appendChild(o); }); sort.value = S.q.sort;
    const filt = el('button', 'btn sm'); filt.type = 'button'; filt.append(icon('i-filter'), el('span', null, 'Filtros'));
    const selb = el('button', 'btn sm'); selb.type = 'button'; selb.append(icon('i-check-square'), el('span', null, 'Seleccionar'));
    const count = el('span', 'pr-count');
    // En pantallas estrechas la barra de categorías se esconde tras este botón
    const railBtn = el('button', 'btn sm pr-railbtn'); railBtn.type = 'button'; railBtn.append(icon('i-sidebar'), el('span', null, 'Categorías'));
    railBtn.addEventListener('click', () => { wrap.classList.toggle('rail-open'); railBtn.classList.toggle('is-on'); });
    sort.setAttribute('aria-label', 'Ordenar prompts');
    tools.append(railBtn, sort, filt, selb, count);
    const active = el('div', 'pr-active');
    const content = el('div', 'pr-content');
    main.append(tools, active, content);
    wrap.append(rail, main);
    v.append(head, wrap);
    const selbar = el('div', 'pr-selbar'); selbar.hidden = true; v.appendChild(selbar);
    Object.assign(R, { head, sub, rail, content, active, count, sort, si, selbar, selb, filt, updateColumns });
    updateColumns();

    si.addEventListener('input', K.debounce(() => { S.q.q = si.value.trim(); load(); }, 220));
    sort.addEventListener('change', () => { S.q.sort = sort.value; try { localStorage.setItem('kcc-pr-sort', sort.value); } catch {} load(); });
    nuevo.addEventListener('click', () => openEditor(null));
    mas.addEventListener('click', () => K.menu(mas, [
      { head: 'Visualización' },
      ...[['grid', 'Tarjetas'], ['list', 'Lista'], ['board', 'Tablero por estado']].map(([id, label]) => ({ label, checked: S.view === id, onClick: () => { S.view = id; try { localStorage.setItem('kcc-pr-view', id); } catch {} load(); } })),
      '-',
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
