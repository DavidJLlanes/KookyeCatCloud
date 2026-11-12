'use strict';
/* Buscar · lista de resultados de la búsqueda sin IA, con las coincidencias marcadas y filtros por módulo. */
(function () {
  if (!window.K || !K.buscar) return;
  const B = K.buscar, S = B.S;

  B.pintaChips = (cont) => {
    cont.textContent = '';
    const r = S.res;
    if (!r || !r.total && !Object.keys(r.fuentes || {}).length) return;
    const total = Object.values(r.fuentes).reduce((a, b) => a + b, 0);
    const chip = (valor, texto, n) => {
      const b = el('button', 'bu-chip' + (S.m === valor ? ' on' : ''), `${texto} · ${n}`); b.type = 'button';
      b.addEventListener('click', () => { S.m = valor; B.lanza(); });
      cont.appendChild(b);
    };
    chip('', 'Todo', total);
    Object.entries(r.fuentes).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => chip(f, B.nombreDe(f), n));
  };

  function tarjeta(r) {
    const card = el('div', 'bu-res');
    const ab = el('button', 'bu-res-main'); ab.type = 'button';
    const ic = el('span', 'bu-ic'); ic.appendChild(icon(B.iconoDe(r.fuente)));
    const cuerpo = el('span', 'bu-res-txt');
    const tit = el('b', 'bu-res-tit'); tit.appendChild(B.marcado(r.titulo, r.titulo_marcas));
    const meta = el('small', 'k-faint', [B.nombreDe(r.fuente), B.fecha(r.fecha)].filter(Boolean).join(' · '));
    cuerpo.append(tit, meta);
    if (r.extracto && r.extracto.texto && r.extracto.texto !== r.titulo) { const ex = el('span', 'bu-res-ex'); ex.appendChild(B.marcado(r.extracto.texto, r.extracto.marcas)); cuerpo.appendChild(ex); }
    ab.append(ic, cuerpo);
    ab.addEventListener('click', () => B.abrir(r));
    card.appendChild(ab);
    // Resumir con IA: solo si hay un proveedor listo y la ficha tiene texto
    if (B.iaLista() && ['notas', 'prompts', 'archivos', 'portapapeles', 'sincronizados', 'bases'].includes(r.fuente)) {
      const rs = el('button', 'btn sm bu-res-ia'); rs.type = 'button'; rs.title = 'Resumir con IA'; rs.appendChild(icon('i-sparkle')); rs.appendChild(el('span', null, 'Resumir'));
      rs.addEventListener('click', (ev) => { ev.stopPropagation(); B.resumir(r); });
      card.appendChild(rs);
    }
    return card;
  }

  B.pintaResultados = (cont) => {
    cont.textContent = '';
    const r = S.res;
    if (S.error) { cont.appendChild(el('div', 'bu-vacio', S.error)); return; }
    if (!r) { B.pintaInicio(cont); return; }
    if (!r.resultados.length) {
      const v = el('div', 'bu-vacio'); v.appendChild(el('b', null, `Nada encontrado para «${S.q}»`));
      v.appendChild(el('span', 'k-faint', 'Prueba con otra palabra o con menos palabras. La búsqueda ignora acentos y mayúsculas, entiende plurales y perdona alguna errata.'));
      if (B.S.config && B.iaLista()) { const b = el('button', 'btn sm', 'Preguntárselo a la IA'); b.type = 'button'; b.addEventListener('click', () => { S.modo = 'ia'; B.pintaTodo(); }); v.appendChild(b); }
      cont.appendChild(v); return;
    }
    cont.appendChild(el('div', 'k-faint bu-cuenta', `${r.total} resultado${r.total === 1 ? '' : 's'} en ${r.ms} ms${r.total > r.resultados.length ? ` (se muestran ${r.resultados.length})` : ''}`));
    r.resultados.forEach(x => cont.appendChild(tarjeta(x)));
  };

  // Pantalla sin consulta: búsquedas recientes y qué se indexa
  B.pintaInicio = (cont) => {
    const caja = el('div', 'bu-inicio');
    if (S.recientes.length) {
      const h = el('div', 'bu-rec-h'); h.append(el('b', null, 'Búsquedas recientes'));
      const x = el('button', 'btn sm', 'Borrar'); x.type = 'button'; x.addEventListener('click', async () => { try { await K.del('/api/busqueda/recientes'); S.recientes = []; B.pintaTodo(); } catch (e) { K.fail(e); } });
      h.appendChild(x); caja.appendChild(h);
      const fila = el('div', 'bu-chips');
      S.recientes.forEach(q => { const b = el('button', 'bu-chip', q); b.type = 'button'; b.addEventListener('click', () => { S.q = q; B.lanza(); }); fila.appendChild(b); });
      caja.appendChild(fila);
    }
    caja.appendChild(el('p', 'k-faint', 'Busca en notas, prompts, bases, código, contactos, calendario, pagos, recordatorios, marcadores, portapapeles y archivos de texto, todo a la vez y sin salir de tu servidor. Puedes escribir solo el principio de una palabra.'));
    cont.appendChild(caja);
  };
})();
