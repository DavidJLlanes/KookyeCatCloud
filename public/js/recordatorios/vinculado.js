'use strict';
/* Recordatorios · los de una nota, un contacto, un archivo, un prompt o un marcador.
   K.recordar(tipo, ref, titulo) abre el panel de ese elemento (o el formulario directamente si aún no tiene ninguno). */
(function () {
  if (!window.K || !K.recordatorios) return;
  const R = K.recordatorios;

  async function panel(tipo, ref, titulo) {
    try { await R.carga(); } catch (e) { K.fail(e); return; }
    const suyos = R.S.items.filter(r => r.vinculo && r.vinculo.tipo === tipo && r.vinculo.ref === ref).sort((a, b) => (a.hecho - b.hecho) || ((R.momento(a) || 0) - (R.momento(b) || 0)));
    const nuevo = () => R.editor(null, { titulo: '', vinculo: { tipo, ref, titulo } });
    if (!suyos.length) { nuevo(); return; }
    const caja = el('div', 'rc-panel');
    let m;
    suyos.forEach(r => caja.appendChild(R.fila(r, { sinVinculo: true, antesDeAbrir: () => m && m.close(), alCambiar: () => panel(tipo, ref, titulo) })));
    m = K.modal({ title: 'Recordatorios', sub: titulo, cls: 'rc-modal', content: caja, actions: [{ label: 'Cerrar' }, { label: 'Nuevo recordatorio', primary: true, onClick: nuevo }] });
  }

  K.recordar = panel;
  K.vinculos = { abrir: panel };     // los botones «Recordar» de Notas y Contactos llaman a K.vinculos.abrir
})();
