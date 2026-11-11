'use strict';
/* editor: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { S, STATUS } = C;
  const PRO = (...a) => C.PRO(...a);
  const editCategory = (...a) => C.editCategory(...a);
  const imgUrl = (...a) => C.imgUrl(...a);
  const kindDefs = (...a) => C.kindDefs(...a);
  const load = (...a) => C.load(...a);
  const parseVars = (...a) => C.parseVars(...a);

  /* ---------- Editor ---------- */
  async function openEditor(id, extra = {}) {
    await Promise.all([K.loadLabels(), K.loadCalendars()]).catch(() => {});
    let p = null;
    if (id) { try { p = await K.get('/api/prompts/' + id); } catch (e) { K.fail(e); return; } }
    const nuevo = !p;
    if (extra.restore && p) { p = { ...p, title: extra.restore.title, body: extra.restore.body, negative: extra.restore.negative, system: extra.restore.system !== undefined ? extra.restore.system : p.system }; K.toast('Versión anterior cargada: pulsa Guardar para aplicarla'); }
    const d = p || { title: '', body: '', negative: '', system: '', chain: [], outputs: [], notes: '', kind: 'imagen', status: 'borrador', model: '', tool: '', language: '', source: '', rating: 0, favorite: false, category: S.q.category && S.q.category !== '__none' ? S.q.category : '', labels: [...S.labels], lists: S.q.list ? [S.q.list] : [], params: {}, images: [], color: '', cal: null };

    const root = el('div', 'pe-grid');
    const left = el('div'); const right = el('div');
    const fld = (label, node, tight) => { const l = el('label', 'field' + (tight ? ' tight' : '')); l.append(el('span', null, label), node); return l; };
    const title = el('input'); title.value = d.title; title.maxLength = 200; title.placeholder = 'Nombre descriptivo del prompt';
    title.style.cssText = 'font-size:18px;font-weight:650';
    const body = el('textarea', 'pe-textarea'); body.value = d.body; body.placeholder = 'Escribe el prompt. Usa {{variable}} para huecos que rellenarás al copiar.'; body.rows = 9;
    const tb = el('div', 'pe-toolbar');
    const bv = el('button', 'btn tiny', '{{ }} Variable ▾'); bv.type = 'button';
    // Inserta una variable de cada tipo; si hay texto seleccionado, lo usa como nombre
    const poneVar = (plantilla) => {
      const st = body.selectionStart, e2 = body.selectionEnd; const sel = body.value.slice(st, e2);
      const txt = plantilla.replace('NOMBRE', sel || 'nombre');
      body.setRangeText(txt, st, e2, 'select'); body.focus(); upd();
    };
    bv.addEventListener('click', () => K.menu(bv, [
      { head: 'Insertar variable' },
      { label: 'Campo de texto  {{nombre}}', onClick: () => poneVar('{{NOMBRE}}') },
      { label: 'Con valor por defecto  {{nombre=valor}}', onClick: () => poneVar('{{NOMBRE=valor}}') },
      { label: 'Lista desplegable  {{nombre=a|b|c}}', onClick: () => poneVar('{{NOMBRE=opción 1|opción 2|opción 3}}') },
      { label: 'Texto largo  {{nombre:largo}}', onClick: () => poneVar('{{NOMBRE:largo}}') },
      { label: 'Número  {{nombre:numero}}', onClick: () => poneVar('{{NOMBRE:numero}}') },
      { label: 'Fecha  {{nombre:fecha}}', onClick: () => poneVar('{{NOMBRE:fecha}}') },
    ]));
    const cnt = el('span', 'k-faint'); cnt.style.cssText = 'font-size:12px;margin-left:auto;align-self:center';
    const vistaVars = el('div', 'k-chips'); vistaVars.style.margin = '2px 0 8px';
    const pro = PRO();
    const bf = el('button', 'btn tiny', '@ Fragmento ▾'); bf.type = 'button';
    bf.addEventListener('click', () => pro && pro.menuFragmentos(bf, (t) => { body.setRangeText(t, body.selectionStart, body.selectionEnd, 'end'); body.focus(); upd(); }));
    const upd = () => {
      const v = parseVars(body.value, neg.value, sys.value);
      const tk = pro ? pro.tokens(sys.value + body.value) : 0;
      cnt.textContent = `${body.value.length} caracteres${tk ? ` · ≈ ${tk.toLocaleString('es')} tokens` : ''}${v.length ? ` · ${v.length} variable${v.length === 1 ? '' : 's'}` : ''}`;
      vistaVars.textContent = '';
      v.forEach(x => { const c = el('span', 'k-chip'); c.style.setProperty('--c', x.opciones.length ? '#a855f7' : '#06b6d4'); c.textContent = x.nombre + (x.opciones.length ? ` ▾ ${x.opciones.length}` : x.def ? ` = ${x.def}` : '') + (x.tipo ? ` (${x.tipo})` : ''); vistaVars.appendChild(c); });
    };
    body.addEventListener('input', upd);
    tb.append(bv, bf, cnt);
    const neg = el('textarea', 'pe-textarea'); neg.value = d.negative; neg.rows = 3; neg.style.minHeight = '70px'; neg.placeholder = 'Qué evitar (opcional)';
    const sys = el('textarea', 'pe-textarea'); sys.value = d.system || ''; sys.rows = 4; sys.placeholder = 'Rol e instrucciones permanentes (opcional). Admite {{variables}} y {{@fragmentos}}.';
    sys.addEventListener('input', upd); neg.addEventListener('input', upd); upd();
    const notes = el('textarea'); notes.value = d.notes; notes.rows = 3; notes.placeholder = 'Resultados, trucos, qué funcionó…';
    const fSys = fld('Mensaje de sistema', sys), fBody = fld('Prompt', body, true), fNeg = fld('Prompt negativo', neg);
    const btnPlant = el('button', 'btn tiny', 'Plantilla ▾'); btnPlant.type = 'button';
    btnPlant.addEventListener('click', () => pro && pro.menuPlantillas(btnPlant, kindSel.value, async (t) => {
      if ((body.value.trim() || sys.value.trim()) && !await K.confirm('Se sustituirá el texto actual por la plantilla.', { ok: 'Usar plantilla' })) return;
      kindSel.value = t.kind; aplicaTipo(); sys.value = t.system; body.value = t.body; if (!title.value.trim()) title.value = t.n; upd();
    }));
    tb.insertBefore(btnPlant, bv);
    const salidasEd = pro ? pro.salidasEditor(d.outputs, true) : null;
    const cadenaEd = pro ? pro.cadenaEditor(d.chain, id) : null;
    const fSal = salidasEd ? fld('Resultados de ejemplo (por modelo, con valoración)', salidasEd.node) : null;
    const fCad = cadenaEd ? fld('Cadena de prompts (se ejecutan uno tras otro)', cadenaEd.node) : null;
    left.append(fld('Título', title), fSys, fBody, tb, vistaVars, fNeg, fld('Notas', notes));
    if (fSal) left.appendChild(fSal);
    if (fCad) left.appendChild(fCad);

    // Parámetros
    const paramsBox = el('div', 'pe-params');
    const paramsList = Object.entries(d.params || {});
    const pintaParams = () => {
      paramsBox.textContent = '';
      paramsList.forEach((kv, i) => {
        const r = el('div', 'pr-p'); const k = el('input'); k.placeholder = 'p. ej. ar'; k.setAttribute('list', 'pe-pk'); k.value = kv[0]; const v = el('input'); v.placeholder = '16:9'; v.value = kv[1];
        k.addEventListener('input', () => { kv[0] = k.value; }); v.addEventListener('input', () => { kv[1] = v.value; });
        const x2 = el('button', 'btn ghost icon'); x2.type = 'button'; x2.appendChild(icon('i-x')); x2.addEventListener('click', () => { paramsList.splice(i, 1); pintaParams(); });
        r.append(k, v, x2); paramsBox.appendChild(r);
      });
      const add = el('button', 'btn tiny'); add.type = 'button'; add.append(icon('i-plus'), document.createTextNode('Añadir parámetro')); add.addEventListener('click', () => { paramsList.push(['', '']); pintaParams(); });
      paramsBox.appendChild(add);
    };
    pintaParams();
    left.appendChild(fld('Parámetros (seed, steps, cfg, aspect ratio…)', paramsBox));

    // Derecha: clasificación
    const catSel = el('select');
    const llenaCats = (valor) => {
      catSel.textContent = '';
      const o0 = el('option', null, 'Sin categoría'); o0.value = ''; catSel.appendChild(o0);
      const addCat = (par, dep) => S.M.categories.filter(c => (c.parent || '') === par).forEach(c => { const o = el('option', null, '  '.repeat(dep) + `${c.emoji || ''} ${c.name}`.trim()); o.value = c.id; catSel.appendChild(o); addCat(c.id, dep + 1); });
      addCat('', 0);
      const on = el('option', null, '＋ Nueva categoría…'); on.value = '__new'; catSel.appendChild(on);
      catSel.value = valor || '';
    };
    llenaCats(d.category);
    let catPrev = catSel.value;
    catSel.addEventListener('change', () => {
      if (catSel.value !== '__new') { catPrev = catSel.value; return; }
      catSel.value = catPrev;
      editCategory(null, '', (nombre) => { const nueva = S.M.categories.find(c => c.name === nombre); llenaCats(nueva ? nueva.id : catPrev); catPrev = catSel.value; });
    });
    const kindSel = el('select'); kindDefs().forEach(k => { const o = el('option', null, k.name); o.value = k.id; kindSel.appendChild(o); }); kindSel.value = d.kind;
    // La ficha se adapta al tipo: negativo solo en imagen/vídeo/audio, mensaje de sistema en texto/código/agente…
    const dlPk = el('datalist'); dlPk.id = 'pe-pk';
    const aplicaTipo = () => {
      const k = kindSel.value; const c = pro ? pro.campos(k) : { sistema: true, negativo: true, cadena: true, resultados: true };
      fSys.hidden = !c.sistema && !sys.value.trim();
      fNeg.hidden = !c.negativo && !neg.value.trim();
      if (fSal) fSal.hidden = !c.resultados; if (fCad) fCad.hidden = !c.cadena;
      fBody.firstChild.textContent = pro ? pro.etiquetaCuerpo(k) : 'Prompt';
      dlPk.textContent = ''; (pro ? pro.paramSugeridos(k) : []).forEach(x2 => { const o = el('option'); o.value = x2; dlPk.appendChild(o); });
    };
    kindSel.addEventListener('change', aplicaTipo); aplicaTipo();
    const statSel = el('select'); Object.entries(STATUS).forEach(([k, n]) => { const o = el('option', null, n); o.value = k; statSel.appendChild(o); }); statSel.value = d.status;
    // Modelo, herramienta e idioma: valores reutilizables (se guardan solos al guardar el prompt, sin duplicar variantes)
    const model = K.campoValor({ campo: 'prompts.model', value: d.model, placeholder: 'GPT-5, Claude, FLUX, SDXL…' });
    const tool = K.campoValor({ campo: 'prompts.tool', value: d.tool || '', placeholder: 'Midjourney, ComfyUI, Cursor…' });
    const lang = K.campoValor({ campo: 'prompts.language', value: d.language, placeholder: 'es, en…' });
    const row2 = el('div', 'k-2'); row2.append(fld('Tipo', kindSel, true), fld('Estado', statSel, true));
    const row3 = el('div', 'k-2'); row3.append(fld('Modelo', model.el, true), fld('Herramienta', tool.el, true));
    const row3b = el('div', 'k-2'); row3b.append(fld('Idioma', lang.el, true));
    const lp = K.labelPicker({ selected: d.labels });
    const rating = d.rating; let rate = rating; const stars = K.stars(rate, (v) => { rate = v; });
    let fav = !!d.favorite; const favSw = el('label', 'k-switch'); const favCk = el('input'); favCk.type = 'checkbox'; favCk.checked = fav; favSw.append(favCk, el('span', 'track'), el('span', null, 'Favorito')); favCk.addEventListener('change', () => { fav = favCk.checked; });
    const color = K.colorPicker({ value: d.color || '', allowNone: true });
    const src = el('input'); src.value = d.source; src.placeholder = 'https://… (de dónde lo sacaste)'; src.maxLength = 500;

    // Listas
    const listsBox = el('div', 'k-chips'); const listSel = new Set(d.lists || []);
    const pintaListas = () => { listsBox.textContent = ''; S.M.lists.forEach(l => { const c = el('span', 'k-chip btnlike' + (listSel.has(l.id) ? '' : ' is-off')); c.style.setProperty('--c', l.color); c.textContent = `${l.emoji || '📌'} ${l.name}`; c.addEventListener('click', () => { if (listSel.has(l.id)) listSel.delete(l.id); else listSel.add(l.id); pintaListas(); }); listsBox.appendChild(c); }); if (!S.M.lists.length) listsBox.appendChild(el('span', 'k-faint', 'Aún no hay listas: crea una desde la barra lateral')); };
    pintaListas();

    // Calendario
    const calF = K.calField({ value: d.cal ? { date: d.cal.date, time: d.cal.time, calendarId: 'prompts' } : null, defaultCalendar: 'prompts', label: 'Poner fecha de subida en el calendario', hint: 'Aparecerá como evento y podrás abrir el prompt desde el calendario.' });

    right.append(fld('Categoría', catSel, true), row2, row3, row3b, fld('Etiquetas', lp, true), fld('Listas', listsBox, true));
    const rr = el('div', 'k-row'); rr.style.margin = '4px 0 14px'; rr.append(stars, favSw); right.appendChild(rr);
    right.append(fld('Color de la tarjeta', color, true), fld('Fuente', src, true), dlPk, fld('Calendario', calF, true));

    // Imágenes
    const imgs = (d.images || []).map(i => ({ ...i, key: i.id }));   // existentes
    let cover = d.cover || (imgs[0] && imgs[0].id) || '';
    const removed = [];
    const maxI = S.M.limits.images;
    const imgBox = el('div', 'pe-imgs');
    let dragKey = null;
    let metadataTask = Promise.resolve();
    const addFiles = (files) => {
      const arr = [...files].filter(f => /^image\//.test(f.type));
      if (!arr.length) return;
      const libre = maxI - imgs.length;
      if (arr.length > libre) K.toast(`Máximo ${maxI} imágenes por prompt`);
      const accepted = arr.slice(0, Math.max(0, libre));
      accepted.forEach(f => imgs.push({ key: 'n' + Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f), caption: '' }));
      pintaImgs();
      metadataTask = metadataTask.then(async () => {
        let applied = false, found = false;
        const candidates = accepted.filter(x => /^image\//.test(x.type) || /\.(png|jpe?g|webp|avif|heic|heif|tiff?)$/i.test(x.name)).slice(0, maxI);
        for (const f of candidates) {
          try {
            const fd = new FormData(); fd.append('image', f, f.name);
            const response = await api(`${BASE}/api/prompts/read-image-metadata`, { method: 'POST', body: fd });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron leer los metadatos');
            const meta = result.metadata; if (!meta) continue; found = true;
            let changed = false;
            if (!title.value.trim()) { title.value = (body.value.trim() || meta.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || f.name.replace(/\.[^.]+$/, ''); changed = true; }
            if (!body.value.trim() && meta.body) { body.value = meta.body; changed = true; }
            if (!neg.value.trim() && meta.negative) { neg.value = meta.negative; changed = true; }
            if (!model.get() && meta.model) { model.set(meta.model); changed = true; }
            if (!tool.get() && meta.tool) { tool.set(meta.tool); changed = true; }
            if (!src.value.trim()) { src.value = f.name; changed = true; }
            Object.entries(meta.params || {}).forEach(([k, v]) => {
              if (!k || v == null || String(v).trim() === '') return;
              const key = k.trim().toLocaleLowerCase();
              const index = paramsList.findIndex(([oldKey]) => oldKey.trim().toLocaleLowerCase() === key);
              if (index < 0) { paramsList.push([k, String(v)]); changed = true; }
              else if (!String(paramsList[index][1] == null ? '' : paramsList[index][1]).trim()) { paramsList[index][1] = String(v); changed = true; }
            });
            if (changed) {
              kindSel.value = 'imagen'; aplicaTipo(); pintaParams(); upd();
              applied = true;
            }
          } catch (e) { console.warn('No se pudieron leer los metadatos de la imagen:', e); }
        }
        if (applied) K.toast('Metadatos de imagen aplicados a los campos vacíos');
        else if (candidates.length && !found) K.toast('La imagen no contiene metadatos de generación compatibles');
      });
      return metadataTask;
    };
    const pintaImgs = () => {
      imgBox.textContent = '';
      imgs.forEach((im) => {
        const t = el('div', 'pe-img' + (cover === im.key ? ' cover' : '')); t.draggable = true;
        const i = el('img'); i.alt = ''; i.src = im.file ? im.url : imgUrl(d.id, im.id, true); t.appendChild(i);
        const tools = el('div', 'tools');
        const star = el('button'); star.type = 'button'; star.title = 'Usar como portada'; star.appendChild(icon(cover === im.key ? 'i-star-fill' : 'i-star')); star.addEventListener('click', () => { cover = im.key; pintaImgs(); });
        const cap = el('button'); cap.type = 'button'; cap.title = 'Pie de foto'; cap.appendChild(icon('i-pencil')); cap.addEventListener('click', async () => { const v = await K.ask('Pie de foto', { value: im.caption || '', placeholder: 'Qué muestra esta imagen' }); if (v !== null) { im.caption = v; } });
        const del = el('button'); del.type = 'button'; del.title = 'Quitar'; del.appendChild(icon('i-trash')); del.addEventListener('click', () => { imgs.splice(imgs.indexOf(im), 1); if (!im.file) removed.push(im.id); if (cover === im.key) cover = imgs[0] ? imgs[0].key : ''; pintaImgs(); });
        tools.append(star, cap, del); t.appendChild(tools);
        t.addEventListener('dragstart', (e) => { dragKey = im.key; e.dataTransfer.setData('text/plain', 'img'); });
        t.addEventListener('dragover', (e) => { if (dragKey) { e.preventDefault(); t.classList.add('over'); } });
        t.addEventListener('dragleave', () => t.classList.remove('over'));
        t.addEventListener('drop', (e) => { if (!dragKey) return; e.preventDefault(); e.stopPropagation(); const a = imgs.findIndex(x => x.key === dragKey), b = imgs.indexOf(im); if (a >= 0 && a !== b) { const [mv] = imgs.splice(a, 1); imgs.splice(b, 0, mv); } dragKey = null; pintaImgs(); });
        t.addEventListener('dragend', () => { dragKey = null; });
        imgBox.appendChild(t);
      });
      if (imgs.length < maxI) {
        const add = el('button', 'pe-add'); add.type = 'button'; add.append(icon('i-image-plus'), document.createTextNode(`${imgs.length}/${maxI}`));
        const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.hidden = true; fi.addEventListener('change', () => { addFiles(fi.files); fi.value = ''; });
        add.addEventListener('click', () => fi.click());
        add.addEventListener('dragover', (e) => { if (!dragKey) { e.preventDefault(); add.classList.add('drag'); } });
        add.addEventListener('dragleave', () => add.classList.remove('drag'));
        add.addEventListener('drop', (e) => { e.preventDefault(); add.classList.remove('drag'); addFiles(e.dataTransfer.files); });
        imgBox.append(add, fi);
      }
    };
    pintaImgs();
    const imgNote = el('div', 'k-faint', S.M.canImages ? `Hasta ${maxI} imágenes. Se convierten a WebP y se reducen a ${S.M.limits.imageMax}px como máximo. Al añadir una imagen con metadatos compatibles, se rellenan los campos vacíos automáticamente. Puedes arrastrarlas o pegarlas (Ctrl+V).` : 'El servidor no tiene "sharp": no se pueden subir imágenes.');
    imgNote.style.cssText = 'font-size:11.5px;margin-top:6px';
    const imgField = el('div', 'field'); imgField.append(el('span', null, 'Imágenes de muestra'), imgBox, imgNote);
    right.insertBefore(imgField, right.firstChild);
    root.addEventListener('paste', (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.some(f => /^image\//.test(f.type))) { e.preventDefault(); addFiles(fs); } });
    root.addEventListener('dragover', (e) => { if (!dragKey && e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    root.addEventListener('drop', (e) => { if (!dragKey && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

    root.append(left, right);

    const guardar = async (h) => {
      h.buttons.save.disabled = true;
      await metadataTask.catch(e => console.warn('No se pudieron completar los metadatos de la imagen:', e));
      h.buttons.save.disabled = false;
      if (!title.value.trim() && !body.value.trim()) { K.toast('Escribe al menos un título o el prompt'); return false; }
      const params2 = {}; paramsList.forEach(([k, v]) => { if (k.trim()) params2[k.trim()] = v; });
      const campos = {
        title: title.value, body: body.value, negative: neg.value, notes: notes.value, category: catSel.value, kind: kindSel.value,
        status: statSel.value, model: model.get(), tool: tool.get(), language: lang.get(), source: src.value, rating: rate, favorite: fav,
        labels: lp.get(), lists: [...listSel], color: color.get(), params: params2,
        system: sys.value,
      };
      if (salidasEd) campos.outputs = salidasEd.get();
      if (cadenaEd) campos.chain = cadenaEd.get();
      // Aviso si ya existe algo muy parecido (solo al crear o si cambió el texto)
      if (pro && kindSel.value !== 'fragmento' && (nuevo || body.value !== d.body) && body.value.trim().length > 30) {
        if (!await pro.confirmaParecidos({ title: title.value, body: body.value, excludeId: id || undefined })) return false;
      }
      const cal = calF.get();
      if (nuevo) { if (cal) campos.calendar = cal; } else campos.calendar = cal;   // al editar, null quita el evento
      h.buttons.save.disabled = true;
      try {
        let pid = id;
        if (nuevo) { const r = await K.post('/api/prompts', campos); pid = r.prompt.id; } else await K.put('/api/prompts/' + id, { ...campos, base: p && p.updatedAt });
        // Imágenes: primero las quitadas, luego las nuevas, y al final orden, pies y portada
        for (const rid of removed) await K.del(`/api/prompts/${pid}/images/${rid}`);
        const nuevas = imgs.filter(i => i.file);
        let serverImgs = null;
        if (nuevas.length) {
          const fd = new FormData(); nuevas.forEach(i => fd.append('images', i.file, i.file.name));
          const res = await api(`${BASE}/api/prompts/${pid}/images`, { method: 'POST', body: fd });
          const j = await res.json(); if (!res.ok) throw new Error(j.error || 'No se pudieron subir las imágenes');
          if (j.failed && j.failed.length) K.toast(`No se pudieron procesar: ${j.failed.join(', ')}`);
          serverImgs = j.images;
          const idsNuevos = serverImgs.slice(serverImgs.length - nuevas.length - (j.failed ? j.failed.length : 0)).map(x => x.id);
          nuevas.forEach((n, k) => { if (idsNuevos[k]) { n.id = idsNuevos[k]; } });
        }
        if (imgs.length) {
          const finalIds = imgs.map(i => i.id).filter(Boolean);
          const caps = {}; imgs.forEach(i => { if (i.id) caps[i.id] = i.caption || ''; });
          const cov = imgs.find(i => i.key === cover);
          await K.put(`/api/prompts/${pid}/images`, { order: finalIds, captions: caps, cover: cov ? cov.id : '' });
        }
        K.valores.cambio();
        imgs.forEach(i => { if (i.url) URL.revokeObjectURL(i.url); });
        K.bus.emit('prompts'); if (cal || (p && p.cal)) K.bus.emit('calendar');
        K.toast(nuevo ? 'Prompt guardado' : 'Cambios guardados');
        await load();
      } catch (e) { K.fail(e); h.buttons.save.disabled = false; return false; }
    };
    const m = K.modal({ title: nuevo ? 'Nuevo prompt' : 'Editar prompt', sub: nuevo ? 'Guarda tu prompt con todo su contexto' : '', cls: 'xl', content: root, dismiss: false,
      actions: [{ label: 'Cancelar', onClick: async () => { if ((title.value !== d.title || body.value !== d.body) && !await K.confirm('Hay cambios sin guardar. ¿Descartarlos?', { ok: 'Descartar', danger: true })) return false; } },
        { id: 'save', label: nuevo ? 'Guardar prompt' : 'Guardar cambios', primary: true, onClick: guardar }] });
    if (nuevo) setTimeout(() => title.focus(), 40);
  }


  Object.assign(C, { openEditor });
})();
