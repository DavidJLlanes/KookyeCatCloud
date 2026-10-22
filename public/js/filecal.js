'use strict';
/* ---------------------------------------------------------------
   Archivos <-> calendario:
   - En la barra de subida, un interruptor "Fecha de subida en el calendario": al terminar
     la subida se crea el evento (uno por archivo si son pocos; uno solo para la carpeta
     si es una subida grande).
   - En el menú de cada archivo, "Fecha en el calendario…" para ponerla, cambiarla o quitarla.
--------------------------------------------------------------- */
(function () {
  let field = null;
  const hoy = () => K.d.ymd(new Date());
  const lee = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch { return def; } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  function mount() {
    const host = $('upbar-cal');
    if (!host || field) return;
    const on = lee('kcc-upcal', '0') === '1';
    field = K.calField({
      value: on ? { date: hoy(), time: '', calendarId: lee('kcc-upcal-cal', 'archivos') } : null,
      defaultCalendar: lee('kcc-upcal-cal', 'archivos'),
      label: 'Poner fecha de subida en el calendario',
    });
    field.classList.add('compact');
    // Se recuerda la preferencia, pero la fecha vuelve a ser "hoy" en cada subida
    field.addEventListener('change', () => {
      const v = field.get();
      guarda('kcc-upcal', v ? '1' : '0');
      if (v) guarda('kcc-upcal-cal', v.calendarId);
    });
    host.appendChild(field);
  }

  window.KCC.onUploadStart = () => {
    mount();
    // Si no hay una cola en marcha, la fecha se reinicia a hoy (el interruptor se conserva)
    const v = field.get();
    if (v) field.set({ date: hoy(), time: v.time, calendarId: v.calendarId });
  };

  window.KCC.onUploaded = async (items) => {
    if (!field) return;
    const cal = field.get();
    if (!cal) return;
    const paths = items.map(i => (i.dest ? i.dest + '/' : '') + (i.guardado || i.name));
    try {
      await K.post('/api/files/calendar', { paths, calendar: { date: cal.date, time: cal.time, calendarId: cal.calendarId } });
      K.bus.emit('calendar');
      K.toast(paths.length > 3 ? 'Subida añadida al calendario' : 'Añadido al calendario');
    } catch (e) { K.fail(e); }
  };

  // Menú de archivo: poner/cambiar/quitar la fecha
  window.KCC.fileCalendar = async function (rutas) {
    await K.loadCalendars().catch(() => {});
    let actual = null;
    if (rutas.length === 1) {
      try { const r = await K.get('/api/calendar/by-source?' + K.qs({ type: 'file', ref: rutas[0] })); actual = r.events[0] || null; } catch {}
    }
    const f = K.calField({
      value: actual ? { date: actual.start.slice(0, 10), time: actual.allDay ? '' : actual.start.slice(11, 16), calendarId: actual.calendarId } : { date: hoy() },
      defaultCalendar: 'archivos', label: 'Mostrar en el calendario',
    });
    if (!actual) f.set({ date: hoy() });
    const nombre = rutas.length === 1 ? rutas[0].split('/').pop() : `${rutas.length} archivos`;
    K.modal({
      title: 'Fecha en el calendario', sub: nombre, content: f,
      actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
        try {
          await K.post('/api/files/calendar', { paths: rutas, calendar: f.get() });
          K.bus.emit('calendar'); K.toast(f.get() ? 'Fecha guardada' : 'Quitado del calendario');
        } catch (e) { K.fail(e); return false; }
      } }],
    });
  };

  K.bus.on('files', () => {});
})();
