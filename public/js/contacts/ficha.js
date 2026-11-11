'use strict';
/* contacts/ficha.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const { S } = C;
  const alternaFav = (...a) => C.alternaFav(...a);
  const avatar = (...a) => C.avatar(...a);
  const contactoMd = (...a) => C.contactoMd(...a);
  const direccionTexto = (...a) => C.direccionTexto(...a);
  const fmtFecha = (...a) => C.fmtFecha(...a);
  const load = (...a) => C.load(...a);
  const nombre = (...a) => C.nombre(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const render = (...a) => C.render(...a);
  const telHref = (...a) => C.telHref(...a);
  const urlSegura = (...a) => C.urlSegura(...a);

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
    const cargos = [['title', c.title], ['department', c.department], ['company', c.company]].filter(x => x[1] && x[1] !== nombre(c));
    if (cargos.length) { const j = el('div', 'ct-job ct-vchips'); cargos.forEach(([p, v]) => j.appendChild(K.chipValor('contacts.' + p, v))); quien.appendChild(j); }
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
      { label: 'Exportar (.vcf)', icon: 'i-download', onClick: () => { K.guardarUrl('/api/contacts/export?ids=' + c.id, { nombre: 'contacto.vcf' }); } },
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
      const vs = [['city', a.city], ['region', a.region], ['country', a.country]].filter(x => x[1]);
      if (vs.length) { const w = el('div', 'ct-vchips'); vs.forEach(([p, v]) => w.appendChild(K.chipValor('contacts.' + p, v))); d.insertBefore(w, d.querySelector('small') || null); }
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


  Object.assign(C, { openDetail, elimina });
})();
