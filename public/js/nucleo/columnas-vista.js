'use strict';
/* Selector compacto para galerías de tarjetas. Cada sección conserva su preferencia. */
const activeColumnListeners = new Map();
window.KCCColumnasVista = function ({ id, actions, primary, grid, list }) {
  const previous = activeColumnListeners.get(id);
  if (previous) previous.mobile.removeEventListener('change', previous.onChange);
  const mobile = matchMedia('(max-width:700px)');
  const key = mode => `kcc-${id}-columnas-${mode === 'mobile' ? 'movil' : 'escritorio'}`;
  const read = (mode, fallback, max) => {
    try { const n = Number(localStorage.getItem(key(mode))); return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback; } catch { return fallback; }
  };
  const columns = { mobile: read('mobile', 2, 3), desktop: read('desktop', 3, 5) };
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'kcc-columns-toggle';
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx=".8"/><rect x="14" y="3" width="7" height="7" rx=".8"/><rect x="3" y="14" width="7" height="7" rx=".8"/><rect x="14" y="14" width="7" height="7" rx=".8"/></svg>';
  actions.insertBefore(button, primary);
  const update = () => {
    const mode = mobile.matches ? 'mobile' : 'desktop', n = columns[mode], next = n % (mobile.matches ? 3 : 5) + 1;
    const inList = list?.active();
    grid.classList.toggle('kcc-column-grid', !inList); grid.style.setProperty('--kcc-cols', String(n)); grid.dataset.columns = inList ? 'lista' : String(n);
    button.title = inList ? 'Lista · pulsar para 1 columna' : `${n} ${n === 1 ? 'columna' : 'columnas'} · pulsar para ${list && n === (mobile.matches ? 3 : 5) ? 'lista' : next}`;
    button.setAttribute('aria-label', inList ? 'Cambiar vista: lista actual, siguiente 1 columna' : `Cambiar vista: ${n} ${n === 1 ? 'columna actual' : 'columnas actuales'}, siguiente ${list && n === (mobile.matches ? 3 : 5) ? 'lista' : next}`);
  };
  button.addEventListener('click', () => {
    const mode = mobile.matches ? 'mobile' : 'desktop', max = mobile.matches ? 3 : 5;
    const wasList = list?.active(), toList = list && !wasList && columns[mode] === max;
    if (wasList) columns[mode] = 1;
    else if (!toList) columns[mode] = columns[mode] % max + 1;
    try { localStorage.setItem(key(mode), String(columns[mode])); } catch { /* almacenamiento privado */ }
    if (wasList || toList) list.set(toList); else update();
  });
  const onChange = () => { if (grid.isConnected) update(); else mobile.removeEventListener('change', onChange); };
  mobile.addEventListener('change', onChange);
  activeColumnListeners.set(id, { mobile, onChange });
  update();
  return button;
};
