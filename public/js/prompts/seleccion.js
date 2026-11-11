'use strict';
/* seleccion: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S, STATUS } = C;
  const PRO = (...a) => C.PRO(...a);
  const load = (...a) => C.load(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Selección múltiple ---------- */
  function toggleSel(id) { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); render(); }
  function renderSelbar() {
    const b = R.selbar; b.textContent = '';
    if (!S.selMode || !S.sel.size) { b.hidden = true; return; }
    b.hidden = false;
    const ids = () => [...S.sel];
    const btn = (label, ic, fn, cls) => { const x = el('button', 'btn sm' + (cls ? ' ' + cls : '')); x.type = 'button'; x.append(icon(ic), el('span', null, label)); x.addEventListener('click', (e) => fn(x, e)); b.appendChild(x); };
    b.appendChild(el('span', 'n', `${S.sel.size} seleccionado${S.sel.size === 1 ? '' : 's'}`));
    btn('Todos', 'i-check', () => { S.items.forEach(i => S.sel.add(i.id)); render(); });
    if (S.q.trash) {
      btn('Restaurar', 'i-restore', () => bulk(ids(), 'restore'));
      btn('Borrar', 'i-trash', () => purge(ids()), 'danger');
    } else {
      btn('Categoría', 'i-folder', (x) => K.menu(x, [{ label: 'Sin categoría', onClick: () => bulk(ids(), 'category', '') }, '-', ...S.M.categories.map(c => ({ label: `${c.emoji || ''} ${c.name}`, dot: c.color, onClick: () => bulk(ids(), 'category', c.id) }))]));
      btn('Etiqueta', 'i-tag', (x) => K.menu(x, K.labels.list.length ? [{ head: 'Añadir' }, ...K.labels.list.map(l => ({ label: l.name, dot: l.color, onClick: () => bulk(ids(), 'addLabel', l.id) })), '-', { head: 'Quitar' }, ...K.labels.list.map(l => ({ label: l.name, dot: l.color, onClick: () => bulk(ids(), 'removeLabel', l.id) }))] : [{ head: 'Aún no hay etiquetas' }]));
      btn('Lista', 'i-stack', (x) => K.menu(x, S.M.lists.length ? S.M.lists.map(l => ({ label: `${l.emoji || ''} ${l.name}`, dot: l.color, onClick: () => bulk(ids(), 'addList', l.id) })) : [{ head: 'Crea una lista primero' }]));
      btn('Estado', 'i-check-square', (x) => K.menu(x, Object.entries(STATUS).map(([k, n]) => ({ label: n, onClick: () => bulk(ids(), 'status', k) }))));
      btn('Favorito', 'i-star', () => bulk(ids(), 'favorite', true));
      if (PRO()) {
        btn('Exportar', 'i-download', () => PRO().exportar(ids(), null));
        btn('Compartir', 'i-link', () => PRO().compartir(ids()));
      }
      btn('Papelera', 'i-trash', () => bulk(ids(), 'delete'), 'danger');
    }
    btn('', 'i-x', () => { S.sel.clear(); S.selMode = false; render(); }, 'ghost');
  }
  async function bulk(ids, op, value) {
    try {
      const r = await K.post('/api/prompts/bulk', { ids, op, value });
      K.toast(`${r.changed} prompt${r.changed === 1 ? '' : 's'} actualizado${r.changed === 1 ? '' : 's'}`);
      S.sel.clear(); K.bus.emit('prompts'); load();
    } catch (e) { K.fail(e); }
  }
  async function purge(ids) {
    if (!await K.confirm(`Se borrar${ids.length === 1 ? 'á este prompt' : 'án ' + ids.length + ' prompts'} para siempre, con sus imágenes.`, { ok: 'Borrar', danger: true })) return;
    try { await K.post('/api/prompts/bulk', { ids, op: 'delete', purge: true }); S.sel.clear(); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); }
  }
  async function patch(id, campos) { try { await K.put('/api/prompts/' + id, campos); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }
  async function duplicar(id) { try { await K.post(`/api/prompts/${id}/duplicate`); K.toast('Prompt duplicado'); K.bus.emit('prompts'); load(); } catch (e) { K.fail(e); } }


  Object.assign(C, { toggleSel, renderSelbar, bulk, purge, patch, duplicar });
})();
