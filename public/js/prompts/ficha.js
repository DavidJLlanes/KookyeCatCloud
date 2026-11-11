'use strict';
/* prompts/ficha.js: parte del módulo (se carga con el resto de prompts/ en index.html). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { S, STATUS } = C;
  const PRO = (...a) => C.PRO(...a);
  const bulk = (...a) => C.bulk(...a);
  const catBy = (...a) => C.catBy(...a);
  const conVars = (...a) => C.conVars(...a);
  const copyPrompt = (...a) => C.copyPrompt(...a);
  const duplicar = (...a) => C.duplicar(...a);
  const imgUrl = (...a) => C.imgUrl(...a);
  const kindBy = (...a) => C.kindBy(...a);
  const listBy = (...a) => C.listBy(...a);
  const load = (...a) => C.load(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const parseVars = (...a) => C.parseVars(...a);
  const patch = (...a) => C.patch(...a);
  const purge = (...a) => C.purge(...a);
  const resetNav = (...a) => C.resetNav(...a);
  const varsDe = (...a) => C.varsDe(...a);

  /* ---------- Ficha ---------- */
  /* ---------- Vínculo con Código ---------- */
  // Ficha de un prompt de tipo código: proyectos de Código donde está guardado su resultado.
  // El vínculo va en los dos lados (lib/vinculos.js), así que desde el proyecto también se llega al prompt.
  function bloqueCodigo(p, cerrar) {
    const b = el('div', 'pd-blk pd-vinc');
    const h = el('header'); h.appendChild(el('span', null, 'Resultado en Código'));
    const acc = el('div', 'pd-vinc-acc');
    const nuevo = el('button', 'btn sm'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', null, 'Crear proyecto'));
    const vinc = el('button', 'btn sm'); vinc.type = 'button'; vinc.append(icon('i-link'), el('span', null, 'Vincular…'));
    acc.append(nuevo, vinc); h.appendChild(acc);
    const lista = el('div', 'pd-vinc-lista'); b.append(h, lista);
    let vivos = [];
    const pinta = async () => {
      try { vivos = (await K.get('/api/vinculos/codigo/prompt/' + p.id)).proyectos; }
      catch (e) { lista.textContent = ''; lista.appendChild(el('p', 'pd-vinc-vacio', 'No se pudieron cargar los proyectos vinculados')); return; }
      lista.textContent = '';
      if (!vivos.length) { lista.appendChild(el('p', 'pd-vinc-vacio', 'Todavía no hay ningún proyecto de Código vinculado. Crea uno con este prompt o vincula uno que ya tengas.')); return; }
      vivos.forEach(x => {
        const fila = el('div', 'pd-vinc-fila'); fila.appendChild(el('span', 'pd-vinc-n', x.nombre));
        const ver = el('button', 'btn sm'); ver.type = 'button'; ver.append(icon('i-code'), el('span', null, 'Ver'));
        ver.setAttribute('aria-label', `Ver el proyecto ${x.nombre}`);
        ver.addEventListener('click', () => { cerrar(); K.open('codigo', x.id); });
        const q = el('button', 'btn sm ghost icon'); q.type = 'button'; q.title = 'Quitar el vínculo'; q.setAttribute('aria-label', `Quitar el vínculo con ${x.nombre}`); q.appendChild(icon('i-x'));
        q.addEventListener('click', async () => {
          try { await K.post('/api/vinculos/codigo/quitar', { promptId: p.id, proyectoId: x.id }); K.toast('Vínculo quitado'); pinta(); } catch (e) { K.fail(e); }
        });
        fila.append(ver, q); lista.appendChild(fila);
      });
    };
    nuevo.addEventListener('click', async () => {
      nuevo.disabled = true;
      try {
        await K.post('/api/vinculos/codigo/crear-proyecto', { promptId: p.id });
        K.toast('Proyecto creado y vinculado'); if (K.game && K.game.load) K.game.load();
        await pinta();
      } catch (e) { K.fail(e); } finally { nuevo.disabled = false; }
    });
    vinc.addEventListener('click', async () => {
      try {
        const todos = (await K.get('/api/codigo')).items.filter(x => !vivos.some(v => v.id === x.id));
        if (!todos.length) { K.toast(vivos.length ? 'No quedan más proyectos por vincular' : 'Todavía no tienes proyectos en Código'); return; }
        K.menu(vinc, todos.map(x => ({ label: x.nombre, onClick: async () => {
          try { await K.post('/api/vinculos/codigo', { promptId: p.id, proyectoId: x.id }); K.toast('Proyecto vinculado'); pinta(); } catch (e) { K.fail(e); }
        } })));
      } catch (e) { K.fail(e); }
    });
    pinta();
    return b;
  }

  async function openDetail(id) {
    let p;
    try { p = await K.get('/api/prompts/' + id); } catch (e) { K.fail(e); return; }
    const idx = S.items.findIndex(i => i.id === id);
    const root = el('div', 'pd');
    let cur = 0;
    // Galería
    const gal = el('div', 'pd-gal');
    if (p.images.length) {
      const main = el('div', 'pd-main'); const im = el('img'); im.alt = p.title; main.appendChild(im);
      const cap = el('div', 'cap'); main.appendChild(cap);
      const thumbs = el('div', 'pd-thumbs');
      const show = (i) => {
        cur = (i + p.images.length) % p.images.length; const x = p.images[cur];
        im.src = imgUrl(p.id, x.id); cap.textContent = x.caption || ''; cap.hidden = !x.caption;
        thumbs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === cur));
      };
      p.images.forEach((x, i) => { const b = el('button'); b.type = 'button'; const t = el('img'); t.src = imgUrl(p.id, x.id, true); t.alt = ''; b.appendChild(t); b.addEventListener('click', () => show(i)); thumbs.appendChild(b); });
      if (p.images.length > 1) {
        for (const [cls, d, rot] of [['l', -1, true], ['r', 1, false]]) { const a = el('button', 'arrow ' + cls); a.type = 'button'; const ic = icon('i-caret'); if (rot) ic.style.transform = 'rotate(180deg)'; a.appendChild(ic); a.addEventListener('click', () => show(cur + d)); main.appendChild(a); }
      }
      // Visor a pantalla completa con zoom (rueda, pellizco, doble toque); empieza en la foto que se ve
      im.addEventListener('click', () => {
        if (window.KZoom) KZoom.lightbox({ items: p.images.map(x => ({ src: imgUrl(p.id, x.id), caption: x.caption || '' })), index: cur, title: p.title });
        else window.open(imgUrl(p.id, p.images[cur].id), '_blank', 'noopener');
      });
      gal.append(main); if (p.images.length > 1) gal.appendChild(thumbs);
      show(Math.max(0, p.images.findIndex(x => x.id === p.cover)));
    } else {
      const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon(kindBy(p.kind).icon)); e.append(em, el('p', null, 'Sin imágenes de muestra'));
      if (!p.deletedAt) { const b = el('button', 'btn sm', 'Añadir imágenes'); b.type = 'button'; b.addEventListener('click', () => { m.close(); openEditor(p.id); }); e.appendChild(b); }
      gal.appendChild(e);
    }

    // Información
    const info = el('div', 'pd-info');
    const top = el('div', 'k-row'); top.style.cssText = 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap';
    const h2 = el('h2', null, p.title);
    const x = el('button', 'btn ghost icon'); x.type = 'button'; x.appendChild(icon('i-x')); x.addEventListener('click', () => m.close());
    top.append(h2, x); info.appendChild(top);

    // Propiedades con título; cada valor es un botón que cierra la ficha y filtra la biblioteca
    const props = el('div', 'pd-props');
    const filtra = (fn) => () => { m.close(); resetNav(); S.labels.clear(); fn(); load(); };
    const valor = (txt, color, fn, ic) => {
      const c = el('button', 'k-chip btnlike pd-val'); c.type = 'button'; c.style.setProperty('--c', color);
      if (ic) { const i = icon(ic); i.style.cssText = 'width:13px;height:13px'; c.appendChild(i); }
      c.appendChild(document.createTextNode(txt)); c.title = 'Ver los prompts con este valor';
      c.addEventListener('click', filtra(fn)); return c;
    };
    const fila = (titulo, nodos) => {
      if (!nodos.length) return;
      const r = el('div', 'pd-prop'); r.appendChild(el('span', 'pd-pk', titulo));
      const v = el('div', 'k-chips pd-pv'); nodos.forEach(n => v.appendChild(n)); r.appendChild(v); props.appendChild(r);
    };
    const cat = catBy(p.category);
    fila('Categoría', cat ? [valor(`${cat.emoji || ''} ${cat.name}`.trim(), cat.color, () => { S.q.category = cat.id; })] : []);
    fila('Listas', (p.lists || []).map(listBy).filter(Boolean).map(l => valor(`${l.emoji || '📌'} ${l.name}`, l.color, () => { S.q.list = l.id; })));
    const kd = kindBy(p.kind);
    fila('Tipo', [valor(kd.name, '#64748b', () => { S.q.kind = p.kind; }, kd.icon)]);
    fila('Estado', [valor(STATUS[p.status] || p.status, { borrador: '#94a3b8', probando: '#f59e0b', final: '#22c55e', archivado: '#64748b' }[p.status] || '#64748b', () => { S.q.status = p.status; })]);
    fila('Modelo', p.model ? [valor(p.model, '#06b6d4', () => { S.q.model = p.model; }, 'i-server')] : []);
    fila('Idioma', p.language ? [valor(p.language, '#10b981', () => { S.q.language = p.language; })] : []);
    fila('Herramienta', p.tool ? [valor(p.tool, '#8b5cf6', () => { S.q.tool = p.tool; }, 'i-sparkle')] : []);
    fila('Etiquetas', (p.labels || []).map(id => K.labels.by[id]).filter(Boolean).map(l => valor(l.name, l.color, () => { S.labels.add(l.id); })));
    info.appendChild(props);

    const meta = el('div', 'pd-meta');
    const st = K.stars(p.rating, async (v) => { try { await K.put('/api/prompts/' + p.id, { rating: v }); p.rating = v; K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }, { readonly: !!p.deletedAt });
    meta.appendChild(st);
    const fav = el('span'); fav.style.cursor = 'pointer';
    const pintaFav = () => { fav.replaceChildren(icon(p.favorite ? 'i-star-fill' : 'i-star'), document.createTextNode(p.favorite ? 'Favorito' : 'Marcar favorito')); fav.style.color = p.favorite ? '#fbbf24' : ''; };
    pintaFav(); fav.addEventListener('click', async () => { try { await K.put('/api/prompts/' + p.id, { favorite: !p.favorite }); p.favorite = !p.favorite; pintaFav(); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } });
    if (!p.deletedAt) meta.appendChild(fav);
    const dd = el('span'); dd.append(icon('i-clock'), document.createTextNode(`Creado ${K.d.short(new Date(p.createdAt))}`)); meta.appendChild(dd);
    if (p.updatedAt - p.createdAt > 60000) { const u = el('span'); u.textContent = `Editado ${K.ago(p.updatedAt)}`; meta.appendChild(u); }
    if (PRO() && (p.body || p.system)) { const t = el('span', null, `≈ ${PRO().tokens((p.system || '') + (p.body || '')).toLocaleString('es')} tokens`); t.title = 'Estimación aproximada (unos 4 caracteres por token)'; meta.appendChild(t); }
    if (p.uses) { const u = el('span'); u.textContent = `Usado ${p.uses} vez${p.uses === 1 ? '' : 'ces'}`.replace('veces', 'veces'); meta.appendChild(u); }
    info.appendChild(meta);

    // Calendario
    const calRow = el('div', 'k-row');
    if (p.cal) {
      const cb = el('button', 'btn sm'); cb.type = 'button'; cb.append(icon('i-calendar'), el('span', null, `En el calendario: ${K.d.short(K.d.parse(p.cal.date))}${p.cal.time ? ' ' + p.cal.time : ''}`));
      cb.addEventListener('click', () => { m.close(); switchTab('calendar'); K.calendar.goto(K.d.parse(p.cal.date), 'month'); });
      calRow.appendChild(cb);
    }
    if (!p.deletedAt) {
      const cc = el('button', 'btn ghost sm'); cc.type = 'button'; cc.append(icon('i-pencil'), el('span', null, p.cal ? 'Cambiar fecha' : 'Añadir al calendario'));
      cc.addEventListener('click', () => editCalDate(p, m));
      calRow.appendChild(cc);
      if (K.recordar) {
        const rc = el('button', 'btn ghost sm'); rc.type = 'button'; rc.append(icon('i-bell'), el('span', null, 'Recordar'));
        rc.addEventListener('click', () => { m.close(); K.recordar('prompt', p.id, p.title); });
        calRow.appendChild(rc);
      }
    }
    info.appendChild(calRow);

    // Acciones
    const acts = el('div', 'pd-actions');
    if (p.deletedAt) {
      const r = el('button', 'btn primary', 'Restaurar'); r.type = 'button'; r.addEventListener('click', async () => { m.close(); await bulk([p.id], 'restore'); });
      const d = el('button', 'btn danger', 'Borrar para siempre'); d.type = 'button'; d.addEventListener('click', () => { m.close(); purge([p.id]); });
      acts.append(r, d);
    } else {
      const cp = el('button', 'btn primary'); cp.type = 'button'; cp.append(icon('i-copy'), el('span', null, varsDe(p.body).length ? 'Copiar…' : 'Copiar prompt')); cp.addEventListener('click', () => copyPrompt(p.id, p));
      const ed = el('button', 'btn'); ed.type = 'button'; ed.append(icon('i-pencil'), el('span', null, 'Editar')); ed.addEventListener('click', () => { m.close(); openEditor(p.id); });
      const mo = el('button', 'btn ghost icon'); mo.type = 'button'; mo.appendChild(icon('i-dots'));
      mo.addEventListener('click', () => K.menu(mo, [
        { label: 'Duplicar', icon: 'i-stack', onClick: async () => { m.close(); await duplicar(p.id); } },
        { label: p.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'i-pin', onClick: async () => { m.close(); await patch(p.id, { pinned: !p.pinned }); } },
        { label: p.negative ? 'Copiar con el negativo' : 'Copiar sistema + mensaje', icon: 'i-copy', onClick: async () => {
          const ex = PRO() ? PRO().expande : async (t) => t;
          const b = await ex(p.body), n = await ex(p.negative), s = await ex(p.system);
          await K.copy((s ? s + '\n\n' : '') + b + (n ? `\n\nNegative prompt: ${n}` : '')); K.toast('Copiado');
        } },
        { label: 'Exportar…', icon: 'i-download', onClick: () => PRO() && PRO().exportar([p.id]) },
        { label: 'Compartir con enlace…', icon: 'i-link', onClick: () => PRO() && PRO().compartir([p.id]) },
        '-', { label: 'Enviar a la papelera', icon: 'i-trash', danger: true, onClick: async () => { m.close(); await bulk([p.id], 'delete'); } },
      ], { align: 'end' }));
      acts.append(cp, ed, mo);
    }
    info.appendChild(acts);
    // Notas que mencionan este prompt (enlaces internos)
    const menc = el('div'); info.appendChild(menc);
    K.get('/api/backlinks?' + K.qs({ type: 'prompt', ref: p.id })).then(r => {
      if (!r.items.length) return;
      const h = el('div', 'pd-meta'); h.append(icon('i-note'), document.createTextNode('Mencionado en: '));
      r.items.forEach(n => { const b = el('button', 'btn tiny', (n.icon ? n.icon + ' ' : '') + n.title); b.type = 'button'; b.addEventListener('click', () => { m.close(); K.open('note', n.id); }); h.appendChild(b); });
      menc.appendChild(h);
    }).catch(() => {});

    const bloque = (titulo, texto, cls) => {
      const b = el('div', 'pd-blk ' + (cls || '')); const h = el('header'); h.appendChild(el('span', null, titulo));
      const c = el('button', 'btn ghost tiny'); c.type = 'button'; c.append(icon('i-copy'), document.createTextNode('Copiar')); c.addEventListener('click', async () => { K.toast((await K.copy(texto)) ? 'Copiado' : 'No se pudo copiar'); }); h.appendChild(c);
      const pre = el('pre'); pre.appendChild(conVars(texto, true)); b.append(h, pre); return b;
    };
    const pro = PRO();
    if (p.system) info.appendChild(bloque('Mensaje de sistema', p.system));
    if (p.body) info.appendChild(bloque(pro ? pro.etiquetaCuerpo(p.kind) : 'Prompt', p.body));
    if (p.negative) info.appendChild(bloque('Prompt negativo', p.negative, 'neg'));
    if (pro && !p.deletedAt && S.M.comfy && p.kind === 'imagen' && p.body) {
      const cb = el('button', 'btn sm'); cb.type = 'button'; cb.append(icon('i-play'), el('span', null, 'Generar en ComfyUI'));
      cb.addEventListener('click', async () => {
        const pv = parseVars(p.body, p.negative);
        const txt = await pro.expande(p.body), neg = await pro.expande(p.negative);
        if (pv.length) { K.toast('Rellena las variables copiando el prompt; ComfyUI usará el texto tal cual'); }
        cb.disabled = true; await pro.generarComfy(p, txt, neg); cb.disabled = false;
      });
      info.appendChild(cb);
    }
    const pk = Object.entries(p.params || {});
    if (pk.length) { const b = el('div', 'pd-blk'); const h = el('header'); h.appendChild(el('span', null, 'Parámetros')); const dl = el('dl', 'pd-params'); pk.forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v))); b.append(h, dl); info.appendChild(b); }
    if (p.notes) info.appendChild(bloque('Notas', p.notes));
    if (pro) pro.seccionesDetalle(p, info, () => m.close());
    if (p.kind === 'codigo' && !p.deletedAt) info.appendChild(bloqueCodigo(p, () => m.close()));
    if (p.source) { const a = /^https?:\/\//i.test(p.source) ? (() => { const l = el('a', null, p.source); l.href = p.source; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.style.cssText = 'color:var(--accent-text);word-break:break-all'; return l; })() : el('span', null, p.source); const d = el('div', 'pd-meta'); d.append(icon('i-link'), document.createTextNode('Fuente: '), a); info.appendChild(d); }
    if (p.versions && p.versions.length) {
      const det = el('details'); const sm = el('summary', null, `Historial (${p.versions.length} versiones)`); sm.style.cssText = 'cursor:pointer;color:var(--muted);font-size:13px'; det.appendChild(sm);
      const vl = el('div', 'pd-vers');
      p.versions.forEach(v => { const b = el('button'); b.type = 'button'; b.append(el('span', null, v.title), el('span', 'k-faint', K.ago(v.at))); b.addEventListener('click', () => { m.close(); openEditor(p.id, { restore: v }); }); vl.appendChild(b); });
      if (K.prompts && K.prompts.comparar) {
        const cmp = el('button', 'btn sm'); cmp.type = 'button'; cmp.append(icon('i-columns'), el('span', null, 'Comparar versiones'));
        cmp.style.margin = '8px 10px 0';
        cmp.addEventListener('click', () => K.prompts.comparar(p));
        det.appendChild(cmp);
      }
      det.appendChild(vl); info.appendChild(det);
    }
    root.append(gal, info);
    const m = K.modal({ cls: 'xl flush', content: root, bare: true });
    m.el.classList.add('prompt-detail-modal');
    // Cerrar flotante para móvil (en escritorio el CSS lo oculta y vale el de la cabecera)
    const xw = el('div', 'pd-xwrap'); const xb = el('button'); xb.type = 'button'; xb.setAttribute('aria-label', 'Cerrar'); xb.appendChild(icon('i-x'));
    xb.addEventListener('click', () => m.close()); xw.appendChild(xb); m.el.insertBefore(xw, m.el.firstChild);
    // Flechas para pasar al anterior/siguiente de la lista
    const nav = (e) => {
      if (!document.body.contains(root) || e.target.closest('input,textarea')) { if (!document.body.contains(root)) document.removeEventListener('keydown', nav); return; }
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || idx < 0 || document.querySelectorAll('.overlay').length > 1) return;
      const n = S.items[idx + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { m.close(); openDetail(n.id); }
    };
    document.addEventListener('keydown', nav);
  }

  function editCalDate(p, parentModal) {
    const f = K.calField({ value: p.cal ? { date: p.cal.date, time: p.cal.time, calendarId: 'prompts' } : null, defaultCalendar: 'prompts', label: 'Mostrar en el calendario' });
    K.modal({ title: 'Fecha en el calendario', sub: p.title, content: f, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { const v = f.get(); await K.put('/api/prompts/' + p.id, { calendar: v }); K.bus.emit('prompts'); K.bus.emit('calendar'); parentModal.close(); load(); openDetail(p.id); } catch (e) { K.fail(e); return false; }
    } }] });
  }


  Object.assign(C, { bloqueCodigo, openDetail, editCalDate });
})();
