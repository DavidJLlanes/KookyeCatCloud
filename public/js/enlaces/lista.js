'use strict';
/* Enlaces · pantalla principal: resumen, buscador, filtros y tarjetas de los enlaces creados. */
(function () {
  if (!window.K || !K.enlaces) return;
  const E = K.enlaces, S = E.S;
  const root = document.getElementById('view-enlaces');
  let caja = null;     // { resumen, tipos, estados, lista, buscador, limpiar }

  const boton = (texto, ic, fn, cls = 'btn sm') => {
    const b = el('button', cls); b.type = 'button';
    if (ic) b.appendChild(icon(ic));
    if (texto) b.appendChild(el('span', null, texto));
    b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
    return b;
  };
  const chip = (texto, cls = '') => el('span', 'en-chip ' + cls, texto);

  function esqueleto() {
    root.textContent = '';
    const page = el('div', 'en-page');
    const cab = el('div', 'en-head');
    const tit = el('div'); tit.append(el('h1', null, 'Enlaces'), el('p', 'k-faint', 'Todos los enlaces públicos que has creado: ver, copiar, cambiar la caducidad o la contraseña y revocarlos.'));
    const acc = el('div', 'en-head-acc');
    const limpiar = boton('Quitar caducados', 'i-trash', () => E.limpiaCaducados());
    const refresca = boton('Actualizar', 'i-refresh', () => E.carga().then(E.pinta).catch(K.fail));
    acc.append(limpiar, refresca); cab.append(tit, acc);
    const resumen = el('div', 'en-resumen');
    const buscador = el('input'); buscador.type = 'search'; buscador.placeholder = 'Buscar por nombre, carpeta o código…'; buscador.setAttribute('aria-label', 'Buscar enlaces'); buscador.value = S.q;
    buscador.addEventListener('input', () => { S.q = buscador.value; pintaLista(); });
    const tipos = el('div', 'en-tabs'), estados = el('div', 'en-tabs');
    const barra = el('div', 'en-barra'); barra.append(buscador);
    const lista = el('div', 'en-lista');
    page.append(cab, resumen, barra, tipos, estados, lista);
    root.appendChild(page);
    caja = { resumen, tipos, estados, lista, buscador, limpiar };
  }

  function pintaResumen() {
    const c = E.cuentas();
    caja.resumen.textContent = '';
    const dato = (titulo, valor, sub, cls = '') => { const d = el('div', 'en-dato ' + cls); d.append(el('span', 'k-faint', titulo), el('b', null, String(valor)), el('small', 'k-faint', sub)); return d; };
    caja.resumen.append(
      dato('Activos', c.activos, c.perpetuos ? `${c.perpetuos} sin caducidad` : 'Todos con caducidad'),
      dato('Caducados', c.caducados, c.caducados ? 'Ya no funcionan' : 'Ninguno', c.caducados ? 'aviso' : ''),
      dato('Descargas', c.descargas, 'En enlaces de descarga'),
      dato('Recibidos', c.recibidos, 'Archivos por enlaces de subida'),
    );
    caja.limpiar.hidden = !c.caducados;
  }

  function pintaFiltros() {
    const fila = (cont, lista, clave, cuenta) => {
      cont.textContent = '';
      for (const [v, t] of lista) {
        const b = el('button', 'en-tab' + (S[clave] === v ? ' on' : ''), cuenta ? `${t} · ${cuenta(v)}` : t); b.type = 'button';
        b.addEventListener('click', () => { S[clave] = v; pintaFiltros(); pintaLista(); });
        cont.appendChild(b);
      }
    };
    fila(caja.tipos, E.TIPOS, 'tipo', (v) => (v === 'todos' ? S.links.length : S.links.filter(l => l.kind === v).length));
    fila(caja.estados, E.ESTADOS, 'estado');
  }

  function tarjeta(l) {
    const c = el('article', 'en-card ' + (l.expired ? 'caducado' : l.expiresAt ? 'activo' : 'perpetuo')); c.dataset.id = l.id;
    const cab = el('div', 'en-cab');
    const ic = el('span', 'en-ic'); ic.appendChild(icon(E.ICONO[l.kind] || 'i-link'));
    const tit = el('div', 'en-tit');
    tit.appendChild(el('b', null, l.label));
    const chips = el('div', 'en-chips');
    chips.appendChild(chip(E.NOMBRE[l.kind] || 'Enlace'));
    if (l.expired) chips.appendChild(chip('Caducado', 'mal'));
    else if (!l.expiresAt) chips.appendChild(chip('Sin caducidad', 'aviso'));
    if (l.protegido) { const p = chip('Con contraseña', 'ok'); p.prepend(icon('i-lock')); chips.appendChild(p); }
    if (l.qr > 0) chips.appendChild(chip('QR descargado'));
    tit.appendChild(chips); cab.append(ic, tit);
    const meta = el('div', 'en-meta');
    meta.append(el('span', null, E.destinoTxt(l)), el('span', null, `${E.usoTxt(l)} · ${E.caducidadTxt(l)}`), el('span', 'k-faint', 'Creado el ' + E.fecha(l.createdAt || Date.now())));
    const url = el('button', 'en-url'); url.type = 'button'; url.title = 'Copiar enlace'; url.textContent = E.urlDe(l);
    url.addEventListener('click', (ev) => { ev.stopPropagation(); E.copiar(l); });
    const acc = el('div', 'en-acc');
    acc.append(boton('Copiar', 'i-copy', () => E.copiar(l)), boton('Abrir', 'i-external', () => E.abrir(l)), boton('QR', 'i-grid', () => E.qr(l)),
      boton('Caducidad', 'i-clock', () => E.caducidad(l)));
    if (l.kind === 'share') acc.appendChild(boton(l.protegido ? 'Contraseña' : 'Proteger', 'i-lock', () => E.clave(l)));
    acc.append(boton('Nombre', 'i-pencil', () => E.renombra(l)), boton('Revocar', 'i-trash', () => E.revoca(l), 'btn sm danger'));
    c.append(cab, meta, url, acc);
    if (K.deslizar) K.deslizar(c, { alBorrar: () => E.revoca(l), etiqueta: 'Revocar' });
    return c;
  }

  function pintaLista() {
    const v = E.visibles();
    caja.lista.textContent = '';
    if (!S.links.length) {
      const vacio = el('div', 'en-vacio');
      vacio.append(el('p', null, 'Todavía no has creado ningún enlace.'), el('p', 'k-faint', 'En Archivos, selecciona un archivo o una carpeta y pulsa «Enlace» para compartirlo. Los enlaces de subida se crean en Cuenta.'));
      vacio.appendChild(boton('Ir a Archivos', 'i-folder', () => switchTab('files'), 'btn primary'));
      caja.lista.appendChild(vacio); return;
    }
    if (!v.length) { caja.lista.appendChild(el('p', 'en-nada k-faint', 'Ningún enlace coincide con el filtro.')); return; }
    v.forEach(l => caja.lista.appendChild(tarjeta(l)));
  }

  E.pinta = () => { if (!caja || !root.contains(caja.lista)) esqueleto(); pintaResumen(); pintaFiltros(); pintaLista(); };
})();
