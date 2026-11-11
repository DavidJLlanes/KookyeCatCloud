'use strict';
/* Recordatorios · una fila (la usan la pantalla principal y el panel de cada nota, contacto…). */
(function () {
  if (!window.K || !K.recordatorios) return;
  const R = K.recordatorios;
  const accion = (ic, titulo, fn) => { const b = el('button', 'icon-btn tiny'); b.type = 'button'; b.title = titulo; b.setAttribute('aria-label', titulo); b.appendChild(icon(ic)); b.addEventListener('click', fn); return b; };

  async function posponer(r, cuerpo) {
    try { await K.post(`/api/recordatorios/${r.id}/posponer`, cuerpo); K.toast('Pospuesto'); await R.cambio(r.calendario); } catch (e) { K.fail(e); }
  }
  function menuPosponer(r, ancla) {
    const m = el('div', 'rc-menu');
    [['10 minutos', { minutos: 10 }], ['1 hora', { minutos: 60 }], ['Mañana', { hasta: 'manana' }], ['En una semana', { minutos: 7 * 1440 }]].forEach(([n, c]) => {
      const b = el('button', 'rc-menu-op', n); b.type = 'button'; b.addEventListener('click', () => { if (K._popClose) K._popClose(); posponer(r, c); }); m.appendChild(b);
    });
    K.pop(ancla, m, { align: 'end', width: 170 });
  }

  // opciones.alCambiar: qué hacer tras marcar hecho (por defecto, repintar la pantalla principal)
  R.fila = function (r, opciones = {}) {
    const f = el('div', `rc-fila ${R.estado(r)}`);
    const chk = el('input'); chk.type = 'checkbox'; chk.checked = r.hecho; chk.setAttribute('aria-label', r.hecho ? 'Marcar como pendiente' : 'Marcar como hecho');
    chk.addEventListener('change', async () => {
      try {
        const res = await K.post(`/api/recordatorios/${r.id}/hecho`, { hecho: chk.checked });
        if (chk.checked) K.sonidos && K.sonidos.reproduce('ok');
        if (res.siguiente) K.toast(`Hecho. Próxima vez: ${R.dia(res.siguiente)}`);
        await R.cambio(false); if (opciones.alCambiar) opciones.alCambiar(); }
      catch (e) { K.fail(e); chk.checked = !chk.checked; }
    });
    const txt = el('div', 'rc-txt');
    txt.appendChild(el('b', null, r.titulo));
    const meta = el('div', 'rc-meta'); meta.appendChild(el('span', 'rc-cuando-t', R.cuando(r)));
    if (r.fecha && r.antes >= 0 && !r.hecho) { const c = el('span', 'rc-ic'); c.title = 'Con aviso'; c.appendChild(icon('i-bell')); meta.appendChild(c); }
    if (r.repite) { const c = el('span', 'rc-ic'); c.title = 'Se repite' + (r.vueltas ? ` · cumplido ${r.vueltas} ${r.vueltas === 1 ? 'vez' : 'veces'}` : ''); c.appendChild(icon('i-repeat')); meta.appendChild(c); }
    if (r.calendario) { const c = el('span', 'rc-ic'); c.title = 'También en el calendario'; c.appendChild(icon('i-calendar')); meta.appendChild(c); }
    if (r.vinculo && !opciones.sinVinculo) {
      const [nombre, ic] = R.TIPOS[r.vinculo.tipo] || ['', 'i-link'];
      const v = el('button', 'rc-chip'); v.type = 'button'; v.title = `Abrir ${nombre.toLowerCase()}`; v.append(icon(ic), el('span', null, r.vinculo.titulo || nombre));
      v.addEventListener('click', () => { if (opciones.antesDeAbrir) opciones.antesDeAbrir(); R.abreVinculo(r.vinculo); });
      meta.appendChild(v);
    }
    txt.appendChild(meta);
    if (r.notas) txt.appendChild(el('small', 'rc-notas k-faint', r.notas));
    f.append(chk, txt);
    const acc = el('div', 'rc-acc');
    if (!r.hecho) { const p = accion('i-clock', 'Posponer', () => menuPosponer(r, p)); acc.appendChild(p); }
    acc.appendChild(accion('i-pencil', 'Editar', () => { if (opciones.antesDeAbrir) opciones.antesDeAbrir(); R.editor(r); }));
    f.appendChild(acc);
    if (K.deslizar) K.deslizar(f, { alBorrar: () => R.elimina(r) });
    return f;
  };
})();
