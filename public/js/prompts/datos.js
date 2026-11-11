'use strict';
/* datos: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { S } = C;
  const render = (...a) => C.render(...a);

  /* ---------- Datos ---------- */
  function params(page) {
    const q = S.q;
    return K.qs({
      q: q.q, category: q.category, list: q.list, kind: q.kind, status: q.status, model: q.model, tool: q.tool, language: q.language,
      fav: q.fav, minRating: q.minRating || '', images: q.images, cal: q.cal, from: q.from, to: q.to,
      trash: q.trash, sort: q.sort, labels: [...S.labels].join(','), page, limit: S.view === 'board' ? 200 : 48,
    });
  }
  async function loadMeta() {
    S.M = await K.get('/api/prompts/meta');
  }
  async function load(append) {
    const n = ++S.loading;
    try {
      if (!append) S.page = 1;
      const [r, m] = await Promise.all([K.get('/api/prompts?' + params(append ? S.page + 1 : 1)), append ? Promise.resolve(S.M) : K.get('/api/prompts/meta')]);
      if (n !== S.loading) return;
      S.M = m;
      if (append) { S.items.push(...r.items); S.page++; } else { S.items = r.items; S.page = 1; }
      S.total = r.total; S.pages = r.pages;
      if (!append) S.sel = new Set([...S.sel].filter(id => S.items.some(i => i.id === id)));
    } catch (e) { K.fail(e); }
    render();
  }


  Object.assign(C, { params, loadMeta, load });
})();
