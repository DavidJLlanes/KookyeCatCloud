'use strict';
/* Recordatorios y tareas vinculados a una nota o a un contacto.
   Son eventos normales del calendario (kind "event" o "task") que llevan `link: { type, ref, title }`:
   aparecen en el calendario, avisan como cualquier recordatorio y desde ellos se vuelve a la nota o al
   contacto. K.vinculos.abrir('note' | 'contact', id, título) abre la ventana de gestión. */
(function () {
  if (!window.K) return;
  const AVISOS = [['0', 'A la hora'], ['10', '10 minutos antes'], ['60', '1 hora antes'], ['1440', '1 día antes'], ['-1', 'Sin aviso']];
  const NOMBRE = { note: 'la nota', contact: 'el contacto' };

  const ymd = (d) => K.d.ymd(d);
  const cuando = (e) => {
    if (!e.start) return 'Sin fecha';
    const d = K.d.parse(e.start);
    const dia = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    return e.allDay ? dia : `${dia}, ${K.d.hm(d)}`;
  };
  const vencida = (e) => !e.done && e.start && K.d.parse(e.start) < (e.allDay ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date());

  async function abrir(tipo, ref, titulo) {
    const w = el('div', 'vc');
    const lista = el('div', 'vc-lista');
    w.appendChild(lista);
    let m;

    async function carga() {
      let r;
      try { r = await K.get('/api/calendar/by-link?' + K.qs({ type: tipo, ref })); } catch (e) { K.fail(e); return; }
      lista.textContent = '';
      if (!r.events.length) {
        lista.appendChild(el('p', 'k-faint vc-vacio', `Nada pendiente. Añade abajo un recordatorio o una tarea para ${NOMBRE[tipo]}.`));
        return;
      }
      for (const e of r.events) {
        const f = el('div', 'vc-fila' + (e.done ? ' done' : '') + (vencida(e) ? ' vencida' : ''));
        const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!e.done; chk.setAttribute('aria-label', 'Hecho');
        chk.addEventListener('change', async () => {
          try { await K.put('/api/calendar/events/' + e.id, { done: chk.checked }); K.bus.emit('calendar'); await carga(); } catch (x) { K.fail(x); chk.checked = !chk.checked; }
        });
        const txt = el('div', 'vc-txt');
        txt.appendChild(el('b', null, e.title));
        const meta = el('span', 'k-faint', `${e.kind === 'task' ? 'Tarea' : 'Recordatorio'} · ${cuando(e)}${(e.reminders || []).length && !e.allDay ? ' · 🔔' : ''}`);
        txt.appendChild(meta);
        const ver = el('button', 'btn ghost icon tiny'); ver.type = 'button'; ver.title = 'Ver en el calendario'; ver.setAttribute('aria-label', 'Ver en el calendario'); ver.appendChild(icon('i-calendar'));
        ver.disabled = !e.start;
        ver.addEventListener('click', () => { m.close(); switchTab('calendar'); if (K.calendar && K.calendar.goto) K.calendar.goto(K.d.parse(e.start), 'month'); });
        const del = el('button', 'btn ghost icon tiny'); del.type = 'button'; del.title = 'Quitar'; del.setAttribute('aria-label', 'Quitar'); del.appendChild(icon('i-trash'));
        del.addEventListener('click', async () => { try { await K.del('/api/calendar/events/' + e.id); K.bus.emit('calendar'); await carga(); } catch (x) { K.fail(x); } });
        f.append(chk, txt, ver, del);
        lista.appendChild(f);
      }
    }

    /* ---- Formulario para añadir ---- */
    const form = el('form', 'vc-form');
    const titulo2 = el('input'); titulo2.type = 'text'; titulo2.placeholder = tipo === 'contact' ? 'Ej. Llamar para hablar del presupuesto' : 'Ej. Revisar esta nota'; titulo2.maxLength = 200; titulo2.required = true;
    const seg = el('div', 'seg'); seg.style.width = 'auto';
    let kind = 'event';
    const bR = el('button', 'is-active', 'Recordatorio'); bR.type = 'button';
    const bT = el('button', null, 'Tarea'); bT.type = 'button';
    seg.append(bR, bT);
    const fecha = el('input'); fecha.type = 'date'; fecha.value = ymd(new Date(Date.now() + 86400000));
    const hora = el('input'); hora.type = 'time'; hora.value = '09:00';
    const aviso = el('select'); AVISOS.forEach(([v, n]) => aviso.appendChild(new Option(n, v))); aviso.value = '10';
    const rapidos = el('div', 'vc-rapidos');
    [['Hoy', 0], ['Mañana', 1], ['En una semana', 7]].forEach(([n, d]) => {
      const b = el('button', 'btn ghost tiny', n); b.type = 'button';
      b.addEventListener('click', () => { fecha.value = ymd(new Date(Date.now() + d * 86400000)); });
      rapidos.appendChild(b);
    });
    const sinFecha = el('button', 'btn ghost tiny', 'Sin fecha'); sinFecha.type = 'button'; sinFecha.hidden = true;
    sinFecha.addEventListener('click', () => { fecha.value = ''; hora.value = ''; });
    rapidos.appendChild(sinFecha);
    const modo = (k) => {
      kind = k; bR.classList.toggle('is-active', k === 'event'); bT.classList.toggle('is-active', k === 'task');
      sinFecha.hidden = k !== 'task';
      if (k === 'event' && !fecha.value) fecha.value = ymd(new Date(Date.now() + 86400000));
      if (k === 'event' && !hora.value) hora.value = '09:00';
    };
    bR.addEventListener('click', () => modo('event')); bT.addEventListener('click', () => modo('task'));
    const fila = el('div', 'vc-cuando');
    const lf = el('label', 'field tight'); lf.append(el('span', null, 'Fecha'), fecha);
    const lh = el('label', 'field tight'); lh.append(el('span', null, 'Hora'), hora);
    const la = el('label', 'field tight'); la.append(el('span', null, 'Aviso'), aviso);
    fila.append(lf, lh, la);
    const enviar = el('button', 'btn primary'); enviar.type = 'submit'; enviar.append(icon('i-plus'), el('span', null, 'Añadir'));
    form.append(seg, titulo2, rapidos, fila, enviar);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const t = titulo2.value.trim();
      if (!t) return;
      if (kind === 'event' && !fecha.value) { K.toast('Elige una fecha para el recordatorio'); return; }
      const cuerpo = { title: t, kind, calendarId: 'personal', link: { type: tipo, ref, title: titulo } };
      if (fecha.value) {
        cuerpo.allDay = !hora.value;
        cuerpo.start = hora.value ? `${fecha.value}T${hora.value}` : fecha.value;
        if (hora.value && +aviso.value >= 0) cuerpo.reminders = [+aviso.value];
      }
      enviar.disabled = true;
      try {
        await K.post('/api/calendar/events', cuerpo);
        K.bus.emit('calendar');
        titulo2.value = '';
        await carga();
        titulo2.focus();
        if (kind === 'event' && hora.value === '' ) K.toast('Sin hora no habrá aviso: se verá en el calendario ese día');
      } catch (x) { K.fail(x); } finally { enviar.disabled = false; }
    });
    w.appendChild(form);

    m = K.modal({ title: 'Recordatorios y tareas', sub: titulo, content: w, cls: 'wide', actions: [{ label: 'Cerrar', primary: true }] });
    await carga();
    setTimeout(() => titulo2.focus(), 60);
  }

  K.vinculos = { abrir };
})();
