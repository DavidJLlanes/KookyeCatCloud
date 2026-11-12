'use strict';
/* Documentos · lista de documentos (con búsqueda, plantillas y papelera) y menú «⋯» del editor (exportar, versiones, borrar…). */
(function () {
  if (!window.K || !K.documentos) return;
  const D = K.documentos, S = D.S;

  async function nuevo(raiz, plantilla) {
    try { const d = await D.crea(plantilla); K.bus && K.bus.emit('documentos'); D.logros(); D.pintaEditor(raiz, d.id); }
    catch (e) { K.fail(e); }
  }

  D.pintaLista = (raiz) => {
    raiz.textContent = '';
    const page = el('div', 'dc-page');
    const cab = el('div', 'dc-head');
    const tit = el('div'); tit.append(el('h1', null, 'Documentos'), el('p', 'k-faint', 'Escribe con formato, columnas, tablas y listas de tareas. Se guarda solo.'));
    const acc = el('div', 'dc-acciones');
    const pap = el('button', 'btn sm', 'Papelera'); pap.type = 'button'; pap.addEventListener('click', () => papelera(raiz));
    const nu = el('button', 'btn primary', '+ Nuevo documento'); nu.type = 'button'; nu.addEventListener('click', () => nuevo(raiz, 'blanco'));
    acc.append(pap, nu); cab.append(tit, acc); page.appendChild(cab);

    const pl = S.plantillas.filter(p => p.id !== 'blanco');
    if (pl.length) {
      const fila = el('div', 'dc-plantillas'); fila.appendChild(el('span', 'k-faint dc-pl-t', 'Empezar desde una plantilla'));
      for (const p of pl) { const b = el('button', 'dc-plantilla'); b.type = 'button'; b.title = p.desc; b.append(el('span', 'dc-pl-i', p.icono), el('span', null, p.nombre)); b.addEventListener('click', () => nuevo(raiz, p.id)); fila.appendChild(b); }
      page.appendChild(fila);
    }
    const busca = el('input', 'dc-busca'); busca.type = 'search'; busca.placeholder = 'Buscar en tus documentos…'; busca.value = S.busca; busca.setAttribute('aria-label', 'Buscar documentos');
    const rejilla = el('div', 'dc-rejilla');
    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const pinta = () => {
      rejilla.textContent = ''; const q = norm(S.busca.trim());
      const l = (S.lista || []).filter(d => !q || norm(d.title + ' ' + d.extracto).includes(q)).sort((a, b) => (b.favorito - a.favorito) || (b.updatedAt - a.updatedAt));
      if (!l.length) { rejilla.appendChild(el('p', 'k-faint dc-vacio', S.lista && S.lista.length ? 'Ningún documento coincide con la búsqueda.' : 'Aún no tienes documentos. Crea uno en blanco o desde una plantilla.')); return; }
      for (const d of l) {
        const c = el('button', 'dc-tarjeta'); c.type = 'button';
        const mini = el('div', 'dc-mini'); mini.textContent = d.extracto || ' ';
        const t = el('div', 'dc-tarjeta-t'); t.append(el('strong', null, (d.favorito ? '★ ' : '') + d.title));
        const m = el('div', 'dc-meta k-faint', `${d.palabras.toLocaleString('es-ES')} palabras · ${D.fecha(d.updatedAt)}${d.cols ? ' · columnas' : ''}`);
        c.append(mini, t, m); c.addEventListener('click', () => D.pintaEditor(raiz, d.id)); rejilla.appendChild(c);
      }
    };
    busca.addEventListener('input', () => { S.busca = busca.value; pinta(); });
    page.append(busca, rejilla); raiz.appendChild(page); pinta();
  };

  /* ---------- Menú «⋯» del editor ---------- */
  D.menuMas = (ancla, doc) => {
    const descarga = (f) => { D.guardaYa({ forzar: true }).finally(() => { const a = document.createElement('a'); a.href = BASE + `/api/documentos/${doc.id}/export?format=${f}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); D.logros(); }); };
    K.menu(ancla, [
      { head: 'Hoja' }, ...D.PAGINAS.map(([k, n]) => ({ label: n, checked: (doc.pagina || 'a4') === k, onClick: () => D.fijaPagina(k) })),
      '-', { head: 'Descargar' }, { label: 'Página web (.html)', onClick: () => descarga('html') }, { label: 'Markdown (.md)', onClick: () => descarga('md') }, { label: 'Texto (.txt)', onClick: () => descarga('txt') },
      '-', { label: doc.favorito ? 'Quitar de favoritos' : 'Marcar como favorito', onClick: async () => { doc.favorito = !doc.favorito; try { await D.guarda(doc.id, { favorito: doc.favorito }); K.toast(doc.favorito ? 'En favoritos' : 'Quitado de favoritos'); } catch (e) { K.fail(e); } } },
      { label: 'Versiones anteriores', onClick: () => versiones(doc) },
      { label: 'Duplicar', onClick: async () => { try { await D.guardaYa({ forzar: true }); const r = await K.post(`/api/documentos/${doc.id}/duplicar`); K.toast('Copia creada'); D.pintaEditor(D.el.page.parentNode, r.documento.id); } catch (e) { K.fail(e); } } },
      '-', { label: 'Borrar documento', danger: true, onClick: async () => {
        if (!await K.confirm(`«${doc.title}» irá a la papelera, de donde se puede recuperar durante 30 días.`, { ok: 'Borrar', danger: true })) return;
        try { await K.del('/api/documentos/' + doc.id); const raiz = D.el.page.parentNode; S.sucio = false; D.ed = null; D.el = null; await D.carga(); D.pintaLista(raiz); K.toast('Movido a la papelera'); } catch (e) { K.fail(e); }
      } },
    ]);
  };

  async function versiones(doc) {
    try {
      const r = await K.get(`/api/documentos/${doc.id}/salvavidas`);
      const w = el('div', 'dc-modal-l');
      if (!r.copias.length) w.appendChild(el('p', 'k-faint', 'Aún no hay copias. Se guardan solas cuando un cambio deja el texto mucho más corto (por si se borra algo sin querer).'));
      for (const c of r.copias) {
        const b = el('button', 'btn dc-ver'); b.type = 'button'; b.textContent = 'Restaurar la copia del ' + new Date(c.at).toLocaleString('es-ES');
        b.addEventListener('click', async () => { if (!await K.confirm('El texto actual se guarda también como copia antes de volver atrás.', { ok: 'Restaurar' })) return; try { await K.post(`/api/documentos/${doc.id}/restaura`, { nombre: c.nombre }); K.toast('Restaurada'); const raiz = D.el.page.parentNode; S.sucio = false; D.pintaEditor(raiz, doc.id); } catch (e) { K.fail(e); } });
        w.appendChild(b);
      }
      K.modal({ title: 'Versiones anteriores', content: w, actions: [{ label: 'Cerrar', primary: true }] });
    } catch (e) { K.fail(e); }
  }

  async function papelera(raiz) {
    try {
      const r = await K.get('/api/documentos/papelera'); const w = el('div', 'dc-modal-l');
      if (!r.documentos.length) w.appendChild(el('p', 'k-faint', 'La papelera está vacía. Lo que borres se conserva 30 días.'));
      for (const d of r.documentos) {
        const b = el('button', 'btn dc-ver'); b.type = 'button'; b.textContent = `Restaurar «${d.title}» · ${d.palabras} palabras · borrado ${new Date(d.borrado).toLocaleDateString('es-ES')}`;
        b.addEventListener('click', async () => { try { await K.post('/api/documentos/papelera/restaura', { nombre: d.nombre }); K.toast('Restaurado'); await D.carga(); D.pintaLista(raiz); b.remove(); } catch (e) { K.fail(e); } });
        w.appendChild(b);
      }
      K.modal({ title: 'Papelera de documentos', content: w, actions: [{ label: 'Cerrar', primary: true }] });
    } catch (e) { K.fail(e); }
  }
})();
