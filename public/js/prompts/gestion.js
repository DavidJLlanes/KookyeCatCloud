'use strict';
/* prompts/gestion.js: parte del módulo (se carga con el resto de prompts/ en index.html). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { KIND_ICONS, S } = C;
  const kindDefs = (...a) => C.kindDefs(...a);
  const load = (...a) => C.load(...a);

  function selectorIcono(anchor, inicial, alElegir) {
    const g = el('div', 'pk-icon-grid');
    KIND_ICONS.forEach(([id, nombre]) => {
      const b = el('button', 'pk-icon' + (id === inicial ? ' is-on' : '')); b.type = 'button'; b.title = nombre; b.setAttribute('aria-label', nombre);
      b.appendChild(icon(id)); b.addEventListener('click', () => { pop.close(); alElegir(id); }); g.appendChild(b);
    });
    const pop = K.pop(anchor, g, { width: 308 });
  }

  function manageKinds() {
    const w = el('div', 'pk-kinds');
    const campos = kindDefs().map(kind => {
      const row = el('div', 'pk-kind-row');
      const pick = el('button', 'btn ghost icon pk-icon-current'); pick.type = 'button'; pick.title = `Cambiar icono de ${kind.name}`; pick.appendChild(icon(kind.icon));
      let icono = kind.icon; pick.addEventListener('click', () => selectorIcono(pick, icono, v => { icono = v; pick.replaceChildren(icon(v)); }));
      const name = el('input'); name.value = kind.name; name.maxLength = 60; name.setAttribute('aria-label', `Nombre del tipo ${kind.name}`);
      row.append(pick, name); w.appendChild(row); return { id: kind.id, name, get icon() { return icono; } };
    });
    K.modal({ title: 'Tipos de prompt', sub: 'Personaliza el nombre y el icono que aparecen en la biblioteca. Los prompts guardados conservan su tipo.', content: w, cls: 'wide', actions: [
      { label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
        try {
          const r = await K.put('/api/prompts/kinds', { kinds: campos.map(k => ({ id: k.id, name: k.name.value, icon: k.icon })) });
          S.M.kindDefs = r.kinds; await load();
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
  }

  function editKind(kind) {
    const name = el('input'); name.value = kind.name; name.maxLength = 60;
    const pick = el('button', 'btn ghost icon pk-icon-current'); pick.type = 'button'; pick.title = 'Cambiar icono'; pick.appendChild(icon(kind.icon));
    let icono = kind.icon; pick.addEventListener('click', () => selectorIcono(pick, icono, v => { icono = v; pick.replaceChildren(icon(v)); }));
    const row = el('div', 'pk-kind-row'); row.append(pick, name);
    K.modal({ title: `Editar tipo: ${kind.name}`, content: row, cls: 'wide', actions: [
      { label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
        try {
          const kinds = kindDefs().map(k => k.id === kind.id ? { id: k.id, name: name.value, icon: icono } : k);
          const r = await K.put('/api/prompts/kinds', { kinds }); S.M.kindDefs = r.kinds; await load();
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
  }

  async function editCategory(c, parent, alGuardar) {
    const nm = el('input'); nm.value = c ? c.name : ''; nm.maxLength = 60; nm.placeholder = 'Nombre';
    const em = el('button', 'btn'); em.type = 'button'; let emoji = c ? c.emoji : '📁'; em.textContent = emoji || '＋'; em.style.fontSize = '20px';
    em.addEventListener('click', () => K.emojiPicker(em, (e) => { emoji = e; em.textContent = e || '＋'; }));
    const col = K.colorPicker({ value: c ? c.color : '#8b5cf6' });
    const par = el('select'); const o0 = el('option', null, 'Sin categoría padre'); o0.value = ''; par.appendChild(o0);
    const add = (p, d) => S.M.categories.filter(x => (x.parent || '') === p).forEach(x => { if (!c || x.id !== c.id) { const o = el('option', null, '  '.repeat(d) + x.name); o.value = x.id; par.appendChild(o); add(x.id, d + 1); } });
    add('', 0); par.value = c ? (c.parent || '') : (parent || '');
    const w = el('div'); const r1 = el('div', 'k-row'); r1.style.marginBottom = '14px'; r1.append(em, nm); nm.style.flex = '1';
    const f2 = el('div', 'field'); f2.append(el('span', null, 'Color'), col);
    const f3 = el('label', 'field'); f3.append(el('span', null, 'Dentro de'), par);
    w.append(r1, f2, f3);
    K.modal({ title: c ? 'Editar categoría' : 'Nueva categoría', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const body = { name: nm.value, emoji, color: col.get(), parent: par.value };
        if (c) await K.put('/api/prompts/categories/' + c.id, body); else await K.post('/api/prompts/categories', body);
        K.bus.emit('prompts'); await load();
        if (alGuardar) alGuardar(body.name);
      } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => nm.focus(), 30);
  }
  function editList(l) {
    const nm = el('input'); nm.value = l ? l.name : ''; nm.maxLength = 60; nm.placeholder = 'Nombre de la lista';
    const em = el('button', 'btn'); em.type = 'button'; let emoji = l ? l.emoji : '📌'; em.textContent = emoji || '＋'; em.style.fontSize = '20px';
    em.addEventListener('click', () => K.emojiPicker(em, (e) => { emoji = e; em.textContent = e || '＋'; }));
    const col = K.colorPicker({ value: l ? l.color : '#06b6d4' });
    const w = el('div'); const r1 = el('div', 'k-row'); r1.style.marginBottom = '14px'; r1.append(em, nm); nm.style.flex = '1';
    const f2 = el('div', 'field'); f2.append(el('span', null, 'Color'), col); w.append(r1, f2);
    K.modal({ title: l ? 'Editar lista' : 'Nueva lista', sub: 'Una lista agrupa prompts de cualquier categoría (un proyecto, un cliente…)', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const body = { name: nm.value, emoji, color: col.get() };
        if (l) await K.put('/api/prompts/lists/' + l.id, body); else await K.post('/api/prompts/lists', body);
        K.bus.emit('prompts'); await load();
      } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => nm.focus(), 30);
  }
  async function delMeta(tipo, x) {
    if (!await K.confirm(tipo === 'categories' ? `Se borrará “${x.name}”. Sus prompts pasarán a la categoría superior.` : `Se borrará la lista “${x.name}”. Los prompts no se tocan.`, { ok: 'Borrar', danger: true })) return;
    try {
      await K.del(`/api/prompts/${tipo}/${x.id}`);
      if (S.q.category === x.id) S.q.category = ''; if (S.q.list === x.id) S.q.list = '';
      await load();
    } catch (e) { K.fail(e); }
  }


  Object.assign(C, { selectorIcono, manageKinds, editKind, editCategory, editList, delMeta });
})();
