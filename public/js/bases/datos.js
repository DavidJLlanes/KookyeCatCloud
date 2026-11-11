'use strict';
/* Bases · carga y guardado (lista, base abierta, filas) y bases enlazadas. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;

  B.cargaLista = async () => { try { const d = await K.get('/api/bases'); S.lista = d.bases; S.plantillas = d.plantillas; S.built = true; B.pinta(); } catch (e) { K.fail(e); } };
  B.abre = async (id) => {
    try { S.destinos = new Map(); S.base = await K.get('/api/bases/' + id); S.vista = (S.base.views[0] || {}).id; S.q = ''; S.ordenLocal = null; S.mes = null; S.dia = ''; S.built = true; B.pinta(); } catch (e) { K.fail(e); }
  };
  B.recarga = async () => {
    if (S.base) { try { S.destinos = new Map(); S.base = await K.get('/api/bases/' + S.base.id); if (!S.base.views.some(v => v.id === S.vista)) S.vista = S.base.views[0].id; } catch (e) { K.fail(e); } }
    B.pinta(); B.logros();
  };
  // Otra base (la enlazada por una relación): se lee una vez por apertura. Con `alLlegar` se avisa cuando está disponible.
  B.destino = (id, alLlegar) => {
    if (S.base && id === S.base.id) return S.base;
    const hay = S.destinos.get(id); if (hay && hay.rows) return hay;
    if (!hay) { S.destinos.set(id, { pendiente: true }); K.get('/api/bases/' + id).then(b => { S.destinos.set(id, b); if (alLlegar) alLlegar(b); }).catch(() => { S.destinos.set(id, { falta: true }); if (alLlegar) alLlegar(null); }); }
    return null;
  };
  B.tituloDestino = (b, r) => { const c = b.columns.find(x => x.tipo === 'text') || b.columns[0]; return (c && typeof r.c[c.id] === 'string' && r.c[c.id].trim()) || 'Sin título'; };

  // Las celdas calculadas de una fila (fórmulas, resúmenes) se repintan sin tocar el resto de la fila (así no se pierde el foco)
  B.actualizaCalc = (r) => {
    const tr = B.root.querySelector(`tr[data-rid="${r.id}"]`); if (!tr || !B.celda) return;
    S.base.columns.filter(c => B.esCalc(c) || c.tipo === 'relation').forEach(c => { const td = tr.querySelector(`td[data-cid="${c.id}"]`); if (td && td !== document.activeElement) td.replaceWith(B.celda(r, c)); });
  };
  B.guardaCelda = async (r, c, valor) => {
    const antes = r.c[c.id];
    r.c[c.id] = valor;
    try { const d = await K.put(`/api/bases/${S.base.id}/rows/${r.id}`, { c: { [c.id]: valor } }); Object.assign(r, d.row); B.actualizaCalc(r); B.logros(); }
    catch (e) {
      K.fail(e);
      // Valor no válido (demasiado largo, no es un número…): la celda conserva lo escrito para corregirlo, sin recargar
      if (e.status === 400) { r.c[c.id] = antes; return; }
      B.recarga();
    }
  };
  B.nuevaFila = async (inicial = {}) => {
    try { const d = await K.post(`/api/bases/${S.base.id}/rows`, { c: inicial }); S.base.rows.push(d.row); B.repinta(); B.actualizaContador(); B.logros(); return d.row; } catch (e) { K.fail(e); return null; }
  };
  B.actualizaContador = () => { const p = B.root.querySelector('.bs-titulo p'); if (p) p.textContent = B.resumenTxt(); };
  B.resumenTxt = () => `${S.base.rows.length} fila${S.base.rows.length === 1 ? '' : 's'} · ${S.base.columns.length} columnas`;
  B.borraFila = async (r) => {
    if (!await K.confirm(`Se eliminará la fila «${B.titulo(r)}».`, { ok: 'Eliminar', danger: true })) return false;
    try { await K.del(`/api/bases/${S.base.id}/rows/${r.id}`); S.base.rows = S.base.rows.filter(x => x.id !== r.id); B.repinta(); B.actualizaContador(); B.logros(); return true; } catch (e) { K.fail(e); return false; }
  };
  B.mueve = async (r, c, opId) => {
    try { const d = await K.post(`/api/bases/${S.base.id}/rows/${r.id}/move`, { columna: c.id, opcion: opId }); Object.assign(r, d.row); B.repinta(); B.logros(); } catch (e) { K.fail(e); }
  };
  // Guarda columnas y/o vistas; devuelve la base nueva (o null si falló) y enseña los avisos de conversión
  B.guardaEsquema = async (cuerpo) => {
    try {
      const b = await K.put(`/api/bases/${S.base.id}/schema`, cuerpo);
      const avisos = b.avisos || []; delete b.avisos; S.base = b; S.destinos = new Map();
      if (!b.views.some(v => v.id === S.vista)) S.vista = b.views[0].id;
      avisos.forEach(a => K.toast(a));
      return b;
    } catch (e) { K.fail(e); return null; }
  };
})();
