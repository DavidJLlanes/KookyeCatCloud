'use strict';
/* semana: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const { HH, S, SNAP } = C;
  const currentRange = (...a) => C.currentRange(...a);
  const dropOnDay = (...a) => C.dropOnDay(...a);
  const evColor = (...a) => C.evColor(...a);
  const evEnd = (...a) => C.evEnd(...a);
  const evStart = (...a) => C.evStart(...a);
  const goto = (...a) => C.goto(...a);
  const isSpan = (...a) => C.isSpan(...a);
  const moveEvent = (...a) => C.moveEvent(...a);
  const openDay = (...a) => C.openDay(...a);
  const openEvent = (...a) => C.openEvent(...a);
  const pill = (...a) => C.pill(...a);
  const programa = (...a) => C.programa(...a);
  const rangeTxt = (...a) => C.rangeTxt(...a);

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


  Object.assign(C, { renderTime, p2h, dayColumn, fechaMas, minutesFromY, strAt, attachCreateDrag, attachTimeDrag });
})();
