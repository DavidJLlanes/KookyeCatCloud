'use strict';
/* lateral: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S, STATUS } = C;
  const delMeta = (...a) => C.delMeta(...a);
  const editCategory = (...a) => C.editCategory(...a);
  const editKind = (...a) => C.editKind(...a);
  const editList = (...a) => C.editList(...a);
  const kindDefs = (...a) => C.kindDefs(...a);
  const load = (...a) => C.load(...a);
  const loadMeta = (...a) => C.loadMeta(...a);
  const manageKinds = (...a) => C.manageKinds(...a);

  /* ---------- Barra lateral ---------- */
  function link({ emoji, ic, name, n, on, color, depth = 0, onClick, menu }) {
    const b = el('div', 'pr-link' + (on ? ' is-on' : '') + (depth ? ' sub' + Math.min(depth, 2) : ''));
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    if (color) b.style.setProperty('--c', color);
    const em = el('span', 'em'); if (emoji) em.textContent = emoji; else if (ic) em.appendChild(icon(ic)); else { const d = el('span', 'k-dot'); d.style.setProperty('--c', color || '#64748b'); em.appendChild(d); }
    b.append(em, el('span', 'nm', name));
    if (n !== undefined) b.appendChild(el('span', 'n', String(n)));
    if (menu) { const m = el('button', 'more'); m.type = 'button'; m.appendChild(icon('i-dots')); m.addEventListener('click', (e) => { e.stopPropagation(); menu(m); }); b.appendChild(m); }
    b.addEventListener('click', onClick);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); });
    return b;
  }
  const resetNav = () => { Object.assign(S.q, { category: '', list: '', fav: false, images: '', trash: false, kind: '', status: '', model: '', tool: '', language: '' }); };

  function section(title, action) {
    const s = el('div', 'pr-sec'); const h = el('h4'); h.appendChild(el('span', null, title));
    if (action) { const b = el('button'); b.type = 'button'; b.appendChild(icon('i-plus')); b.title = action.title; b.addEventListener('click', action.fn); h.appendChild(b); }
    const nav = el('div', 'pr-nav'); s.append(h, nav); return [s, nav];
  }

  async function guardaVista() {
    const q = S.q;
    const filtros = ['q', 'category', 'list', 'kind', 'status', 'model', 'tool', 'language', 'fav', 'minRating', 'images', 'cal', 'from', 'to', 'trash', 'sort'];
    const guardado = {}; filtros.forEach(k => { if (q[k]) guardado[k] = q[k]; });
    if (Object.keys(guardado).length <= 1 && !S.labels.size) { K.toast('Aplica primero una búsqueda o algún filtro'); return; }
    const name = await K.ask('Nombre de la vista', { placeholder: 'p. ej. Prompts finales de Claude' });
    if (!name) return;
    try { await K.post('/api/prompts/views', { name, q: guardado, labels: [...S.labels] }); await loadMeta(); renderRail(); K.toast('Vista guardada'); } catch (e) { K.fail(e); }
  }
  function renderRail() {
    const rail = R.rail; const f = S.M.facets; const q = S.q;
    rail.textContent = '';
    const noFilter = !q.category && !q.list && !q.fav && !q.images && !q.trash;

    const [s1, n1] = section('Biblioteca');
    n1.append(
      link({ ic: 'i-sparkle', name: 'Todos los prompts', n: f.total, on: noFilter && !q.kind && !q.status && !q.model && !q.tool && !q.language, onClick: () => { resetNav(); load(); } }),
      link({ ic: 'i-star-fill', name: 'Favoritos', n: f.favorites, on: q.fav, onClick: () => { resetNav(); q.fav = true; load(); } }),
      link({ ic: 'i-image', name: 'Con imágenes', n: f.withImages, on: q.images === '1' && !q.trash, onClick: () => { resetNav(); q.images = '1'; load(); } }),
      link({ ic: 'i-inbox', name: 'Sin categoría', n: f.noCategory, on: q.category === '__none', onClick: () => { const k = q.category === '__none'; q.category = k ? '' : '__none'; q.list = ''; q.fav = false; q.images = ''; q.trash = false; load(); } }),
      link({ ic: 'i-trash', name: 'Papelera', n: f.trash, on: q.trash, onClick: () => { resetNav(); q.trash = true; load(); } }),
    );
    rail.appendChild(s1);

    // Vistas guardadas: una combinación de búsqueda y filtros a un clic
    const [sv, nv] = section('Vistas guardadas', { title: 'Guardar la búsqueda y los filtros actuales', fn: guardaVista });
    (S.M.views || []).forEach(v => nv.appendChild(link({
      ic: 'i-search', name: v.name, on: false,
      onClick: () => { resetNav(); S.q.q = ''; Object.assign(S.q, v.q || {}); S.labels = new Set(v.labels || []); if (R.si) R.si.value = S.q.q || ''; load(); },
      menu: (a) => K.menu(a, [{ label: 'Borrar vista', icon: 'i-trash', danger: true, onClick: async () => { try { await K.del('/api/prompts/views/' + v.id); await loadMeta(); renderRail(); } catch (e) { K.fail(e); } } }], { align: 'end' }),
    })));
    if (!(S.M.views || []).length) { const p = el('p', 'k-faint', 'Filtra o busca y pulsa + para guardar la combinación'); p.style.cssText = 'font-size:12.5px;padding:4px 8px'; nv.appendChild(p); }
    rail.appendChild(sv);

    // Categorías en árbol
    const [s2, n2] = section('Categorías', { title: 'Nueva categoría', fn: () => editCategory(null) });
    const pinta = (parent, depth) => {
      S.M.categories.filter(c => (c.parent || '') === parent).forEach(c => {
        const total = countTree(c.id);
        n2.appendChild(link({
          emoji: c.emoji, color: c.color, name: c.name, n: total, depth, on: q.category === c.id,
          onClick: () => { const k = q.category === c.id; q.category = k ? '' : c.id; q.list = ''; q.fav = false; q.images = ''; q.trash = false; load(); },
          menu: (a) => K.menu(a, [
            { label: 'Editar…', icon: 'i-pencil', onClick: () => editCategory(c) },
            { label: 'Añadir subcategoría…', icon: 'i-plus', onClick: () => editCategory(null, c.id) },
            '-', { label: 'Borrar', icon: 'i-trash', danger: true, onClick: () => delMeta('categories', c) },
          ], { align: 'end' }),
        }));
        pinta(c.id, depth + 1);
      });
    };
    pinta('', 0);
    if (!S.M.categories.length) n2.appendChild(el('p', 'k-faint', 'Crea tu primera categoría con +')).style.cssText = 'font-size:12.5px;padding:4px 8px';
    rail.appendChild(s2);

    // Listas
    const [s3, n3] = section('Listas', { title: 'Nueva lista', fn: () => editList(null) });
    S.M.lists.forEach(l => n3.appendChild(link({
      emoji: l.emoji || '📌', color: l.color, name: l.name, n: f.list[l.id] || 0, on: q.list === l.id,
      onClick: () => { const k = q.list === l.id; resetNav(); q.list = k ? '' : l.id; load(); },
      menu: (a) => K.menu(a, [{ label: 'Editar…', icon: 'i-pencil', onClick: () => editList(l) }, '-', { label: 'Borrar', icon: 'i-trash', danger: true, onClick: () => delMeta('lists', l) }], { align: 'end' }),
    })));
    if (!S.M.lists.length) { const p = el('p', 'k-faint', 'Agrupa prompts de un proyecto con una lista'); p.style.cssText = 'font-size:12.5px;padding:4px 8px'; n3.appendChild(p); }
    rail.appendChild(s3);

    // Tipo
    const [s4, n4] = section('Tipo', { title: 'Editar nombres e iconos de los tipos', fn: manageKinds });
    kindDefs().forEach(k => { if (f.kind[k.id]) n4.appendChild(link({ ic: k.icon, name: k.name, n: f.kind[k.id], on: q.kind === k.id, onClick: () => { q.kind = q.kind === k.id ? '' : k.id; load(); }, menu: a => K.menu(a, [{ label: 'Editar nombre e icono…', icon: 'i-pencil', onClick: () => editKind(k) }], { align: 'end' }) })); });
    rail.appendChild(s4);

    // Estado
    const [s5, n5] = section('Estado');
    Object.entries(STATUS).forEach(([k, name]) => { if (f.status[k]) n5.appendChild(link({ name, n: f.status[k], color: { borrador: '#94a3b8', probando: '#f59e0b', final: '#22c55e', archivado: '#64748b' }[k], on: q.status === k, onClick: () => { q.status = q.status === k ? '' : k; load(); } })); });
    if (n5.children.length) rail.appendChild(s5);

    // Modelo
    const modelos = Object.entries(f.model).sort((a, b) => b[1] - a[1]);
    if (modelos.length) {
      const [s6, n6] = section('Modelo');
      (S.modelsAll ? modelos : modelos.slice(0, 8)).forEach(([m, n]) => n6.appendChild(link({ ic: 'i-server', name: m, n, on: K.valores.clave(q.model) === K.valores.clave(m), onClick: () => { q.model = q.model === m ? '' : m; load(); } })));
      if (modelos.length > 8) { const b = el('button', 'btn ghost tiny', S.modelsAll ? 'Ver menos' : `Ver ${modelos.length - 8} más`); b.type = 'button'; b.style.margin = '4px 0 0 6px'; b.addEventListener('click', () => { S.modelsAll = !S.modelsAll; renderRail(); }); n6.appendChild(b); }
      rail.appendChild(s6);
    }
    // Herramienta
    const herrs = Object.entries(f.tool || {}).sort((a, b) => b[1] - a[1]);
    if (herrs.length) {
      const [s7, n7] = section('Herramienta');
      (S.toolsAll ? herrs : herrs.slice(0, 8)).forEach(([m, n]) => n7.appendChild(link({ ic: 'i-sparkle', name: m, n, on: K.valores.clave(q.tool) === K.valores.clave(m), onClick: () => { q.tool = q.tool === m ? '' : m; load(); } })));
      if (herrs.length > 8) { const b = el('button', 'btn ghost tiny', S.toolsAll ? 'Ver menos' : `Ver ${herrs.length - 8} más`); b.type = 'button'; b.style.margin = '4px 0 0 6px'; b.addEventListener('click', () => { S.toolsAll = !S.toolsAll; renderRail(); }); n7.appendChild(b); }
    }

    // Etiquetas
    const used = K.labels.list.filter(l => f.label[l.id]);
    if (used.length) {
      const s7 = el('div', 'pr-sec'); const h = el('h4'); h.appendChild(el('span', null, 'Etiquetas'));
      const g = el('button'); g.type = 'button'; g.appendChild(icon('i-pencil')); g.title = 'Gestionar etiquetas'; g.addEventListener('click', () => K.manageLabels()); h.appendChild(g);
      const ch = el('div', 'k-chips'); ch.style.padding = '2px 4px 4px';
      used.forEach(l => {
        const c = K.labelChip(l, { onClick: () => { if (S.labels.has(l.id)) S.labels.delete(l.id); else S.labels.add(l.id); load(); } });
        c.append(el('span', null, ' ' + f.label[l.id])); c.lastChild.style.opacity = '.6';
        if (S.labels.size && !S.labels.has(l.id)) c.classList.add('is-off');
        ch.appendChild(c);
      });
      s7.append(h, ch); rail.appendChild(s7);
    }
  }
  function countTree(id) {
    const ids = new Set([id]); let grow = true;
    while (grow) { grow = false; for (const c of S.M.categories) if (c.parent && ids.has(c.parent) && !ids.has(c.id)) { ids.add(c.id); grow = true; } }
    let n = 0; ids.forEach(i => { n += S.M.facets.category[i] || 0; }); return n;
  }


  Object.assign(C, { link, resetNav, section, guardaVista, renderRail, countTree });
})();
