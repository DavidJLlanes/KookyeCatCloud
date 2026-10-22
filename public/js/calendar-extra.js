'use strict';
/* ---------------------------------------------------------------
   Calendario: diálogos de importar .ics, suscripción iCal y festivos de España.
   Se llaman desde el menú "⋯" del calendario (K.calExtra.*).
--------------------------------------------------------------- */
(function () {
  const refresca = async () => { await K.loadCalendars(true).catch(() => {}); K.bus.emit('calendar'); if (K.calendar) K.calendar.reload(); };

  /* ---------- Importar un archivo .ics ---------- */
  function importar() {
    const w = el('div');
    w.appendChild(el('p', 'k-muted', 'Elige un archivo .ics exportado desde Google Calendar, Apple Calendar, Outlook u otra app. Las horas se pasan a tu zona horaria.'));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 14px';
    const fi = el('input'); fi.type = 'file'; fi.accept = '.ics,.ical,text/calendar';
    const f1 = el('label', 'field'); f1.append(el('span', null, 'Archivo'), fi); w.appendChild(f1);
    const resumen = el('div'); resumen.hidden = true; w.appendChild(resumen);

    let parsed = null, nombreBase = '';
    const modo = { nuevo: true };
    const nombre = el('input'); nombre.maxLength = 60; nombre.placeholder = 'Nombre del calendario nuevo';
    const dest = el('select');
    const o0 = el('option', null, 'Crear un calendario nuevo'); o0.value = '__new'; dest.appendChild(o0);
    K.cals.list.filter(c => !c.virtual).forEach(c => { const o = el('option', null, `Añadir a “${c.name}”`); o.value = c.id; dest.appendChild(o); });
    const color = K.colorPicker({ value: '#14b8a6' });

    const pintaResumen = () => {
      resumen.textContent = ''; resumen.hidden = false;
      const tareas = parsed.events.filter(e => e.kind === 'task').length;
      const rep = parsed.events.filter(e => e.repeat).length;
      const p = el('p'); p.style.cssText = 'margin:0 0 12px;font-weight:600';
      p.textContent = `${parsed.events.length} elemento${parsed.events.length === 1 ? '' : 's'} encontrado${parsed.events.length === 1 ? '' : 's'}` +
        ` (${parsed.events.length - tareas} evento${parsed.events.length - tareas === 1 ? '' : 's'}${tareas ? `, ${tareas} tarea${tareas === 1 ? '' : 's'}` : ''}${rep ? `, ${rep} con repetición` : ''})`;
      resumen.appendChild(p);
      if (parsed.warnings.length) {
        const a = el('ul', 'k-faint'); a.style.cssText = 'font-size:12.5px;margin:0 0 12px;padding-left:18px';
        parsed.warnings.forEach(t => a.appendChild(el('li', null, t)));
        resumen.appendChild(a);
      }
      const f2 = el('label', 'field tight'); f2.append(el('span', null, 'Destino'), dest);
      const f3 = el('label', 'field tight'); f3.append(el('span', null, 'Nombre'), nombre);
      const f4 = el('div', 'field tight'); f4.append(el('span', null, 'Color'), color);
      const nuevoBox = el('div'); nuevoBox.append(f3, f4);
      dest.onchange = () => { modo.nuevo = dest.value === '__new'; nuevoBox.hidden = !modo.nuevo; };
      resumen.append(f2, nuevoBox);
      const nota = el('p', 'k-faint', 'Si vuelves a importar el mismo archivo no se duplican los eventos que ya estén.'); nota.style.cssText = 'font-size:12px;margin:8px 0 0';
      resumen.appendChild(nota);
      if (m.buttons.go) m.buttons.go.disabled = !parsed.events.length;
    };

    fi.addEventListener('change', async () => {
      const f = fi.files[0]; if (!f) return;
      if (f.size > 20 * 1024 * 1024) { K.toast('El archivo es demasiado grande (máx. 20 MB)'); return; }
      try {
        parsed = ICS.parse(await f.text());
        nombreBase = (parsed.name || f.name.replace(/\.[^.]+$/, '') || 'Importado').slice(0, 60);
        nombre.value = nombreBase;
        pintaResumen();
      } catch (e) { K.toast('No se pudo leer el archivo'); }
    });

    const m = K.modal({ title: 'Importar calendario', content: w, cls: 'wide', actions: [
      { label: 'Cancelar' },
      { id: 'go', label: 'Importar', primary: true, onClick: async (h) => {
        if (!parsed || !parsed.events.length) { K.toast('Elige un archivo con eventos'); return false; }
        try {
          let destino = modo.nuevo ? { name: nombre.value || nombreBase, color: color.get() } : { id: dest.value };
          let creados = 0, omitidos = 0, errores = 0;
          for (let i = 0; i < parsed.events.length; i += 500) {
            const r = await K.post('/api/calendar/import', { calendar: destino, events: parsed.events.slice(i, i + 500) });
            creados += r.creados; omitidos += r.omitidos; errores += r.errores;
            destino = { id: r.calendarId };           // los siguientes bloques van al calendario ya creado
          }
          await refresca();
          K.toast(`Importados ${creados}${omitidos ? ` · ${omitidos} ya estaban` : ''}${errores ? ` · ${errores} con error` : ''}`);
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
    m.buttons.go.disabled = true;
  }

  /* ---------- Suscripción de solo lectura (iCal) ---------- */
  async function suscripcion() {
    let s;
    try { s = await K.get('/api/calendar/ical'); await K.loadCalendars(true); } catch (e) { K.fail(e); return; }
    const w = el('div');
    const render = () => {
      w.textContent = '';
      if (!s.enabled) {
        w.appendChild(el('p', 'k-muted', 'Genera un enlace privado para ver tus eventos en Google Calendar, Apple Calendar u Outlook. Es de solo lectura y se actualiza solo.'));
        w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 14px';
        const nota = el('p', 'k-faint', 'Quien tenga el enlace podrá ver tus eventos, así que no lo compartas. Puedes regenerarlo o apagarlo cuando quieras.'); nota.style.cssText = 'font-size:12.5px';
        w.appendChild(nota);
        const b = el('button', 'btn primary', 'Activar suscripción'); b.type = 'button'; b.style.marginTop = '12px';
        b.addEventListener('click', async () => { try { s = await K.post('/api/calendar/ical', { action: 'enable' }); render(); } catch (e) { K.fail(e); } });
        w.appendChild(b);
        return;
      }
      const url = `${location.origin}${BASE}/ical/${s.token}.ics`;
      const f = el('label', 'field'); f.appendChild(el('span', null, 'Enlace de suscripción'));
      const row = el('div', 'k-row'); row.style.flexWrap = 'nowrap';
      const inp = el('input'); inp.readOnly = true; inp.value = url; inp.addEventListener('focus', () => inp.select());
      const cp = el('button', 'btn'); cp.type = 'button'; cp.append(icon('i-copy'), document.createTextNode('Copiar'));
      cp.addEventListener('click', async () => { K.toast((await K.copy(url)) ? 'Enlace copiado' : 'No se pudo copiar'); });
      row.append(inp, cp); f.appendChild(row); w.appendChild(f);

      const ap = el('a', 'btn sm', 'Abrir en mi app de calendario'); ap.href = url.replace(/^https?:/, 'webcal:'); ap.style.marginBottom = '14px';
      w.appendChild(ap);

      const incl = el('div', 'field'); incl.appendChild(el('span', null, 'Calendarios incluidos'));
      const ex = new Set(s.exclude);
      const guarda = K.debounce(async () => { try { s = await K.post('/api/calendar/ical', { action: 'settings', exclude: [...ex] }); } catch (e) { K.fail(e); } }, 300);
      K.cals.list.forEach(c => {
        const l = el('label', 'k-switch'); l.style.cssText = 'display:flex;margin:6px 0';
        const ck = el('input'); ck.type = 'checkbox'; ck.checked = !ex.has(c.id);
        ck.addEventListener('change', () => { if (ck.checked) ex.delete(c.id); else ex.add(c.id); guarda(); });
        const d = el('span', 'k-dot'); d.style.setProperty('--c', c.color);
        l.append(ck, el('span', 'track'), d, el('span', null, c.name));
        incl.appendChild(l);
      });
      w.appendChild(incl);

      const det = el('details'); det.style.margin = '6px 0 14px';
      det.appendChild(el('summary', null, 'Cómo añadirlo'));
      det.lastChild.style.cssText = 'cursor:pointer;color:var(--muted);font-size:13.5px';
      const ol = el('ul'); ol.style.cssText = 'font-size:13px;color:var(--muted);line-height:1.7;padding-left:18px';
      [['Google Calendar', 'Otros calendarios (+) → Desde URL → pega el enlace. Google puede tardar horas en actualizar.'],
        ['Apple Calendar / iPhone', 'Pulsa “Abrir en mi app de calendario”, o Archivo → Nueva suscripción de calendario → pega el enlace.'],
        ['Outlook', 'Agregar calendario → Suscribirse desde la web → pega el enlace.']].forEach(([t, d2]) => { const li = el('li'); li.append(el('b', null, t + ': '), document.createTextNode(d2)); ol.appendChild(li); });
      det.appendChild(ol); w.appendChild(det);

      const acc = el('div', 'k-row');
      const rot = el('button', 'btn sm', 'Generar enlace nuevo'); rot.type = 'button';
      rot.addEventListener('click', async () => { if (!await K.confirm('El enlace actual dejará de funcionar y tendrás que volver a suscribirte con el nuevo.', { ok: 'Generar' })) return; try { s = await K.post('/api/calendar/ical', { action: 'rotate' }); render(); } catch (e) { K.fail(e); } });
      const off = el('button', 'btn sm danger', 'Apagar suscripción'); off.type = 'button';
      off.addEventListener('click', async () => { if (!await K.confirm('El enlace dejará de funcionar.', { ok: 'Apagar', danger: true })) return; try { s = await K.post('/api/calendar/ical', { action: 'disable' }); render(); } catch (e) { K.fail(e); } });
      acc.append(rot, off); w.appendChild(acc);
    };
    render();
    K.modal({ title: 'Suscripción a tu calendario', sub: 'Solo lectura · iCal (.ics)', content: w, cls: 'wide', actions: [{ label: 'Cerrar', primary: true }] });
  }

  /* ---------- Festivos de España ---------- */
  async function festivos() {
    let h;
    try { h = await K.get('/api/calendar/holidays'); } catch (e) { K.fail(e); return; }
    const w = el('div');
    w.appendChild(el('p', 'k-muted', 'Añade a tu calendario los festivos nacionales y los de tu comunidad autónoma.'));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 14px';
    const sel = el('select'); const o0 = el('option', null, 'Elige tu comunidad…'); o0.value = ''; sel.appendChild(o0);
    h.regions.forEach(r => { const o = el('option', null, r.name); o.value = r.code; sel.appendChild(o); });
    sel.value = h.region;
    const f = el('label', 'field'); f.append(el('span', null, 'Comunidad autónoma'), sel); w.appendChild(f);
    const sw = el('label', 'k-switch'); const ck = el('input'); ck.type = 'checkbox'; ck.checked = h.enabled;
    sw.append(ck, el('span', 'track'), el('span', null, 'Mostrar festivos en el calendario')); w.appendChild(sw);
    const nota = el('p', 'k-faint', 'Fechas orientativas: cada comunidad publica su calendario oficial cada año (y algunas mueven al lunes los que caen en domingo). Los festivos locales de tu ciudad no están incluidos; añádelos como eventos.');
    nota.style.cssText = 'font-size:12.5px;margin-top:16px'; w.appendChild(nota);
    K.modal({ title: 'Festivos de España', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      if (ck.checked && !sel.value) { K.toast('Elige primero tu comunidad'); return false; }
      try { await K.put('/api/calendar/holidays', { region: sel.value, enabled: ck.checked }); await refresca(); } catch (e) { K.fail(e); return false; }
    } }] });
  }

  K.calExtra = { importar, suscripcion, festivos };
})();
