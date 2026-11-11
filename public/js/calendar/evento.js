'use strict';
/* calendar/evento.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { REMS, S } = C;
  const calsEscribibles = (...a) => C.calsEscribibles(...a);
  const evColor = (...a) => C.evColor(...a);
  const load = (...a) => C.load(...a);
  const p2h = (...a) => C.p2h(...a);
  const rangeTxt = (...a) => C.rangeTxt(...a);
  const remLabel = (...a) => C.remLabel(...a);

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
          await K.put('/api/calendar/events/' + ev.id + q, { ...body, base: ev.updatedAt });
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


  Object.assign(C, { openEvent, preguntaAlcance, borrar });
})();
