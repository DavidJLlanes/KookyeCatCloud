'use strict';
/* contacts/vista.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const { NOMVAL, R, S } = C;
  const avatar = (...a) => C.avatar(...a);
  const exportaDoc = (...a) => C.exportaDoc(...a);
  const filtrados = (...a) => C.filtrados(...a);
  const letraDe = (...a) => C.letraDe(...a);
  const nombre = (...a) => C.nombre(...a);
  const openDetail = (...a) => C.openDetail(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const pideImportar = (...a) => C.pideImportar(...a);
  const principal = (...a) => C.principal(...a);

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
      { label: 'Exportar todos (.vcf)', icon: 'i-download', onClick: () => { if (!S.items.length) { K.toast('No hay contactos que exportar'); return; } K.guardarUrl('/api/contacts/export', { nombre: 'contactos.vcf' }); } },
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
    const ir = (fav, label) => () => { S.fav = fav; S.label = label; S.val = null; R.wrap.classList.remove('rail-open'); render(); };
    nav.append(
      link({ ic: 'i-contact', name: 'Todos', n: S.items.length, on: !S.fav && !S.label && !S.val, onClick: ir(false, '') }),
      link({ ic: 'i-star', name: 'Favoritos', n: S.items.filter(c => c.favorite).length, on: S.fav, onClick: ir(true, '') }),
    );
    if (S.val) nav.appendChild(link({ ic: 'i-search', name: `${NOMVAL[S.val.prop]}: ${S.val.valor}`, n: filtrados().length, on: true, onClick: ir(false, '') }));
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
    const chipsTrabajo = () => { const w = el('span', 'ct-vchips'); [['company', c.company], ['title', c.title]].forEach(([p, v]) => { if (v) w.appendChild(K.chipValor('contacts.' + p, v)); }); return w; };
    const resumen = principal(c) || (c.emails[0] || {}).value || (c.phones[0] || {}).value || '';
    if (principal(c)) { const sb = el('small', 'ct-sub'); sb.appendChild(chipsTrabajo()); nm.appendChild(sb); }
    else if (resumen) nm.appendChild(el('small', 'ct-sub', resumen));
    quien.appendChild(nm);
    const fav = el('button', 'ct-fav' + (c.favorite ? ' on' : '')); fav.type = 'button';
    fav.title = c.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'; fav.setAttribute('aria-label', fav.title);
    fav.appendChild(icon(c.favorite ? 'i-star-fill' : 'i-star'));
    fav.addEventListener('click', async (e) => { e.stopPropagation(); await alternaFav(c); });
    r.append(quien, el('span', 'ct-col', (c.emails[0] || {}).value || ''), el('span', 'ct-col', (c.phones[0] || {}).value || ''), (() => { const col = el('span', 'ct-col'); if (principal(c)) col.appendChild(chipsTrabajo()); return col; })(), fav);
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


  Object.assign(C, { build, link, pintaRail, vacio, fila, render, pintaSel, eliminaSel, alternaFav, sustituye });
})();
