'use strict';
/* Enlaces · acciones sobre un enlace: copiar, abrir, QR, caducidad, contraseña, nombre y revocar. */
(function () {
  if (!window.K || !K.enlaces) return;
  const E = K.enlaces;
  const recarga = async () => { await E.carga(); E.pinta(); };
  const copia = async (texto, ok) => {
    try { await navigator.clipboard.writeText(texto); K.toast(ok); return; } catch { /* sin permiso: se prueba a la vieja usanza */ }
    const ta = el('textarea'); ta.value = texto; ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); K.toast(ok); } catch { K.toast('No se pudo copiar: ' + texto); }
    ta.remove();
  };

  E.copiar = (l) => copia(E.urlDe(l), 'Enlace copiado');
  E.abrir = (l) => window.open(E.urlDe(l), '_blank', 'noopener');
  E.qr = (l) => K.qrEnlace(E.urlDe(l), l.id, l.label);

  // Caducidad: plazos habituales o uno propio en días (admite decimales: 0,5 = 12 horas)
  E.caducidad = (l) => {
    const sel = el('select'); sel.setAttribute('aria-label', 'Plazo');
    for (const [v, t] of E.PLAZOS) { const o = el('option', null, t); o.value = v; sel.appendChild(o); }
    sel.value = l.expiresAt ? 'otro' : '0';
    const dias = el('input'); dias.type = 'text'; dias.inputMode = 'decimal'; dias.placeholder = 'Días (p. ej. 14 o 0,5)';
    dias.value = l.expiresAt && !l.expired ? String(Math.max(0.04, Math.round((l.expiresAt - Date.now()) / 8640000) / 10)).replace('.', ',') : '';
    const caja = el('div', 'en-form');
    const aviso = el('p', 'k-faint', E.caducidadTxt(l) + '.');
    const campoDias = el('label', 'en-campo'); campoDias.append(el('span', null, 'Días hasta que caduque'), dias);
    const vista = () => { campoDias.hidden = sel.value !== 'otro'; };
    sel.addEventListener('change', vista); vista();
    caja.append(aviso, sel, campoDias);
    K.modal({ title: 'Caducidad del enlace', sub: l.label, content: caja, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      const d = sel.value === 'otro' ? Number(String(dias.value).replace(',', '.')) : Number(sel.value);
      if (!(d >= 0) || d > 3650 || (sel.value === 'otro' && !dias.value.trim())) { K.toast('Pon un número de días entre 0 y 3650'); return false; }
      try { await K.put(`/api/links/${l.id}/caducidad`, { days: d }); K.toast(d > 0 ? 'Caducidad actualizada' : 'El enlace ya no caduca'); E.logros(); await recarga(); }
      catch (e) { K.fail(e); return false; }
    } }] });
  };

  // Contraseña de un enlace de descarga: se pone, se cambia o se quita
  E.clave = (l) => {
    const pw = el('input'); pw.type = 'password'; pw.autocomplete = 'new-password'; pw.maxLength = 200; pw.placeholder = l.protegido ? 'Nueva contraseña' : 'Contraseña';
    const guarda = async (valor, msg) => { try { await K.put(`/api/links/${l.id}/clave`, { password: valor }); K.toast(msg); await recarga(); } catch (e) { K.fail(e); return false; } };
    const acciones = [{ label: 'Cancelar' }];
    if (l.protegido) acciones.push({ label: 'Quitar contraseña', danger: true, onClick: () => guarda('', 'Contraseña quitada') });
    acciones.push({ label: l.protegido ? 'Cambiar' : 'Poner', primary: true, onClick: () => { if (!pw.value) { K.toast('Escribe la contraseña'); return false; } return guarda(pw.value, 'Contraseña guardada'); } });
    K.modal({ title: l.protegido ? 'Contraseña del enlace' : 'Proteger con contraseña', sub: l.label, content: pw, actions: acciones });
    setTimeout(() => pw.focus(), 40);
  };

  E.renombra = async (l) => {
    const t = await K.ask('Nombre del enlace', { value: l.label, ok: 'Guardar' });
    if (!t) return;
    try { await K.put(`/api/links/${l.id}/etiqueta`, { label: t }); K.toast('Nombre cambiado'); await recarga(); } catch (e) { K.fail(e); }
  };

  E.revoca = async (l) => {
    const quien = l.kind === 'upload' ? 'Quien lo tenga dejará de poder subir archivos.' : l.kind === 'prompts' ? 'Quien lo tenga dejará de ver los prompts.' : 'Quien lo tenga dejará de poder descargar.';
    if (!await K.confirm(`Se revocará «${l.label}». ${quien} Se guarda una copia 30 días.`, { ok: 'Revocar', danger: true, title: 'Revocar enlace' })) return false;
    try { await K.del('/api/links/' + l.id); K.toast('Enlace revocado'); E.logros(); await recarga(); return true; } catch (e) { K.fail(e); return false; }
  };

  E.limpiaCaducados = async () => {
    const n = E.S.links.filter(l => l.expired).length;
    if (!n) return;
    if (!await K.confirm(`Se quitarán ${n} enlace${n === 1 ? '' : 's'} caducado${n === 1 ? '' : 's'}. Se guarda una copia 30 días.`, { ok: 'Quitar', danger: true, title: 'Limpiar caducados' })) return;
    try { const r = await K.post('/api/links/limpiar-caducados'); K.toast(`${r.quitados} enlace${r.quitados === 1 ? '' : 's'} quitado${r.quitados === 1 ? '' : 's'}`); E.logros(); await recarga(); } catch (e) { K.fail(e); }
  };
})();
