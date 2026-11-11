'use strict';
/* calendar/lateral.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { R, S } = C;
  const evColor = (...a) => C.evColor(...a);
  const evEnd = (...a) => C.evEnd(...a);
  const evStart = (...a) => C.evStart(...a);
  const goto = (...a) => C.goto(...a);
  const load = (...a) => C.load(...a);
  const openEvent = (...a) => C.openEvent(...a);
  const render = (...a) => C.render(...a);
  const visibleEvents = (...a) => C.visibleEvents(...a);

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


  Object.assign(C, { renderSide, tasksCard, editCalendar, delCalendar });
})();
