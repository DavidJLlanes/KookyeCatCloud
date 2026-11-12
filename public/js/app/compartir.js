'use strict';
/* ---------------------------------------------------------------
   Compartir carpetas y archivos con otros usuarios de este servidor, con permiso de solo
   lectura o de edición. Quien recibe lo ve en "Compartido conmigo" (en su raíz de archivos).
--------------------------------------------------------------- */
(function () {
  const PERM = { read: 'Solo ver', write: 'Puede editar' };
  const idDe = (nombre) => { const m = /~([a-f0-9]{8})$/.exec(nombre); return m ? m[1] : null; };

  /* ---------- Diálogo: compartir un elemento propio ---------- */
  async function compartir(item) {
    let usuarios, mias;
    try { [usuarios, mias] = await Promise.all([K.get('/api/shares/users'), K.get('/api/shares/mine')]); } catch (e) { K.fail(e); return; }
    const actual = mias.shares.find(s => s.path === item.rel);
    const w = el('div');
    if (!usuarios.users.length) {
      w.appendChild(el('p', 'k-muted', 'Todavía no hay otros usuarios en este servidor. El administrador puede crearlos en Administración.'));
      K.modal({ title: 'Compartir con usuarios', sub: item.name, content: w, actions: [{ label: 'Cerrar', primary: true }] });
      return;
    }
    w.appendChild(el('p', 'k-muted', `Elige quién puede ver${item.isDir ? ' esta carpeta' : ' este archivo'} y si puede cambiarlo.`));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 14px';
    const selects = {};
    usuarios.users.forEach(u => {
      const fila = el('div', 'k-row'); fila.style.cssText = 'padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
      const av = el('span', 'av', u.charAt(0).toUpperCase()); av.style.cssText = 'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:#fff;font-weight:700;font-size:13px;flex:none';
      const sel = el('select'); sel.style.cssText = 'width:auto;min-width:150px;padding:8px 32px 8px 12px;font-size:13.5px';
      [['', 'Sin acceso'], ['read', PERM.read], ['write', PERM.write]].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); });
      sel.value = (actual && (actual.grants.find(g => g.user === u) || {}).perm) || '';
      selects[u] = sel;
      fila.append(av, el('b', 'k-grow', u), sel);
      w.appendChild(fila);
    });
    const nota = el('p', 'k-faint', 'Los que tengan permiso de edición pueden subir, renombrar y borrar dentro (lo borrado va a tu papelera). Nadie puede volver a compartirlo con un enlace público.');
    nota.style.cssText = 'font-size:12px;margin-top:14px';
    w.appendChild(nota);
    K.modal({ title: 'Compartir con usuarios', sub: item.name, content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      const grants = Object.entries(selects).filter(([, s]) => s.value).map(([user, s]) => ({ user, perm: s.value }));
      try {
        await K.post('/api/shares', { path: item.rel, grants });
        K.toast(grants.length ? `Compartido con ${grants.length} usuario${grants.length === 1 ? '' : 's'}` : 'Ya no se comparte');
      } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Menú contextual de Archivos ---------- */
  window.KCC.shareMenu = (menu, item, rutas, multi) => {
    if (multi) return;
    if (typeof state !== 'undefined' && state.path === '@compartido') {
      const id = idDe(item.name);
      if (id) opcionCtx(menu, 'i-x', 'Dejar de ver esta carpeta', async () => {
        if (!await K.confirm(`Dejarás de ver “${nombreVisible(item.name)}”. Su dueño puede volver a compartirla contigo.`, { ok: 'Dejar de verla', danger: true })) return;
        try { await K.del('/api/shares/' + id); K.toast('Hecho'); refresh(); } catch (e) { K.fail(e); }
      }, true);
      return;
    }
    if (item.rel && item.rel.startsWith('@compartido')) return;          // lo compartido contigo no se reparte más
    opcionCtx(menu, 'i-users', 'Compartir con usuarios…', () => compartir(item));
  };

  /* ---------- Aviso dentro de una carpeta compartida ---------- */
  function banner(data) {
    let b = $('share-banner');
    if (!b) {
      b = el('div', 'share-banner'); b.id = 'share-banner';
      const bar = $('view-files').querySelector('.subbar'); if (bar) bar.after(b);
    }
    const v = $('view-files');
    const enVirtual = typeof state !== 'undefined' && state.path === '@compartido';
    v.classList.toggle('ro', data.perm === 'read' || enVirtual);
    if (enVirtual) { b.hidden = false; b.className = 'share-banner'; b.textContent = 'Lo que otros usuarios han compartido contigo. Pulsa los tres puntos de una carpeta para dejar de verla.'; return; }
    if (data.perm) {
      b.hidden = false; b.className = 'share-banner ' + data.perm;
      b.textContent = `Compartido por ${data.sharedBy} · ${data.perm === 'write' ? 'puedes editar' : 'solo lectura'}`;
    } else b.hidden = true;
  }
  window.KCC.afterList = banner;

  /* ---------- Tarjeta en Cuenta: ver y gestionar lo compartido ---------- */
  async function resumen() {
    let mias, conmigo;
    try { [mias, conmigo] = await Promise.all([K.get('/api/shares/mine'), K.get('/api/shares/with-me')]); } catch (e) { K.fail(e); return; }
    const w = el('div');
    const titulo = (t) => { const h = el('div', 'k-faint', t); h.style.cssText = 'margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.1em'; return h; };
    w.appendChild(titulo('Lo que yo comparto'));
    if (!mias.shares.length) w.appendChild(el('p', 'k-faint', 'No compartes nada con otros usuarios. Usa “Compartir con usuarios…” en el menú de un archivo o carpeta.'));
    mias.shares.forEach(s => {
      const f = el('div', 'k-row'); f.style.cssText = 'padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
      const info = el('div', 'k-grow'); info.appendChild(el('b', null, s.path));
      const ch = el('div', 'k-chips'); ch.style.marginTop = '4px';
      s.grants.forEach(g => { const c = el('span', 'k-chip'); c.style.setProperty('--c', g.perm === 'write' ? '#f59e0b' : '#3b82f6'); c.textContent = `${g.user} · ${PERM[g.perm]}`; ch.appendChild(c); });
      info.appendChild(ch);
      const ed = el('button', 'btn sm', 'Cambiar'); ed.type = 'button'; ed.addEventListener('click', () => { m.close(); compartir({ rel: s.path, name: s.name, isDir: s.isDir }); });
      const no = el('button', 'btn sm danger', 'Dejar de compartir'); no.type = 'button';
      no.addEventListener('click', async () => { if (!await K.confirm(`“${s.path}” dejará de estar compartido con todos.`, { ok: 'Dejar de compartir', danger: true })) return; try { await K.del('/api/shares/' + s.id); m.close(); resumen(); } catch (e) { K.fail(e); } });
      f.append(info, ed, no); w.appendChild(f);
    });
    w.appendChild(titulo('Lo que comparten conmigo'));
    if (!conmigo.shares.length) w.appendChild(el('p', 'k-faint', 'Nadie ha compartido nada contigo todavía.'));
    conmigo.shares.forEach(s => {
      const f = el('div', 'k-row'); f.style.cssText = 'padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
      const info = el('div', 'k-grow'); info.appendChild(el('b', null, s.name));
      info.appendChild(el('div', 'k-faint', `de ${s.owner} · ${PERM[s.perm]}`)); info.lastChild.style.fontSize = '12px';
      const ab = el('button', 'btn sm', 'Abrir'); ab.type = 'button'; ab.addEventListener('click', () => { m.close(); switchTab('files'); goTo('@compartido/' + s.segment); });
      f.append(info, ab); w.appendChild(f);
    });
    const m = K.modal({ title: 'Compartir con usuarios', content: w, cls: 'wide', actions: [{ label: 'Cerrar', primary: true }] });
  }

  function tarjeta() {
    const v = $('view-cuenta'); if (!v || $('card-compartir')) return;
    const c = el('section', 'card'); c.id = 'card-compartir';
    const h = el('h3'); h.append(icon('i-users'), document.createTextNode(' Compartir con usuarios'));
    c.append(h, el('p', 'card-sub', 'Comparte carpetas o archivos con otros usuarios de este servidor, con permiso de solo lectura o de edición.'));
    const b = el('button', 'btn', 'Ver lo que comparto y lo que comparten conmigo'); b.type = 'button'; b.addEventListener('click', resumen);
    c.appendChild(b);
    v.appendChild(c);
  }
  tarjeta();

  K.sharing = { compartir, resumen };
})();
