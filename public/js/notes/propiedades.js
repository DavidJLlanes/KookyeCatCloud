'use strict';
/* notes/propiedades.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;

  Object.assign(EST, { props: null });
  const itemActual = () => NT.items.find(i => i.id === NT.abierta);

  async function guardaProps(campos) {
    const id = NT.abierta; if (!id) return;
    try {
      await K.put('/api/notes/' + id, campos);
      await loadNotes(true);
      K.bus.emit('notes');
      if (campos.calendar !== undefined) K.bus.emit('calendar');
      pintaProps();
    } catch (e) { K.fail(e); }
  }

  function pintaProps() {
    if (!EST.props) return;
    const it = itemActual(); EST.props.textContent = '';
    if (!it) return;
    const colorear = it.color || '';
    $('editor-cuerpo').style.setProperty('--note-c', colorear || 'transparent');
    $('editor-cuerpo').classList.toggle('has-color', !!colorear);
    const ic = el('button', 'btn ghost sm'); ic.type = 'button'; ic.title = 'Cambiar icono';
    if (it.icon) { ic.textContent = it.icon; ic.style.fontSize = '18px'; } else { ic.appendChild(icon('i-sparkle')); ic.append(' Icono'); }
    ic.addEventListener('click', () => K.emojiPicker(ic, (e) => guardaProps({ icon: e })));
    const co = el('button', 'btn ghost sm'); co.type = 'button'; co.title = 'Color';
    if (colorear) { const d = el('span', 'k-dot'); d.style.setProperty('--c', colorear); co.appendChild(d); co.append(' Color'); } else { co.appendChild(icon('i-palette')); co.append(' Color'); }
    co.addEventListener('click', () => { const cp = K.colorPicker({ value: colorear, allowNone: true, onChange: (c) => { guardaProps({ color: c }); } }); const w = el('div'); w.style.padding = '6px'; w.appendChild(cp); K.pop(co, w, { width: 240 }); });
    const pin = el('button', 'btn ghost sm' + (it.pinned ? ' is-on' : '')); pin.type = 'button'; pin.append(icon(it.pinned ? 'i-pin-fill' : 'i-pin'), document.createTextNode(it.pinned ? ' Fijada' : ' Fijar'));
    pin.addEventListener('click', () => guardaProps({ pinned: !it.pinned }));
    const cal = el('button', 'btn ghost sm' + (it.cal ? ' is-on' : '')); cal.type = 'button';
    cal.append(icon('i-calendar'), document.createTextNode(it.cal ? ` ${K.d.short(K.d.parse(it.cal.date))}${it.cal.time ? ' ' + it.cal.time : ''}` : ' Fecha'));
    cal.title = it.cal ? 'Cambiar o quitar la fecha del calendario' : 'Añadir al calendario';
    cal.addEventListener('click', () => {
      const f = K.calField({ value: it.cal ? { date: it.cal.date, time: it.cal.time, calendarId: 'notas' } : null, defaultCalendar: 'notas', label: 'Mostrar en el calendario' });
      K.modal({ title: 'Fecha de la nota', sub: it.title, content: f, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { await guardaProps({ calendar: f.get() }); } }] });
    });
    EST.props.append(ic, co, pin, cal);
    if (it.type === 'note' && K.vinculos) {
      const rec = el('button', 'btn ghost sm'); rec.type = 'button'; rec.title = 'Recordatorios y tareas de esta nota';
      rec.append(icon('i-bell'), document.createTextNode(' Recordar'));
      rec.addEventListener('click', () => K.vinculos.abrir('note', it.id, it.title));
      EST.props.appendChild(rec);
    }
    if (it.cal) { const go = el('button', 'btn ghost sm'); go.type = 'button'; go.appendChild(icon('i-external')); go.title = 'Ver en el calendario'; go.addEventListener('click', () => { switchTab('calendar'); K.calendar.goto(K.d.parse(it.cal.date), 'month'); }); EST.props.appendChild(go); }
    K.loadLabels().then(() => {
      const lp = K.labelPicker({ selected: it.labels || [], onChange: K.debounce((ids) => { if (NT.abierta === it.id) guardaProps({ labels: ids }); }, 400) });
      lp.style.cssText = 'flex:1;min-width:200px;min-height:36px;padding:3px 7px';
      EST.props.appendChild(lp);
    }).catch(() => {});
  }

  function montaProps() {
    if (EST.props || !$('editor-cuerpo')) return;
    EST.props = el('div', 'note-props');
    $('editor-cuerpo').querySelector('.editor-barra').after(EST.props);
  }

  /* ============ Enganches con app.js ============ */

  Object.assign(C, { itemActual, guardaProps, pintaProps, montaProps });
})();
