'use strict';
/* prompts/importar.js: parte del módulo (se carga con el resto de prompts/ en index.html). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { S } = C;
  const kindDefs = (...a) => C.kindDefs(...a);
  const load = (...a) => C.load(...a);

  /* ---------- Importar ---------- */
  function openImport() {
    const w = el('div');
    w.appendChild(el('p', 'k-muted', 'Importa un archivo JSON exportado desde aquí, o pega varios prompts separados por una línea con tres guiones (---).'));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 12px';
    const fi = el('input'); fi.type = 'file'; fi.accept = '.json,application/json,.txt,.md';
    const ta = el('textarea'); ta.rows = 8; ta.placeholder = 'Primer prompt…\n---\nSegundo prompt…';
    const cat = el('select'); const o0 = el('option', null, 'Sin categoría'); o0.value = ''; cat.appendChild(o0); S.M.categories.forEach(c => { const o = el('option', null, c.name); o.value = c.name; cat.appendChild(o); });
    const k = el('select'); kindDefs().forEach(kind => { const o = el('option', null, kind.name); o.value = kind.id; k.appendChild(o); });
    const fR = el('div', 'k-2'); const a = el('label', 'field tight'); a.append(el('span', null, 'Categoría (pegado)'), cat); const b = el('label', 'field tight'); b.append(el('span', null, 'Tipo (pegado)'), k); fR.append(a, b);
    const f1 = el('label', 'field'); f1.append(el('span', null, 'Archivo'), fi);
    const f2 = el('label', 'field'); f2.append(el('span', null, 'O pegar texto'), ta);
    w.append(f1, f2, fR);
    K.modal({ title: 'Importar prompts', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Importar', primary: true, onClick: async () => {
      try {
        let lista = [];
        if (fi.files[0]) {
          const txt = await fi.files[0].text();
          if (/\.json$/i.test(fi.files[0].name)) { const j = JSON.parse(txt); lista = Array.isArray(j) ? j : j.prompts || []; }
          else lista = txt.split(/^[ \t]*---[ \t]*$/m).map(s => s.trim()).filter(Boolean).map(s => ({ title: s.split('\n')[0].slice(0, 80), body: s, kind: k.value, category: cat.value }));
        }
        if (ta.value.trim()) lista.push(...ta.value.split(/^[ \t]*---[ \t]*$/m).map(s => s.trim()).filter(Boolean).map(s => ({ title: s.split('\n')[0].slice(0, 80), body: s, kind: k.value, category: cat.value })));
        if (!lista.length) { K.toast('No hay nada que importar'); return false; }
        let total = 0;
        for (let i = 0; i < lista.length; i += 1000) { const r = await K.post('/api/prompts/import', { prompts: lista.slice(i, i + 1000) }); total += r.created; }
        K.toast(`${total} prompts importados`); K.bus.emit('prompts'); K.bus.emit('labels'); await load();
      } catch (e) { K.fail(e); return false; }
    } }] });
  }


  Object.assign(C, { openImport });
})();
