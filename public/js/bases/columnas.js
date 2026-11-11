'use strict';
/* Bases · editor de columnas: nombre, tipo (que se puede cambiar), opciones y los ajustes de fórmulas, relaciones y resúmenes. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const COLORES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
  const AYUDA = 'Escribe las columnas entre llaves: {Precio} * {Cantidad}\n\nOperadores: + - * / % ^  y  & (unir textos)  = != < > <= >=\nFunciones: SI(cond; sí; no)  Y  O  NO  VACIO  SIERROR  SUMA  PROMEDIO  MIN  MAX  REDONDEAR(n; decimales)  ABS  ENTERO  RAIZ\nCONCAT  LARGO  MAYUS  MINUS  RECORTAR  IZQUIERDA  DERECHA  REEMPLAZAR  CONTIENE  TEXTO  NUM  CUENTA\nFechas: HOY()  ANIO  MES  DIA  DIAS(fin; inicio)  SUMADIAS(fecha; n)\nEjemplos: SI({Hecha}; "Listo"; "Pendiente")   ·   DIAS({Vence}; HOY())   ·   REDONDEAR({Importe} * 1,21; 2)';

  const datosDe = (b, selfCols) => (selfCols || b.columns).filter(x => x.id && !B.esCalc(x) && x.tipo !== 'relation');
  const funcsPara = (t) => ['cuenta', 'rellenas', 'unicos', ...(t && t.tipo === 'number' ? ['suma', 'media', 'min', 'max'] : []), ...(t && t.tipo === 'date' ? ['min', 'max'] : []), ...(t && t.tipo === 'checkbox' ? ['marcadas'] : [])];

  function ajustes(c, cols, redibuja) {
    const caja = el('div', 'bs-ajustes');
    if (c.tipo === 'select' || c.tipo === 'multiselect') {
      c.opciones = c.opciones || [];
      c.opciones.forEach((o, j) => {
        const f = el('div', 'bs-op'); const cl = el('input'); cl.type = 'color'; cl.value = o.color || COLORES[j % 8]; cl.addEventListener('input', () => { o.color = cl.value; });
        const nn = el('input'); nn.value = o.nombre; nn.maxLength = 40; nn.setAttribute('aria-label', 'Nombre de la opción'); nn.addEventListener('input', () => { o.nombre = nn.value; });
        const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar opción'); x.textContent = '×'; x.addEventListener('click', () => { c.opciones.splice(j, 1); redibuja(); });
        f.append(cl, nn, x); caja.appendChild(f);
      });
      caja.appendChild(B.btn('Opción', 'i-plus', () => { c.opciones.push({ nombre: '', color: COLORES[c.opciones.length % 8] }); redibuja(); }, 'btn sm'));
    } else if (c.tipo === 'formula') {
      const t = el('textarea'); t.rows = 2; t.value = c.expr || ''; t.placeholder = '{Precio} * {Cantidad}'; t.maxLength = 500; t.spellcheck = false; t.setAttribute('aria-label', 'Fórmula'); t.addEventListener('input', () => { c.expr = t.value; res.textContent = ''; });
      const res = el('div', 'bs-formula-res k-muted');
      const prueba = B.btn('Comprobar', 'i-check', async () => {
        try {
          const d = await K.post(`/api/bases/${S.base.id}/formula`, { expr: c.expr || '', nombres: cols.map(x => x.nombre) });
          res.className = 'bs-formula-res ' + (d.ok ? 'ok' : 'bs-err'); res.textContent = d.ok ? ('Fórmula válida' + (d.ejemplos && d.ejemplos.length ? ' · primeras filas: ' + d.ejemplos.map(x => (x && x.e ? x.e : x === null || x === undefined ? '—' : typeof x === 'number' ? B.nf(x) : String(x))).join(' | ') : '')) : d.error;
        } catch (e) { K.fail(e); }
      }, 'btn sm');
      const ay = el('details', 'bs-ayuda'); ay.appendChild(el('summary', null, 'Ayuda con las fórmulas')); ay.appendChild(el('pre', null, AYUDA));
      caja.append(t, prueba, res, ay);
    } else if (c.tipo === 'relation') {
      const otras = [[S.base.id, 'Esta misma base'], ...S.lista.filter(x => x.id !== S.base.id).map(x => [x.id, `${x.icono} ${x.nombre}`])];
      const s = B.select(otras, c.destino || ''); if (!c.destino) { c.destino = otras[0][0]; s.value = c.destino; }
      s.addEventListener('change', () => { c.destino = s.value; });
      caja.appendChild(B.campo('Se relaciona con', s));
      const dob = el('input'); dob.type = 'checkbox'; dob.checked = c.doble === undefined ? !!c.inversa : !!c.doble; c.doble = dob.checked;
      dob.addEventListener('change', () => { c.doble = dob.checked; });
      const l = el('label', 'bs-check'); l.append(dob, el('span', null, 'Doble sentido: crear la columna inversa en la otra base y mantenerlas sincronizadas'));
      caja.appendChild(l);
    } else if (c.tipo === 'rollup') ajustesResumen(c, cols, caja, redibuja);
    return caja;
  }

  function ajustesResumen(c, cols, caja, redibuja) {
    const rels = cols.filter(x => x.tipo === 'relation');
    if (!rels.length) { caja.appendChild(el('p', 'k-muted', 'Un resumen necesita antes una columna de relación. Crea la relación, guarda y vuelve aquí (o créala en esta misma ventana).')); return; }
    if (!c._rel || !rels.includes(c._rel)) c._rel = rels.find(x => x.id && x.id === c.relacion) || rels[0];
    const sr = B.select(rels.map((x, i) => [i, x.nombre || '(sin nombre)']), rels.indexOf(c._rel)); sr.addEventListener('change', () => { c._rel = rels[Number(sr.value)]; c.columna = ''; redibuja(); });
    caja.appendChild(B.campo('Filas enlazadas por', sr));
    const destino = c._rel.destino === S.base.id ? S.base : B.destino(c._rel.destino, redibuja);
    const datos = destino && destino.columns ? datosDe(destino, c._rel.destino === S.base.id ? cols : null) : [];
    const sc = B.select([['', '—'], ...datos.map(x => [x.id, x.nombre])], c.columna || ''); sc.addEventListener('change', () => { c.columna = sc.value; redibuja(); });
    const t = datos.find(x => x.id === c.columna); const fs = funcsPara(t); if (!fs.includes(c.func)) c.func = fs[0];
    const sf = B.select(fs.map(k => [k, B.RESUMEN[k]]), c.func); sf.addEventListener('change', () => { c.func = sf.value; });
    caja.appendChild(B.campo('Columna que se resume', sc)); caja.appendChild(B.campo('Operación', sf));
    if (!destino) caja.appendChild(el('small', 'k-faint', 'Cargando la base enlazada…'));
    if (t === undefined && c.func !== 'cuenta' && c.columna) c.columna = '';
  }

  B.editaColumnas = () => {
    const cols = S.base.columns.map(c => ({ ...c, opciones: (c.opciones || []).map(o => ({ ...o })) }));
    const orig = new Map(S.base.columns.map(c => [c.id, c.tipo]));
    const w = el('div', 'bs-form bs-cols');
    const dibuja = () => {
      w.textContent = '';
      cols.forEach((c, i) => {
        const bloque = el('div', 'bs-colbloque'); const fila = el('div', 'bs-colfila');
        const n = el('input'); n.value = c.nombre; n.maxLength = 60; n.setAttribute('aria-label', 'Nombre de la columna'); n.addEventListener('input', () => { c.nombre = n.value; });
        const fijo = c.id && B.esCalc(c) || (c.id && c.tipo === 'relation' && orig.get(c.id) === 'relation');
        let t;
        if (fijo) t = el('span', 'bs-tipo', B.TIPO_NOMBRE[c.tipo]);
        else { t = B.select(c.id ? B.TIPOS.slice(0, 10) : B.TIPOS, c.tipo); t.setAttribute('aria-label', 'Tipo de columna'); t.className = 'bs-tipo-sel'; t.addEventListener('change', () => { c.tipo = t.value; if (c.tipo === 'select' || c.tipo === 'multiselect') c.opciones = c.opciones || []; redibuja(); }); }
        const del = el('button', 'icon-btn'); del.type = 'button'; del.title = 'Eliminar columna'; del.setAttribute('aria-label', 'Eliminar columna'); del.appendChild(icon('i-trash'));
        del.addEventListener('click', async () => { if (cols.length < 2) { K.toast('La base necesita al menos una columna'); return; } if (await K.confirm(`Se eliminará la columna «${c.nombre}» y sus datos.`, { ok: 'Quitar', danger: true })) { cols.splice(i, 1); dibuja(); } });
        fila.append(n, t, del); bloque.appendChild(fila);
        if (c.id && orig.get(c.id) && orig.get(c.id) !== c.tipo) bloque.appendChild(el('p', 'bs-aviso', `Al guardar, los valores se convertirán de «${B.TIPO_NOMBRE[orig.get(c.id)]}» a «${B.TIPO_NOMBRE[c.tipo]}». Lo que no se pueda convertir quedará vacío (se guarda una copia de la base 30 días).`));
        const aj = ajustes(c, cols, dibuja); if (aj.childNodes.length) bloque.appendChild(aj);
        w.appendChild(bloque);
      });
      const nueva = el('div', 'bs-colfila bs-nuevacol'); const nn = el('input'); nn.placeholder = 'Nueva columna…'; nn.maxLength = 60;
      const ts = B.select(B.TIPOS, 'text');
      nueva.append(nn, ts, B.btn('Añadir', 'i-plus', () => {
        if (!nn.value.trim()) return; if (cols.length >= 30) { K.toast('Máximo 30 columnas'); return; }
        cols.push({ nombre: nn.value.trim(), tipo: ts.value, ...(ts.value === 'select' || ts.value === 'multiselect' ? { opciones: [] } : {}) }); dibuja();
      }, 'btn sm')); w.appendChild(nueva);
    };
    const redibuja = dibuja;
    dibuja();
    K.modal({ title: 'Columnas', sub: 'Puedes cambiar el tipo de una columna: sus valores se convierten al guardar', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      const columnas = cols.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, opciones: c.opciones, expr: c.expr, destino: c.destino, doble: c.tipo === 'relation' ? c.doble : undefined, relacion: c._rel ? (c._rel.id || c._rel.nombre) : c.relacion, columna: c.columna, func: c.func }));
      const b = await B.guardaEsquema({ columnas, conocidas: S.base.columns.map(c => c.id), vistas: S.base.views });
      if (!b) return false; B.pinta(); B.logros(); return true;
    } }] });
  };
})();
