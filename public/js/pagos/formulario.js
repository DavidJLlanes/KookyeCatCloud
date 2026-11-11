'use strict';
/* Pagos · formulario de alta y edición, marcar como pagado y deshacer. */
(function () {
  if (!window.K || !K.pagos) return;
  const P = K.pagos;
  const campo = (texto, nodo, cls = '') => { const l = el('label', 'pg-campo ' + cls); l.append(el('span', null, texto), nodo); return l; };
  const entrada = (tipo, valor, extra = {}) => { const i = el('input'); i.type = tipo; i.value = valor ?? ''; Object.entries(extra).forEach(([k, v]) => i.setAttribute(k, v)); return i; };
  const select = (opciones, valor) => { const s = el('select'); opciones.forEach(([v, n]) => { const o = el('option', null, n); o.value = v; s.appendChild(o); }); s.value = valor; return s; };
  const interruptor = (texto, activo) => { const l = el('label', 'k-switch'), i = el('input'); i.type = 'checkbox'; i.checked = activo; l.append(i, el('span', 'track'), el('span', null, texto)); l.input = i; return l; };

  async function recarga() { await P.carga(); P.pinta(); P.logros(); }

  // Elimina un pago (con confirmación; se guarda 30 días). Devuelve true si se borró.
  P.elimina = async (p) => {
    if (!await K.confirm(`Se eliminará «${p.nombre}». Se guarda 30 días por si te arrepientes.`, { ok: 'Eliminar', danger: true })) return false;
    try { await K.del('/api/pagos/' + p.id); K.toast('Pago eliminado'); await recarga(); return true; } catch (e) { K.fail(e); return false; }
  };

  P.editor = function (p) {
    const nuevo = !p;
    const base = p || { nombre: '', compania: '', categoria: '', banco: '', importe: null, frecuencia: 'mensual', fechaProxima: K.d.ymd(new Date(P.S.hoy ? K.d.parse(P.S.hoy) : new Date())), avisoDias: 3, metodo: '', referencia: '', web: '', notas: '', activo: true, recordar: true, historial: [] };
    const nombre = entrada('text', base.nombre, { maxlength: 120, placeholder: 'Seguro del hogar, Luz, Netflix…', autocomplete: 'off' });
    const compania = K.campoValor({ campo: 'pagos.compania', value: base.compania, placeholder: 'Mapfre, Iberdrola…' });
    const banco = K.campoValor({ campo: 'pagos.banco', value: base.banco, placeholder: 'Banco o cuenta de cargo' });
    const categoria = K.campoValor({ campo: 'pagos.categoria', value: base.categoria, placeholder: 'Seguros, Suministros…' });
    const importe = entrada('text', base.importe === null ? '' : String(base.importe).replace('.', ','), { inputmode: 'decimal', placeholder: '0,00' });
    const frecuencia = select(P.FRECUENCIAS, base.frecuencia);
    const fecha = entrada('date', base.fechaProxima);
    const aviso = entrada('number', base.avisoDias ?? 3, { min: 0, max: 60 });
    const metodo = select(P.METODOS, base.metodo || '');
    const ref = entrada('text', base.referencia, { maxlength: 120, placeholder: 'Nº de póliza, contrato o cliente' });
    const web = entrada('url', base.web, { placeholder: 'https://… (área de cliente)' });
    const notas = el('textarea'); notas.rows = 3; notas.value = base.notas || '';
    const activo = interruptor('Pago activo', base.activo !== false), recordar = interruptor('Añadir el vencimiento al calendario', base.recordar !== false);

    const f = el('div', 'pg-form');
    f.append(campo('Nombre', nombre, 'ancho'), campo('Compañía', compania.el), campo('Categoría', categoria.el),
      campo('Importe (€)', importe), campo('Frecuencia', frecuencia), campo('Próximo pago', fecha), campo('Avisar con (días)', aviso),
      campo('Forma de pago', metodo), campo('Banco', banco.el), campo('Referencia', ref), campo('Web', web, 'ancho'), campo('Notas', notas, 'ancho'), activo, recordar);
    if (!nuevo && (p.historial || []).length) {
      const h = el('div', 'pg-hist ancho'); h.appendChild(el('h4', null, `Pagos anotados (${p.nPagos || p.historial.length})`));
      p.historial.slice(0, 6).forEach(x => h.appendChild(el('div', 'pg-h-fila', `${P.fechaTxt(x.fecha)} · ${P.euros(x.importe)}`)));
      const des = el('button', 'btn sm', 'Deshacer el último pago'); des.type = 'button';
      des.addEventListener('click', async () => { try { await K.post(`/api/pagos/${p.id}/deshacer`); modal.close(); K.toast('Último pago deshecho'); recarga(); } catch (e) { K.fail(e); } });
      h.appendChild(des); f.appendChild(h);
    }
    if (nuevo) f.appendChild(el('p', 'k-faint ancho', 'Guarda el pago y podrás adjuntar la póliza o el recibo.'));
    else f.appendChild(P.seccionAdjuntos(p, () => { P.logros(); recarga(); }));
    const acciones = [{ label: 'Cancelar' }, { label: nuevo ? 'Crear' : 'Guardar', primary: true, onClick: async () => {
      const cuerpo = { nombre: nombre.value, compania: compania.get(), categoria: categoria.get(), banco: banco.get(), importe: importe.value, frecuencia: frecuencia.value, fechaProxima: fecha.value, avisoDias: aviso.value, metodo: metodo.value, referencia: ref.value, web: web.value, notas: notas.value, activo: activo.input.checked, recordar: recordar.input.checked };
      try {
        if (nuevo) await K.post('/api/pagos', cuerpo); else await K.put('/api/pagos/' + p.id, { ...cuerpo, base: p.updatedAt });
        K.toast(nuevo ? 'Pago creado' : 'Pago guardado'); K.sonidos && K.sonidos.reproduce('ok'); recarga();
      } catch (e) { K.fail(e); return false; }       // el formulario sigue abierto con lo escrito
    } }];
    const modal = K.modal({ title: nuevo ? 'Nuevo pago' : 'Editar pago', cls: 'pg-modal', content: f, actions: acciones });
    if (!nuevo) {
      const del = el('button', 'btn danger sm pg-borrar', 'Eliminar pago'); del.type = 'button';
      del.addEventListener('click', async () => { if (await P.elimina(p)) modal.close(); });
      f.appendChild(del);
    }
    setTimeout(() => nombre.focus(), 40);
  };

  // Marcar como pagado: fecha e importe por defecto, editables (la factura puede variar)
  P.marcaPagado = function (p) {
    const importe = entrada('text', p.importe === null ? '' : String(p.importe).replace('.', ','), { inputmode: 'decimal' });
    const fecha = entrada('date', P.S.hoy);
    const c = el('div', 'pg-form'); c.append(campo('Importe pagado (€)', importe), campo('Fecha de pago', fecha));
    const sig = p.frecuencia === 'unico' ? 'Es un pago único: quedará como pagado.' : 'El siguiente vencimiento pasará al próximo periodo.';
    K.modal({ title: `Marcar «${p.nombre}» como pagado`, sub: sig, content: c, actions: [{ label: 'Cancelar' }, { label: 'Pagado', primary: true, onClick: async () => {
      try { const r = await K.post(`/api/pagos/${p.id}/pagado`, { importe: importe.value, fecha: fecha.value }); K.toast(r.pago.activo === false ? 'Pago anotado' : `Pagado. Próximo: ${P.fechaTxt(r.pago.fechaProxima)}`); K.sonidos && K.sonidos.reproduce('ok'); recarga(); }
      catch (e) { K.fail(e); return false; }
    } }] });
  };
})();
