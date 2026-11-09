'use strict';
/* Marcadores web · formularios de marcador y de carpeta. */
(function () {
  if (!window.K || !K.marcadores) return;
  const M = K.marcadores, S = M.S;
  const campo = (texto, nodo, cls = '') => { const l = el('label', 'mk-campo ' + cls); l.append(el('span', null, texto), nodo); return l; };
  async function recarga() { await M.carga(); M.pinta(); M.logros(); M.autoIconos(); }

  M.editor = function (m) {
    const nuevo = !m;
    const base = m || { nombre: '', url: '', descripcion: '', color: '', carpeta: S.carpeta && S.carpeta !== 'todas' ? S.carpeta : '' };
    const url = el('input'); url.type = 'text'; url.value = base.url; url.placeholder = 'https://ejemplo.com'; url.inputMode = 'url'; url.autocapitalize = 'off'; url.spellcheck = false; url.maxLength = 2000;
    const nombre = el('input'); nombre.type = 'text'; nombre.value = base.nombre; nombre.maxLength = 120; nombre.placeholder = 'Se rellena con el nombre de la web';
    const desc = el('textarea'); desc.rows = 3; desc.value = base.descripcion || ''; desc.placeholder = 'Para qué sirve, por qué la guardas…';
    const carpeta = el('select'); [['', 'Sin carpeta'], ...S.carpetas.map(c => [c.id, c.nombre])].forEach(([v, n]) => { const o = el('option', null, n); o.value = v; carpeta.appendChild(o); }); carpeta.value = base.carpeta || '';
    const color = K.colorPicker({ value: base.color || '', allowNone: true });
    url.addEventListener('blur', () => { if (!nombre.value.trim() && url.value.trim()) nombre.value = M.anfitrion(/^[a-z]+:/i.test(url.value) ? url.value.trim() : 'https://' + url.value.trim()); });

    const f = el('div', 'mk-form');
    if (!nuevo) { const p = el('div', 'mk-prev'); p.append(M.icono(m, 'grande')); const r = el('button', 'btn sm', 'Actualizar icono'); r.type = 'button'; r.addEventListener('click', async () => { r.disabled = true; await M.buscaIcono(m.id, true); r.disabled = false; M.pinta(); p.firstChild.replaceWith(M.icono(S.marcadores.find(x => x.id === m.id) || m, 'grande')); }); p.appendChild(r); f.appendChild(p); }
    f.append(campo('Dirección web', url), campo('Nombre', nombre), campo('Descripción', desc), campo('Carpeta', carpeta), campo('Color', color));

    const modal = K.modal({ title: nuevo ? 'Nuevo marcador' : 'Editar marcador', cls: 'mk-modal', content: f, actions: [{ label: 'Cancelar' }, { label: nuevo ? 'Guardar' : 'Guardar cambios', primary: true, onClick: async () => {
      const cuerpo = { url: url.value, nombre: nombre.value, descripcion: desc.value, carpeta: carpeta.value, color: color.get() };
      try {
        const r = nuevo ? await K.post('/api/marcadores', cuerpo) : await K.put('/api/marcadores/' + m.id, { ...cuerpo, base: m.updatedAt });
        K.toast(nuevo ? 'Marcador guardado' : 'Cambios guardados'); K.sonidos && K.sonidos.reproduce('ok');
        await recarga();
        if (!r.marcador.icono) M.buscaIcono(r.marcador.id).then(() => M.pinta());       // el icono llega después, sin hacer esperar
      } catch (e) { K.fail(e); return false; }      // el formulario sigue abierto con lo escrito
    } }] });
    if (!nuevo) {
      const del = el('button', 'btn danger sm mk-borrar', 'Eliminar marcador'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!await K.confirm(`Se eliminará «${m.nombre}». Se guarda 30 días por si te arrepientes.`, { ok: 'Eliminar', danger: true })) return;
        try { await K.del('/api/marcadores/' + m.id); modal.close(); K.toast('Marcador eliminado'); recarga(); } catch (e) { K.fail(e); }
      });
      f.appendChild(del);
    }
    setTimeout(() => url.focus(), 40);
  };

  M.editorCarpeta = function (c) {
    const nuevo = !c;
    const nombre = el('input'); nombre.type = 'text'; nombre.value = c ? c.nombre : ''; nombre.maxLength = 60; nombre.placeholder = 'Trabajo, Inspiración, Herramientas…';
    const color = K.colorPicker({ value: c ? c.color : '', allowNone: true });
    const f = el('div', 'mk-form'); f.append(campo('Nombre', nombre), campo('Color', color));
    const modal = K.modal({ title: nuevo ? 'Nueva carpeta' : 'Editar carpeta', content: f, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try {
        const r = nuevo ? await K.post('/api/marcadores/carpetas', { nombre: nombre.value, color: color.get() }) : await K.put('/api/marcadores/carpetas/' + c.id, { nombre: nombre.value, color: color.get() });
        if (nuevo) S.carpeta = r.carpeta.id;
        await recarga();
      } catch (e) { K.fail(e); return false; }
    } }] });
    if (!nuevo) {
      const del = el('button', 'btn danger sm mk-borrar', 'Eliminar carpeta'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!await K.confirm(`Se eliminará la carpeta «${c.nombre}». Sus marcadores no se borran: pasan a «Sin carpeta».`, { ok: 'Eliminar carpeta', danger: true })) return;
        try { await K.del('/api/marcadores/carpetas/' + c.id); S.carpeta = 'todas'; modal.close(); recarga(); } catch (e) { K.fail(e); }
      });
      f.appendChild(del);
    }
    setTimeout(() => nombre.focus(), 40);
  };
})();
