'use strict';
/* tarjetas: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S, STATUS } = C;
  const bulk = (...a) => C.bulk(...a);
  const catBy = (...a) => C.catBy(...a);
  const clearAll = (...a) => C.clearAll(...a);
  const colorOf = (...a) => C.colorOf(...a);
  const copyPrompt = (...a) => C.copyPrompt(...a);
  const duplicar = (...a) => C.duplicar(...a);
  const imgUrl = (...a) => C.imgUrl(...a);
  const kindBy = (...a) => C.kindBy(...a);
  const leeVar = (...a) => C.leeVar(...a);
  const listBy = (...a) => C.listBy(...a);
  const load = (...a) => C.load(...a);
  const openDetail = (...a) => C.openDetail(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const patch = (...a) => C.patch(...a);
  const purge = (...a) => C.purge(...a);
  const renderRail = (...a) => C.renderRail(...a);
  const renderSelbar = (...a) => C.renderSelbar(...a);
  const toggleSel = (...a) => C.toggleSel(...a);

  /* ---------- Render ---------- */
  function render() {
    if (!S.built || !S.M) return;
    const f = S.M.facets;
    R.sub.textContent = S.q.trash ? `${f.trash} en la papelera` : `${f.total} prompt${f.total === 1 ? '' : 's'} guardado${f.total === 1 ? '' : 's'}`;
    R.seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.v === S.view));
    R.selb.classList.toggle('is-on', S.selMode);
    renderRail();
    renderActive();
    R.count.textContent = S.total === S.items.length ? `${S.total} resultado${S.total === 1 ? '' : 's'}` : `${S.items.length} de ${S.total}`;
    const c = R.content; c.textContent = '';
    if (S.q.trash && f.trash) {
      const b = el('div', 'k-row'); b.style.marginBottom = '12px';
      b.append(el('span', 'k-faint', 'Los prompts en la papelera se borran solos pasados unos días.'));
      const v = el('button', 'btn sm danger', 'Vaciar papelera'); v.type = 'button'; v.addEventListener('click', async () => { if (await K.confirm('Se borrarán para siempre, con sus imágenes.', { ok: 'Vaciar', danger: true })) { try { await K.del('/api/prompts'); load(); } catch (e) { K.fail(e); } } });
      b.appendChild(v); c.appendChild(b);
    }
    if (!S.items.length) { c.appendChild(emptyState()); renderSelbar(); return; }
    if (S.view === 'list') {
      const l = el('div', 'pr-list'); S.items.forEach(p => l.appendChild(row(p))); c.appendChild(l);
    } else if (S.view === 'board') {
      const b = el('div', 'pr-board');
      Object.entries(STATUS).forEach(([k, name]) => {
        const col = el('div', 'pr-col'); const items = S.items.filter(p => p.status === k);
        const h = el('h4'); h.append(el('span', null, name), el('span', null, String(items.length))); col.appendChild(h);
        items.forEach(p => col.appendChild(card(p)));
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
        col.addEventListener('dragleave', () => col.classList.remove('drop'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('drop');
          const id = e.dataTransfer.getData('text/plain'); const p = S.items.find(x => x.id === id);
          if (!p || p.status === k) return;
          try { await K.put('/api/prompts/' + id, { status: k }); K.bus.emit('prompts'); load(); } catch (er) { K.fail(er); }
        });
        b.appendChild(col);
      });
      c.appendChild(b);
    } else {
      const g = el('div', 'pr-grid'); S.items.forEach(p => g.appendChild(card(p))); c.appendChild(g);
    }
    if (S.view !== 'board' && S.items.length < S.total) {
      const m = el('div', 'pr-more'); const b = el('button', 'btn', `Cargar más (${S.total - S.items.length})`); b.type = 'button'; b.addEventListener('click', () => load(true)); m.appendChild(b); c.appendChild(m);
    }
    renderSelbar();
  }

  function renderActive() {
    const a = R.active; a.textContent = ''; const q = S.q;
    const chip = (txt, fn, color) => { const c = el('span', 'k-chip btnlike'); c.style.setProperty('--c', color || '#6366f1'); c.append(el('span', null, txt), el('span', null, ' ×')); c.addEventListener('click', fn); a.appendChild(c); };
    if (q.q) chip(`“${q.q}”`, () => { q.q = ''; R.si.value = ''; load(); });
    if (q.category === '__none') chip('Sin categoría', () => { q.category = ''; load(); });
    else if (q.category && catBy(q.category)) chip(`${catBy(q.category).emoji || ''} ${catBy(q.category).name}`, () => { q.category = ''; load(); }, catBy(q.category).color);
    if (q.list && listBy(q.list)) chip(`Lista: ${listBy(q.list).name}`, () => { q.list = ''; load(); }, listBy(q.list).color);
    if (q.kind) chip(`Tipo: ${kindBy(q.kind).name}`, () => { q.kind = ''; load(); });
    if (q.status) chip(`Estado: ${STATUS[q.status]}`, () => { q.status = ''; load(); });
    if (q.model) chip(`Modelo: ${q.model}`, () => { q.model = ''; load(); });
    if (q.tool) chip(`Herramienta: ${q.tool}`, () => { q.tool = ''; load(); });
    if (q.language) chip(`Idioma: ${q.language}`, () => { q.language = ''; load(); });
    if (q.minRating) chip(`★ ${q.minRating}+`, () => { q.minRating = 0; load(); }, '#f59e0b');
    if (q.images) chip(q.images === '1' ? 'Con imágenes' : 'Sin imágenes', () => { q.images = ''; load(); });
    if (q.cal) chip('En el calendario', () => { q.cal = false; load(); }, '#8b5cf6');
    if (q.from || q.to) chip(`${q.from || '…'} → ${q.to || '…'}`, () => { q.from = q.to = ''; load(); });
    S.labels.forEach(id => { const l = K.labels.by[id]; if (l) chip('# ' + l.name, () => { S.labels.delete(id); load(); }, l.color); });
  }

  function emptyState() {
    const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon(S.q.trash ? 'i-trash' : 'i-sparkle')); e.appendChild(em);
    const filtrado = S.q.q || S.q.category || S.q.list || S.q.kind || S.q.status || S.q.model || S.q.tool || S.q.language || S.q.fav || S.q.minRating || S.q.images || S.q.cal || S.labels.size || S.q.from || S.q.to;
    if (S.q.trash) { e.append(el('h3', null, 'La papelera está vacía'), el('p', null, 'Los prompts que borres aparecerán aquí.')); return e; }
    if (filtrado) {
      e.append(el('h3', null, 'Nada coincide con esos filtros'), el('p', null, 'Prueba a quitar alguno.'));
      const b = el('button', 'btn', 'Limpiar filtros'); b.type = 'button'; b.addEventListener('click', clearAll); e.appendChild(b); return e;
    }
    e.append(el('h3', null, 'Tu biblioteca de prompts está vacía'), el('p', null, 'Guarda el primero con su texto, categoría, etiquetas e imágenes de muestra.'));
    const b = el('button', 'btn primary', 'Crear el primer prompt'); b.type = 'button'; b.addEventListener('click', () => openEditor(null)); e.appendChild(b);
    return e;
  }

  // Texto con las {{variables}} resaltadas, sin tocar innerHTML. Las que llevan valor por
  // defecto o lista se muestran solo con su nombre (el texto completo va en el tooltip).
  function conVars(texto, completo) {
    const frag = document.createDocumentFragment();
    String(texto).split(/(\{\{[^{}\n]{1,120}\}\})/g).forEach(parte => {
      const m = /^\{\{([^{}\n]{1,120})\}\}$/.exec(parte);
      if (m) {
        const v = leeVar(m[1]);
        const s = el('span', 'var', completo ? parte : `{{${v.nombre}}}`);
        if (v.opciones.length) s.classList.add('lista');
        s.title = v.opciones.length ? `Lista: ${v.opciones.join(' · ')}` : (v.def ? `Por defecto: ${v.def}` : 'Variable');
        frag.appendChild(s);
      } else if (parte) frag.appendChild(document.createTextNode(parte));
    });
    return frag;
  }

  function card(p) {
    const c = el('article', 'pr-card' + (S.sel.has(p.id) ? ' is-sel' : '') + (S.selMode ? ' sel-mode' : ''));
    c.style.setProperty('--c', colorOf(p)); c.tabIndex = 0; c.draggable = S.view === 'board';
    c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', p.id));
    const cover = el('div', 'pr-cover');
    if (p.cover) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imgUrl(p.id, p.cover, true); cover.appendChild(im); }
    else { const ph = el('div', 'ph'); ph.appendChild(icon(kindBy(p.kind).icon)); cover.appendChild(ph); }
    const badges = el('div', 'pr-badges'); badges.appendChild(el('span', 'pr-badge ' + p.status, STATUS[p.status] || p.status)); cover.appendChild(badges);
    if (p.images.length > 1) { const n = el('span', 'nimg'); n.append(icon('i-image'), document.createTextNode(String(p.images.length))); cover.appendChild(n); }
    if (p.pinned) { const pin = el('span', 'pr-pin'); pin.appendChild(icon('i-pin-fill')); cover.appendChild(pin); }
    const fav = el('button', 'pr-fav' + (p.favorite ? ' on' : '')); fav.type = 'button'; fav.appendChild(icon(p.favorite ? 'i-star-fill' : 'i-star')); fav.title = 'Favorito';
    fav.addEventListener('click', async (e) => { e.stopPropagation(); try { await K.put('/api/prompts/' + p.id, { favorite: !p.favorite }); p.favorite = !p.favorite; fav.classList.toggle('on', p.favorite); fav.replaceChildren(icon(p.favorite ? 'i-star-fill' : 'i-star')); S.M.facets.favorites += p.favorite ? 1 : -1; renderRail(); } catch (er) { K.fail(er); } });
    cover.appendChild(fav);
    const chk = el('div', 'pr-chk'); chk.appendChild(icon('i-check')); cover.appendChild(chk);
    c.appendChild(cover);

    const body = el('div', 'pr-body');
    body.appendChild(el('h3', 'pr-title', p.title));
    const sn = el('p', 'pr-snip'); sn.appendChild(conVars(p.snippet)); body.appendChild(sn);
    const chips = el('div', 'k-chips');
    const cat = catBy(p.category);
    if (cat) { const ch = el('span', 'k-chip'); ch.style.setProperty('--c', cat.color); ch.textContent = `${cat.emoji || ''} ${cat.name}`.trim(); chips.appendChild(ch); }
    p.labels.slice(0, 3).forEach(l => { const ch = K.labelChip(l); if (ch) chips.appendChild(ch); });
    if (p.labels.length > 3) chips.appendChild(el('span', 'k-chip', `+${p.labels.length - 3}`));
    if (chips.children.length) body.appendChild(chips);
    const foot = el('div', 'pr-foot');
    // Los datos (modelo, valoración, fecha) van agrupados y pueden pasar a otra línea; el botón no se sale de la tarjeta
    const meta = el('div', 'pr-meta');
    if (p.model) meta.appendChild(K.chipValor('prompts.model', p.model));
    if (p.tool) meta.appendChild(K.chipValor('prompts.tool', p.tool));
    if (p.rating) meta.appendChild(el('span', 'pr-rate', '★ ' + p.rating));
    if (p.cal) { const cl = el('span', 'pr-date'); cl.appendChild(icon('i-calendar')); cl.firstChild.style.cssText = 'width:12px;height:12px;vertical-align:-1px;flex:none'; cl.append(' ' + K.d.short(K.d.parse(p.cal.date))); cl.title = 'En el calendario'; meta.appendChild(cl); }
    if (meta.children.length) foot.appendChild(meta);
    foot.appendChild(el('span', 'grow'));
    if (!S.q.trash) {
      const cp = el('button', 'btn tiny pr-copy'); cp.type = 'button'; cp.append(icon('i-copy'), document.createTextNode('Copiar'));
      cp.addEventListener('click', (e) => { e.stopPropagation(); copyPrompt(p.id); });
      foot.appendChild(cp);
    } else foot.appendChild(el('span', null, 'Borrado ' + K.ago(p.deletedAt)));
    body.appendChild(foot);
    c.appendChild(body);
    activate(c, p);
    return c;
  }

  function row(p) {
    const r = el('article', 'pr-row'); r.style.setProperty('--c', colorOf(p)); r.tabIndex = 0;
    const th = el('div', 'th'); if (p.cover) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imgUrl(p.id, p.cover, true); th.appendChild(im); } else th.appendChild(icon(kindBy(p.kind).icon));
    const mid = el('div'); mid.style.minWidth = 0;
    const h = el('h3'); h.append(document.createTextNode(p.title));
    if (p.favorite) { const s = icon('i-star-fill'); s.style.cssText = 'width:14px;height:14px;color:#fbbf24;margin-left:6px;vertical-align:-1px'; h.appendChild(s); }
    const sn = el('p'); sn.textContent = p.snippet.replace(/\s+/g, ' ');
    const chips = el('div', 'k-chips'); chips.style.marginTop = '6px';
    const cat = catBy(p.category); if (cat) { const ch = el('span', 'k-chip'); ch.style.setProperty('--c', cat.color); ch.textContent = `${cat.emoji || ''} ${cat.name}`.trim(); chips.appendChild(ch); }
    p.labels.slice(0, 4).forEach(l => { const ch = K.labelChip(l); if (ch) chips.appendChild(ch); });
    mid.append(h, sn, chips);
    const side = el('div', 'side');
    if (p.model) side.appendChild(K.chipValor('prompts.model', p.model));
    if (p.tool) side.appendChild(K.chipValor('prompts.tool', p.tool));
    side.appendChild(el('span', 'pr-badge ' + p.status, STATUS[p.status]));
    if (p.rating) { const rr = el('span', null, '★ ' + p.rating); rr.style.color = '#fbbf24'; side.appendChild(rr); }
    side.appendChild(el('span', null, K.ago(p.updatedAt)));
    if (S.selMode) { const ck = el('span', 'cal-check' + (S.sel.has(p.id) ? ' on' : '')); ck.style.setProperty('--c', '#6366f1'); ck.appendChild(icon('i-check')); side.prepend(ck); }
    r.append(th, mid, side);
    activate(r, p);
    return r;
  }

  function activate(node, p) {
    const go = (e) => {
      if (S.selMode) { e.preventDefault(); toggleSel(p.id, node); return; }
      openDetail(p.id);
    };
    node.addEventListener('click', go);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      K.menu({ x: e.clientX, y: e.clientY }, S.q.trash ? [
        { label: 'Restaurar', icon: 'i-restore', onClick: () => bulk([p.id], 'restore') },
        { label: 'Borrar para siempre', icon: 'i-trash', danger: true, onClick: () => purge([p.id]) },
      ] : [
        { label: 'Abrir', icon: 'i-external', onClick: () => openDetail(p.id) },
        { label: 'Copiar prompt', icon: 'i-copy', onClick: () => copyPrompt(p.id) },
        { label: 'Editar…', icon: 'i-pencil', onClick: () => openEditor(p.id) },
        { label: 'Duplicar', icon: 'i-stack', onClick: () => duplicar(p.id) },
        { label: p.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'i-pin', onClick: () => patch(p.id, { pinned: !p.pinned }) },
        '-', { label: 'Enviar a la papelera', icon: 'i-trash', danger: true, onClick: () => bulk([p.id], 'delete') },
      ]);
    });
  }


  Object.assign(C, { render, renderActive, emptyState, conVars, card, row, activate });
})();
