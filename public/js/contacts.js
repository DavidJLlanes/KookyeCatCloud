'use strict';
/* ---------------------------------------------------------------
   Contactos al estilo Google Contacts: nombre, empresa y cargo, varios teléfonos, correos,
   direcciones, webs y fechas (cumpleaños, aniversario…), notas, etiquetas de color compartidas
   y favoritos. Buscador, lista agrupada por letra, ficha y editor. Importa y exporta .vcf.
--------------------------------------------------------------- */
(function () {
  const ETQ = {
    phones: ['Móvil', 'Trabajo', 'Casa', 'Principal', 'Fax', 'Otro'],
    emails: ['Personal', 'Trabajo', 'Otro'],
    addresses: ['Casa', 'Trabajo', 'Otro'],
    websites: ['Personal', 'Trabajo', 'Otro'],
    dates: ['Cumpleaños', 'Aniversario', 'Otra'],
  };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const S = { sel: new Set(), selMode: false, built: false, items: [], loaded: false, q: '', label: '', fav: false, sort: 'first', max: 10000 };
  const R = {};
  try { S.sort = localStorage.getItem('kcc-ct-sort') || 'first'; } catch { /* sin almacenamiento */ }

  /* ---------- Utilidades ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const digitos = (s) => String(s || '').replace(/\D/g, '');
  const nombre = (c) => [c.first, c.middle, c.last].filter(Boolean).join(' ').trim() || c.company
    || (c.emails[0] || {}).value || (c.phones[0] || {}).value || 'Sin nombre';
  const claveOrden = (c) => norm(S.sort === 'last' ? [c.last || c.first || c.company, c.first, c.middle].filter(Boolean).join(' ') : nombre(c));
  const letraDe = (c) => { const ch = claveOrden(c).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; };
  const principal = (c) => [c.company, c.title].filter(Boolean).join(' · ');

  function iniciales(c) {
    const a = (c.first || '').trim(), b = (c.last || '').trim();
    if (a && b) return (a[0] + b[0]).toUpperCase();
    const n = nombre(c).replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const w = n.split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : (w[0] || '').charAt(1))).toUpperCase();
  }
  function colorDe(c) {
    let h = 0; const s = c.id || nombre(c);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return `hsl(${h} 58% 46%)`;
  }
  function avatar(c, tam) {
    const a = el('div', 'ct-av');
    a.style.setProperty('--c', colorDe(c));
    if (c.photo) {
      const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.draggable = false;
      im.src = `${BASE}/api/contacts/${c.id}/photo?v=${c.photo}`;
      im.addEventListener('error', () => { im.remove(); a.textContent = iniciales(c); });
      a.appendChild(im);
    } else a.textContent = iniciales(c);
    if (tam) a.style.setProperty('--s', tam + 'px');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  // 1990-03-15 -> "15 de marzo de 1990"; --03-15 -> "15 de marzo"
  function fmtFecha(f) {
    const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(f || '');
    if (!m) return f || '';
    return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}${m[1] ? ' de ' + m[1] : ''}`;
  }
  // Solo http(s): una web guardada como "javascript:…" no debe poder ejecutarse al pulsarla
  function urlSegura(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    const u = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
    return /^https?:\/\//i.test(u) ? u : '';
  }
  const telHref = (v) => 'tel:' + String(v).replace(/[^\d+*#,;]/g, '');
  const direccionTexto = (a) => [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ');

  /* ---------- Datos ---------- */
  async function load() {
    try {
      const r = await K.get('/api/contacts');
      S.items = r.contacts; S.max = r.max || S.max; S.loaded = true;
    } catch (e) { K.fail(e); }
    render();
  }

  // Contacto en Markdown (para .md, .txt y .pdf)
  function contactoMd(c) {
    const cargo = [c.title, c.department, c.company].filter(Boolean).join(' · ');
    const L = [`## ${nombre(c)}`];
    if (c.nickname) L.push(`“${c.nickname}”`);
    if (cargo && cargo !== nombre(c)) L.push(cargo);
    const lin = (et, arr) => (arr || []).forEach(x => L.push(`- ${et}${x.label || x.type ? ' (' + (x.label || x.type) + ')' : ''}: ${x.value}`));
    L.push('');
    lin('Teléfono', c.phones); lin('Correo', c.emails); lin('Web', c.websites);
    (c.addresses || []).forEach(a => L.push(`- Dirección${a.label || a.type ? ' (' + (a.label || a.type) + ')' : ''}: ${direccionTexto(a)}`));
    if (c.birthday) L.push(`- Cumpleaños: ${c.birthday}`);
    if (c.notes) L.push('', c.notes);
    return L.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  const contactosMd = (lista, titulo) => `# ${titulo}\n\n` + lista.map(contactoMd).join('\n\n');
  function exportaDoc(lista, titulo) {
    return () => (lista().length ? { titulo, nombre: titulo.toLowerCase(), md: contactosMd(lista(), titulo) } : (K.toast('No hay contactos que exportar'), null));
  }

  function filtrados() {
    const q = norm(S.q), qd = digitos(S.q);
    let l = S.items;
    if (S.fav) l = l.filter(c => c.favorite);
    if (S.label) l = l.filter(c => (c.labels || []).includes(S.label));
    if (q) {
      l = l.filter((c) => {
        const hay = norm([nombre(c), c.nickname, c.company, c.title, c.department, c.notes,
          ...c.emails.map(e => e.value), ...c.websites.map(w => w.value), ...c.addresses.map(direccionTexto)].join(' '));
        return hay.includes(q) || (qd.length >= 3 && c.phones.some(p => digitos(p.value).includes(qd)));
      });
    }
    return l.slice().sort((a, b) => claveOrden(a).localeCompare(claveOrden(b), 'es'));
  }

  /* ---------- Vista ---------- */
  function build() {
    const v = $('view-contacts');
    v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); const sub = el('p', 'sub', ''); t.append(el('h2', null, 'Contactos'), sub);
    const search = el('div', 'kv-search'); search.appendChild(icon('i-search'));
    const si = el('input'); si.type = 'search'; si.placeholder = 'Buscar por nombre, teléfono, correo…  ( / )'; si.autocomplete = 'off'; search.appendChild(si);
    const nuevo = el('button', 'btn primary'); nuevo.type = 'button'; nuevo.append(icon('i-plus'), el('span', 'lbl', 'Nuevo contacto'));
    const mas = el('button', 'btn ghost icon'); mas.type = 'button'; mas.appendChild(icon('i-dots')); mas.title = 'Importar, exportar y más';
    head.append(t, el('span', 'grow'), search, nuevo, mas);

    const wrap = el('div', 'pr');
    const rail = el('aside', 'pr-rail');
    const main = el('section', 'pr-main');
    const tools = el('div', 'pr-tools');
    const railBtn = el('button', 'btn sm pr-railbtn'); railBtn.type = 'button'; railBtn.append(icon('i-sidebar'), el('span', null, 'Etiquetas'));
    railBtn.addEventListener('click', () => { wrap.classList.toggle('rail-open'); railBtn.classList.toggle('is-on'); });
    const sort = el('select');
    for (const [val, txt] of [['first', 'Ordenar por nombre'], ['last', 'Ordenar por apellido']]) { const o = el('option', null, txt); o.value = val; sort.appendChild(o); }
    sort.value = S.sort;
    const count = el('span', 'pr-count');
    const selb = el('button', 'btn sm'); selb.type = 'button'; selb.append(icon('i-check-square'), el('span', null, 'Seleccionar'));
    selb.addEventListener('click', () => { S.selMode = !S.selMode; if (!S.selMode) S.sel.clear(); selb.classList.toggle('is-on', S.selMode); render(); });
    const barra = el('div', 'ct-selbar'); barra.hidden = true;
    tools.append(railBtn, sort, selb, count);
    const content = el('div', 'ct-content');
    main.append(tools, barra, content);
    wrap.append(rail, main);
    v.append(head, wrap);
    Object.assign(R, { sub, rail, content, count, si, wrap, barra, selb });

    si.addEventListener('input', K.debounce(() => { S.q = si.value.trim(); render(); }, 150));
    sort.addEventListener('change', () => { S.sort = sort.value; try { localStorage.setItem('kcc-ct-sort', S.sort); } catch { /* sin almacenamiento */ } render(); });
    nuevo.addEventListener('click', () => openEditor(null));
    mas.addEventListener('click', () => K.menu(mas, [
      { label: 'Importar contactos (.vcf)…', icon: 'i-upload', onClick: pideImportar },
      { label: 'Exportar todos (.vcf)', icon: 'i-download', onClick: () => { if (!S.items.length) { K.toast('No hay contactos que exportar'); return; } location.href = BASE + '/api/contacts/export'; } },
      ...K.doc.items(exportaDoc(() => (S.sel.size ? S.items.filter(c => S.sel.has(c.id)) : filtrados()), 'Contactos')),
      '-', { label: 'Gestionar etiquetas…', icon: 'i-tag', onClick: () => K.manageLabels() },
    ], { align: 'end' }));
    document.addEventListener('keydown', (e) => {
      if ($('view-contacts').hidden || e.target.closest('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); si.focus(); }
      else if (e.key === 'n' && !document.querySelector('.overlay')) { e.preventDefault(); openEditor(null); }
    });
    S.built = true;
  }

  function link({ ic, name, n, on, color, onClick }) {
    const b = el('div', 'pr-link' + (on ? ' is-on' : ''));
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    if (color) b.style.setProperty('--c', color);
    const em = el('span', 'em');
    if (ic) em.appendChild(icon(ic)); else { const d = el('span', 'k-dot'); d.style.setProperty('--c', color || '#64748b'); em.appendChild(d); }
    b.append(em, el('span', 'nm', name));
    if (n !== undefined) b.appendChild(el('span', 'n', String(n)));
    b.addEventListener('click', onClick);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
    return b;
  }

  function pintaRail() {
    const rail = R.rail; rail.textContent = '';
    const uso = {};
    S.items.forEach(c => (c.labels || []).forEach(l => { uso[l] = (uso[l] || 0) + 1; }));
    const sec1 = el('div', 'pr-sec'); sec1.appendChild(el('h4', null, 'Contactos'));
    const nav = el('div', 'pr-nav');
    const ir = (fav, label) => () => { S.fav = fav; S.label = label; R.wrap.classList.remove('rail-open'); render(); };
    nav.append(
      link({ ic: 'i-contact', name: 'Todos', n: S.items.length, on: !S.fav && !S.label, onClick: ir(false, '') }),
      link({ ic: 'i-star', name: 'Favoritos', n: S.items.filter(c => c.favorite).length, on: S.fav, onClick: ir(true, '') }),
    );
    sec1.appendChild(nav); rail.appendChild(sec1);

    const sec2 = el('div', 'pr-sec');
    const h = el('h4'); h.appendChild(el('span', null, 'Etiquetas'));
    const gest = el('button'); gest.type = 'button'; gest.title = 'Gestionar etiquetas'; gest.appendChild(icon('i-pencil'));
    gest.addEventListener('click', () => K.manageLabels()); h.appendChild(gest); sec2.appendChild(h);
    const nav2 = el('div', 'pr-nav');
    const usadas = K.labels.list.filter(l => uso[l.id]);
    usadas.forEach(l => nav2.appendChild(link({ name: l.name, color: l.color, n: uso[l.id], on: S.label === l.id, onClick: ir(false, S.label === l.id ? '' : l.id) })));
    if (!usadas.length) nav2.appendChild(el('p', 'k-faint', 'Ponles etiquetas a tus contactos para agruparlos.')).style.cssText = 'margin:4px 6px;font-size:12.5px';
    sec2.appendChild(nav2); rail.appendChild(sec2);
  }

  function vacio(hayFiltro) {
    const e = el('div', 'k-empty'); const em = el('div', 'em'); em.appendChild(icon('i-contact'));
    e.append(em);
    if (hayFiltro) {
      e.append(el('h3', null, 'Ningún contacto coincide'), el('p', null, 'Prueba con otra búsqueda o quita el filtro.'));
    } else {
      e.append(el('h3', null, 'Aún no tienes contactos'), el('p', null, 'Añade el primero o importa un archivo .vcf de Google Contacts, iCloud o tu móvil.'));
      const fila = el('div', 'k-row'); fila.style.justifyContent = 'center';
      const a = el('button', 'btn primary'); a.type = 'button'; a.append(icon('i-plus'), el('span', null, 'Nuevo contacto')); a.addEventListener('click', () => openEditor(null));
      const b = el('button', 'btn'); b.type = 'button'; b.append(icon('i-upload'), el('span', null, 'Importar .vcf')); b.addEventListener('click', pideImportar);
      fila.append(a, b); e.appendChild(fila);
    }
    return e;
  }

  function fila(c) {
    const r = el('div', 'ct-row'); r.setAttribute('role', 'button'); r.tabIndex = 0;
    const quien = el('div', 'ct-who'); quien.appendChild(avatar(c, 38));
    const nm = el('div', 'ct-nm'); nm.appendChild(el('b', null, nombre(c)));
    // En pantallas estrechas las columnas se esconden y esta línea recoge lo más útil
    const resumen = principal(c) || (c.emails[0] || {}).value || (c.phones[0] || {}).value || '';
    if (resumen) nm.appendChild(el('small', 'ct-sub', resumen));
    quien.appendChild(nm);
    const fav = el('button', 'ct-fav' + (c.favorite ? ' on' : '')); fav.type = 'button';
    fav.title = c.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'; fav.setAttribute('aria-label', fav.title);
    fav.appendChild(icon(c.favorite ? 'i-star-fill' : 'i-star'));
    fav.addEventListener('click', async (e) => { e.stopPropagation(); await alternaFav(c); });
    r.append(quien, el('span', 'ct-col', (c.emails[0] || {}).value || ''), el('span', 'ct-col', (c.phones[0] || {}).value || ''), el('span', 'ct-col', principal(c)), fav);
    if ((c.labels || []).length) { const ch = K.labelChips(c.labels.slice(0, 3)); ch.classList.add('ct-chips'); nm.appendChild(ch); }
    if (S.selMode) {
      r.classList.add('sel-mode'); if (S.sel.has(c.id)) r.classList.add('is-sel');
      const ck = el('span', 'cal-check' + (S.sel.has(c.id) ? ' on' : '')); ck.style.setProperty('--c', '#6366f1'); ck.appendChild(icon('i-check'));
      quien.prepend(ck);
    }
    const abre = () => { if (S.selMode) { if (S.sel.has(c.id)) S.sel.delete(c.id); else S.sel.add(c.id); render(); } else openDetail(c.id); };
    r.addEventListener('click', abre);
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter') abre(); });
    return r;
  }

  function render() {
    if (!S.built) return;
    pintaRail();
    const lista = filtrados();
    const total = S.items.length;
    R.sub.textContent = total ? `${total} contacto${total === 1 ? '' : 's'}` : 'Tu agenda';
    R.count.textContent = lista.length !== total ? `${lista.length} de ${total}` : '';
    pintaSel(lista);
    const c = R.content; c.textContent = '';
    if (!S.loaded) { c.appendChild(el('p', 'k-faint', 'Cargando…')); return; }
    if (!lista.length) { c.appendChild(vacio(total > 0)); return; }
    const frag = document.createDocumentFragment();
    let letra = null, cuerpo = null;
    for (const ct of lista) {
      const l = letraDe(ct);
      if (l !== letra) {
        letra = l;
        frag.appendChild(el('div', 'ct-letter', l));
        cuerpo = el('div', 'ct-list'); frag.appendChild(cuerpo);
      }
      cuerpo.appendChild(fila(ct));
    }
    c.appendChild(frag);
  }

  function pintaSel(lista) {
    const b = R.barra; b.textContent = '';
    S.sel = new Set([...S.sel].filter(id => S.items.some(i => i.id === id)));
    if (!S.selMode) { b.hidden = true; return; }
    b.hidden = false;
    b.appendChild(el('span', 'n', `${S.sel.size} seleccionado${S.sel.size === 1 ? '' : 's'}`));
    const btn = (txt, ic, fn, cls) => { const x = el('button', 'btn sm ' + (cls || '')); x.type = 'button'; x.appendChild(icon(ic)); if (txt) x.appendChild(el('span', null, txt)); x.addEventListener('click', fn); b.appendChild(x); return x; };
    btn('Todos', 'i-check', () => { (lista || filtrados()).forEach(c => S.sel.add(c.id)); render(); });
    btn('Ninguno', 'i-x', () => { S.sel.clear(); render(); });
    b.appendChild(el('span', 'grow'));
    const del = btn('Eliminar', 'i-trash', eliminaSel, 'danger'); del.disabled = !S.sel.size;
  }
  async function eliminaSel() {
    const ids = [...S.sel]; if (!ids.length) return;
    if (!(await K.confirm(`${ids.length} contacto${ids.length === 1 ? '' : 's'} se eliminará${ids.length === 1 ? '' : 'n'} para siempre.`, { ok: 'Eliminar', danger: true, title: 'Eliminar contactos' }))) return;
    try {
      const r = await K.post('/api/contacts/bulk-delete', { ids });
      const set = new Set(ids);
      S.items = S.items.filter(x => !set.has(x.id)); S.sel.clear(); S.selMode = false; R.selb.classList.remove('is-on');
      K.toast(`${r.borrados} contacto${r.borrados === 1 ? '' : 's'} eliminado${r.borrados === 1 ? '' : 's'}`); render();
    } catch (e) { K.fail(e); }
  }

  async function alternaFav(c) {
    try {
      const r = await K.put('/api/contacts/' + c.id, { favorite: !c.favorite });
      sustituye(r.contact); render();
    } catch (e) { K.fail(e); }
  }
  function sustituye(ct) {
    const i = S.items.findIndex(x => x.id === ct.id);
    if (i >= 0) S.items[i] = ct; else S.items.push(ct);
  }

  /* ---------- Ficha ---------- */
  function openDetail(id) {
    const c = S.items.find(x => x.id === id);
    if (!c) return;
    const root = el('div', 'ct-detail');
    const top = el('div', 'ct-top');
    const x = el('button', 'btn ghost icon ct-x'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.appendChild(icon('i-x'));
    x.addEventListener('click', () => m.close());
    top.appendChild(x);
    const quien = el('div', 'ct-hero');
    quien.appendChild(avatar(c, 84));
    quien.appendChild(el('h2', null, nombre(c)));
    if (c.nickname) quien.appendChild(el('p', 'ct-nick', `“${c.nickname}”`));
    const cargo = [c.title, c.department, c.company].filter(Boolean).join(' · ');
    if (cargo && cargo !== nombre(c)) quien.appendChild(el('p', 'ct-job', cargo));
    if ((c.labels || []).length) { const ch = K.labelChips(c.labels, { onClick: (l) => { m.close(); S.fav = false; S.label = l.id; render(); } }); ch.style.justifyContent = 'center'; quien.appendChild(ch); }
    root.append(top, quien);

    // Acciones rápidas
    const acts = el('div', 'ct-acts');
    const accion = (ic, txt, href, cls) => { const a = el('a', 'btn ' + (cls || '')); a.href = href; a.append(icon(ic), el('span', null, txt)); return a; };
    if (c.phones[0]) acts.appendChild(accion('i-phone', 'Llamar', telHref(c.phones[0].value)));
    if (c.emails[0]) acts.appendChild(accion('i-mail', 'Correo', 'mailto:' + encodeURIComponent(c.emails[0].value).replace(/%40/g, '@')));
    const rem = el('button', 'btn'); rem.type = 'button'; rem.append(icon('i-bell'), el('span', null, 'Recordatorio'));
    rem.addEventListener('click', () => K.vinculos && K.vinculos.abrir('contact', c.id, nombre(c)));
    acts.appendChild(rem);
    const ed = el('button', 'btn primary'); ed.type = 'button'; ed.append(icon('i-pencil'), el('span', null, 'Editar'));
    ed.addEventListener('click', () => { m.close(); openEditor(c.id); });
    const mo = el('button', 'btn ghost icon'); mo.type = 'button'; mo.appendChild(icon('i-dots')); mo.setAttribute('aria-label', 'Más acciones');
    mo.addEventListener('click', () => K.menu(mo, [
      { label: c.favorite ? 'Quitar de favoritos' : 'Marcar como favorito', icon: c.favorite ? 'i-star-fill' : 'i-star', onClick: async () => { m.close(); await alternaFav(c); } },
      { label: 'Copiar nombre', icon: 'i-copy', onClick: async () => { K.toast((await K.copy(nombre(c))) ? 'Copiado' : 'No se pudo copiar'); } },
      { label: 'Exportar (.vcf)', icon: 'i-download', onClick: () => { location.href = BASE + '/api/contacts/export?ids=' + c.id; } },
      ...K.doc.items(() => ({ titulo: nombre(c), nombre: nombre(c), md: contactoMd(c) })),
      { label: 'Copiar o mover a…', icon: 'i-move', onClick: () => { m.close(); K.transferir.abre({ tipo: 'contactos', ids: [c.id], titulo: nombre(c) }, { alTerminar: () => load() }); } },
      '-', { label: 'Eliminar contacto', icon: 'i-trash', danger: true, onClick: () => elimina(c, m) },
    ], { align: 'end' }));
    acts.append(ed, mo);
    root.appendChild(acts);

    // Bloques de datos
    const bloque = (ic, filas) => {
      if (!filas.length) return;
      const b = el('div', 'ct-blk');
      filas.forEach((f) => { const l = el('div', 'ct-line'); const i = el('span', 'ct-ico'); i.appendChild(icon(ic)); l.append(i, f); b.appendChild(l); });
      root.appendChild(b);
    };
    const celda = (principalEl, etiqueta, copia) => {
      const d = el('div', 'ct-val'); d.appendChild(principalEl);
      if (etiqueta) d.appendChild(el('small', null, etiqueta));
      if (copia) {
        const cb = el('button', 'btn ghost tiny ct-copy'); cb.type = 'button'; cb.appendChild(icon('i-copy')); cb.title = 'Copiar'; cb.setAttribute('aria-label', 'Copiar');
        cb.addEventListener('click', async () => { K.toast((await K.copy(copia)) ? 'Copiado' : 'No se pudo copiar'); });
        d.appendChild(cb);
      }
      return d;
    };
    const enlace = (txt, href, externo) => { const a = el('a', null, txt); a.href = href; if (externo) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
    bloque('i-phone', c.phones.map(p => celda(enlace(p.value, telHref(p.value)), p.label, p.value)));
    bloque('i-mail', c.emails.map(e => celda(enlace(e.value, 'mailto:' + encodeURIComponent(e.value).replace(/%40/g, '@')), e.label, e.value)));
    bloque('i-pin', c.addresses.map((a) => {
      const txt = el('span', 'ct-addr', direccionTexto(a));
      const d = celda(txt, a.label, direccionTexto(a));
      const mapa = enlace('Ver en el mapa', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(direccionTexto(a)), true); mapa.className = 'ct-maplink';
      d.insertBefore(mapa, d.querySelector('small') || null);
      return d;
    }));
    bloque('i-globe', c.websites.map((w) => { const u = urlSegura(w.value); return celda(u ? enlace(w.value, u, true) : el('span', null, w.value), w.label, w.value); }));
    bloque('i-cake', c.dates.map(d => celda(el('span', null, fmtFecha(d.date)), d.label)));
    if (c.notes) bloque('i-note', [celda(el('span', 'ct-notes', c.notes))]);
    const pie = el('p', 'ct-foot k-faint', `Creado ${K.d.short(new Date(c.createdAt))}${c.updatedAt - c.createdAt > 60000 ? ' · Editado ' + K.ago(c.updatedAt) : ''}`);
    root.appendChild(pie);

    const m = K.modal({ cls: 'wide ct-modal', content: root });
  }

  async function elimina(c, m) {
    if (!(await K.confirm(`“${nombre(c)}” se eliminará para siempre.`, { ok: 'Eliminar', danger: true, title: 'Eliminar contacto' }))) return;
    try {
      await K.del('/api/contacts/' + c.id);
      S.items = S.items.filter(x => x.id !== c.id);
      if (m) m.close();
      K.toast('Contacto eliminado'); render();
    } catch (e) { K.fail(e); }
  }

  /* ---------- Editor ---------- */
  const campo = (txt, input) => { const l = el('label', 'field tight'); l.append(el('span', null, txt), input); return l; };
  const entrada = (valor, ph, tipo, max) => { const i = el('input'); i.type = tipo || 'text'; i.value = valor || ''; if (ph) i.placeholder = ph; i.maxLength = max || 160; i.autocomplete = 'off'; return i; };
  function selector(opciones, valor) {
    const s = el('select');
    const lista = opciones.includes(valor) || !valor ? opciones : [valor, ...opciones];
    lista.forEach((o) => { const op = el('option', null, o); op.value = o; s.appendChild(op); });
    s.value = valor || opciones[0];
    return s;
  }

  // Lista de filas que se pueden añadir y quitar (teléfonos, correos, direcciones…)
  function repetidor({ titulo, ic, anadir, items, nuevaFila }) {
    const sec = el('section', 'ct-rep');
    const h = el('h4'); h.append(icon(ic), el('span', null, titulo)); sec.appendChild(h);
    const cuerpo = el('div', 'ct-rep-rows'); sec.appendChild(cuerpo);
    const filas = [];
    const pon = (v, enfoca) => {
      const r = nuevaFila(v || {});
      filas.push(r); cuerpo.appendChild(r.el);
      r.quita.addEventListener('click', () => { filas.splice(filas.indexOf(r), 1); r.el.remove(); });
      if (enfoca) r.foco.focus();
    };
    (items.length ? items : [{}]).forEach(v => pon(v));
    const b = el('button', 'btn ghost sm ct-add'); b.type = 'button'; b.append(icon('i-plus'), el('span', null, anadir));
    b.addEventListener('click', () => pon({}, true)); sec.appendChild(b);
    return { el: sec, get: () => filas.map(r => r.get()).filter(Boolean) };
  }
  const botonQuitar = () => { const q = el('button', 'btn ghost icon ct-rm'); q.type = 'button'; q.title = 'Quitar'; q.setAttribute('aria-label', 'Quitar'); q.appendChild(icon('i-x')); return q; };

  function filaSimple(tipo, ph, inputType, max) {
    return (v) => {
      const r = el('div', 'ct-rep-row');
      const sel = selector(ETQ[tipo], v.label); const inp = entrada(v.value, ph, inputType, max);
      if (inputType === 'tel') inp.inputMode = 'tel'; if (inputType === 'email') inp.inputMode = 'email';
      const q = botonQuitar(); r.append(sel, inp, q);
      return { el: r, quita: q, foco: inp, get: () => (inp.value.trim() ? { label: sel.value, value: inp.value.trim() } : null) };
    };
  }
  function filaDireccion(v) {
    const r = el('div', 'ct-rep-row ct-adr');
    const sel = selector(ETQ.addresses, v.label);
    const calle = entrada(v.street, 'Calle y número', 'text', 160), cp = entrada(v.zip, 'Código postal', 'text', 20), ciudad = entrada(v.city, 'Ciudad', 'text', 80);
    const region = entrada(v.region, 'Provincia / región', 'text', 80), pais = entrada(v.country, 'País', 'text', 80);
    const q = botonQuitar();
    const g = el('div', 'ct-adr-g'); g.append(calle, cp, ciudad, region, pais);
    const cab = el('div', 'ct-adr-h'); cab.append(sel, q);
    r.append(cab, g);
    return { el: r, quita: q, foco: calle, get: () => {
      const a = { label: sel.value, street: calle.value.trim(), zip: cp.value.trim(), city: ciudad.value.trim(), region: region.value.trim(), country: pais.value.trim() };
      return a.street || a.zip || a.city || a.region || a.country ? a : null;
    } };
  }
  function filaFecha(v) {
    const r = el('div', 'ct-rep-row ct-date');
    const sel = selector(ETQ.dates, v.label);
    const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(v.date || '');
    const dia = entrada(m ? String(Number(m[3])) : '', 'Día', 'number', 2); dia.min = 1; dia.max = 31; dia.inputMode = 'numeric';
    const mes = el('select'); const o0 = el('option', null, 'Mes'); o0.value = ''; mes.appendChild(o0);
    MESES.forEach((n, i) => { const o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); mes.appendChild(o); });
    mes.value = m ? m[2] : '';
    const anio = entrada(m && m[1] ? m[1] : '', 'Año', 'number', 4); anio.min = 1; anio.max = 9999; anio.inputMode = 'numeric';
    const q = botonQuitar(); r.append(sel, dia, mes, anio, q);
    return { el: r, quita: q, foco: dia, get: () => {
      const d = Number(dia.value);
      if (!d || !mes.value) return null;
      const y = anio.value.trim();
      return { label: sel.value, date: `${/^\d{4}$/.test(y) ? y : '-'}-${mes.value}-${String(d).padStart(2, '0')}`.replace(/^--/, '--') };
    } };
  }

  async function openEditor(id, prefill) {
    await K.loadLabels().catch(() => {});
    const c = id ? S.items.find(x => x.id === id) : null;
    if (id && !c) return;
    const base = c || prefill || {};
    const f = el('div', 'ct-form');

    const nom = el('div', 'k-2');
    const first = entrada(base.first, '', 'text', 80), last = entrada(base.last, '', 'text', 80);
    const middle = entrada(base.middle, '', 'text', 80), nick = entrada(base.nickname, '', 'text', 80);
    nom.append(campo('Nombre', first), campo('Apellidos', last), campo('Segundo nombre', middle), campo('Apodo', nick));
    const trab = el('div', 'k-2');
    const company = entrada(base.company, '', 'text', 120), title = entrada(base.title, '', 'text', 120), dep = entrada(base.department, '', 'text', 120);
    trab.append(campo('Empresa', company), campo('Cargo', title), campo('Departamento', dep));
    f.append(nom, trab);

    const tels = repetidor({ titulo: 'Teléfonos', ic: 'i-phone', anadir: 'Añadir teléfono', items: base.phones || [], nuevaFila: filaSimple('phones', 'Teléfono', 'tel', 40) });
    const mails = repetidor({ titulo: 'Correos', ic: 'i-mail', anadir: 'Añadir correo', items: base.emails || [], nuevaFila: filaSimple('emails', 'Correo electrónico', 'email', 160) });
    const dirs = repetidor({ titulo: 'Direcciones', ic: 'i-pin', anadir: 'Añadir dirección', items: base.addresses || [], nuevaFila: filaDireccion });
    const webs = repetidor({ titulo: 'Sitios web', ic: 'i-globe', anadir: 'Añadir web', items: base.websites || [], nuevaFila: filaSimple('websites', 'https://…', 'text', 300) });
    const fechas = repetidor({ titulo: 'Fechas', ic: 'i-cake', anadir: 'Añadir fecha', items: base.dates || [], nuevaFila: filaFecha });
    f.append(tels.el, mails.el, dirs.el, webs.el, fechas.el);

    // Foto: se reduce en el servidor a 300x300 (WebP); se sube al guardar
    const foto = { file: null, quitar: false };
    const fotoBox = el('div', 'ct-photo');
    const fotoIn = el('input'); fotoIn.type = 'file'; fotoIn.accept = 'image/*'; fotoIn.hidden = true;
    const pintaFoto = () => {
      fotoBox.textContent = '';
      const prev = el('div', 'ct-av'); prev.style.setProperty('--s', '72px'); prev.style.setProperty('--c', colorDe(c || { id: 'nuevo' }));
      if (foto.file) { const im = el('img'); im.alt = ''; im.src = foto.url; prev.appendChild(im); }
      else if (c && c.photo && !foto.quitar) { const im = el('img'); im.alt = ''; im.src = `${BASE}/api/contacts/${c.id}/photo?v=${c.photo}`; prev.appendChild(im); }
      else prev.appendChild(icon('i-contact'));
      const b1 = el('button', 'btn sm'); b1.type = 'button'; b1.append(icon('i-image'), el('span', null, (foto.file || (c && c.photo && !foto.quitar)) ? 'Cambiar foto' : 'Añadir foto'));
      b1.addEventListener('click', () => fotoIn.click());
      fotoBox.append(prev, b1);
      if (foto.file || (c && c.photo && !foto.quitar)) {
        const b2 = el('button', 'btn ghost sm'); b2.type = 'button'; b2.append(icon('i-trash'), el('span', null, 'Quitar'));
        b2.addEventListener('click', () => { if (foto.url) URL.revokeObjectURL(foto.url); foto.file = null; foto.url = ''; foto.quitar = true; pintaFoto(); });
        fotoBox.appendChild(b2);
      }
      fotoBox.appendChild(fotoIn);
    };
    fotoIn.addEventListener('change', () => {
      const fl = fotoIn.files && fotoIn.files[0]; fotoIn.value = '';
      if (!fl) return;
      if (!/^image\//.test(fl.type) && !/\.(heic|heif|avif|webp|jpe?g|png|gif)$/i.test(fl.name)) { K.toast('Elige una imagen'); return; }
      if (fl.size > 15 * 1024 * 1024) { K.toast('La imagen supera los 15 MB'); return; }
      if (foto.url) URL.revokeObjectURL(foto.url);
      foto.file = fl; foto.url = URL.createObjectURL(fl); foto.quitar = false; pintaFoto();
    });
    pintaFoto();
    f.insertBefore(fotoBox, f.firstChild);

    const notas = el('textarea'); notas.value = base.notes || ''; notas.maxLength = 5000; notas.rows = 3; notas.placeholder = 'Notas';
    f.appendChild(campo('Notas', notas));
    const picker = K.labelPicker({ selected: base.labels || [] });
    f.appendChild(campo('Etiquetas', picker));
    let favorito = !!base.favorite;
    const favB = el('button', 'btn sm ct-favbtn'); favB.type = 'button';
    const pintaFav = () => { favB.replaceChildren(icon(favorito ? 'i-star-fill' : 'i-star'), el('span', null, favorito ? 'Favorito' : 'Marcar como favorito')); favB.classList.toggle('on', favorito); };
    pintaFav(); favB.addEventListener('click', () => { favorito = !favorito; pintaFav(); });
    f.appendChild(favB);

    const m = K.modal({ title: c ? 'Editar contacto' : 'Nuevo contacto', cls: 'xl ct-modal', content: f, dismiss: false, actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', primary: true, onClick: async () => {
        const body = {
          first: first.value, middle: middle.value, last: last.value, nickname: nick.value,
          company: company.value, title: title.value, department: dep.value,
          phones: tels.get(), emails: mails.get(), addresses: dirs.get(), websites: webs.get(), dates: fechas.get(),
          notes: notas.value, labels: picker.get(), favorite: favorito,
        };
        try {
          const r = c ? await K.put('/api/contacts/' + c.id, body) : await K.post('/api/contacts', body);
          let ct = r.contact;
          try {
            if (foto.file) {
              const rs = await api(`${BASE}/api/contacts/${ct.id}/photo`, { method: 'PUT', headers: { 'Content-Type': foto.file.type || 'application/octet-stream' }, body: foto.file });
              const dj = await rs.json().catch(() => ({}));
              if (!rs.ok) throw new Error(dj.error || 'No se pudo guardar la foto');
              ct = dj.contact;
            } else if (foto.quitar && c && c.photo) {
              ct = (await K.del(`/api/contacts/${ct.id}/photo`)).contact || ct;
            }
          } catch (e) { K.fail(e); }
          if (foto.url) URL.revokeObjectURL(foto.url);
          r.contact = ct;
          sustituye(r.contact); render();
          K.toast(c ? 'Contacto actualizado' : 'Contacto creado');
          if (c) setTimeout(() => openDetail(r.contact.id), 30);
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
    setTimeout(() => first.focus(), 40);
    return m;
  }

  /* ---------- Importar ---------- */
  function pideImportar() {
    const inp = el('input'); inp.type = 'file'; inp.accept = '.vcf,.vcard,text/vcard,text/x-vcard,text/directory'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; inp.remove();
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { K.toast('El archivo supera los 8 MB'); return; }
      try {
        const res = await api(BASE + '/api/contacts/import', { method: 'POST', headers: { 'Content-Type': 'text/vcard; charset=utf-8' }, body: await file.text() });
        let data = null; try { data = await res.json(); } catch { /* sin cuerpo */ }
        if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
        const partes = [`${data.creados} importado${data.creados === 1 ? '' : 's'}`];
        if (data.duplicados) partes.push(`${data.duplicados} ya existían`);
        if (data.invalidos) partes.push(`${data.invalidos} sin datos`);
        K.toast(partes.join(' · '));
        await K.loadLabels(true).catch(() => {}); K.bus.emit('labels');
        await load();
      } catch (e) { K.fail(e); }
    }, { once: true });
    inp.addEventListener('cancel', () => inp.remove(), { once: true });
    inp.click();
  }

  /* ---------- Registro ---------- */
  K.registerView('contacts', {
    async open() {
      if (!S.built) build();
      await K.loadLabels().catch(() => {});
      if (!S.loaded) render();
      load();
      if (R.si && S.q === '') R.si.value = '';
    },
    close() { S.selMode = false; S.sel.clear(); if (R.selb) R.selb.classList.remove('is-on'); },
  });
  K.bus.on('labels', () => { if (S.built && !$('view-contacts').hidden) load(); else S.loaded = false; });
  K.openers.contact = (id) => { switchTab('contacts'); const ir = () => openDetail(id); S.loaded ? setTimeout(ir, 60) : setTimeout(ir, 400); };
  K.contacts = { open: (id) => K.openers.contact(id), newContact: () => { switchTab('contacts'); setTimeout(() => openEditor(null), 60); } };
})();
