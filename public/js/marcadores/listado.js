'use strict';
/* Marcadores web · pantalla principal: barra de herramientas, carpetas y el listado (tarjetas o lista). */
(function () {
  if (!window.K || !K.marcadores) return;
  const M = K.marcadores, S = M.S;
  const root = document.getElementById('view-marcadores');
  const btn = (texto, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (texto) b.appendChild(el('span', null, texto)); b.addEventListener('click', fn); return b; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ORDENES = { nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'), recientes: (a, b) => (b.createdAt || 0) - (a.createdAt || 0), abiertos: (a, b) => (b.visitas || 0) - (a.visitas || 0) || a.nombre.localeCompare(b.nombre, 'es') };

  function visibles() {
    const q = norm(S.q);
    return S.marcadores.filter(m => {
      if (S.carpeta === '' ? !!m.carpeta : S.carpeta !== 'todas' && m.carpeta !== S.carpeta) return false;
      const c = M.carpetaDe(m);
      return !q || [m.nombre, m.url, m.descripcion, c && c.nombre].some(t => norm(t).includes(q));
    }).sort(ORDENES[S.orden] || ORDENES.nombre);
  }

  function carpetas() {
    const caja = el('div', 'mk-carpetas');
    const chip = (id, nombre, n, color) => {
      const b = el('button', 'mk-carpeta' + (S.carpeta === id ? ' on' : '')); b.type = 'button';
      if (color) { const p = el('i', 'mk-punto'); p.style.setProperty('--c', color); b.appendChild(p); }
      b.append(el('span', null, nombre), el('small', 'k-faint', String(n)));
      b.addEventListener('click', () => { S.carpeta = id; M.pinta(); }); return b;
    };
    caja.appendChild(chip('todas', 'Todos', S.marcadores.length));
    S.carpetas.forEach(c => caja.appendChild(chip(c.id, c.nombre, S.marcadores.filter(m => m.carpeta === c.id).length, c.color)));
    const sin = S.marcadores.filter(m => !m.carpeta).length;
    if (S.carpetas.length && sin) caja.appendChild(chip('', 'Sin carpeta', sin));
    caja.appendChild(btn('Carpeta', 'i-folder-plus', () => M.editorCarpeta(null), 'btn sm'));
    const actual = S.carpetas.find(c => c.id === S.carpeta);
    if (actual) { const e = btn('', 'i-pencil', () => M.editorCarpeta(actual), 'icon-btn'); e.title = `Editar la carpeta «${actual.nombre}»`; e.setAttribute('aria-label', e.title); caja.appendChild(e); }
    return caja;
  }

  M.pinta = function () {
    if (!root || !S.cargado) return;
    root.textContent = '';
    const page = el('section', 'mk-page'); root.appendChild(page);
    const cab = el('header', 'mk-head'); const t = el('div');
    t.append(el('h1', null, 'Marcadores'), el('p', 'k-muted', 'Tus webs favoritas, con carpetas y colores'));
    cab.append(t, btn('Nuevo marcador', 'i-plus', () => M.editor(null), 'btn primary')); page.appendChild(cab);
    if (!S.marcadores.length) {
      const v = el('div', 'mk-vacio'); v.append(el('h2', null, 'Aún no tienes marcadores'), el('p', 'k-muted', 'Guarda tus webs con nombre, descripción y color. El icono de cada una se busca solo.'), btn('Añadir el primero', 'i-plus', () => M.editor(null), 'btn primary'));
      page.appendChild(v); return;
    }
    const barra = el('div', 'mk-barra');
    const busca = el('input'); busca.type = 'search'; busca.placeholder = 'Buscar por nombre, dirección o descripción…'; busca.value = S.q; busca.setAttribute('aria-label', 'Buscar marcadores');
    busca.addEventListener('input', K.debounce(() => { S.q = busca.value; pintaListado(); }, 150));
    const orden = el('select'); orden.setAttribute('aria-label', 'Ordenar');
    [['nombre', 'Por nombre'], ['recientes', 'Más recientes'], ['abiertos', 'Más abiertos']].forEach(([v, n]) => { const o = el('option', null, n); o.value = v; orden.appendChild(o); });
    orden.value = S.orden; orden.addEventListener('change', () => { S.orden = orden.value; pintaListado(); });
    const vista = el('div', 'mk-vista');
    [['tarjetas', 'i-grid', 'Tarjetas'], ['lista', 'i-list', 'Lista']].forEach(([id, ic, n]) => {
      const b = el('button', 'icon-btn' + (S.vista === id ? ' on' : '')); b.type = 'button'; b.title = n; b.setAttribute('aria-label', `Ver en ${n.toLowerCase()}`); b.setAttribute('aria-pressed', String(S.vista === id)); b.appendChild(icon(ic));
      b.addEventListener('click', () => { M.guardaVista(id); M.pinta(); }); vista.appendChild(b);
    });
    barra.append(busca, orden, vista); page.append(barra, carpetas());
    const caja = el('div', 'mk-caja'); caja.id = 'mk-caja'; page.appendChild(caja);
    pintaListado();
  };

  function pintaListado() {
    const caja = document.getElementById('mk-caja'); if (!caja) return;
    caja.textContent = ''; caja.className = 'mk-caja ' + S.vista;
    const l = visibles();
    if (!l.length) { caja.appendChild(el('p', 'k-muted mk-nada', 'No hay marcadores aquí.')); return; }
    if (S.vista === 'lista') { const t = el('div', 'mk-tabla'); t.appendChild(M.cabeceraLista()); l.forEach(m => t.appendChild(M.fila(m))); caja.appendChild(t); }
    else l.forEach(m => caja.appendChild(M.tarjeta(m)));
  }
})();
