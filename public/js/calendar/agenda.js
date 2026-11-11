'use strict';
/* agenda: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { S } = C;
  const currentRange = (...a) => C.currentRange(...a);
  const evColor = (...a) => C.evColor(...a);
  const evEnd = (...a) => C.evEnd(...a);
  const evStart = (...a) => C.evStart(...a);
  const load = (...a) => C.load(...a);
  const openEvent = (...a) => C.openEvent(...a);

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


  Object.assign(C, { renderAgenda });
})();
