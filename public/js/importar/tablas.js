'use strict';
/* Importar · asignación de columnas de un CSV: base nueva (nombre y tipo de cada columna), base existente o contactos. */
(function () {
  if (!window.K || !K.importar) return;
  const I = K.importar, S = I.S;

  I.ajusteInicial = (t) => ({
    tabla: t.i, activa: true, destino: t.campos.filter(Boolean).length >= 2 ? 'contactos' : 'nueva', nombre: t.nombre, baseId: '',
    columnas: t.cabecera.map((c, k) => ({ col: k, nombre: c, tipo: t.tipos[k] || 'text', ignora: false })),
    destinoCols: t.cabecera.map(() => -1), campos: t.campos.slice(),
  });

  const opcion = (v, txt, sel) => { const o = el('option', null, txt); o.value = v; if (sel) o.selected = true; return o; };
  const select = (opts, valor, alCambiar) => { const s = el('select'); opts.forEach(([v, t]) => s.appendChild(opcion(v, t, String(v) === String(valor)))); s.addEventListener('change', () => alCambiar(s.value)); return s; };

  function tablaMapa(t, a, root) {
    const w = el('div', 'im-mapa');
    const hdr = el('div', 'im-fila im-fila-h'); hdr.append(el('span', null, 'CSV'), el('span', null, a.destino === 'nueva' ? 'Nombre y tipo' : a.destino === 'base' ? 'Columna de la base' : 'Campo del contacto'), el('span', null, 'Ejemplo'));
    w.appendChild(hdr);
    const base = a.destino === 'base' ? S.analisis.bases.find(b => b.id === a.baseId) : null;
    t.cabecera.forEach((c, k) => {
      const f = el('div', 'im-fila');
      const col = a.columnas[k];
      const izq = el('label', 'im-col');
      if (a.destino === 'nueva') { const ck = el('input'); ck.type = 'checkbox'; ck.checked = !col.ignora; ck.addEventListener('change', () => { col.ignora = !ck.checked; f.classList.toggle('off', col.ignora); }); izq.appendChild(ck); }
      izq.appendChild(el('span', null, c)); f.appendChild(izq);
      const med = el('div', 'im-ctl');
      if (a.destino === 'nueva') {
        const n = el('input'); n.type = 'text'; n.value = col.nombre; n.maxLength = 60; n.setAttribute('aria-label', 'Nombre de la columna ' + c); n.addEventListener('input', () => { col.nombre = n.value; });
        med.append(n, select(I.TIPOS, col.tipo, (v) => { col.tipo = v; }));
        f.classList.toggle('off', col.ignora);
      } else if (a.destino === 'base') {
        med.appendChild(select([[-1, '— ignorar —'], ...(base ? base.columnas.filter(x => !['formula', 'relation', 'rollup', 'file'].includes(x.tipo)).map(x => [x.i, `${x.nombre} (${I.nombreTipo(x.tipo)})`]) : [])], a.destinoCols[k], (v) => { a.destinoCols[k] = Number(v); }));
      } else {
        med.appendChild(select([['', '— ignorar —'], ...S.analisis.camposContacto], a.campos[k], (v) => { a.campos[k] = v; }));
      }
      f.appendChild(med);
      f.appendChild(el('span', 'im-ej k-faint', t.muestra.map(m => m[k]).filter(Boolean).slice(0, 2).join(' · ').slice(0, 60)));
      w.appendChild(f);
    });
    return w;
  }

  I.pintaTabla = (t, a, root) => {
    const c = el('section', 'im-card');
    const cab = el('div', 'im-card-h');
    const ck = el('input'); ck.type = 'checkbox'; ck.checked = a.activa; ck.setAttribute('aria-label', 'Importar ' + t.nombre);
    ck.addEventListener('change', () => { a.activa = ck.checked; I.pinta(root); });
    cab.append(ck, el('strong', null, `${t.nombre}.csv`), el('span', 'k-faint', `${t.total} filas · ${t.cabecera.length} columnas`));
    c.appendChild(cab);
    if (t.truncado) c.appendChild(el('p', 'im-aviso', 'Solo se leen las primeras 20.000 filas.'));
    if (!a.activa) return c;
    const dest = el('div', 'im-dest');
    const op = (v, tx) => { const l = el('label', 'im-radio'); const r = el('input'); r.type = 'radio'; r.name = 'dest' + t.i; r.checked = a.destino === v; r.addEventListener('change', () => { a.destino = v; I.pinta(root); }); l.append(r, el('span', null, tx)); return l; };
    dest.append(op('nueva', 'Base nueva'), op('base', 'Añadir a una base'), op('contactos', 'Contactos'));
    c.appendChild(dest);
    if (a.destino === 'nueva') { const n = el('input'); n.type = 'text'; n.value = a.nombre; n.maxLength = 80; n.className = 'im-nombre'; n.setAttribute('aria-label', 'Nombre de la base'); n.addEventListener('input', () => { a.nombre = n.value; }); c.appendChild(n); }
    if (a.destino === 'base') {
      const bs = S.analisis.bases;
      if (!bs.length) c.appendChild(el('p', 'im-aviso', 'Todavía no tienes bases: elige «Base nueva».'));
      else { c.appendChild(select([['', 'Elige una base…'], ...bs.map(b => [b.id, b.nombre])], a.baseId, (v) => { a.baseId = v; a.destinoCols = a.destinoCols.map(() => -1); if (v) { const b = bs.find(x => x.id === v); t.cabecera.forEach((h, k) => { const m = b.columnas.find(x => x.nombre.toLowerCase() === h.toLowerCase()); if (m) a.destinoCols[k] = m.i; }); } I.pinta(root); })); }
    }
    if (a.destino !== 'base' || a.baseId) c.appendChild(tablaMapa(t, a, root));
    return c;
  };
})();
