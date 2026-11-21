'use strict';
/* Pizarra: tarjetas de altura variable y selector compacto de columnas.
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
  const cards = new Map();
  let loading = false;
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  root.innerHTML = '<div class="cr-wrap cr-pizarra cr-p-new-ui"><header class="cr-head cr-p-head kcc-section-head"><div><h2>Pizarra</h2></div><div class="cr-p-head-actions"><button type="button" id="cr-p-view-toggle" class="cr-p-view-toggle" aria-label="Cambiar columnas" title="Cambiar columnas"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx=".8"/><rect x="14" y="3" width="7" height="7" rx=".8"/><rect x="3" y="14" width="7" height="7" rx=".8"/><rect x="14" y="14" width="7" height="7" rx=".8"/></svg></button><button type="button" id="cr-p-new" class="btn primary">+ Nueva nota</button></div></header><div class="cr-board" id="cr-p-board"></div><p class="cr-p-empty" id="cr-p-empty" hidden>Tu pizarra está vacía. Añade tu primera nota.</p></div>';
  const board = root.querySelector('#cr-p-board');
  const empty = root.querySelector('#cr-p-empty');
  const toggle = root.querySelector('#cr-p-view-toggle');
  toggle.addEventListener('click', () => {
    const mode = mobile.matches ? 'mobile' : 'desktop';
    const max = mobile.matches ? 3 : 5;
    columns[mode] = columns[mode] % max + 1;
    try { localStorage.setItem(pref[mode], String(columns[mode])); } catch { /* privada */ }
    layout();
  });
  function layout() {
    const isMobile = mobile.matches;
    const active = columns[isMobile ? 'mobile' : 'desktop'];
    board.style.setProperty('--cr-p-cols', String(active));
    board.dataset.columns = String(active);
    const next = active % (isMobile ? 3 : 5) + 1;
    toggle.title = `${active} ${active === 1 ? 'columna' : 'columnas'} · pulsar para ${next}`;
    toggle.setAttribute('aria-label', `Cambiar columnas: ${active} ${active === 1 ? 'actual' : 'actuales'}, siguiente ${next}`);
    rebalance();
  }
  function rebalance() {
    const count = Number(board.dataset.columns) || 1;
    const slots = Array.from({ length: count }, () => node('div', 'cr-p-column'));
    const heights = Array(count).fill(0);
    board.replaceChildren(...slots);
    for (const item of items) {
      let card = cards.get(item.id);
      if (!card) { card = preview(item); cards.set(item.id, card); }
      const shortest = heights.indexOf(Math.min(...heights));
      slots[shortest].append(card);
      heights[shortest] = slots[shortest].offsetHeight;
    }
  }
  if (mobile.addEventListener) mobile.addEventListener('change', layout);
  else mobile.addListener(layout);
  layout();
  function refreshEmpty() {
    empty.hidden = items.length > 0;
  }
  function preview(item) {
    const card = node('button', 'cr-postit cr-p-preview');
    card.type = 'button';
    card.dataset.color = item.color || 'amarillo';
    card.setAttribute('aria-label', 'Editar nota ' + (item.titulo || 'Sin título'));
    const heading = node('div', 'cr-p-preview-title', item.titulo && item.titulo !== 'Nueva nota' ? item.titulo : 'Sin título');
    if (item.tituloHtml) { heading.innerHTML = clean(item.tituloHtml); heading.style.fontWeight = '400'; }
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
        if (item.tituloHtml) { heading.innerHTML = clean(item.tituloHtml); heading.style.fontWeight = '400'; }
        text.innerHTML = clean(item.contenido);
        rebalance();
      }, removed => {
        items = items.filter(other => other.id !== removed.id);
        cards.delete(removed.id);
        card.remove();
        rebalance();
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
      cards.clear();
      rebalance();
      refreshEmpty();
    } catch (error) { K.fail(error); }
    finally { loading = false; }
  }
  root.querySelector('#cr-p-new').addEventListener('click', () => {
    let card;
    edit({ titulo: '', color: 'amarillo', contenido: '' }, saved => {
      const next = preview(saved);
      if (card) card.replaceWith(next);
      else items.unshift(saved);
      cards.set(saved.id, next);
      card = next;
      rebalance();
      refreshEmpty();
    }, removed => {
      items = items.filter(item => item.id !== removed.id);
      cards.delete(removed.id);
      card?.remove();
      rebalance();
      refreshEmpty();
    });
  });
  K.registerView('pizarra', { open: load, close() {
    const done = document.querySelector('.cr-e-overlay .cr-e-done');
    if (done) done.click();
  } });
})();
