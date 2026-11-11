'use strict';
/* calendar/datos.js: parte del módulo (se carga con el resto de calendar/ en index.html). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { S } = C;
  const evEnd = (...a) => C.evEnd(...a);
  const evStart = (...a) => C.evStart(...a);
  const rangeTxt = (...a) => C.rangeTxt(...a);
  const render = (...a) => C.render(...a);

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


  Object.assign(C, { visibleEvents, currentRange, load, calsEscribibles, agendaMd });
})();
