'use strict';
/* Recordatorios · formulario de alta y edición. */
(function () {
  if (!window.K || !K.recordatorios) return;
  const R = K.recordatorios;
  const campo = (texto, nodo, cls = '') => { const l = el('label', 'rc-campo ' + cls); l.append(el('span', null, texto), nodo); return l; };
  const manana = () => K.d.ymd(K.d.add(new Date(), 1));

  // r: recordatorio a editar (null: nuevo) · ini: { titulo, vinculo, fecha } con lo que ya se sabe al crearlo desde otra sección
  // Elimina un recordatorio (con confirmación; se guarda 30 días). Devuelve true si se borró.
  R.elimina = async (r) => {
    if (!await K.confirm(`Se eliminará «${r.titulo}». Se guarda 30 días por si te arrepientes.`, { ok: 'Eliminar', danger: true })) return false;
    try { await K.del('/api/recordatorios/' + r.id); K.toast('Recordatorio eliminado'); R.cambio(r.calendario); return true; } catch (e) { K.fail(e); return false; }
  };

  R.editor = function (r, ini = {}) {
    const nuevo = !r;
    const base = r || { titulo: ini.titulo || '', notas: '', fecha: ini.fecha === undefined ? manana() : ini.fecha, hora: '09:00', antes: 0, calendario: false, repite: null, vinculo: ini.vinculo || null };
    let vinculo = base.vinculo;
    const titulo = el('input'); titulo.type = 'text'; titulo.maxLength = 200; titulo.value = base.titulo; titulo.placeholder = 'Qué quieres recordar';
    const fecha = el('input'); fecha.type = 'date'; fecha.value = base.fecha;
    const hora = el('input'); hora.type = 'time'; hora.value = base.hora;
    const antes = el('select'); R.ANTES.forEach(([v, n]) => antes.appendChild(new Option(n, String(v)))); antes.value = String(base.antes);
    const notas = el('textarea'); notas.rows = 3; notas.maxLength = 2000; notas.value = base.notas || ''; notas.placeholder = 'Detalles (opcional)';
    const cal = el('input'); cal.type = 'checkbox'; cal.checked = !!base.calendario;
    const calL = el('label', 'rc-check'); calL.append(cal, el('span', null, 'Añadir también al calendario'));

    const rapidos = el('div', 'rc-rapidos');
    [['Hoy', 0], ['Mañana', 1], ['En una semana', 7]].forEach(([n, d]) => {
      const b = el('button', 'btn ghost sm', n); b.type = 'button';
      b.addEventListener('click', () => { fecha.value = K.d.ymd(K.d.add(new Date(), d)); sync(); });
      rapidos.appendChild(b);
    });
    const sin = el('button', 'btn ghost sm', 'Sin fecha'); sin.type = 'button'; sin.addEventListener('click', () => { fecha.value = ''; hora.value = ''; sync(); }); rapidos.appendChild(sin);

    // Repetición: frecuencia, cada cuánto, días de la semana (semanal), día o «el primer lunes» (mensual) y fecha final
    const rep = base.repite || {};
    const freq = el('select'); R.REPITE.forEach(([v, n]) => freq.appendChild(new Option(n, v))); freq.value = rep.freq || '';
    const cada = el('input'); cada.type = 'number'; cada.min = 1; cada.max = 99; cada.value = rep.cada || 1;
    const unidad = el('span', 'k-faint');
    const hasta = el('input'); hasta.type = 'date'; hasta.value = rep.hasta || '';
    const dias = el('div', 'rc-dias'), diasSel = new Set(rep.dias || []);
    R.DIAS.forEach((n, i) => { const b = el('button', 'rc-dia' + (diasSel.has(i + 1) ? ' on' : ''), n); b.type = 'button'; b.setAttribute('aria-pressed', diasSel.has(i + 1)); b.addEventListener('click', () => { diasSel.has(i + 1) ? diasSel.delete(i + 1) : diasSel.add(i + 1); b.classList.toggle('on'); b.setAttribute('aria-pressed', diasSel.has(i + 1)); }); dias.appendChild(b); });
    const modo = el('select'); modo.append(new Option('El mismo día del mes', 'dia'), new Option('El mismo día de la semana (p. ej. el primer lunes)', 'semana')); modo.value = rep.mesModo || 'dia';
    const filaRep = el('div', 'rc-repite'); const cadaL = el('label', 'rc-campo'); cadaL.append(el('span', null, 'Cada'), cada, unidad);
    const hastaL = campo('Hasta (opcional)', hasta); const modoL = campo('Los meses', modo);
    filaRep.append(cadaL, dias, modoL, hastaL);
    const UNI = { dia: 'día(s)', semana: 'semana(s)', mes: 'mes(es)', anio: 'año(s)' };
    function syncRep() { const f = freq.value; filaRep.hidden = !f || !fecha.value; unidad.textContent = UNI[f] || ''; dias.hidden = f !== 'semana'; modoL.hidden = f !== 'mes'; }
    freq.addEventListener('input', syncRep);
    const ayuda = el('small', 'k-faint');
    // Sin fecha no hay hora, ni aviso, ni calendario; sin hora el aviso llega a la hora de los de todo el día
    function sync() {
      const con = !!fecha.value;
      hora.disabled = antes.disabled = cal.disabled = freq.disabled = !con; if (!con) freq.value = '';
      syncRep();
      if (!con) cal.checked = false;
      ayuda.textContent = !con ? 'Sin fecha es un pendiente suelto: no avisa.' : !hora.value ? `Sin hora, avisa a las ${R.HORA_DIA} de ese día.` : '';
    }
    fecha.addEventListener('input', sync); hora.addEventListener('input', sync);

    const f = el('div', 'rc-form');
    f.appendChild(campo('Recordatorio', titulo));
    if (vinculo) {
      const [nombre, ic] = R.TIPOS[vinculo.tipo] || ['', 'i-link'];
      const chip = el('div', 'rc-vinculo'); chip.append(icon(ic), el('span', null, `${nombre}: ${vinculo.titulo || vinculo.ref}`));
      const q = el('button', 'icon-btn tiny'); q.type = 'button'; q.title = 'Quitar el vínculo'; q.setAttribute('aria-label', 'Quitar el vínculo'); q.appendChild(icon('i-x'));
      q.addEventListener('click', () => { vinculo = null; chip.remove(); }); chip.appendChild(q); f.appendChild(chip);
    }
    const cuando = el('div', 'rc-cuando'); cuando.append(campo('Fecha', fecha), campo('Hora', hora), campo('Aviso', antes));
    f.append(rapidos, cuando, campo('Repetir', freq), filaRep, ayuda, calL, campo('Notas', notas));

    const modal = K.modal({ title: nuevo ? 'Nuevo recordatorio' : 'Editar recordatorio', cls: 'rc-modal', content: f, actions: [{ label: 'Cancelar' }, { label: nuevo ? 'Guardar' : 'Guardar cambios', primary: true, onClick: async () => {
      const cuerpo = { titulo: titulo.value, notas: notas.value, fecha: fecha.value, hora: hora.value, antes: +antes.value, calendario: cal.checked, vinculo,
        repite: freq.value ? { freq: freq.value, cada: +cada.value || 1, hasta: hasta.value || '', ...(freq.value === 'semana' ? { dias: [...diasSel].sort() } : {}), ...(freq.value === 'mes' ? { mesModo: modo.value } : {}) } : null };
      try {
        const res = nuevo ? await K.post('/api/recordatorios', cuerpo) : await K.put('/api/recordatorios/' + r.id, { ...cuerpo, base: r.updatedAt });
        K.toast(nuevo ? 'Recordatorio guardado' : 'Cambios guardados'); K.sonidos && K.sonidos.reproduce('ok');
        if (res.calendarioFallo) K.toast('Se guardó, pero no se pudo añadir al calendario');
        await R.cambio(cal.checked || (r && r.calendario));
        if (nuevo && cuerpo.fecha && cuerpo.antes >= 0) R.pideAvisos();
      } catch (e) { K.fail(e); return false; }     // el formulario sigue abierto con lo escrito
    } }] });

    if (!nuevo) {
      const del = el('button', 'btn danger sm rc-borrar', 'Eliminar recordatorio'); del.type = 'button';
      del.addEventListener('click', async () => { if (await R.elimina(r)) modal.close(); });
      f.appendChild(del);
    }
    sync();
    setTimeout(() => titulo.focus(), 40);
  };
})();
