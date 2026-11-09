'use strict';
/* Marcadores web · cómo se dibuja un marcador: tarjeta (icono y nombre) y fila de la lista (todos los campos). */
(function () {
  if (!window.K || !K.marcadores) return;
  const M = K.marcadores;
  const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const editar = (m) => { const b = el('button', 'icon-btn mk-edit'); b.type = 'button'; b.title = 'Editar'; b.setAttribute('aria-label', `Editar ${m.nombre}`); b.appendChild(icon('i-pencil')); b.addEventListener('click', (ev) => { ev.stopPropagation(); M.editor(m); }); return b; };
  const enlace = (m, cls) => { const a = el('a', cls); a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = m.url; a.addEventListener('click', (ev) => { if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) { ev.preventDefault(); M.abre(m); } }); return a; };

  // Tarjeta: favicon y nombre de la web
  M.tarjeta = function (m) {
    const c = el('div', 'mk-card'); if (m.color) c.style.setProperty('--c', m.color);
    const a = enlace(m, 'mk-card-a'); a.append(M.icono(m, 'grande'), el('span', 'mk-nombre', m.nombre));
    c.append(a, editar(m));
    return c;
  };

  // Fila de la lista: todos los campos; la tabla se desliza de lado y la primera columna queda fija
  const COLUMNAS = [['Nombre', 'mk-c-nombre'], ['Dirección', 'mk-c-url'], ['Descripción', 'mk-c-desc'], ['Carpeta', 'mk-c-carp'], ['Visitas', 'mk-c-vis'], ['Añadido', 'mk-c-fecha']];
  M.cabeceraLista = function () { const h = el('div', 'mk-fila mk-fila-cab'); COLUMNAS.forEach(([n, c]) => h.appendChild(el('div', 'mk-celda ' + c, n))); return h; };
  M.fila = function (m) {
    const f = el('div', 'mk-fila'); if (m.color) f.style.setProperty('--c', m.color);
    const nombre = el('div', 'mk-celda mk-c-nombre');
    const a = enlace(m, 'mk-fila-a'); a.append(M.icono(m), el('span', 'mk-nombre', m.nombre));
    nombre.append(a, editar(m));
    const url = el('div', 'mk-celda mk-c-url', M.anfitrion(m.url) + (m.url.replace(/^https?:\/\/[^/]+/, '').length > 1 ? '…' : '')); url.title = m.url;
    const carp = M.carpetaDe(m), cel = el('div', 'mk-celda mk-c-carp');
    if (carp) { const p = el('span', 'mk-pastilla', carp.nombre); if (carp.color) p.style.setProperty('--c', carp.color); cel.appendChild(p); }
    f.append(nombre, url, el('div', 'mk-celda mk-c-desc', m.descripcion || ''), cel, el('div', 'mk-celda mk-c-vis', String(m.visitas || 0)), el('div', 'mk-celda mk-c-fecha', fecha(m.createdAt)));
    return f;
  };
})();
