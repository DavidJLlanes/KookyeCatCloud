'use strict';
/* Foto de perfil: tarjeta «Mi perfil» de Administración, avatar de la cabecera y fotos en la lista de usuarios.
   Se elige, se recorta en cuadrado (perfil-recorte.js) y el servidor la guarda a 300 × 300 en WebP, calidad 75. */
(function () {
  if (!window.K) return;
  const P = K.perfil = { v: null, nombre: '' };
  const urlDe = (nombre, v) => `${BASE}/api/perfil/avatar${nombre ? '/' + encodeURIComponent(nombre) : ''}?v=${v || 0}`;

  // Pone la foto dentro de un círculo (si falla la carga se queda la inicial)
  function pinta(nodo, nombre, v) {
    if (!nodo) return;
    nodo.textContent = String(nombre || '·').charAt(0).toUpperCase();
    if (!v) return;
    const img = el('img'); img.alt = ''; img.decoding = 'async'; img.src = urlDe(nombre === (state.user && state.user.username) ? '' : nombre, v);
    img.addEventListener('load', () => { nodo.textContent = ''; nodo.appendChild(img); });
  }

  async function carga() {
    try { const d = await K.get('/api/perfil'); P.v = (d.avatar || {}).v || null; P.nombre = d.nombre || ''; } catch { /* sin foto */ }
    return P.v;
  }
  P.cabecera = async function () {
    await carga(); pinta(document.getElementById('user-av'), state.user.username, P.v);
    const n = document.getElementById('user-name'); if (n) n.textContent = P.nombre || state.user.username;
  };

  // Fotos de todos los usuarios en la lista de Administración
  P.lista = async function () {
    try {
      const mapa = await K.get('/api/perfil/avatares');
      document.querySelectorAll('#user-list .av[data-user]').forEach(n => pinta(n, n.dataset.user, mapa[n.dataset.user]));
      const nombres = await K.get('/api/perfil/nombres');
      document.querySelectorAll('#user-list .un[data-user]').forEach(n => {
        const v = nombres[n.dataset.user]; n.textContent = '';
        n.append(el('b', null, v || n.dataset.user)); if (v) n.append(el('small', null, '@' + n.dataset.user));
      });
    } catch { /* se queda con las iniciales */ }
  };

  async function sube(archivo) {
    if (!archivo) return;
    if (K.perfil.recorta) { archivo = await K.perfil.recorta(archivo); if (!archivo) return; }     // null = cancelado
    const fd = new FormData(); fd.append('foto', archivo);
    try {
      const res = await api(`${BASE}/api/perfil/avatar`, { method: 'PUT', body: fd });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error || 'No se pudo guardar la foto');
      P.v = r.avatar.v; K.toast('Foto actualizada'); K.sonidos && K.sonidos.reproduce('ok');
      tarjeta(); P.cabecera(); if (K.game && K.game.load) K.game.load();
    } catch (e) { K.fail(e); }
  }
  async function quita() {
    if (!await K.confirm('Se quitará tu foto de perfil. La podrás volver a poner cuando quieras.', { ok: 'Quitar foto', danger: true })) return;
    try { await K.del('/api/perfil/avatar'); P.v = null; tarjeta(); P.cabecera(); } catch (e) { K.fail(e); }
  }

  function tarjeta() {
    const c = document.getElementById('perfil-card'); if (!c) return;
    const u = state.user; c.textContent = '';
    const h = el('h3'); h.append(icon('i-contact'), document.createTextNode(' Mi perfil')); c.appendChild(h);
    c.appendChild(el('p', 'card-sub', 'Tu nombre y tu foto aparecen en la cabecera y en la lista de usuarios.'));
    const fila = el('div', 'pf-fila');
    const av = el('div', 'av pf-av'); pinta(av, u.username, P.v);
    const datos = el('div', 'pf-datos'); datos.append(el('b', null, P.nombre || u.username), el('small', 'k-faint', (P.nombre ? '@' + u.username + ' · ' : '') + (u.role === 'admin' ? 'Administrador' : 'Usuario')));
    const acc = el('div', 'pf-acc');
    const input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    input.addEventListener('change', () => { sube(input.files[0]); input.value = ''; });
    const cambia = el('button', 'btn primary'); cambia.type = 'button'; cambia.textContent = P.v ? 'Cambiar foto' : 'Poner foto'; cambia.addEventListener('click', () => input.click());
    acc.append(input, cambia);
    if (P.v) { const q = el('button', 'btn'); q.type = 'button'; q.textContent = 'Quitar foto'; q.addEventListener('click', quita); acc.appendChild(q); }
    fila.append(av, datos, acc); c.appendChild(fila);
    const f = el('form', 'pf-nombre'); const lb = el('label', null, 'Tu nombre'); lb.htmlFor = 'pf-nombre-in';
    const inp = el('input'); inp.id = 'pf-nombre-in'; inp.type = 'text'; inp.maxLength = 40; inp.value = P.nombre; inp.placeholder = u.username; inp.autocomplete = 'name';
    const ok = el('button', 'btn primary'); ok.type = 'submit'; ok.textContent = 'Guardar nombre';
    f.append(lb, inp, ok);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { const r = await K.put('/api/perfil', { nombre: inp.value }); P.nombre = r.nombre; K.toast('Nombre guardado'); tarjeta(); P.cabecera(); if (document.querySelector('#user-list .un[data-user]')) P.lista(); } catch (e) { K.fail(e); }
    });
    c.appendChild(f);
  }
  P.tarjeta = async function () { await carga(); tarjeta(); };
  // Este script se carga después de arrancar la sesión: si la sesión ya estaba abierta, showApp() no encontró K.perfil
  // y la cabecera se quedó con la inicial. Se pinta ahora la foto.
  if (typeof state !== 'undefined' && state.user && !document.getElementById('app').hidden) P.cabecera();
})();
