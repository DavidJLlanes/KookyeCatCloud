'use strict';
/* Bases · arrastrar filas de la tabla para reordenarlas (ratón y dedo, con un asa a la izquierda de cada fila). */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  // Solo se reordena a mano cuando el orden visible es el natural (sin orden de columnas ni agrupación)
  B.puedeReordenar = (v) => !B.ordenes(v).length && !v.agrupaPor;

  B.asaOrden = (tr, r, v) => {
    const td = el('td', 'asa'); const b = el('button', 'icon-btn bs-asa'); b.type = 'button'; b.textContent = '⠿';
    b.title = 'Arrastra para reordenar'; b.setAttribute('aria-label', `Reordenar la fila ${B.titulo(r)}`);
    if (!B.puedeReordenar(v)) { b.classList.add('apagada'); b.addEventListener('click', () => K.toast('Quita el orden o la agrupación de esta vista para reordenar filas a mano')); td.appendChild(b); return td; }
    let destino = null, activo = false;
    const marca = (tre, pos) => { B.root.querySelectorAll('tr.drop-antes,tr.drop-despues').forEach(x => x.classList.remove('drop-antes', 'drop-despues')); if (tre) tre.classList.add(pos === 'antes' ? 'drop-antes' : 'drop-despues'); };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      activo = true; destino = null; b.setPointerCapture(e.pointerId); tr.classList.add('arrastra'); e.preventDefault();
    });
    b.addEventListener('pointermove', (e) => {
      if (!activo) return;
      if (e.clientY < 70) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
      // Las filas de una tabla no salen en elementsFromPoint: se busca la celda y de ahí su fila
      const bajo = document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest && x.closest('tr[data-rid]')).find(x => x && x !== tr);
      if (!bajo) { destino = null; marca(null); return; }
      const rect = bajo.getBoundingClientRect(); const arriba = e.clientY < rect.top + rect.height / 2;
      destino = { rid: bajo.dataset.rid, arriba }; marca(bajo, arriba ? 'antes' : 'despues');
    });
    const fin = async (e, cancelar) => {
      if (!activo) return; activo = false; tr.classList.remove('arrastra'); marca(null);
      try { b.releasePointerCapture(e.pointerId); } catch { /* ya soltado */ }
      if (cancelar || !destino) return;
      const filas = S.base.rows; const i = filas.findIndex(x => x.id === r.id);
      let antes = destino.rid;
      if (!destino.arriba) { const j = filas.findIndex(x => x.id === destino.rid); antes = j >= 0 && filas[j + 1] ? filas[j + 1].id : ''; }
      if (antes === r.id) return;
      try {
        const d = await K.post(`/api/bases/${S.base.id}/orden`, { id: r.id, antes });
        const pos = new Map(d.ids.map((id, k) => [id, k])); S.base.rows.sort((a, c) => pos.get(a.id) - pos.get(c.id));
        B.repinta(); B.logros();
      } catch (err) { K.fail(err); }
    };
    b.addEventListener('pointerup', (e) => fin(e, false)); b.addEventListener('pointercancel', (e) => fin(e, true));
    td.appendChild(b); return td;
  };
})();
