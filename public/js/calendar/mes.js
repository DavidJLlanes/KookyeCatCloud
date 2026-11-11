'use strict';
/* calendar/mes.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { R, S } = C;
  const currentRange = (...a) => C.currentRange(...a);
  const evColor = (...a) => C.evColor(...a);
  const evEnd = (...a) => C.evEnd(...a);
  const evStart = (...a) => C.evStart(...a);
  const isSpan = (...a) => C.isSpan(...a);
  const load = (...a) => C.load(...a);
  const openEvent = (...a) => C.openEvent(...a);
  const rangeTxt = (...a) => C.rangeTxt(...a);
  const renderAgenda = (...a) => C.renderAgenda(...a);
  const renderSide = (...a) => C.renderSide(...a);
  const renderTime = (...a) => C.renderTime(...a);
  const strAt = (...a) => C.strAt(...a);
  const timeTxt = (...a) => C.timeTxt(...a);
  const visibleEvents = (...a) => C.visibleEvents(...a);

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


  Object.assign(C, { render, pill, renderMonth, openDay, dayPopup, dropOnDay, programa, shiftStr, moveEvent });
})();
