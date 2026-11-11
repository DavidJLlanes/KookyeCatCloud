'use strict';
/* Pagos · pantalla principal: resumen, filtros y tarjetas. */
(function () {
  if (!window.K || !K.pagos) return;
  const P = K.pagos, S = P.S;
  const root = document.getElementById('view-pagos');
  const btn = (texto, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (texto) b.appendChild(el('span', null, texto)); b.addEventListener('click', fn); return b; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function visibles() {
    const q = norm(S.q);
    return S.pagos.filter(p => {
      const e = P.estadoDe(p);
      if (S.estado === 'vencidos' && !(e.clase === 'vencido' || e.clase === 'hoy')) return false;
      if (S.estado === 'proximos' && !(e.clase === 'pronto' || (e.dias !== undefined && e.dias >= 0 && e.dias <= 30))) return false;
      if (S.estado === 'fin' && e.clase !== 'fin') return false;
      if (S.estado === 'todos' && e.clase === 'fin' && !S.q) return false;
      if (S.valor && norm(p[S.valor.prop]) !== norm(S.valor.valor)) return false;
      return !q || [p.nombre, p.compania, p.banco, p.categoria, p.referencia, p.notas].some(t => norm(t).includes(q));
    }).sort((a, b) => P.estadoDe(a).orden - P.estadoDe(b).orden || (a.fechaProxima || '').localeCompare(b.fechaProxima || '') || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function resumen() {
    const activos = S.pagos.filter(p => p.activo !== false);
    const prox = activos.filter(p => { const n = P.dias(p.fechaProxima); return n >= 0 && n <= 30; });
    const venc = activos.filter(p => P.dias(p.fechaProxima) < 0);
    const mes = activos.reduce((a, p) => a + P.mensual(p), 0);
    const caja = el('div', 'pg-resumen');
    const dato = (titulo, valor, sub, cls = '') => { const d = el('div', 'pg-dato ' + cls); d.append(el('span', 'k-faint', titulo), el('b', null, valor), el('small', 'k-faint', sub)); return d; };
    caja.append(
      dato('Próximos 30 días', P.euros(prox.reduce((a, p) => a + (p.importe || 0), 0)), `${prox.length} ${prox.length === 1 ? 'pago' : 'pagos'}`),
      dato('Vencidos', String(venc.length), venc.length ? P.euros(venc.reduce((a, p) => a + (p.importe || 0), 0)) : 'Todo al día', venc.length ? 'mal' : ''),
      dato('Gasto mensual estimado', P.euros(mes), `${P.euros(mes * 12)} al año`),
    );
    return caja;
  }

  function tarjeta(p) {
    const e = P.estadoDe(p);
    const c = el('article', 'pg-card ' + e.clase); c.tabIndex = 0;
    const cab = el('div', 'pg-cab');
    const t = el('div', 'pg-tit'); t.append(el('b', null, p.nombre));
    const chips = el('div', 'pg-chips');
    if (p.compania) chips.appendChild(K.chipValor('pagos.compania', p.compania));
    if (p.banco) chips.appendChild(K.chipValor('pagos.banco', p.banco));
    if (p.categoria) chips.appendChild(K.chipValor('pagos.categoria', p.categoria));
    if (chips.childNodes.length) t.appendChild(chips);
    cab.append(t, el('div', 'pg-importe', P.euros(p.importe)));
    const pie = el('div', 'pg-pie');
    const fecha = el('div', 'pg-fecha'); fecha.append(el('span', 'pg-estado', e.texto), el('small', 'k-faint', `${P.fechaTxt(p.fechaProxima)} · ${P.nombreDe(P.FRECUENCIAS, p.frecuencia)}`));
    const acc = el('div', 'pg-acc');
    if (p.activo !== false) acc.appendChild(btn('Pagado', 'i-check', (ev) => { ev.stopPropagation(); K.pagos.marcaPagado(p); }, 'btn primary sm'));
    acc.appendChild(btn('', 'i-pencil', (ev) => { ev.stopPropagation(); P.editor(p); }, 'icon-btn')); acc.lastChild.title = 'Editar'; acc.lastChild.setAttribute('aria-label', `Editar ${p.nombre}`);
    pie.append(fecha, acc); c.append(cab, pie);
    c.addEventListener('click', () => P.editor(p));
    c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target === c) P.editor(p); });
    return c;
  }

  P.pinta = function () {
    if (!root || !S.cargado) return;
    root.textContent = '';
    const page = el('section', 'pg-page'); root.appendChild(page);
    const cab = el('header', 'pg-head'); const t = el('div');
    t.append(el('h1', null, 'Pagos'), el('p', 'k-muted', 'Recibos, seguros y suscripciones: compañía, importe y cuándo toca pagar'));
    cab.append(t, btn('Nuevo pago', 'i-plus', () => P.editor(null), 'btn primary')); page.appendChild(cab);
    if (!S.pagos.length) {
      const v = el('div', 'pg-vacio'); v.append(el('h2', null, 'Aún no hay pagos'), el('p', 'k-muted', 'Apunta tus seguros, suministros y suscripciones para saber qué pagas, a quién y cuándo.'), btn('Añadir el primero', 'i-plus', () => P.editor(null), 'btn primary'));
      page.appendChild(v); return;
    }
    page.appendChild(resumen());
    const barra = el('div', 'pg-barra');
    const busca = el('input'); busca.type = 'search'; busca.placeholder = 'Buscar por nombre, compañía…'; busca.value = S.q; busca.setAttribute('aria-label', 'Buscar pagos');
    busca.addEventListener('input', K.debounce(() => { S.q = busca.value; pintaLista(); }, 150));
    const tabs = el('div', 'pg-tabs');
    [['todos', 'Activos'], ['vencidos', 'Vencidos'], ['proximos', 'Próximos 30 días'], ['fin', 'Finalizados']].forEach(([id, n]) => {
      const b = el('button', 'pg-tab' + (S.estado === id ? ' on' : ''), n); b.type = 'button';
      b.addEventListener('click', () => { S.estado = id; P.pinta(); }); tabs.appendChild(b);
    });
    barra.append(busca, tabs); page.appendChild(barra);
    if (S.valor) { const f = el('div', 'pg-filtro'); f.append(el('span', null, `Solo «${S.valor.valor}»`), btn('Quitar filtro', 'i-x', () => { S.valor = null; P.pinta(); }, 'btn sm')); page.appendChild(f); }
    const caja = el('div', 'pg-lista'); caja.id = 'pg-lista'; page.appendChild(caja);
    pintaLista();
  };
  function pintaLista() {
    const caja = document.getElementById('pg-lista'); if (!caja) return;
    caja.textContent = '';
    const l = visibles();
    if (!l.length) caja.appendChild(el('p', 'k-muted pg-nada', 'No hay pagos con este filtro.'));
    l.forEach(p => caja.appendChild(tarjeta(p)));
  }
})();
