'use strict';
/* estructura: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { R, S } = C;
  const agendaMd = (...a) => C.agendaMd(...a);
  const load = (...a) => C.load(...a);
  const openEvent = (...a) => C.openEvent(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Estructura ---------- */
  function build() {
    const v = $('view-calendar');
    v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); t.append(el('h2', null, 'Calendario'), el('p', 'sub', 'Eventos, tareas y todo lo que subes, en un solo sitio'));
    const grow = el('span', 'grow');
    const search = el('div', 'kv-search'); search.appendChild(icon('i-search'));
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar eventos…'; si.autocomplete = 'off';
    search.appendChild(si);
    const nuevo = el('button', 'btn primary'); nuevo.type = 'button';
    nuevo.append(icon('i-plus'), el('span', 'lbl', 'Nuevo evento'));
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.title = 'Importar, suscribirse y festivos';
    mas.addEventListener('click', () => K.menu(mas, [
      { label: 'Importar archivo .ics…', icon: 'i-upload', onClick: () => K.calExtra.importar() },
      { label: 'Suscribirse desde otro calendario…', icon: 'i-link', onClick: () => K.calExtra.suscripcion() },
      { label: 'Festivos de España…', icon: 'i-star', onClick: () => K.calExtra.festivos() },
      '-', ...K.doc.items(() => { const d = agendaMd(); return d.md ? { titulo: d.titulo, nombre: 'calendario', md: d.md } : (K.toast('No hay eventos en este periodo'), null); }),
      '-', { label: 'Gestionar etiquetas…', icon: 'i-tag', onClick: () => K.manageLabels() },
    ], { align: 'end' }));
    mas.title = 'Importar, exportar y más';
    head.append(t, grow, search, nuevo, mas);

    const cal = el('div', 'cal');
    const side = el('aside', 'cal-side');
    const main = el('section', 'cal-main');
    const bar = el('div', 'cal-bar');
    const hoy = el('button', 'btn sm', 'Hoy'); hoy.type = 'button';
    const nav = el('div', 'cal-nav');
    const prev = el('button', 'btn ghost'); prev.type = 'button'; prev.setAttribute('aria-label', 'Anterior');
    const sig = el('button', 'btn ghost'); sig.type = 'button'; sig.setAttribute('aria-label', 'Siguiente');
    const ip = icon('i-caret'); ip.style.transform = 'rotate(180deg)'; prev.appendChild(ip); sig.appendChild(icon('i-caret'));
    nav.append(prev, sig);
    const title = el('h3', 'cal-title');
    const gap = el('span', 'grow'); gap.style.flex = '1';
    const seg = el('div', 'seg'); seg.style.width = 'auto';
    for (const [id, lbl] of [['month', 'Mes'], ['week', 'Semana'], ['day', 'Día'], ['agenda', 'Agenda']]) {
      const b = el('button', null, lbl); b.type = 'button'; b.dataset.v = id; b.style.width = 'auto'; b.style.padding = '0 13px'; b.style.fontSize = '13px';
      b.addEventListener('click', () => { S.view = id; try { localStorage.setItem('kcc-cal-view', id); } catch {} S.dirty = true; load(); });
      seg.appendChild(b);
    }
    bar.append(hoy, nav, title, gap, seg);
    const body = el('div', 'cal-body');
    main.append(bar, body);
    cal.append(side, main);
    v.append(head, cal);
    Object.assign(R, { head, side, main, title, body, seg, si, search });

    hoy.addEventListener('click', () => { S.cursor = K.d.day(new Date()); S.dirty = true; load(); });
    prev.addEventListener('click', () => step(-1));
    sig.addEventListener('click', () => step(1));
    nuevo.addEventListener('click', () => openEvent(null, { date: S.cursor }));
    si.addEventListener('input', K.debounce(() => { S.query = si.value.trim(); render(); }, 150));
    S.built = true;
  }

  function step(n) {
    const c = S.cursor;
    if (S.view === 'month') S.cursor = K.d.addMonths(c, n);
    else if (S.view === 'week') S.cursor = K.d.add(c, 7 * n);
    else if (S.view === 'day') S.cursor = K.d.add(c, n);
    else S.cursor = K.d.add(c, 30 * n);
    S.dirty = true; load();
  }
  function goto(date, view) { S.cursor = K.d.day(date); if (view) S.view = view; S.dirty = true; load(); }


  Object.assign(C, { build, step, goto });
})();
