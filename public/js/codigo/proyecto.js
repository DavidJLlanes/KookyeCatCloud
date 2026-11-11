'use strict';
/* codigo/proyecto.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { MAXB, S, logros } = C;
  const abre = (...a) => C.abre(...a);
  const bajar = (...a) => C.bajar(...a);
  const btn = (...a) => C.btn(...a);
  const carga = (...a) => C.carga(...a);
  const cierra = (...a) => C.cierra(...a);
  const guardaVersion = (...a) => C.guardaVersion(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const pinta = (...a) => C.pinta(...a);
  const pintaArchivos = (...a) => C.pintaArchivos(...a);
  const pintaVersiones = (...a) => C.pintaVersiones(...a);
  const pintaWeb = (...a) => C.pintaWeb(...a);
  const proyectoMd = (...a) => C.proyectoMd(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);

  /* ---------- Proyecto ---------- */
  function pintaProyecto(page) {
    const p = S.p;
    const head = el('header', 'cd-edhead');
    const back = btn('Código', null, cierra, 'btn sm'); back.prepend(el('span', null, '← '));
    const tit = el('button', 'cd-nombre'); tit.type = 'button'; tit.textContent = (p.favorito ? '★ ' : '') + p.nombre; tit.title = 'Editar nombre y descripción'; tit.addEventListener('click', datos);
    const acc = el('div', 'cd-acc');
    acc.append(btn('Exportar ZIP', 'i-zip', async () => { await guardaYa(); bajar(url('/zip'), nombreZip()); }, 'btn sm'), btn('Guardar versión', 'i-archive', guardaVersion, 'btn primary sm'));
    const mas = btn('', 'i-dots', () => K.menu(mas, [
      { label: p.favorito ? 'Quitar de favoritos' : 'Marcar como favorito', icon: 'i-star', onClick: async () => { try { S.p = await K.put(url(''), { favorito: !p.favorito }); pinta(); } catch (e) { K.fail(e); } } },
      { label: 'Editar nombre y descripción', icon: 'i-pencil', onClick: datos },
      { label: 'Descargar como ZIP', icon: 'i-download', onClick: async () => { await guardaYa(); bajar(url('/zip'), nombreZip()); } },
      ...K.doc.items(() => ({ titulo: p.nombre, nombre: p.nombre, md: proyectoMd })),
      { label: 'Copiar o mover a Archivos…', icon: 'i-move', onClick: () => K.transferir.abre({ tipo: 'codigo', id: p.id, vid: S.ver ? S.ver.id : undefined }, { carpeta: '', alTerminar: () => { S.built && carga(); } }) },
      { label: 'Historial de envíos…', icon: 'i-restore', onClick: () => K.transferir.historial(() => { if (S.p) abre(S.p.id); }) },
      '-', { label: 'Eliminar proyecto', icon: 'i-trash', danger: true, onClick: elimina }]), 'btn sm'); mas.setAttribute('aria-label', 'Más acciones'); acc.appendChild(mas);
    head.append(back, tit, acc); page.appendChild(head);
    const cuota = el('div', 'cd-cuota'); const pct = Math.min(100, Math.round(p.almacen / MAXB * 100));
    const barra = el('div', 'cd-barra'); const rell = el('i'); rell.style.width = pct + '%'; if (pct > 85) rell.classList.add('alto'); barra.appendChild(rell);
    cuota.append(barra, el('small', 'k-muted', `${tam(p.almacen)} de 50 MB (incluye versiones) · ${p.nArchivos}/${p.limites.archivos} archivos · ${p.nVersiones}/${p.limites.versiones} versiones`));
    page.appendChild(cuota);
    page.appendChild(bloquePrompts());
    const tabs = el('div', 'cd-tabs2');
    [['archivos', 'Archivos'], ['versiones', `Versiones (${p.nVersiones})`], ['web', 'Vista web']].forEach(([k, n]) => { const b = el('button', S.tab === k ? 'is-active' : '', n); b.type = 'button'; b.addEventListener('click', async () => { await guardaYa(); S.tab = k; pinta(); }); tabs.appendChild(b); });
    page.appendChild(tabs);
    const cont = el('div', 'cd-contenido'); page.appendChild(cont);
    if (S.tab === 'archivos') pintaArchivos(cont); else if (S.tab === 'versiones') pintaVersiones(cont); else pintaWeb(cont);
  }
  /* ---------- Prompts vinculados ---------- */
  // Prompts de tipo código cuyo resultado está guardado en este proyecto. El vínculo va en los dos lados (lib/vinculos.js).
  function bloquePrompts() {
    const pr = S.p; const b = el('section', 'cd-vinc');
    const h = el('div', 'cd-vinc-h'); h.appendChild(el('strong', null, 'Prompts vinculados'));
    const acc = el('div', 'cd-vinc-acc'); h.appendChild(acc);
    const lista = el('div', 'cd-vinc-lista'); b.append(h, lista);
    let vivos = [];
    const pinta = async () => {
      try { vivos = (await K.get('/api/vinculos/codigo/proyecto/' + pr.id)).prompts; }
      catch (e) { lista.textContent = ''; return; }
      lista.textContent = '';
      if (!vivos.length) { lista.appendChild(el('p', 'cd-vinc-vacio', 'Ningún prompt vinculado. Crea uno desde este proyecto o vincula un prompt de tipo código que ya tengas.')); return; }
      vivos.forEach(x => {
        const fila = el('div', 'cd-vinc-fila'); fila.appendChild(el('span', 'cd-vinc-n', x.title));
        if (x.status) fila.appendChild(el('span', 'cd-vinc-s', x.status));
        const ver = btn('Ver', 'i-sparkle', async () => { await guardaYa(); K.open('prompt', x.id); }, 'btn sm'); ver.setAttribute('aria-label', `Ver el prompt ${x.title}`);
        const q = btn('', 'i-x', async () => {
          try { await K.post('/api/vinculos/codigo/quitar', { promptId: x.id, proyectoId: pr.id }); K.toast('Vínculo quitado'); pinta(); } catch (e) { K.fail(e); }
        }, 'btn sm ghost icon'); q.title = 'Quitar el vínculo'; q.setAttribute('aria-label', `Quitar el vínculo con ${x.title}`);
        fila.append(ver, q); lista.appendChild(fila);
      });
    };
    const nuevo = btn('Crear prompt', 'i-plus', async () => {
      nuevo.disabled = true;
      try { await K.post('/api/vinculos/codigo/crear-prompt', { proyectoId: pr.id }); K.toast('Prompt creado y vinculado'); K.bus.emit('prompts'); await pinta(); }
      catch (e) { K.fail(e); } finally { nuevo.disabled = false; }
    }, 'btn sm');
    const vinc = btn('Vincular…', 'i-link', async () => {
      try {
        const todos = (await K.get('/api/vinculos/codigo/prompts')).items.filter(x => !vivos.some(v => v.id === x.id));
        if (!todos.length) { K.toast(vivos.length ? 'No quedan más prompts de código por vincular' : 'No tienes prompts de tipo código. Crea uno con «Crear prompt»'); return; }
        K.menu(vinc, todos.map(x => ({ label: x.title, onClick: async () => {
          try { await K.post('/api/vinculos/codigo', { promptId: x.id, proyectoId: pr.id }); K.toast('Prompt vinculado'); K.bus.emit('prompts'); pinta(); } catch (e) { K.fail(e); }
        } })));
      } catch (e) { K.fail(e); }
    }, 'btn sm');
    acc.append(nuevo, vinc);
    pinta();
    return b;
  }
  const nombreZip = () => (S.p.nombre.replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '-') || 'proyecto') + '.zip';
  function datos() {
    const w = el('div', 'cd-form'); const n = el('input'); n.value = S.p.nombre; n.maxLength = 120; n.setAttribute('aria-label', 'Nombre');
    const d = el('input'); d.value = S.p.descripcion; d.maxLength = 300; d.placeholder = 'Descripción'; d.setAttribute('aria-label', 'Descripción');
    const e = K.campoValor({ campo: 'codigo.etiquetas', value: S.p.etiquetas || [], multiple: true, placeholder: 'Etiquetas' }); w.append(n, d, e.el);
    K.modal({ title: 'Proyecto', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { S.p = await K.put(url(''), { nombre: n.value, descripcion: d.value, etiquetas: e.get() }); K.valores.cambio(); pinta(); } catch (er) { K.fail(er); return false; } } }] });
  }
  async function elimina() {
    if (!await K.confirm(`Se eliminará «${S.p.nombre}» con todos sus archivos y versiones.`, { ok: 'Eliminar', danger: true })) return;
    try { await K.del(url('')); clearTimeout(S.timer); S.guardado = true; S.p = null; await carga(); logros(); } catch (e) { K.fail(e); }
  }


  Object.assign(C, { pintaProyecto, bloquePrompts, nombreZip, datos, elimina });
})();
