'use strict';
/* ---------------------------------------------------------------
   Calendario: mes / semana / día / agenda, varios calendarios con color, repetición,
   recordatorios, tareas y eventos que nacen de notas, prompts y archivos.
--------------------------------------------------------------- */
(function () {
  const HH = 48;                       // altura de una hora en px (vistas semana y día)
  const SNAP = 15;                     // minutos al arrastrar
  const REMS = [[0, 'En el momento'], [5, '5 minutos antes'], [10, '10 minutos antes'], [15, '15 minutos antes'],
    [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 día antes'], [2880, '2 días antes'], [10080, '1 semana antes']];
  const remLabel = (m) => (REMS.find(r => r[0] === m) || [m, `${m} min antes`])[1];

  const S = {
    built: false, view: 'month', cursor: K.d.day(new Date()), events: [], range: null,
    hidden: new Set(), labelFilter: new Set(), query: '', dirty: true, loading: 0,
    tasks: [],        // tareas sin fecha (lista lateral)
    drag: null,       // lo que se está arrastrando: { id, occ, recurring, kind, undated }
  };
  try { S.view = localStorage.getItem('kcc-cal-view') || 'month'; } catch {}
  const R = {};   // referencias al DOM

  const evColor = (e) => e.color || (K.cals.by[e.calendarId] && K.cals.by[e.calendarId].color) || '#3b82f6';
  const evStart = (e) => K.d.parse(e.start);
  const evEnd = (e) => K.d.parse(e.end);
  const timeTxt = (e) => (e.allDay ? '' : K.d.hm(evStart(e)));
  const rangeTxt = (e) => {
    const a = evStart(e), b = evEnd(e);
    if (e.allDay) return K.d.same(a, b) ? K.d.long(a) : `${K.d.short(a)} – ${K.d.short(b)}`;
    return K.d.same(a, b) ? `${K.d.long(a)} · ${K.d.hm(a)} – ${K.d.hm(b)}` : `${K.d.short(a)} ${K.d.hm(a)} – ${K.d.short(b)} ${K.d.hm(b)}`;
  };
  const isSpan = (e) => e.allDay || !K.d.same(evStart(e), evEnd(e));

  /* ---------- Datos ---------- */
  function visibleEvents() {
    const q = S.query.toLowerCase();
    return S.events.filter(e => {
      if (S.hidden.has(e.calendarId)) return false;
      if (S.labelFilter.size && !(e.labels || []).some(l => S.labelFilter.has(l))) return false;
      if (q && !(`${e.title} ${e.description || ''} ${e.location || ''}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function currentRange() {
    const c = S.cursor;
    if (S.view === 'month') {
      const first = K.d.weekStart(new Date(c.getFullYear(), c.getMonth(), 1));
      const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
      const semanas = Math.ceil((K.d.diffDays(first, last) + 1) / 7);
      return [first, K.d.add(first, semanas * 7 - 1)];
    }
    if (S.view === 'week') { const s = K.d.weekStart(c); return [s, K.d.add(s, 6)]; }
    if (S.view === 'day') return [c, c];
    return [c, K.d.add(c, 89)];       // agenda: 90 días desde el cursor
  }

  async function load() {
    const [a, b] = currentRange();
    const key = K.d.ymd(a) + '|' + K.d.ymd(b);
    const n = ++S.loading;
    try {
      const [r, t] = await Promise.all([
        K.get('/api/calendar/events?' + K.qs({ from: K.d.ymd(a), to: K.d.ymd(b) })),
        K.get('/api/calendar/tasks'),
      ]);
      if (n !== S.loading) return;
      S.events = r.events; S.tasks = t.tasks; S.range = key; S.dirty = false;
    } catch (e) { K.fail(e); }
    render();
  }

  // Calendarios en los que se puede crear algo: el de festivos es virtual y de solo lectura
  const calsEscribibles = () => K.cals.list.filter(c => !c.virtual);

  // Agenda del periodo visible en Markdown: eventos y tareas por día
  function agendaMd() {
    const [a, b] = currentRange();
    const lista = visibleEvents().slice().sort((x, y) => evStart(x) - evStart(y));
    const titulo = `Calendario · ${K.d.short(a)} – ${K.d.short(b)}`;
    if (!lista.length) return { titulo, md: '' };
    const L = [`# ${titulo}`]; let dia = '';
    for (const e of lista) {
      const d = K.d.long(evStart(e));
      if (d !== dia) { dia = d; L.push('', `## ${d}`, ''); }
      const hora = e.allDay ? 'Todo el día' : (K.d.same(evStart(e), evEnd(e)) ? `${K.d.hm(evStart(e))} – ${K.d.hm(evEnd(e))}` : rangeTxt(e));
      const caja = e.kind === 'task' ? (e.done ? '[x] ' : '[ ] ') : '';
      L.push(`- ${caja}**${e.title}** · ${hora}${e.location ? ' · ' + e.location : ''}`);
      if (e.description) L.push(...String(e.description).split('\n').map(x => '  ' + x));
    }
    return { titulo, md: L.join('\n') + '\n' };
  }

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

  /* ---------- Barra lateral ---------- */
  function renderSide() {
    const side = R.side;
    side.textContent = '';
    // Mini calendario
    const mini = el('div', 'cal-card');
    const mh = el('div', 'mini-head');
    const mp = el('button'); mp.type = 'button'; const ic = icon('i-caret'); ic.style.transform = 'rotate(180deg)'; mp.appendChild(ic);
    const mn = el('button'); mn.type = 'button'; mn.appendChild(icon('i-caret'));
    mh.append(mp, el('b', null, K.d.month(S.cursor)), mn);
    mp.addEventListener('click', () => { S.cursor = K.d.addMonths(S.cursor, -1); S.dirty = true; load(); });
    mn.addEventListener('click', () => { S.cursor = K.d.addMonths(S.cursor, 1); S.dirty = true; load(); });
    const grid = el('div', 'mini-grid');
    K.d.dow.forEach(d => grid.appendChild(el('div', 'dow', d)));
    const first = K.d.weekStart(new Date(S.cursor.getFullYear(), S.cursor.getMonth(), 1));
    const hoy = K.d.day(new Date());
    const conEv = new Set(visibleEvents().flatMap(e => {
      const out = []; let d = K.d.day(evStart(e)); const fin = K.d.day(evEnd(e));
      for (let i = 0; i < 31 && d <= fin; i++, d = K.d.add(d, 1)) out.push(K.d.ymd(d));
      return out;
    }));
    for (let i = 0; i < 42; i++) {
      const d = K.d.add(first, i);
      const b = el('button', null, String(d.getDate())); b.type = 'button';
      if (d.getMonth() !== S.cursor.getMonth()) b.classList.add('out');
      if (K.d.same(d, hoy)) b.classList.add('today');
      if (K.d.same(d, S.cursor)) b.classList.add('sel');
      if (conEv.has(K.d.ymd(d))) b.classList.add('has');
      b.addEventListener('click', () => goto(d, S.view === 'month' ? 'day' : S.view));
      grid.appendChild(b);
    }
    mini.append(mh, grid);

    // Calendarios
    const cals = el('div', 'cal-card');
    const h4 = el('h4'); h4.appendChild(el('span', null, 'Mis calendarios'));
    const add = el('button', 'btn ghost tiny'); add.type = 'button'; add.appendChild(icon('i-plus')); add.title = 'Nuevo calendario';
    add.addEventListener('click', () => editCalendar(null));
    h4.appendChild(add);
    const list = el('div', 'cal-list');
    K.cals.list.forEach(c => {
      const row = el('div', 'cal-item');
      const chk = el('span', 'cal-check' + (S.hidden.has(c.id) ? '' : ' on')); chk.style.setProperty('--c', c.color); chk.appendChild(icon('i-check'));
      const nm = el('span', 'nm', c.name);
      const more = el('button', 'more'); more.type = 'button'; more.appendChild(icon('i-dots'));
      row.append(chk, nm, more);
      row.addEventListener('click', (e) => {
        if (e.target.closest('.more')) return;
        if (S.hidden.has(c.id)) S.hidden.delete(c.id); else S.hidden.add(c.id);
        K.put('/api/calendar/calendars/' + c.id, { visible: !S.hidden.has(c.id) }).catch(() => {});
        render();
      });
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.virtual) {            // festivos: solo comunidad, color y quitarlos
          K.menu(more, [
            { label: 'Cambiar comunidad…', icon: 'i-pin', onClick: () => K.calExtra.festivos() },
            { label: 'Cambiar color…', icon: 'i-palette', onClick: async () => {
              const cp = K.colorPicker({ value: c.color, onChange: async (col) => { try { await K.put('/api/calendar/calendars/festivos', { color: col }); await K.loadCalendars(true); S.dirty = true; load(); } catch (er) { K.fail(er); } } });
              const w = el('div'); w.style.padding = '6px'; w.appendChild(cp); K.pop(more, w, { width: 240, align: 'end' });
            } },
            '-', { label: 'Quitar festivos', icon: 'i-trash', danger: true, onClick: async () => { try { await K.put('/api/calendar/holidays', { enabled: false }); await K.loadCalendars(true); S.dirty = true; load(); } catch (er) { K.fail(er); } } },
          ], { align: 'end' });
          return;
        }
        K.menu(more, [
          { label: 'Editar…', icon: 'i-pencil', onClick: () => editCalendar(c) },
          { label: 'Mostrar solo este', icon: 'i-check', onClick: () => { S.hidden = new Set(K.cals.list.filter(x => x.id !== c.id).map(x => x.id)); render(); } },
          ...(c.system || c.id === 'personal' ? [] : ['-', { label: 'Borrar calendario', icon: 'i-trash', danger: true, onClick: () => delCalendar(c) }]),
        ], { align: 'end' });
      });
      list.appendChild(row);
    });
    cals.append(h4, list);
    side.append(mini, tasksCard(), cals);

    // Filtro por etiquetas
    if (K.labels.list.length) {
      const lc = el('div', 'cal-card');
      const lh = el('h4'); lh.appendChild(el('span', null, 'Etiquetas'));
      const gest = el('button', 'btn ghost tiny'); gest.type = 'button'; gest.appendChild(icon('i-pencil')); gest.title = 'Gestionar etiquetas';
      gest.addEventListener('click', () => K.manageLabels());
      lh.appendChild(gest);
      const ch = el('div', 'k-chips');
      K.labels.list.forEach(l => {
        const c = K.labelChip(l, { onClick: () => { if (S.labelFilter.has(l.id)) S.labelFilter.delete(l.id); else S.labelFilter.add(l.id); render(); } });
        if (S.labelFilter.size && !S.labelFilter.has(l.id)) c.classList.add('is-off');
        ch.appendChild(c);
      });
      lc.append(lh, ch);
      side.appendChild(lc);
    }
  }

  /* ---------- Tareas sin fecha ---------- */
  // Se arrastran a un hueco del calendario para ponerles día y hora; y de vuelta aquí para quitárselos.
  function tasksCard() {
    const card = el('div', 'cal-card cal-tasks');
    const h4 = el('h4'); h4.append(el('span', null, `Tareas sin fecha${S.tasks.length ? ' · ' + S.tasks.length : ''}`));
    card.appendChild(h4);
    const form = el('form', 'task-add');
    const inp = el('input'); inp.placeholder = 'Nueva tarea…'; inp.maxLength = 200; inp.autocomplete = 'off';
    form.appendChild(inp);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = inp.value.trim(); if (!title) return;
      try { await K.post('/api/calendar/events', { title, kind: 'task', start: '' }); inp.value = ''; K.bus.emit('calendar'); S.dirty = true; load(); } catch (er) { K.fail(er); }
    });
    card.appendChild(form);
    const list = el('div', 'task-list');
    if (!S.tasks.length) list.appendChild(el('p', 'task-empty', 'Apunta tareas aquí y arrástralas al calendario cuando sepas cuándo.'));
    S.tasks.forEach(t => {
      const row = el('div', 'task-item' + (t.done ? ' done' : ''));
      row.draggable = true;
      row.title = 'Arrástrala a un día o a una hora del calendario';
      const chk = el('span', 'cal-check' + (t.done ? ' on' : '')); chk.style.setProperty('--c', evColor(t)); chk.appendChild(icon('i-check'));
      chk.addEventListener('click', async (e) => { e.stopPropagation(); try { await K.put('/api/calendar/events/' + t.id, { done: !t.done }); S.dirty = true; load(); } catch (er) { K.fail(er); } });
      row.append(chk, el('span', 'tt', t.title));
      row.addEventListener('dragstart', (e) => {
        S.drag = { id: t.id, kind: 'task', undated: true };
        e.dataTransfer.setData('text/plain', JSON.stringify({ id: t.id, undated: true })); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => { S.drag = null; row.classList.remove('dragging'); });
      row.addEventListener('click', () => openEvent(t));
      list.appendChild(row);
    });
    card.appendChild(list);
    // Soltar aquí una tarea ya programada la deja otra vez sin fecha
    card.addEventListener('dragover', (e) => { if (S.drag && S.drag.kind === 'task' && !S.drag.undated) { e.preventDefault(); card.classList.add('drop'); } });
    card.addEventListener('dragleave', () => card.classList.remove('drop'));
    card.addEventListener('drop', async (e) => {
      e.preventDefault(); card.classList.remove('drop');
      const d = S.drag; S.drag = null;
      if (!d || d.undated) return;
      if (d.recurring) { K.toast('Las tareas repetidas no se pueden dejar sin fecha'); return; }
      try { await K.put('/api/calendar/events/' + d.id, { start: '', end: '' }); K.bus.emit('calendar'); S.dirty = true; load(); } catch (er) { K.fail(er); }
    });
    return card;
  }

  function editCalendar(c) {
    const nombre = el('input'); nombre.value = c ? c.name : ''; nombre.placeholder = 'Nombre del calendario'; nombre.maxLength = 60;
    const color = K.colorPicker({ value: c ? c.color : '#14b8a6' });
    const w = el('div'); const f1 = el('label', 'field'); f1.append(el('span', null, 'Nombre'), nombre);
    const f2 = el('div', 'field'); f2.append(el('span', null, 'Color'), color); w.append(f1, f2);
    K.modal({ title: c ? 'Editar calendario' : 'Nuevo calendario', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        if (c) await K.put('/api/calendar/calendars/' + c.id, { name: nombre.value, color: color.get() });
        else await K.post('/api/calendar/calendars', { name: nombre.value, color: color.get() });
        await K.loadCalendars(true); K.bus.emit('calendar'); S.dirty = true; load();
      } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => nombre.focus(), 30);
  }
  async function delCalendar(c) {
    if (!await K.confirm(`Se borrará “${c.name}”. Sus eventos pasarán a Personal.`, { ok: 'Borrar', danger: true })) return;
    try { await K.del('/api/calendar/calendars/' + c.id); await K.loadCalendars(true); S.dirty = true; load(); } catch (e) { K.fail(e); }
  }

  /* ---------- Render principal ---------- */
  function render() {
    if (!S.built) return;
    R.seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.v === S.view));
    const c = S.cursor;
    R.title.textContent = S.view === 'month' ? K.d.month(c)
      : S.view === 'day' ? K.d.long(c)
      : S.view === 'week' ? (() => { const [a, b] = currentRange(); return `${a.getDate()} ${a.toLocaleDateString('es-ES', { month: 'short' })} – ${b.getDate()} ${b.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`; })()
      : 'Próximos eventos';
    renderSide();
    R.body.textContent = '';
    const evs = visibleEvents();
    if (S.view === 'month') R.body.appendChild(renderMonth(evs));
    else if (S.view === 'agenda') R.body.appendChild(renderAgenda(evs));
    else R.body.appendChild(renderTime(evs, S.view === 'week' ? 7 : 1));
  }

  /* ---------- Píldoras ---------- */
  function pill(e, { showTime = true, contL = false, contR = false } = {}) {
    const p = el('div', 'ev' + (isSpan(e) ? ' solid' : '') + (e.done ? ' done' : ''));
    p.style.setProperty('--c', evColor(e));
    if (e.kind === 'task') p.appendChild(icon(e.done ? 'i-check-square' : 'i-list-check', 'src'));
    else if (e.source) p.appendChild(icon(K.srcIcon[e.source.type] || 'i-link', 'src'));
    else if (e.link) p.appendChild(icon(K.srcIcon[e.link.type] || 'i-link', 'src'));
    if (showTime && !isSpan(e)) p.appendChild(el('span', 'h', timeTxt(e)));
    p.appendChild(el('span', 't', (contL ? '◂ ' : '') + e.title + (contR ? ' ▸' : '')));
    p.title = `${e.title}\n${rangeTxt(e)}`;
    if (e.holiday) p.classList.add('holiday');
    p.draggable = !e.readonly;
    p.addEventListener('dragstart', (ev) => {
      S.drag = { id: e.id, occ: e.occurrence, recurring: e.recurring, kind: e.kind, undated: false };
      ev.dataTransfer.setData('text/plain', JSON.stringify({ id: e.id, occ: e.occurrence, recurring: e.recurring }));
      ev.dataTransfer.effectAllowed = 'move'; p.classList.add('dragging');
    });
    p.addEventListener('dragend', () => { S.drag = null; p.classList.remove('dragging'); });
    p.addEventListener('click', (ev) => { ev.stopPropagation(); openEvent(e); });
    return p;
  }

  /* ---------- Vista mes ---------- */
  function renderMonth(evs) {
    const [ini, fin] = currentRange();
    const semanas = (K.d.diffDays(ini, fin) + 1) / 7;
    const wrap = el('div', 'cal-month');
    const dows = el('div', 'cal-dows'); K.d.dowLong.forEach(d => dows.appendChild(el('div', null, d.slice(0, 3))));
    wrap.appendChild(dows);
    const weeks = el('div', 'cal-weeks');
    weeks.style.gridTemplateRows = `repeat(${semanas},minmax(112px,1fr))`;
    const hoy = K.d.day(new Date());

    for (let w = 0; w < semanas; w++) {
      const ws = K.d.add(ini, w * 7), we = K.d.add(ws, 6);
      const row = el('div', 'cal-week');
      // Barras (día completo y multidía) con carriles
      const segs = [];
      const singles = Array.from({ length: 7 }, () => []);
      for (const e of evs) {
        const a = K.d.day(evStart(e)), b = K.d.day(evEnd(e));
        if (b < ws || a > we) continue;
        if (isSpan(e)) {
          const s = Math.max(0, K.d.diffDays(ws, a)), f = Math.min(6, K.d.diffDays(ws, b));
          segs.push({ e, s, f, contL: a < ws, contR: b > we });
        } else singles[K.d.diffDays(ws, a)].push(e);
      }
      segs.sort((x, y) => x.s - y.s || (y.f - y.s) - (x.f - x.s));
      const lanes = [];
      for (const sg of segs) {
        let i = lanes.findIndex(l => l[l.length - 1].f < sg.s);
        if (i < 0) { lanes.push([]); i = lanes.length - 1; }
        lanes[i].push(sg); sg.lane = i;
      }
      const MAXL = 3;
      const nLanes = Math.min(lanes.length, MAXL);
      row.style.setProperty('--lanes', nLanes);
      const ocultasPorDia = Array(7).fill(0);

      for (let i = 0; i < 7; i++) {
        const d = K.d.add(ws, i);
        const cell = el('div', 'cal-cell');
        if (d.getMonth() !== S.cursor.getMonth()) cell.classList.add('out');
        if (K.d.same(d, hoy)) cell.classList.add('today');
        cell.style.paddingTop = (30 + nLanes * 22) + 'px';
        const dn = el('span', 'dn', String(d.getDate()) + (d.getDate() === 1 ? ' ' + d.toLocaleDateString('es-ES', { month: 'short' }) : ''));
        dn.style.cssText = 'position:absolute;top:2px;left:4px';
        cell.appendChild(dn);
        const list = el('div', 'cal-evs');
        const cap = Math.max(0, 4 - nLanes);
        const dia = singles[i].sort((x, y) => (x.start < y.start ? -1 : 1));
        dia.slice(0, cap).forEach(e => list.appendChild(pill(e)));
        const extra = dia.length - cap + segs.filter(s => s.lane >= MAXL && s.s <= i && s.f >= i).length;
        if (extra > 0) {
          const m = el('span', 'more-ev', `+${extra} más`);
          m.addEventListener('click', (ev) => { ev.stopPropagation(); openDay(d); });
          list.appendChild(m);
        }
        cell.appendChild(list);
        cell.addEventListener('click', () => openDay(d));
        cell.addEventListener('dragover', (ev) => { ev.preventDefault(); cell.classList.add('drop'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
        cell.addEventListener('drop', (ev) => { ev.preventDefault(); cell.classList.remove('drop'); dropOnDay(ev, d); });
        row.appendChild(cell);
      }
      const span = el('div', 'cal-span');
      for (const sg of segs) {
        if (sg.lane >= MAXL) continue;
        const p = pill(sg.e, { contL: sg.contL, contR: sg.contR });
        p.style.left = `calc(${sg.s * 100 / 7}% + 3px)`;
        p.style.width = `calc(${(sg.f - sg.s + 1) * 100 / 7}% - 6px)`;
        p.style.top = (sg.lane * 22) + 'px';
        span.appendChild(p);
      }
      row.appendChild(span);
      weeks.appendChild(row);
    }
    wrap.appendChild(weeks);
    return wrap;
  }

  // Ventana del día: lo programado ese día y botones para añadir un evento o una tarea
  function openDay(d) {
    const dia = K.d.day(d);
    const evs = visibleEvents().filter(e => K.d.day(evStart(e)) <= dia && K.d.day(evEnd(e)) >= dia)
      .sort((a, b) => (a.allDay === b.allDay ? (a.start < b.start ? -1 : 1) : a.allDay ? -1 : 1));
    const w = el('div', 'cal-dia');
    if (!evs.length) w.appendChild(el('p', 'k-faint', 'No hay nada programado este día.'));
    evs.forEach(e => {
      const it = el('div', 'ag-ev'); it.style.setProperty('--c', evColor(e));
      if (e.kind === 'task' && !e.holiday) {
        const chk = el('span', 'cal-check' + (e.done ? ' on' : '')); chk.style.setProperty('--c', evColor(e)); chk.appendChild(icon('i-check'));
        chk.addEventListener('click', async (ev) => { ev.stopPropagation(); try { await K.put('/api/calendar/events/' + e.id, { done: !e.done }); S.dirty = true; await load(); m.close(); openDay(dia); } catch (er) { K.fail(er); } });
        it.appendChild(chk);
      }
      it.append(el('span', 'tm', e.allDay ? 'Todo el día' : `${K.d.hm(evStart(e))} – ${K.d.hm(evEnd(e))}`));
      const tt = el('span', 'tt', e.title); if (e.done) tt.style.textDecoration = 'line-through'; it.appendChild(tt);
      if (e.location) it.appendChild(el('span', 'meta', '📍 ' + e.location));
      it.addEventListener('click', () => { m.close(); openEvent(e); });
      w.appendChild(it);
    });
    const m = K.modal({
      title: K.d.long(dia), sub: evs.length ? `${evs.length} elemento${evs.length === 1 ? '' : 's'}` : '', content: w, cls: 'wide',
      actions: [
        { label: 'Cerrar' },
        { label: '+ Tarea', onClick: () => openEvent(null, { date: dia, allDay: true, kind: 'task' }) },
        { label: '+ Evento', primary: true, onClick: () => openEvent(null, { date: dia }) },
      ],
    });
  }

  function dayPopup(d, anchor) {
    const evs = visibleEvents().filter(e => K.d.day(evStart(e)) <= d && K.d.day(evEnd(e)) >= d);
    const cont = el('div');
    cont.appendChild(el('div', 'head', K.d.long(d)));
    evs.forEach(e => {
      const b = el('button', 'item'); b.type = 'button';
      const dt = el('span', 'k-dot'); dt.style.setProperty('--c', evColor(e));
      b.append(dt, el('span', null, (e.allDay ? '' : timeTxt(e) + '  ') + e.title));
      b.addEventListener('click', () => { p.close(); openEvent(e); });
      cont.appendChild(b);
    });
    const p = K.pop(anchor, cont, { width: 280 });
  }

  async function dropOnDay(ev, dia) {
    let info; try { info = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
    S.drag = null;
    if (info.undated) return programa(info.id, dia, null);          // tarea de la lista -> todo el día
    const e = S.events.find(x => x.id === info.id && x.occurrence === info.occ);
    if (!e || e.readonly) return;
    const delta = K.d.diffDays(K.d.day(evStart(e)), dia);
    if (!delta) return;
    await moveEvent(e, { start: shiftStr(e.start, delta), end: shiftStr(e.end, delta) });
  }
  // Pone fecha a una tarea sin fecha: todo el día (mins null) o a una hora, con 30 minutos de duración
  async function programa(id, dia, mins) {
    const cuerpo = mins == null
      ? { start: K.d.ymd(dia), end: K.d.ymd(dia), allDay: true }
      : { start: strAt(dia, mins), end: strAt(dia, Math.min(mins + 30, 24 * 60 - 1)), allDay: false };
    try { await K.put('/api/calendar/events/' + id, cuerpo); K.bus.emit('calendar'); S.dirty = true; load(); } catch (err) { K.fail(err); }
  }
  function shiftStr(s, days) {
    const d = K.d.parse(s);
    const n = K.d.add(d, days);
    return s.length === 10 ? K.d.ymd(n) : `${K.d.ymd(n)}T${K.d.hm(n)}`;
  }
  async function moveEvent(e, campos) {
    try {
      const q = e.recurring ? `?scope=one&date=${e.occurrence}` : '';
      await K.put('/api/calendar/events/' + e.id + q, { ...campos, allDay: e.allDay });
      if (e.recurring) K.toast('Solo se ha movido esta aparición');
      K.bus.emit('calendar'); S.dirty = true; load();
      if (e.source) K.bus.emit(e.source.type === 'prompt' ? 'prompts' : e.source.type === 'note' ? 'notes' : e.source.type === 'game' ? 'games' : 'files');
    } catch (err) { K.fail(err); load(); }
  }

  /* ---------- Vistas semana y día (rejilla horaria) ---------- */
  function renderTime(evs, ncols) {
    const [ini] = currentRange();
    const days = Array.from({ length: ncols }, (_, i) => K.d.add(ini, i));
    const hoy = K.d.day(new Date());
    const box = el('div', 'cal-time');
    box.style.setProperty('--cols', ncols); box.style.setProperty('--hh', HH + 'px');

    const head = el('div', 'tg-head'); head.appendChild(el('div'));
    days.forEach(d => {
      const h = el('div', 'dh' + (K.d.same(d, hoy) ? ' today' : ''));
      h.append(el('small', null, d.toLocaleDateString('es-ES', { weekday: 'short' })), el('b', null, String(d.getDate())));
      h.addEventListener('click', () => goto(d, 'day'));
      head.appendChild(h);
    });
    const allday = el('div', 'tg-allday'); allday.appendChild(el('div', 'lbl', 'todo el día'));
    days.forEach(d => {
      const col = el('div', 'col');
      evs.filter(e => isSpan(e) && K.d.day(evStart(e)) <= d && K.d.day(evEnd(e)) >= d).forEach(e => col.appendChild(pill(e, { contL: K.d.day(evStart(e)) < d })));
      col.addEventListener('click', () => openDay(d));
      col.addEventListener('dragover', (e) => { if (S.drag) { e.preventDefault(); col.classList.add('drop'); } });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('drop'); dropOnDay(e, d); });
      allday.appendChild(col);
    });
    box.append(head, allday);

    const scroll = el('div', 'tg-scroll');
    const body = el('div', 'tg-body');
    const hours = el('div', 'tg-hours');
    for (let h = 0; h < 24; h++) hours.appendChild(el('div', null, h ? `${p2h(h)}:00` : ''));
    body.appendChild(hours);
    days.forEach(d => body.appendChild(dayColumn(d, evs, K.d.same(d, hoy))));
    scroll.appendChild(body);
    box.appendChild(scroll);
    const ahora = new Date();
    scroll.scrollTop = Math.max(0, ((K.d.same(days[0], hoy) || days.some(x => K.d.same(x, hoy)) ? ahora.getHours() : 8) - 1.5) * HH);
    return box;
  }
  const p2h = (h) => String(h).padStart(2, '0');

  function dayColumn(d, evs, esHoy) {
    const col = el('div', 'tg-col' + (esHoy ? ' today' : ''));
    const items = evs.filter(e => !isSpan(e) && K.d.same(K.d.day(evStart(e)), d))
      .map(e => ({ e, a: evStart(e).getHours() * 60 + evStart(e).getMinutes(), b: Math.max(evEnd(e).getHours() * 60 + evEnd(e).getMinutes(), 0) }))
      .map(x => ({ ...x, b: Math.max(x.b, x.a + 20) }))
      .sort((x, y) => x.a - y.a || y.b - x.b);
    // Reparto en columnas para los que se solapan
    const grupos = []; let cur = null;
    for (const it of items) {
      if (!cur || it.a >= cur.fin) { cur = { items: [], fin: 0 }; grupos.push(cur); }
      cur.items.push(it); cur.fin = Math.max(cur.fin, it.b);
    }
    for (const g of grupos) {
      const cols = [];
      for (const it of g.items) {
        let i = cols.findIndex(c => c <= it.a);
        if (i < 0) { cols.push(0); i = cols.length - 1; }
        cols[i] = it.b; it.col = i;
      }
      g.items.forEach(it => { it.n = cols.length; });
    }
    for (const it of items) {
      const e = it.e;
      const t = el('div', 'tg-ev' + (e.done ? ' done' : ''));
      t.style.setProperty('--c', evColor(e));
      t.style.top = (it.a / 60 * HH) + 'px';
      t.style.height = Math.max(18, (it.b - it.a) / 60 * HH - 2) + 'px';
      t.style.left = `calc(${it.col * 100 / it.n}% + 2px)`;
      t.style.width = `calc(${100 / it.n}% - 4px)`;
      t.append(el('b', null, e.title), el('small', null, `${K.d.hm(evStart(e))} – ${K.d.hm(evEnd(e))}`));
      if (e.kind === 'task' && e.done) t.style.opacity = '.6';
      t.title = `${e.title}\n${rangeTxt(e)}`;
      const rs = el('div', 'rs'); t.appendChild(rs);
      attachTimeDrag(t, rs, e, col, d);
      col.appendChild(t);
    }
    if (esHoy) {
      const now = new Date();
      const l = el('div', 'tg-now'); l.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HH) + 'px';
      col.appendChild(l);
    }
    attachCreateDrag(col, d);
    // Soltar una tarea (de la lista) o un evento sobre una hora de la columna
    col.addEventListener('dragover', (e) => { if (S.drag) { e.preventDefault(); col.classList.add('drop'); } });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const d0 = S.drag; S.drag = null;
      if (!d0) return;
      const mins = Math.min(minutesFromY(col, e.clientY), 24 * 60 - SNAP);
      if (d0.undated) { programa(d0.id, d, mins); return; }
      const e0 = S.events.find(x => x.id === d0.id && x.occurrence === d0.occ);
      if (!e0 || e0.readonly || e0.allDay || isSpan(e0)) return;
      const dur = (evEnd(e0) - evStart(e0)) / 60000;
      moveEvent(e0, { start: strAt(d, mins), end: fechaMas(d, mins + dur) });
    });
    return col;
  }
  // Fin = día + minutos (puede pasar de medianoche)
  const fechaMas = (d, mins) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins); return `${K.d.ymd(x)}T${K.d.hm(x)}`; };

  const minutesFromY = (col, y) => {
    const r = col.getBoundingClientRect();
    return Math.min(24 * 60, Math.max(0, Math.round(((y - r.top) / HH * 60) / SNAP) * SNAP));
  };
  const strAt = (d, mins) => `${K.d.ymd(d)}T${p2h(Math.floor(mins / 60) % 24)}:${p2h(mins % 60)}`;

  // Arrastrar en una columna vacía crea un evento con ese rango
  function attachCreateDrag(col, d) {
    col.addEventListener('pointerdown', (ev) => {
      if (ev.target !== col || ev.button !== 0 || ev.pointerType !== 'mouse') return;
      const a = minutesFromY(col, ev.clientY);
      let b = a + 60;
      const ghost = el('div', 'tg-ev ghost'); ghost.style.setProperty('--c', '#6366f1'); col.appendChild(ghost);
      const pinta = () => { const lo = Math.min(a, b), hi = Math.max(a, b, lo + SNAP); ghost.style.top = (lo / 60 * HH) + 'px'; ghost.style.height = ((hi - lo) / 60 * HH) + 'px'; ghost.textContent = `${p2h(Math.floor(lo / 60))}:${p2h(lo % 60)} – ${p2h(Math.floor(hi / 60) % 24)}:${p2h(hi % 60)}`; };
      pinta();
      let movido = false;
      const mv = (e) => { movido = true; b = minutesFromY(col, e.clientY); pinta(); };
      const up = () => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
        ghost.remove();
        const lo = movido ? Math.min(a, b) : a, hi = movido ? Math.max(a, b, lo + 30) : a + 60;
        openEvent(null, { start: strAt(d, lo), end: hi >= 1440 ? `${K.d.ymd(d)}T23:59` : strAt(d, hi) });
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
  }

  // Mover (arrastrando el cuerpo, también a otro día) y redimensionar (borde inferior)
  function attachTimeDrag(node, handle, e, col, d) {
    node.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.pointerType !== 'mouse') return;
      ev.stopPropagation();
      const resize = ev.target === handle;
      const a0 = evStart(e), b0 = evEnd(e);
      const dur = (b0 - a0) / 60000;
      const startMin = a0.getHours() * 60 + a0.getMinutes();
      const y0 = ev.clientY;
      const cols = [...col.parentElement.querySelectorAll('.tg-col')];
      let destDay = d, destMin = startMin, destDur = dur, movido = false;
      const mv = (m) => {
        if (!movido && Math.abs(m.clientY - y0) < 4 && Math.abs(m.clientX - ev.clientX) < 4) return;
        movido = true;
        if (resize) {
          destDur = Math.max(SNAP, Math.round((dur + (m.clientY - y0) / HH * 60) / SNAP) * SNAP);
          node.style.height = Math.max(18, destDur / 60 * HH - 2) + 'px';
        } else {
          destMin = Math.min(24 * 60 - SNAP, Math.max(0, Math.round((startMin + (m.clientY - y0) / HH * 60) / SNAP) * SNAP));
          const target = cols.find(c => { const r = c.getBoundingClientRect(); return m.clientX >= r.left && m.clientX < r.right; });
          if (target) { destDay = K.d.add(S.view === 'day' ? S.cursor : K.d.weekStart(S.cursor), cols.indexOf(target)); if (target !== node.parentElement) target.appendChild(node); }
          node.style.top = (destMin / 60 * HH) + 'px'; node.style.opacity = '.8';
        }
      };
      const up = () => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
        if (!movido) { openEvent(e); return; }
        const fin = destMin + destDur;
        const sIso = strAt(destDay, destMin);
        const eIso = fin >= 1440 ? strAt(K.d.add(destDay, 1), fin - 1440) : strAt(destDay, fin);
        moveEvent(e, { start: sIso, end: eIso });
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
    // Para ratón la pulsación se gestiona arriba; en táctil, un toque abre el evento
    node.addEventListener('click', (ev) => { if (ev.pointerType !== 'mouse') openEvent(e); });
  }

  /* ---------- Agenda ---------- */
  function renderAgenda(evs) {
    const [ini, fin] = currentRange();
    const wrap = el('div', 'cal-agenda');
    const hoy = K.d.day(new Date());
    let hubo = false;
    for (let d = ini; d <= fin; d = K.d.add(d, 1)) {
      const delDia = evs.filter(e => K.d.day(evStart(e)) <= d && K.d.day(evEnd(e)) >= d)
        .sort((a, b) => (a.allDay === b.allDay ? (a.start < b.start ? -1 : 1) : a.allDay ? -1 : 1));
      if (!delDia.length) continue;
      hubo = true;
      const row = el('div', 'ag-day' + (K.d.same(d, hoy) ? ' today' : ''));
      const date = el('div', 'ag-date'); date.append(el('b', null, String(d.getDate())), document.createTextNode(d.toLocaleDateString('es-ES', { weekday: 'long', month: 'short' })));
      const list = el('div', 'ag-list');
      delDia.forEach(e => {
        const it = el('div', 'ag-ev'); it.style.setProperty('--c', evColor(e));
        if (e.kind === 'task') {
          const chk = el('span', 'cal-check' + (e.done ? ' on' : '')); chk.style.setProperty('--c', evColor(e)); chk.appendChild(icon('i-check'));
          chk.addEventListener('click', async (ev) => { ev.stopPropagation(); try { await K.put('/api/calendar/events/' + e.id, { done: !e.done }); S.dirty = true; load(); } catch (er) { K.fail(er); } });
          it.appendChild(chk);
        }
        it.append(el('span', 'tm', e.allDay ? 'Todo el día' : `${K.d.hm(evStart(e))} – ${K.d.hm(evEnd(e))}`));
        const tt = el('span', 'tt', e.title); if (e.done) tt.style.textDecoration = 'line-through'; it.appendChild(tt);
        const meta = el('span', 'meta');
        if (e.location) meta.appendChild(el('span', null, '📍 ' + e.location));
        if (e.source) { const s = el('span', 'k-chip'); s.style.setProperty('--c', evColor(e)); s.append(icon(K.srcIcon[e.source.type]), document.createTextNode(K.srcName[e.source.type])); s.firstChild.style.cssText = 'width:12px;height:12px'; meta.appendChild(s); }
        if (e.link) { const s = el('span', 'k-chip'); s.style.setProperty('--c', evColor(e)); s.append(icon(K.srcIcon[e.link.type]), document.createTextNode(e.link.title || K.srcName[e.link.type])); s.firstChild.style.cssText = 'width:12px;height:12px'; meta.appendChild(s); }
        (e.labels || []).forEach(l => { const c = K.labelChip(l); if (c) meta.appendChild(c); });
        it.appendChild(meta);
        it.addEventListener('click', () => openEvent(e));
        list.appendChild(it);
      });
      row.append(date, list);
      wrap.appendChild(row);
    }
    if (!hubo) {
      const v = el('div', 'ag-vacio'); v.append(el('p', null, 'No hay eventos en este periodo.'));
      const b = el('button', 'btn primary', 'Crear evento'); b.type = 'button'; b.addEventListener('click', () => openEvent(null, { date: S.cursor }));
      v.appendChild(b); wrap.appendChild(v);
    }
    return wrap;
  }

  /* ---------- Modal de evento ---------- */
  async function openEvent(ev, defaults = {}) {
    await Promise.all([K.loadCalendars(), K.loadLabels()]).catch(() => {});
    // Los festivos no se editan: solo se enseña de qué día es y de qué ámbito
    if (ev && ev.holiday) {
      const w = el('div'); w.append(el('p', 'k-muted', K.d.long(K.d.parse(ev.start))));
      const ch = el('span', 'k-chip'); ch.style.setProperty('--c', evColor(ev)); ch.textContent = ev.scope === 'nacional' ? 'Festivo nacional' : 'Festivo autonómico'; w.appendChild(ch);
      const nota = el('p', 'k-faint', 'Fechas orientativas: cada comunidad publica su calendario oficial cada año y los festivos locales no están incluidos.'); nota.style.cssText = 'font-size:12.5px;margin-top:14px';
      w.appendChild(nota);
      K.modal({ title: ev.title, content: w, actions: [{ label: 'Cambiar comunidad…', onClick: () => K.calExtra.festivos() }, { label: 'Cerrar', primary: true }] });
      return;
    }
    const nuevo = !ev;
    const now = new Date();
    const sinFecha0 = !!(ev && !ev.start);          // tarea sin fecha
    let base = ev ? { ...ev } : (() => {
      const day = defaults.date ? K.d.day(defaults.date) : K.d.day(now);
      if (defaults.start) return { title: '', allDay: false, start: defaults.start, end: defaults.end || defaults.start };
      if (defaults.allDay) return { title: '', allDay: true, start: K.d.ymd(day), end: K.d.ymd(day) };
      const h = K.d.same(day, K.d.day(now)) ? Math.min(23, now.getHours() + 1) : 9;
      return { title: '', allDay: false, start: `${K.d.ymd(day)}T${p2h(h)}:00`, end: `${K.d.ymd(day)}T${p2h(Math.min(23, h + 1))}:00` };
    })();
    if (sinFecha0) {                                  // se muestra "hoy" en los campos, pero queda marcada sin fecha
      const h0 = new Date(); h0.setMinutes(0, 0, 0); h0.setHours(h0.getHours() + 1);
      base.start = K.d.ymd(h0) + 'T' + K.d.hm(h0); base.end = base.start; base.allDay = true;
    }
    if (nuevo) { base.calendarId = defaults.calendarId || (calsEscribibles().find(c => !S.hidden.has(c.id) && c.id === 'personal') ? 'personal' : calsEscribibles()[0].id); base.kind = defaults.kind || 'event'; base.labels = []; base.reminders = []; }
    const bloqueaTitulo = !!(ev && ev.source);

    const root = el('div');
    const top = el('div', 'ev-modal-top');
    const title = el('input', 'ev-title-input'); title.placeholder = 'Título'; title.value = base.title || ''; title.maxLength = 200;
    if (bloqueaTitulo) { title.disabled = true; title.title = `El título se cambia en ${K.srcName[ev.source.type].toLowerCase()}`; }
    top.appendChild(title);
    root.appendChild(top);

    // Tipo + calendario
    const l0 = el('div', 'ev-line'); l0.appendChild(icon('i-calendar'));
    const c0 = el('div', 'cnt k-row');
    const segk = el('div', 'seg'); segk.style.width = 'auto';
    let kind = base.kind || 'event';
    for (const [id, lbl] of [['event', 'Evento'], ['task', 'Tarea']]) {
      const b = el('button', kind === id ? 'is-active' : '', lbl); b.type = 'button'; b.style.cssText = 'width:auto;padding:0 14px;font-size:13px';
      b.addEventListener('click', () => { kind = id; segk.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); doneRow.hidden = kind !== 'task'; syncFecha(); });
      segk.appendChild(b);
    }
    const calSel = el('select'); calSel.style.width = 'auto'; calSel.style.minWidth = '160px';
    calsEscribibles().forEach(c => { const o = el('option', null, c.name); o.value = c.id; calSel.appendChild(o); });
    calSel.value = base.calendarId || 'personal';
    c0.append(segk, calSel); l0.appendChild(c0); root.appendChild(l0);

    // Fechas
    const l1 = el('div', 'ev-line'); l1.appendChild(icon('i-clock'));
    const c1 = el('div', 'cnt');
    const sw = el('label', 'k-switch'); const allday = el('input'); allday.type = 'checkbox'; allday.checked = !!base.allDay;
    sw.append(allday, el('span', 'track'), el('span', null, 'Todo el día')); sw.style.marginBottom = '10px';
    const dates = el('div', 'ev-dates');
    const sd = el('input'); sd.type = 'date'; const st = el('input'); st.type = 'time';
    const ed = el('input'); ed.type = 'date'; const et = el('input'); et.type = 'time';
    const pa = K.d.parse(base.start), pb = K.d.parse(base.end || base.start);
    sd.value = K.d.ymd(pa); st.value = base.allDay ? '09:00' : K.d.hm(pa);
    ed.value = K.d.ymd(pb); et.value = base.allDay ? '10:00' : K.d.hm(pb);
    dates.append(sd, st, el('span', 'sep', '→'), ed, et);
    const sync = () => { dates.classList.toggle('allday', allday.checked); st.hidden = et.hidden = allday.checked; };
    allday.addEventListener('change', sync); sync();
    // Al mover el inicio, el fin se desplaza igual (como en Google Calendar)
    let prevStart = K.d.parse(`${sd.value}T${st.value || '00:00'}`);
    const shiftEnd = () => {
      const nuevoIni = K.d.parse(`${sd.value}T${st.value || '00:00'}`);
      if (isNaN(nuevoIni)) return;
      const fin = K.d.parse(`${ed.value}T${et.value || '00:00'}`);
      if (!isNaN(fin) && !isNaN(prevStart)) {
        const f2 = new Date(fin.getTime() + (nuevoIni - prevStart));
        ed.value = K.d.ymd(f2); et.value = K.d.hm(f2);
      }
      prevStart = nuevoIni;
    };
    sd.addEventListener('change', shiftEnd); st.addEventListener('change', shiftEnd);
    // Las tareas pueden quedarse sin fecha (van a la lista lateral hasta que las arrastres al calendario)
    const nfSw = el('label', 'k-switch'); const sinFecha = el('input'); sinFecha.type = 'checkbox'; sinFecha.checked = sinFecha0;
    nfSw.append(sinFecha, el('span', 'track'), el('span', null, 'Sin fecha (la programarás después)')); nfSw.style.marginBottom = '10px';
    const syncFecha = () => {
      const esTarea = kind === 'task';
      nfSw.hidden = !esTarea;
      const oculto = esTarea && sinFecha.checked;
      sw.hidden = dates.hidden = oculto;
      l2.hidden = oculto;                        // sin fecha no hay repetición
    };
    sinFecha.addEventListener('change', syncFecha);
    c1.append(nfSw, sw, dates); l1.appendChild(c1); root.appendChild(l1);

    // Tarea hecha
    const doneRow = el('div', 'ev-line'); doneRow.hidden = kind !== 'task';
    doneRow.appendChild(icon('i-check-square'));
    const dc = el('div', 'cnt'); const dsw = el('label', 'k-switch'); const done = el('input'); done.type = 'checkbox'; done.checked = !!base.done;
    dsw.append(done, el('span', 'track'), el('span', null, 'Completada')); dc.appendChild(dsw); doneRow.appendChild(dc); root.appendChild(doneRow);

    // Repetición
    const l2 = el('div', 'ev-line'); l2.appendChild(icon('i-repeat'));
    const c2 = el('div', 'cnt');
    const rf = el('select'); rf.style.width = 'auto';
    for (const [v, t] of [['', 'No se repite'], ['daily', 'Cada día'], ['weekly', 'Cada semana'], ['monthly', 'Cada mes'], ['yearly', 'Cada año']]) { const o = el('option', null, t); o.value = v; rf.appendChild(o); }
    const rep = base.repeat || null;
    rf.value = rep ? rep.freq : '';
    const rOpts = el('div'); rOpts.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:10px';
    const intRow = el('div', 'k-row'); const ri = el('input'); ri.type = 'number'; ri.min = 1; ri.max = 99; ri.value = rep ? rep.interval : 1; ri.style.width = '74px';
    const unit = el('span', 'k-muted', '');
    intRow.append(el('span', 'k-muted', 'Cada'), ri, unit);
    const dowRow = el('div', 'dow-pick'); const sel = new Set(rep && rep.byday ? rep.byday : [(pa.getDay())]);
    K.d.dow.forEach((l, i) => { const dn = (i + 1) % 7; const b = el('button', sel.has(dn) ? 'on' : '', l); b.type = 'button'; b.addEventListener('click', () => { if (sel.has(dn)) { if (sel.size > 1) sel.delete(dn); } else sel.add(dn); b.classList.toggle('on', sel.has(dn)); }); dowRow.appendChild(b); });
    const endRow = el('div', 'k-row'); const es = el('select'); es.style.width = 'auto';
    for (const [v, t] of [['never', 'Nunca termina'], ['until', 'Hasta el día'], ['count', 'Tras N veces']]) { const o = el('option', null, t); o.value = v; es.appendChild(o); }
    const eu = el('input'); eu.type = 'date'; eu.style.width = 'auto'; eu.value = rep && rep.until ? rep.until : K.d.ymd(K.d.add(pa, 90));
    const ec = el('input'); ec.type = 'number'; ec.min = 1; ec.max = 1000; ec.style.width = '84px'; ec.value = rep && rep.count ? rep.count : 10;
    es.value = rep && rep.until ? 'until' : rep && rep.count ? 'count' : 'never';
    endRow.append(es, eu, ec);
    rOpts.append(intRow, dowRow, endRow);
    const syncRep = () => {
      rOpts.hidden = !rf.value;
      unit.textContent = { daily: 'día(s)', weekly: 'semana(s)', monthly: 'mes(es)', yearly: 'año(s)' }[rf.value] || '';
      dowRow.hidden = rf.value !== 'weekly'; eu.hidden = es.value !== 'until'; ec.hidden = es.value !== 'count';
    };
    rf.addEventListener('change', syncRep); es.addEventListener('change', syncRep); syncRep();
    c2.append(rf, rOpts); l2.appendChild(c2); root.appendChild(l2);
    syncFecha();

    // Recordatorios
    const l3 = el('div', 'ev-line'); l3.appendChild(icon('i-bell'));
    const c3 = el('div', 'cnt ev-rem');
    let rems = [...(base.reminders || [])];
    const pintaRems = () => {
      c3.textContent = '';
      rems.forEach(m => { const ch = el('span', 'k-chip'); ch.append(el('span', null, remLabel(m))); const x = el('button', null, '×'); x.type = 'button'; x.addEventListener('click', () => { rems = rems.filter(r => r !== m); pintaRems(); }); ch.appendChild(x); c3.appendChild(ch); });
      const add = el('select'); add.style.cssText = 'width:auto;padding:6px 30px 6px 10px;font-size:13px';
      const o0 = el('option', null, rems.length ? '+ Otro aviso' : '+ Añadir aviso'); o0.value = ''; add.appendChild(o0);
      REMS.filter(r => !rems.includes(r[0])).forEach(([m, t]) => { const o = el('option', null, t); o.value = m; add.appendChild(o); });
      add.addEventListener('change', () => { if (add.value === '') return; rems.push(+add.value); pintaRems(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); });
      if (rems.length < 5) c3.appendChild(add);
    };
    pintaRems(); l3.appendChild(c3); root.appendChild(l3);

    // Lugar y descripción
    const l4 = el('div', 'ev-line'); l4.appendChild(icon('i-pin')); const c4 = el('div', 'cnt');
    const loc = el('input'); loc.placeholder = 'Lugar'; loc.value = base.location || ''; loc.maxLength = 200; c4.appendChild(loc); l4.appendChild(c4); root.appendChild(l4);
    const l5 = el('div', 'ev-line'); l5.appendChild(icon('i-doc')); const c5 = el('div', 'cnt');
    const desc = el('textarea'); desc.placeholder = 'Descripción'; desc.value = base.description || ''; desc.rows = 3; c5.appendChild(desc); l5.appendChild(c5); root.appendChild(l5);

    // Etiquetas y color
    const l6 = el('div', 'ev-line'); l6.appendChild(icon('i-tag')); const c6 = el('div', 'cnt');
    const lp = K.labelPicker({ selected: base.labels || [] }); c6.appendChild(lp); l6.appendChild(c6); root.appendChild(l6);
    const l7 = el('div', 'ev-line'); l7.appendChild(icon('i-palette')); const c7 = el('div', 'cnt');
    const colp = K.colorPicker({ value: base.color || '', allowNone: true }); c7.appendChild(colp);
    const ch = el('div', 'k-faint', 'Sin color: usa el del calendario'); ch.style.cssText = 'font-size:11.5px;margin-top:5px'; c7.appendChild(ch);
    l7.appendChild(c7); root.appendChild(l7);

    // Origen vinculado
    if (ev && ev.source) {
      const s = el('div', 'ev-source');
      s.append(icon(K.srcIcon[ev.source.type] || 'i-link'), el('span', null, `${K.srcName[ev.source.type]}: ${ev.source.title || ev.source.ref}`), el('span', 'k-grow'), icon('i-external'));
      s.addEventListener('click', () => { m.close(); K.open(ev.source.type, ev.source.ref); });
      root.appendChild(s);
    }

    // Recordatorio o tarea colgado de una nota o de un contacto
    if (ev && ev.link) {
      const s = el('div', 'ev-source');
      s.append(icon(K.srcIcon[ev.link.type] || 'i-link'), el('span', null, `${K.srcName[ev.link.type]}: ${ev.link.title || ev.link.ref}`), el('span', 'k-grow'), icon('i-external'));
      s.addEventListener('click', () => { m.close(); K.open(ev.link.type, ev.link.ref); });
      root.appendChild(s);
    }

    const acciones = [{ label: 'Cancelar' }];
    if (!nuevo) acciones.push({ label: 'Borrar', danger: true, onClick: async (h) => { const ok = await borrar(ev); return ok ? undefined : false; } });
    acciones.push({ id: 'save', label: nuevo ? 'Crear' : 'Guardar', primary: true, onClick: async () => {
      const body = {
        title: title.value, calendarId: calSel.value, kind, allDay: allday.checked,
        start: allday.checked ? sd.value : `${sd.value}T${st.value || '00:00'}`,
        end: allday.checked ? (ed.value || sd.value) : `${ed.value || sd.value}T${et.value || st.value || '00:00'}`,
        done: kind === 'task' ? done.checked : false,
        location: loc.value, description: desc.value, labels: lp.get(), color: colp.get(), reminders: rems,
        repeat: rf.value ? {
          freq: rf.value, interval: +ri.value || 1, byday: rf.value === 'weekly' ? [...sel] : undefined,
          until: es.value === 'until' ? eu.value : undefined, count: es.value === 'count' ? +ec.value : undefined,
        } : null,
      };
      if (bloqueaTitulo) delete body.title;
      const undated = kind === 'task' && sinFecha.checked;
      if (undated) { body.start = ''; body.end = ''; body.allDay = false; body.repeat = null; }
      else if (!sd.value) { K.toast('Falta la fecha'); return false; }
      try {
        if (nuevo) await K.post('/api/calendar/events', body);
        else {
          let q = '';
          if (ev.recurring) {
            const scope = await preguntaAlcance('Guardar cambios');
            if (!scope) return false;
            if (scope === 'one') q = `?scope=one&date=${ev.occurrence}`;
          }
          await K.put('/api/calendar/events/' + ev.id + q, body);
        }
        K.bus.emit('calendar'); if (ev && ev.source) K.bus.emit(ev.source.type === 'prompt' ? 'prompts' : ev.source.type === 'game' ? 'games' : 'notes');
        S.dirty = true; load();
      } catch (e) { K.fail(e); return false; }
    } });
    const m = K.modal({ title: nuevo ? (defaults.kind === 'task' ? 'Nueva tarea' : 'Nuevo evento') : 'Editar evento', cls: 'wide', content: root, actions: acciones,
      sub: nuevo ? '' : (sinFecha0 ? 'Sin fecha' : rangeTxt(ev)) });
    if (nuevo) setTimeout(() => title.focus(), 40);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && m.buttons.save) m.buttons.save.click(); });
  }

  function preguntaAlcance(accion) {
    return new Promise((res) => {
      let fin = null;
      K.modal({ title: 'Evento repetido', sub: `${accion}: ¿a qué eventos se aplica?`, onClose: () => res(fin),
        actions: [
          { label: 'Solo este evento', onClick: () => { fin = 'one'; } },
          { label: 'Todos los eventos', primary: true, onClick: () => { fin = 'all'; } },
        ] });
    });
  }

  async function borrar(ev) {
    let q = '';
    if (ev.recurring) {
      const scope = await preguntaAlcance('Borrar');
      if (!scope) return false;
      if (scope === 'one') q = `?scope=one&date=${ev.occurrence}`;
    } else if (!await K.confirm(`¿Borrar “${ev.title}”?`, { ok: 'Borrar', danger: true })) return false;
    try {
      await K.del('/api/calendar/events/' + ev.id + q);
      K.bus.emit('calendar'); if (ev.source) K.bus.emit(ev.source.type === 'prompt' ? 'prompts' : ev.source.type === 'game' ? 'games' : 'notes');
      S.dirty = true; load(); return true;
    } catch (e) { K.fail(e); return false; }
  }

  /* ---------- Recordatorios ---------- */
  const avisados = (() => { try { return new Set(JSON.parse(localStorage.getItem('kcc-rem') || '[]')); } catch { return new Set(); } })();
  let proximos = [];
  async function cargaProximos() {
    try {
      const hoy = K.d.day(new Date());
      const r = await K.get('/api/calendar/events?' + K.qs({ from: K.d.ymd(K.d.add(hoy, -1)), to: K.d.ymd(K.d.add(hoy, 8)) }));
      proximos = r.events.filter(e => (e.reminders || []).length && !e.allDay && !e.done);
    } catch { /* sin red */ }
  }
  function revisaAvisos() {
    const ahora = Date.now();
    for (const e of proximos) {
      const ini = evStart(e).getTime();
      for (const m of e.reminders) {
        const cuando = ini - m * 60000;
        const clave = `${e.id}|${e.occurrence}|${m}`;
        if (ahora >= cuando && ahora < ini + 60000 && !avisados.has(clave)) {
          avisados.add(clave);
          try { localStorage.setItem('kcc-rem', JSON.stringify([...avisados].slice(-300))); } catch {}
          const txt = `${e.title} — ${m === 0 ? 'ahora' : 'en ' + (m >= 1440 ? Math.round(m / 1440) + ' d' : m >= 60 ? Math.round(m / 60) + ' h' : m + ' min')}`;
          K.toast('🔔 ' + txt);
          if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('KookyeCatCloud', { body: txt }); } catch {} }
        }
      }
    }
  }
  let remTimer = null;
  function arrancaAvisos() {
    if (remTimer) return;
    cargaProximos();
    remTimer = setInterval(revisaAvisos, 30000);
    setInterval(cargaProximos, 5 * 60000);
  }

  /* ---------- Registro ---------- */
  K.registerView('calendar', {
    async open() {
      if (!S.built) build();
      await K.loadCalendars().catch(() => {}); await K.loadLabels().catch(() => {});
      K.cals.list.forEach(c => { if (c.visible === false) S.hidden.add(c.id); });
      load();
    },
    close() {},
  });
  const invalida = () => { S.dirty = true; cargaProximos(); if (S.built && !$('view-calendar').hidden) load(); };
  ['calendar', 'prompts', 'notes', 'files'].forEach(ev => K.bus.on(ev, invalida));
  K.bus.on('labels', () => { if (S.built && !$('view-calendar').hidden) render(); });

  K.openers.event = async (id) => {
    switchTab('calendar');
    try {
      const r = await K.get('/api/calendar/events/' + id);
      if (r.event.start) goto(K.d.parse(r.event.start), 'month');
      openEvent({ ...r.event, occurrence: (r.event.start || '').slice(0, 10), recurring: !!r.event.repeat });
    } catch (e) { K.fail(e); }
  };
  K.calendar = {
    newEvent: (opts) => { switchTab('calendar'); openEvent(null, opts || {}); },
    goto,
    reload: () => { S.dirty = true; if (S.built) load(); },
    hide: (id) => S.hidden.add(id),
  };

  // Al iniciar sesión (preload) arrancan también los avisos
  const preloadOrig = K.preload;
  K.preload = function () { preloadOrig(); arrancaAvisos(); };
})();
