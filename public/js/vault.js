'use strict';
/* ---------------------------------------------------------------
   Caja fuerte: carpeta cifrada con contraseña propia. Aquí solo está la interfaz; el
   cifrado ocurre en el servidor (lib/vault.js) y la clave solo vive en su memoria mientras
   la caja está desbloqueada.
--------------------------------------------------------------- */
(function () {
  const S = { built: false, estado: null, items: [], parent: '', idleMin: 15, minPass: 10, ultimo: 0, filtro: '', lockOnLeave: true, timer: null };
  try { S.lockOnLeave = localStorage.getItem('kcc-vault-leave') !== '0'; } catch {}
  const R = {};

  const EXT_ICO = { png: 'i-image', jpg: 'i-image', jpeg: 'i-image', gif: 'i-image', webp: 'i-image', avif: 'i-image', bmp: 'i-image',
    mp4: 'i-play', webm: 'i-play', mov: 'i-play', mp3: 'i-music', m4a: 'i-music', wav: 'i-music', flac: 'i-music', ogg: 'i-music', zip: 'i-zip', rar: 'i-zip', '7z': 'i-zip' };
  const ext = (n) => String(n).split('.').pop().toLowerCase();
  const icoDe = (it) => (it.type === 'folder' ? 'i-folder' : EXT_ICO[ext(it.name)] || 'i-doc');
  const url = (id, what) => `${BASE}/api/vault/items/${id}/${what}`;

  // Cualquier llamada que devuelva "bloqueada" lleva de vuelta a la pantalla de desbloqueo
  async function llama(fn) {
    try { return await fn(); }
    catch (e) {
      if (/bloquead/i.test(e.message)) { await cargaEstado(); pinta(); }
      throw e;
    }
  }
  const tocado = () => { S.ultimo = Date.now(); };

  async function cargaEstado() {
    const st = await K.get('/api/vault');
    S.idleMin = st.idleMin; S.minPass = st.minPass;
    S.estado = !st.exists ? 'nuevo' : st.unlocked ? 'abierta' : 'bloqueada';
    if (S.estado === 'abierta') tocado();
    return S.estado;
  }
  async function cargaItems() {
    const r = await llama(() => K.get('/api/vault/items'));
    S.items = r.items; tocado();
  }

  /* ---------- Estructura ---------- */
  function build() {
    const v = $('view-vault'); v.textContent = '';
    const cab = el('div', 'kv-head');
    const t = el('div'); t.append(el('h2', null, 'Caja fuerte'), el('p', 'sub', 'Archivos cifrados con una contraseña distinta a la de tu cuenta'));
    const cuerpo = el('div', 'vt-body');
    cab.append(t, el('span', 'grow'));
    R.acc = el('div', 'k-row'); cab.appendChild(R.acc);
    v.append(cab, cuerpo);
    R.cuerpo = cuerpo;
    S.built = true;
  }

  function tarjeta(icono, titulo, sub) {
    const c = el('div', 'vt-card');
    const ic = el('div', 'vt-ic'); ic.appendChild(icon(icono));
    c.append(ic, el('h3', null, titulo));
    if (sub) c.appendChild(el('p', 'k-muted', sub));
    return c;
  }
  const campoPass = (etq, ph) => { const l = el('label', 'field'); const i = el('input'); i.type = 'password'; i.placeholder = ph || ''; i.autocomplete = 'new-password'; l.append(el('span', null, etq), i); return [l, i]; };

  function pantallaNueva() {
    const c = tarjeta('i-lock', 'Crea tu caja fuerte', 'Todo lo que guardes aquí se cifra en el servidor con una clave que solo sale de tu contraseña.');
    const ul = el('ul', 'vt-list');
    ['Los nombres y el contenido están cifrados: ni siquiera el administrador del servidor puede leerlos.',
      'La caja se bloquea sola tras unos minutos sin usarla y al cerrar sesión.',
      'Si olvidas la contraseña, los archivos NO se pueden recuperar. No hay “olvidé mi contraseña”.',
      'Los archivos de la caja no salen en la búsqueda, en WebDAV ni en los enlaces compartidos.'].forEach(t => ul.appendChild(el('li', null, t)));
    c.appendChild(ul);
    const [l1, p1] = campoPass('Contraseña de la caja', `Mínimo ${S.minPass} caracteres`);
    const [l2, p2] = campoPass('Repite la contraseña');
    const sw = el('label', 'k-switch'); const ck = el('input'); ck.type = 'checkbox';
    sw.append(ck, el('span', 'track'), el('span', null, 'Entiendo que si la olvido no hay forma de recuperar lo que guarde'));
    sw.style.margin = '4px 0 16px';
    const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
    const b = el('button', 'btn primary block', 'Crear caja fuerte'); b.type = 'button';
    b.addEventListener('click', async () => {
      err.textContent = '';
      if (p1.value.length < S.minPass) { err.textContent = `La contraseña debe tener al menos ${S.minPass} caracteres`; return; }
      if (p1.value !== p2.value) { err.textContent = 'Las contraseñas no coinciden'; return; }
      if (!ck.checked) { err.textContent = 'Marca la casilla para continuar'; return; }
      b.disabled = true;
      try { await K.post('/api/vault/setup', { password: p1.value }); await entra(); }
      catch (e) { err.textContent = e.message; b.disabled = false; }
    });
    c.append(l1, l2, sw, err, b);
    R.cuerpo.appendChild(c);
    setTimeout(() => p1.focus(), 30);
  }

  function pantallaBloqueada(mensaje) {
    const c = tarjeta('i-lock', 'Caja fuerte bloqueada', mensaje || 'Escribe la contraseña de la caja para abrirla.');
    const [l, p] = campoPass('Contraseña de la caja'); p.autocomplete = 'current-password';
    const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
    const b = el('button', 'btn primary block', 'Desbloquear'); b.type = 'button';
    const ir = async () => {
      err.textContent = ''; if (!p.value) return; b.disabled = true;
      try { await K.post('/api/vault/unlock', { password: p.value }); p.value = ''; await entra(); }
      catch (e) { err.textContent = e.message; b.disabled = false; p.select(); }
    };
    b.addEventListener('click', ir);
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    c.append(l, err, b);
    R.cuerpo.appendChild(c);
    setTimeout(() => p.focus(), 30);
  }

  async function entra() { await cargaEstado(); if (S.estado === 'abierta') { S.parent = ''; await cargaItems(); } pinta(); }

  /* ---------- Caja abierta ---------- */
  const porId = (id) => S.items.find(i => i.id === id);
  function ruta() { const r = []; let c = porId(S.parent); while (c) { r.unshift(c); c = porId(c.parent); } return r; }
  const hijosDe = (id) => S.items.filter(i => i.parent === id);

  function pinta() {
    if (!S.built) return;
    R.cuerpo.textContent = ''; R.acc.textContent = '';
    if (S.estado === 'nuevo') { pantallaNueva(); return; }
    if (S.estado !== 'abierta') { pantallaBloqueada(); return; }

    // Cabecera: estado y acciones
    const chip = el('span', 'k-chip'); chip.style.setProperty('--c', '#22c55e'); chip.append(icon('i-lock'), document.createTextNode(` Desbloqueada · se cierra tras ${S.idleMin} min sin usarla`));
    chip.firstChild.style.cssText = 'width:12px;height:12px';
    const bloquear = el('button', 'btn'); bloquear.type = 'button'; bloquear.append(icon('i-lock'), el('span', null, 'Bloquear'));
    bloquear.addEventListener('click', bloqueaYa);
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots'));
    mas.addEventListener('click', () => K.menu(mas, [
      { label: S.lockOnLeave ? '✓ Bloquear al salir de esta sección' : 'Bloquear al salir de esta sección', icon: 'i-lock', onClick: () => { S.lockOnLeave = !S.lockOnLeave; try { localStorage.setItem('kcc-vault-leave', S.lockOnLeave ? '1' : '0'); } catch {} K.toast(S.lockOnLeave ? 'Se bloqueará al salir' : 'Seguirá abierta al cambiar de sección'); } },
      { label: 'Cambiar la contraseña…', icon: 'i-key', onClick: cambiaPass },
      '-', { label: 'Eliminar la caja fuerte…', icon: 'i-trash', danger: true, onClick: eliminaCaja },
    ], { align: 'end' }));
    R.acc.append(chip, bloquear, mas);

    // Barra de herramientas
    const barra = el('div', 'vt-bar');
    const migas = el('nav', 'crumbs');
    const raiz = el('button', null); raiz.append(icon('i-lock'), el('span', null, 'Caja fuerte'));
    if (!S.parent) raiz.classList.add('current'); else raiz.addEventListener('click', () => { S.parent = ''; pinta(); });
    migas.appendChild(raiz);
    ruta().forEach((c, i, arr) => { migas.appendChild(el('span', 'sep', '/')); const b = el('button', null, c.name); if (i === arr.length - 1) b.classList.add('current'); else b.addEventListener('click', () => { S.parent = c.id; pinta(); }); migas.appendChild(b); });
    barra.appendChild(migas);
    const acc = el('div', 'k-row');
    const subir = el('label', 'btn primary'); subir.style.cursor = 'pointer'; subir.append(icon('i-upload'), el('span', null, 'Subir'));
    const fi = el('input'); fi.type = 'file'; fi.multiple = true; fi.hidden = true; subir.appendChild(fi);
    fi.addEventListener('change', () => { sube([...fi.files]); fi.value = ''; });
    const carp = el('button', 'btn'); carp.type = 'button'; carp.append(icon('i-folder-plus'), el('span', null, 'Carpeta'));
    carp.addEventListener('click', nuevaCarpeta);
    const imp = el('button', 'btn'); imp.type = 'button'; imp.append(icon('i-move'), el('span', null, 'Mover desde mis archivos'));
    imp.addEventListener('click', () => importaDesdeArchivos());
    const bus = el('div', 'kv-search'); bus.style.maxWidth = '220px'; bus.appendChild(icon('i-search'));
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar en la caja…'; si.value = S.filtro; bus.appendChild(si);
    si.addEventListener('input', () => { S.filtro = si.value.trim().toLowerCase(); lista(); });
    acc.append(subir, carp, imp, bus);
    barra.appendChild(acc);
    R.cuerpo.appendChild(barra);

    R.prog = el('div', 'vt-prog'); R.prog.hidden = true; R.cuerpo.appendChild(R.prog);
    R.lista = el('div'); R.cuerpo.appendChild(R.lista);
    lista();

    // Soltar archivos para subirlos
    R.cuerpo.ondragover = (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); R.cuerpo.classList.add('drop'); } };
    R.cuerpo.ondragleave = (e) => { if (e.target === R.cuerpo) R.cuerpo.classList.remove('drop'); };
    R.cuerpo.ondrop = (e) => { e.preventDefault(); R.cuerpo.classList.remove('drop'); if (e.dataTransfer.files.length) sube([...e.dataTransfer.files]); };
  }

  function lista() {
    if (!R.lista) return;
    R.lista.textContent = '';
    let items = S.filtro ? S.items.filter(i => i.name.toLowerCase().includes(S.filtro)) : hijosDe(S.parent);
    items = [...items].sort((a, b) => (b.type === 'folder') - (a.type === 'folder') || a.name.localeCompare(b.name, 'es'));
    if (!items.length) {
      const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon('i-lock')); e.appendChild(em);
      e.append(el('h3', null, S.filtro ? 'Nada coincide' : 'Esta carpeta está vacía'), el('p', null, S.filtro ? 'Prueba con otro nombre.' : 'Sube archivos, arrástralos aquí o muévelos desde tus archivos.'));
      R.lista.appendChild(e); return;
    }
    const g = el('div', 'vt-grid');
    items.forEach(it => g.appendChild(tile(it)));
    R.lista.appendChild(g);
  }

  function tile(it) {
    const t = el('div', 'vt-tile'); t.tabIndex = 0;
    const th = el('div', 'vt-th');
    if (it.thumb) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = url(it.id, 'thumb'); th.appendChild(im); }
    else th.appendChild(icon(icoDe(it)));
    const nm = el('div', 'vt-nm', it.name); nm.title = it.name;
    const sub = el('div', 'vt-sub', it.type === 'folder' ? `${hijosDe(it.id).length} elementos` : fmtSize(it.size));
    const mas = el('button', 'vt-mas'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.setAttribute('aria-label', 'Opciones');
    t.append(th, nm, sub, mas);
    const abre = () => { tocado(); if (it.type === 'folder') { S.parent = it.id; S.filtro = ''; pinta(); } else previa(it); };
    t.addEventListener('click', (e) => { if (e.target.closest('.vt-mas')) return; abre(); });
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') abre(); });
    const menu = (anchor) => K.menu(anchor, [
      { label: it.type === 'folder' ? 'Abrir' : 'Ver', icon: 'i-external', onClick: abre },
      ...(it.type === 'file' ? [{ label: 'Descargar', icon: 'i-download', onClick: () => { location.href = url(it.id, 'file') + '?download=1'; tocado(); } }] : []),
      { label: 'Renombrar…', icon: 'i-pencil', onClick: () => renombra(it) },
      { label: 'Mover a…', icon: 'i-move', onClick: () => mueve(it) },
      { label: 'Sacar a mis archivos…', icon: 'i-upload', onClick: () => saca(it) },
      '-', { label: 'Eliminar', icon: 'i-trash', danger: true, onClick: () => elimina(it) },
    ], { align: 'end' });
    mas.addEventListener('click', (e) => { e.stopPropagation(); menu(mas); });
    t.addEventListener('contextmenu', (e) => { e.preventDefault(); menu({ x: e.clientX, y: e.clientY }); });
    return t;
  }

  /* ---------- Acciones ---------- */
  function sube(files) {
    if (!files.length) return;
    const fd = new FormData(); files.forEach(f => fd.append('files', f, f.name));
    R.prog.hidden = false; R.prog.textContent = '';
    const barra = el('div', 'vt-bar-prog'); const fill = el('i'); barra.appendChild(fill);
    const txt = el('span', null, `Cifrando y subiendo ${files.length} archivo${files.length === 1 ? '' : 's'}…`);
    R.prog.append(txt, barra);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/vault/upload?parent=${encodeURIComponent(S.parent)}`);
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) fill.style.width = Math.round(e.loaded / e.total * 100) + '%'; });
    xhr.addEventListener('load', async () => {
      R.prog.hidden = true;
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 200) { K.toast(`${j.items.length} archivo${j.items.length === 1 ? '' : 's'} guardado${j.items.length === 1 ? '' : 's'} en la caja`); await cargaItems(); pinta(); }
      else if (xhr.status === 423) { await cargaEstado(); pinta(); }
      else K.toast(j.error || 'No se pudo subir');
    });
    xhr.addEventListener('error', () => { R.prog.hidden = true; K.toast('Error de conexión'); });
    xhr.send(fd); tocado();
  }

  async function nuevaCarpeta() {
    const n = await K.ask('Nueva carpeta', { placeholder: 'Nombre', ok: 'Crear' });
    if (!n) return;
    try { await llama(() => K.post('/api/vault/folders', { name: n, parent: S.parent })); await cargaItems(); pinta(); } catch (e) { K.fail(e); }
  }
  async function renombra(it) {
    const n = await K.ask('Renombrar', { value: it.name, ok: 'Guardar' });
    if (!n || n === it.name) return;
    try { await llama(() => K.put('/api/vault/items/' + it.id, { name: n })); await cargaItems(); pinta(); } catch (e) { K.fail(e); }
  }
  function mueve(it) {
    const carpetas = S.items.filter(i => i.type === 'folder' && i.id !== it.id);
    const prohibido = new Set([it.id]);
    const baja = (id) => S.items.filter(i => i.parent === id).forEach(h => { prohibido.add(h.id); baja(h.id); });
    if (it.type === 'folder') baja(it.id);
    const cont = el('div'); let m;
    const fila = (id, nombre, nivel) => {
      const b = el('button', 'btn'); b.type = 'button'; b.style.cssText = `width:100%;justify-content:flex-start;margin-bottom:6px;padding-left:${12 + nivel * 18}px`;
      b.append(icon(id ? 'i-folder' : 'i-lock'), document.createTextNode(' ' + nombre));
      b.addEventListener('click', async () => { m.close(); try { await llama(() => K.put('/api/vault/items/' + it.id, { parent: id })); await cargaItems(); pinta(); } catch (e) { K.fail(e); } });
      cont.appendChild(b);
    };
    fila('', 'Caja fuerte (raíz)', 0);
    const rec = (padre, n) => carpetas.filter(c => c.parent === padre && !prohibido.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(c => { fila(c.id, c.name, n); rec(c.id, n + 1); });
    rec('', 1);
    m = K.modal({ title: 'Mover a…', sub: it.name, content: cont, actions: [{ label: 'Cancelar' }] });
  }
  async function elimina(it) {
    const n = it.type === 'folder' ? `la carpeta “${it.name}” y todo lo que contiene` : `“${it.name}”`;
    if (!await K.confirm(`Se eliminará ${n} para siempre. No va a ninguna papelera.`, { ok: 'Eliminar', danger: true })) return;
    try { await llama(() => K.del('/api/vault/items/' + it.id)); await cargaItems(); pinta(); } catch (e) { K.fail(e); }
  }

  // Navegador sencillo de tus archivos (para elegir qué cifrar o a dónde sacar algo)
  function navegador({ titulo, sub, modo, ok, onElige }) {
    const w = el('div'); let dir = ''; const sel = new Set(); let m;
    const migas = el('div', 'k-row'); migas.style.cssText = 'margin-bottom:10px;font-size:13px;color:var(--muted)';
    const lista = el('div'); lista.style.cssText = 'max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:12px';
    w.append(migas, lista);
    const pinta2 = async () => {
      migas.textContent = '';
      const partes = dir.split('/').filter(Boolean);
      const inicio = el('button', 'btn ghost tiny', 'Inicio'); inicio.type = 'button'; inicio.addEventListener('click', () => { dir = ''; pinta2(); }); migas.appendChild(inicio);
      let acum = ''; partes.forEach(p => { acum += (acum ? '/' : '') + p; const a = acum; migas.appendChild(document.createTextNode('/')); const b = el('button', 'btn ghost tiny', p); b.type = 'button'; b.addEventListener('click', () => { dir = a; pinta2(); }); migas.appendChild(b); });
      lista.textContent = '';
      try {
        const r = await K.get('/api/files?' + K.qs({ path: dir }));
        const items = modo === 'carpeta' ? r.items.filter(i => i.isDir) : r.items;
        if (!items.length) lista.appendChild(el('p', 'k-faint', modo === 'carpeta' ? 'No hay subcarpetas aquí.' : 'Esta carpeta está vacía.')).style.padding = '14px';
        items.forEach(i => {
          const rel = (dir ? dir + '/' : '') + i.name;
          const f = el('div', 'k-row'); f.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:nowrap';
          if (modo === 'archivos') { const ck = el('input'); ck.type = 'checkbox'; ck.style.cssText = 'width:18px;height:18px;flex:none'; ck.checked = sel.has(rel); ck.addEventListener('change', () => { if (ck.checked) sel.add(rel); else sel.delete(rel); cuenta(); }); f.appendChild(ck); }
          const b = el('button', 'btn ghost'); b.type = 'button'; b.style.cssText = 'flex:1;justify-content:flex-start;min-width:0'; b.append(icon(i.isDir ? 'i-folder' : 'i-doc'), el('span', null, i.name));
          if (i.isDir) b.addEventListener('click', () => { dir = rel; pinta2(); }); else b.style.cursor = 'default';
          f.appendChild(b); if (!i.isDir) f.appendChild(el('small', 'k-faint', fmtSize(i.size)));
          lista.appendChild(f);
        });
      } catch (e) { K.fail(e); }
    };
    const cuenta = () => { if (m && m.buttons.go && modo === 'archivos') { m.buttons.go.disabled = !sel.size; m.buttons.go.textContent = sel.size ? `${ok} (${sel.size})` : ok; } };
    m = K.modal({ title: titulo, sub, content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { id: 'go', label: ok, primary: true, onClick: async () => { return await onElige(modo === 'carpeta' ? dir : [...sel]); } }] });
    if (modo === 'archivos') m.buttons.go.disabled = true;
    pinta2();
    return m;
  }

  function importaDesdeArchivos() {
    navegador({ titulo: 'Mover a la caja fuerte', sub: 'Se cifran y se borran de tus archivos normales', modo: 'archivos', ok: 'Cifrar y mover',
      onElige: async (rutas) => {
        if (!rutas.length) return false;
        try { const r = await llama(() => K.post('/api/vault/import', { paths: rutas, parent: S.parent })); K.toast(`${r.moved} elemento${r.moved === 1 ? '' : 's'} movido${r.moved === 1 ? '' : 's'} a la caja`); K.bus.emit('files'); await cargaItems(); pinta(); }
        catch (e) { K.fail(e); return false; }
      } });
  }
  function saca(it) {
    navegador({ titulo: 'Sacar a mis archivos', sub: `“${it.name}” se descifrará en la carpeta que elijas`, modo: 'carpeta', ok: 'Sacar aquí',
      onElige: async (dest) => {
        // null = cerró el cuadro sin elegir: no se hace nada
        const mover = await new Promise((res) => {
          let elegido = null;
          K.modal({ title: 'Sacar de la caja', sub: '¿Qué hago con la copia cifrada? Si la conservas, quedará también una copia SIN cifrar en tus archivos.',
            onClose: () => res(elegido),
            actions: [{ label: 'Conservar copia en la caja', onClick: () => { elegido = false; } }, { label: 'Quitar de la caja', primary: true, onClick: () => { elegido = true; } }] });
        });
        if (mover === null) return false;
        try { await llama(() => K.post('/api/vault/export', { ids: [it.id], dest, move: mover })); K.toast('Archivo descifrado en tus archivos'); K.bus.emit('files'); await cargaItems(); pinta(); }
        catch (e) { K.fail(e); return false; }
      } });
  }

  /* ---------- Vista previa ---------- */
  async function previa(it) {
    const cont = el('div'); cont.style.cssText = 'display:grid;place-items:center;min-height:200px';
    const e = ext(it.name); const u = url(it.id, 'file');
    if (/^(png|jpe?g|gif|webp|avif|bmp)$/.test(e)) { const im = el('img'); im.src = u; im.alt = it.name; im.style.cssText = 'max-width:100%;max-height:70dvh;border-radius:12px'; cont.appendChild(im); }
    else if (e === 'pdf') { const f = el('iframe'); f.src = u; f.style.cssText = 'width:100%;height:70dvh;border:0;border-radius:12px;background:#fff'; cont.appendChild(f); }
    else if (/^(mp4|webm|mov)$/.test(e)) { const v = el('video'); v.controls = true; v.src = u; v.style.cssText = 'max-width:100%;max-height:70dvh;border-radius:12px'; cont.appendChild(v); }
    else if (/^(mp3|m4a|wav|flac|ogg)$/.test(e)) { const a = el('audio'); a.controls = true; a.src = u; cont.appendChild(a); }
    else if (/^(txt|md|csv|json|log)$/.test(e)) {
      try { const r = await api(u); const t = await r.text(); const pre = el('pre'); pre.textContent = t.slice(0, 200000); pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0;width:100%;max-height:65dvh;overflow:auto;font-size:13px'; cont.appendChild(pre); }
      catch (er) { K.fail(er); return; }
    } else { cont.appendChild(el('p', 'k-muted', 'No hay vista previa para este tipo de archivo. Puedes descargarlo.')); }
    K.modal({ title: it.name, sub: fmtSize(it.size), content: cont, cls: 'xl', actions: [
      { label: 'Descargar', onClick: () => { location.href = u + '?download=1'; return false; }, close: false },
      { label: 'Cerrar', primary: true },
    ] });
    tocado();
  }

  /* ---------- Cuenta de la caja ---------- */
  async function bloqueaYa() { try { await K.post('/api/vault/lock'); } catch {} S.estado = 'bloqueada'; S.items = []; pinta(); }
  function cambiaPass() {
    const [l0, p0] = campoPass('Contraseña actual'); p0.autocomplete = 'current-password';
    const [l1, p1] = campoPass('Contraseña nueva', `Mínimo ${S.minPass} caracteres`);
    const [l2, p2] = campoPass('Repite la nueva');
    const w = el('div'); w.append(l0, l1, l2);
    K.modal({ title: 'Cambiar la contraseña', sub: 'Los archivos no se vuelven a cifrar: solo cambia la llave que los abre.', content: w, actions: [{ label: 'Cancelar' }, { label: 'Cambiar', primary: true, onClick: async () => {
      if (p1.value !== p2.value) { K.toast('Las contraseñas nuevas no coinciden'); return false; }
      try { await K.post('/api/vault/password', { password: p0.value, newPassword: p1.value }); K.toast('Contraseña cambiada'); } catch (e) { K.fail(e); return false; }
    } }] });
  }
  async function eliminaCaja() {
    const [l, p] = campoPass('Contraseña de la caja'); p.autocomplete = 'current-password';
    const w = el('div'); w.append(el('p', 'k-muted', 'Se borrarán TODOS los archivos cifrados. No se puede deshacer ni recuperar.'), l);
    w.firstChild.style.cssText = 'margin:0 0 14px;font-size:13.5px';
    K.modal({ title: 'Eliminar la caja fuerte', content: w, actions: [{ label: 'Cancelar' }, { label: 'Eliminar para siempre', danger: true, onClick: async () => {
      try { await K.http('DELETE', '/api/vault', { password: p.value }); K.toast('Caja fuerte eliminada'); await cargaEstado(); pinta(); } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Integración ---------- */
  // Desde el menú de un archivo: pide la contraseña si hace falta y mueve lo elegido a la caja
  window.KCC.toVault = async function (rutas) {
    try { await cargaEstado(); } catch (e) { K.fail(e); return; }
    if (S.estado === 'nuevo') { K.toast('Primero crea tu caja fuerte'); switchTab('vault'); return; }
    if (S.estado !== 'abierta') {
      const ok = await new Promise((res) => {
        const [l, p] = campoPass('Contraseña de la caja'); p.autocomplete = 'current-password';
        let hecho = false;
        const m = K.modal({ title: 'Desbloquear la caja fuerte', content: l, onClose: () => { if (!hecho) res(false); }, actions: [{ label: 'Cancelar' }, { label: 'Desbloquear', primary: true, onClick: async () => {
          try { await K.post('/api/vault/unlock', { password: p.value }); hecho = true; res(true); } catch (e) { K.fail(e); return false; }
        } }] });
        p.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.buttons.go && m.buttons.go.click(); });
        setTimeout(() => p.focus(), 30);
      });
      if (!ok) return;
    }
    if (!await K.confirm(`Se cifrarán ${rutas.length === 1 ? 'este elemento' : rutas.length + ' elementos'} y se borrarán de tus archivos normales.`, { ok: 'Mover a la caja' })) return;
    try { const r = await K.post('/api/vault/import', { paths: rutas, parent: '' }); K.toast(`${r.moved} movido${r.moved === 1 ? '' : 's'} a la caja fuerte`); K.bus.emit('files'); if (typeof refresh === 'function') refresh(); }
    catch (e) { K.fail(e); }
  };

  K.registerView('vault', {
    async open() {
      if (!S.built) build();
      R.cuerpo.textContent = ''; R.cuerpo.appendChild(el('p', 'k-faint', 'Cargando…'));
      try { await cargaEstado(); if (S.estado === 'abierta') await cargaItems(); } catch (e) { K.fail(e); }
      pinta();
      clearInterval(S.timer);
      // Si se bloquea sola por inactividad, se refleja sin esperar a que el usuario pulse algo
      S.timer = setInterval(async () => {
        if (S.estado !== 'abierta' || $('view-vault').hidden) return;
        if (Date.now() - S.ultimo > S.idleMin * 60000 - 5000) { try { await cargaEstado(); if (S.estado !== 'abierta') { S.items = []; pinta(); } } catch {} }
      }, 20000);
    },
    close() {
      clearInterval(S.timer);
      if (S.estado === 'abierta' && S.lockOnLeave) { K.post('/api/vault/lock').catch(() => {}); S.estado = 'bloqueada'; S.items = []; }
    },
  });
})();
