'use strict';
/* Importar · pasos 2 y 3: revisar lo encontrado (notas, avisos, tablas) y ver el resultado. */
(function () {
  if (!window.K || !K.importar) return;
  const I = K.importar, S = I.S;

  async function importa(root) {
    S.ocupado = true; S.error = ''; I.pinta(root);
    try { S.resultado = await I.ejecuta(); S.paso = 'hecho'; K.bus.emit('notes'); I.logros(); }
    catch (e) { S.error = (e && e.message) || 'No se pudo importar'; }
    S.ocupado = false; I.pinta(root);
  }

  I.pintaRevisar = (root) => {
    const a = S.analisis, page = el('div', 'im-page');
    const cab = el('div', 'im-head'); cab.append(el('h1', null, `Revisa lo que se va a importar`), el('p', 'k-faint', `${a.fuenteNombre} · ${a.nombre}`));
    page.appendChild(cab);
    if (S.error) page.appendChild(el('div', 'im-error', S.error));
    if (a.avisos.length) { const av = el('ul', 'im-avisos'); a.avisos.forEach(x => av.appendChild(el('li', null, x))); page.appendChild(av); }
    if (a.notas) {
      const c = el('section', 'im-card');
      const h = el('div', 'im-card-h'); const ck = el('input'); ck.type = 'checkbox'; ck.checked = S.notas; ck.setAttribute('aria-label', 'Importar las notas');
      ck.addEventListener('change', () => { S.notas = ck.checked; I.pinta(root); });
      h.append(ck, el('strong', null, `${a.notas} nota${a.notas === 1 ? '' : 's'}`), el('span', 'k-faint', `${a.carpetas} carpeta${a.carpetas === 1 ? '' : 's'} · ${a.adjuntos} adjunto${a.adjuntos === 1 ? '' : 's'} (${I.peso(a.bytesAdjuntos)})`));
      c.appendChild(h);
      if (S.notas) {
        const l = el('label', 'im-destino'); l.appendChild(el('span', null, 'Dentro de:'));
        const s = el('select'); const o0 = el('option', null, 'Raíz de Notas'); o0.value = ''; s.appendChild(o0);
        S.carpetas.forEach(f => { const o = el('option', null, f.nombre); o.value = f.id; if (f.id === S.destino) o.selected = true; s.appendChild(o); });
        s.addEventListener('change', () => { S.destino = s.value; }); l.appendChild(s); c.appendChild(l);
        c.appendChild(el('p', 'k-faint im-nota', 'Se crea una carpeta «Importado de … · fecha» con todo dentro, para que nada se mezcle con lo tuyo.'));
        const ul = el('ul', 'im-arbol');
        a.arbol.slice(0, 40).forEach(n => ul.appendChild(el('li', null, (n.ruta ? n.ruta + ' / ' : '') + n.titulo)));
        if (a.notas > 40) ul.appendChild(el('li', 'k-faint', `… y ${a.notas - 40} más`));
        c.appendChild(ul);
      }
      page.appendChild(c);
    }
    a.tablasDetalle.forEach((t, i) => page.appendChild(I.pintaTabla(t, S.ajustes[i], root)));
    const pie = el('div', 'im-pie');
    const atras = el('button', 'btn', 'Cancelar'); atras.type = 'button'; atras.addEventListener('click', () => { I.reset(); I.pinta(root); });
    const hay = (S.notas && a.notas) || S.ajustes.some(x => x.activa);
    const ok = el('button', 'btn primary', S.ocupado ? 'Importando…' : 'Importar'); ok.type = 'button'; ok.disabled = S.ocupado || !hay;
    ok.addEventListener('click', () => importa(root));
    pie.append(atras, ok); page.appendChild(pie); root.appendChild(page);
  };

  I.pintaHecho = (root) => {
    const r = S.resultado, page = el('div', 'im-page');
    const cab = el('div', 'im-head'); cab.append(el('h1', null, r.errores.length && !r.notas && !r.tablas.length ? 'No se importó nada' : 'Importación terminada')); page.appendChild(cab);
    const c = el('section', 'im-card'); const ul = el('ul', 'im-res');
    if (r.notas) {
      const n = r.notas;
      ul.appendChild(el('li', null, `${n.notas} nota${n.notas === 1 ? '' : 's'} en ${n.carpetas} carpeta${n.carpetas === 1 ? '' : 's'}, con ${n.adjuntos} adjunto${n.adjuntos === 1 ? '' : 's'}.`));
      if (n.sinAdjuntar) ul.appendChild(el('li', 'im-aviso', `${n.sinAdjuntar} adjunto(s) de un tipo no permitido se han dejado fuera.`));
      if (n.recortadas) ul.appendChild(el('li', 'im-aviso', `${n.recortadas} nota(s) eran demasiado largas y se han recortado.`));
    }
    r.tablas.forEach(t => ul.appendChild(el('li', null, `${t.nombre}: ${t.filas} ${t.destino === 'contactos' ? 'contactos' : 'filas'}${t.duplicados ? ` (${t.duplicados} ya existían)` : ''}${t.invalidos ? ` (${t.invalidos} sin datos útiles)` : ''}.`)));
    r.tablas.forEach(t => (t.avisos || []).forEach(x => ul.appendChild(el('li', 'im-aviso', x))));
    r.errores.forEach(x => ul.appendChild(el('li', 'im-error', x)));
    c.appendChild(ul); page.appendChild(c);
    const pie = el('div', 'im-pie');
    const otra = el('button', 'btn', 'Importar otro archivo'); otra.type = 'button'; otra.addEventListener('click', () => { I.reset(); I.pinta(root); });
    pie.appendChild(otra);
    if (r.notas) { const ir = el('button', 'btn primary', 'Ir a Notas'); ir.type = 'button'; ir.addEventListener('click', () => { I.reset(); switchTab('notes'); }); pie.appendChild(ir); }
    const tb = r.tablas.find(t => t.baseId);
    if (tb) { const ir = el('button', 'btn primary', 'Ir a Bases'); ir.type = 'button'; ir.addEventListener('click', () => { I.reset(); switchTab('bases'); }); pie.appendChild(ir); }
    page.appendChild(pie); root.appendChild(page);
  };
})();
