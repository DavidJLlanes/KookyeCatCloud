'use strict';
/* Pizarra: tarjetas de lectura rápida y selector visual de densidad.
   La edición y el formato viven en pizarra-editor.js. */
(function () {
  const root = document.getElementById('view-pizarra');
  if (!root) return;
  const { open: edit, clean } = window.KCCPizarraEditor;
  const mobile = matchMedia('(max-width:700px)');
  const pref = {
    mobile: 'kcc-pizarra-columnas-movil',
    desktop: 'kcc-pizarra-columnas-escritorio'
  };
  function readPreference(key, fallback, max) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
    } catch { return fallback; }
  }
  const columns = { mobile: readPreference(pref.mobile, 2, 3), desktop: readPreference(pref.desktop, 3, 5) };
  let items = [];
  let loading = false;
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  root.innerHTML = '<div class="cr-wrap cr-pizarra cr-p-new-ui"><header class="cr-head cr-p-head"><div><h2>Pizarra</h2><p class="cr-p-sub">Tus ideas, de un vistazo</p></div><button type="button" id="cr-p-new" class="btn primary">+ Nueva nota</button></header><div class="cr-p-density"><span class="cr-p-density-label">Vista</span><div id="cr-p-columns" role="group" aria-label="Columnas de notas"></div></div><div class="cr-board" id="cr-p-board"></div><p class="cr-p-empty" id="cr-p-empty" hidden>Tu pizarra está vacía. Añade tu primera nota.</p></div>';
  const board = root.querySelector('#cr-p-board');
  const empty = root.querySelector('#cr-p-empty');
  const controls = root.querySelector('#cr-p-columns');
  function layout() {
    const isMobile = mobile.matches;
    const active = columns[isMobile ? 'mobile' : 'desktop'];
    board.style.setProperty('--cr-p-cols', String(active));
    board.dataset.columns = String(active);
    controls.replaceChildren();
    for (let count = 1; count <= (isMobile ? 3 : 5); count++) {
      const btn = node('button', 'cr-p-layout-button');
      btn.type = 'button';
      btn.title = count + (count === 1 ? ' columna' : ' columnas');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(count === active));
      if (count === active) btn.classList.add('is-active');
      const glyph = node('span', 'cr-p-layout-glyph');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.style.setProperty('--glyph-cols', String(count));
      for (let i = 0; i < count; i++) glyph.append(node('i'));
      btn.append(glyph);
      btn.addEventListener('click', () => {
        const mode = mobile.matches ? 'mobile' : 'desktop';
        columns[mode] = count;
        try { localStorage.setItem(pref[mode], String(count)); } catch { /* privada */ }
        layout();
      });
      controls.append(btn);
    }
  }
  if (mobile.addEventListener) mobile.addEventListener('change', layout);
  else mobile.addListener(layout);
  layout();
  function refreshEmpty() { empty.hidden = board.children.length > 0; }
  function preview(item) {
    const card = node('button', 'cr-postit cr-p-preview');
    card.type = 'button';
    card.dataset.color = item.color || 'amarillo';
    card.setAttribute('aria-label', 'Editar nota ' + (item.titulo || 'Sin título'));
    const heading = node('strong', 'cr-p-preview-title', item.titulo && item.titulo !== 'Nueva nota' ? item.titulo : 'Sin título');
    const contents = node('div', 'cr-p-preview-text');
    contents.innerHTML = clean(item.contenido);
    card.append(heading, contents);
    card.addEventListener('click', () => {
      edit(item, updated => {
        Object.assign(item, updated);
        const heading = card.querySelector('.cr-p-preview-title');
        const text = card.querySelector('.cr-p-preview-text');
        card.dataset.color = item.color || 'amarillo';
        card.setAttribute('aria-label', 'Editar nota ' + (item.titulo || 'Sin título'));
        heading.textContent = item.titulo && item.titulo !== 'Nueva nota' ? item.titulo : 'Sin título';
        text.innerHTML = clean(item.contenido);
      }, removed => {
        items = items.filter(other => other.id !== removed.id);
        card.remove();
        refreshEmpty();
      });
    });
    return card;
  }
  async function load() {
    if (loading || document.querySelector('.cr-e-overlay')) return;
    loading = true;
    try {
      items = (await K.get('/api/creativos/pizarra')).items;
      board.replaceChildren(...items.map(preview));
      refreshEmpty();
    } catch (error) { K.fail(error); }
    finally { loading = false; }
  }
  root.querySelector('#cr-p-new').addEventListener('click', async () => {
    try {
      const result = await K.post('/api/creativos/pizarra', { titulo: 'Nueva nota', color: 'amarillo', contenido: '' });
      items.unshift(result.item);
      const card = preview(result.item);
      board.prepend(card);
      refreshEmpty();
      card.click();
    } catch (error) { K.fail(error); }
  });
  K.registerView('pizarra', { open: load, close() {
    const done = document.querySelector('.cr-e-overlay .cr-e-done');
    if (done) done.click();
  } });
})();
