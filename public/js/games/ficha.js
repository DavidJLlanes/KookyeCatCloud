'use strict';
/* games/ficha.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { NOMBRE, S } = C;
  const btn = (...a) => C.btn(...a);
  const caratula = (...a) => C.caratula(...a);
  const chips = (...a) => C.chips(...a);
  const editar = (...a) => C.editar(...a);
  const eur = (...a) => C.eur(...a);
  const fechaTxt = (...a) => C.fechaTxt(...a);
  const guardar = (...a) => C.guardar(...a);
  const load = (...a) => C.load(...a);
  const nf = (...a) => C.nf(...a);
  const tarjetaJuego = (...a) => C.tarjetaJuego(...a);

  /* ---------- Ficha ---------- */
  function ficha(id) {
    const g = S.items.find(x => x.id === id); if (!g) return;
    const w = el('div', 'gms-ficha');
    const top = el('div', 'gms-ficha-top'); top.appendChild(caratula(g, 'grande'));
    const info = el('div', 'gms-ficha-info');
    const sub = el('p', 'k-muted'); sub.append(NOMBRE[g.status] || ''); if ((g.platforms || []).length) { sub.append(' · '); sub.appendChild(chips('games.platforms', g.platforms)); } info.append(el('h2', null, g.title), sub);
    if (g.rating != null) info.appendChild(el('div', 'gms-nota-grande', `★ ${nf(g.rating)}/10`));
    const datos = [['Horas', g.hours ? `${nf(g.hours)} h` : ''], ['Géneros', (g.genres || []).length ? chips('games.genres', g.genres) : ''], ['Estudio', g.developer ? chips('games.developer', [g.developer]) : ''], ['Saga', g.series ? chips('games.series', [g.series]) : ''], ['Salida', fechaTxt(g.released)], ['Empezado', fechaTxt(g.started)], ['Terminado', fechaTxt(g.finished)], ['Completado', g.percent ? g.percent + '%' : ''], ['Rejugadas', g.replays || ''], ['Formato', g.format === 'fisico' ? 'Físico' : g.format === 'digital' ? 'Digital' : ''], ['Tienda', g.store ? chips('games.store', [g.store]) : ''], ['Precio', g.price != null ? eur(g.price) : ''], ['Precio objetivo', g.targetPrice != null ? eur(g.targetPrice) : ''], ['Prestado a', g.lentTo]].filter(x => x[1] !== '' && x[1] != null);
    const dl = el('dl', 'gms-datos'); datos.forEach(([k, v]) => { const dd = el('dd'); if (v instanceof Node) dd.appendChild(v); else dd.textContent = String(v); dl.append(el('dt', null, k), dd); }); info.appendChild(dl);
    top.appendChild(info); w.appendChild(top);
    if (g.review) w.appendChild(el('p', 'gms-review', g.review));
    if (g.pros) w.appendChild(el('p', 'gms-pc', '👍 ' + g.pros));
    if (g.cons) w.appendChild(el('p', 'gms-pc', '👎 ' + g.cons));
    if ((g.tags || []).length) { const t = el('div', 'gms-tags'); g.tags.forEach(x => t.appendChild(K.chipValor('games.tags', x))); w.appendChild(t); }
    if (g.url) { const a = el('a', 'gms-link', 'Abrir enlace'); a.href = g.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; w.appendChild(a); }
    const rapidas = el('div', 'gms-quick');
    rapidas.append(
      btn('Sesión', 'i-plus', () => { m.close(); setTimeout(() => sesion(g), 0); }, 'btn sm'),
      btn('Tarjeta', 'i-star', () => { m.close(); setTimeout(() => tarjetaJuego(g), 0); }, 'btn sm'),
      btn('Carátula', 'i-image', () => subePortada(g), 'btn sm'),
      btn('Copiar o mover a…', 'i-move', () => { m.close(); setTimeout(() => K.transferir.abre({ tipo: 'juegos', ids: [g.id], titulo: g.title }, { alTerminar: () => load() }), 0); }, 'btn sm'));
    if (S.rawg) rapidas.appendChild(btn('Buscar en RAWG', 'i-search', () => { m.close(); setTimeout(() => vincula(g), 0); }, 'btn sm'));
    w.appendChild(rapidas);
    const m = K.modal({
      title: '', content: w, cls: 'wide', actions: [
        { label: 'Cerrar' },
        { label: 'Eliminar', danger: true, onClick: async () => { if (!await K.confirm(`Se eliminará «${g.title}» y su carátula.`, { ok: 'Eliminar', danger: true })) return false; return !!await guardar(() => K.del('/api/games/' + g.id)); } },
        { label: 'Editar', primary: true, onClick: () => { setTimeout(() => editar(g), 0); return true; } },
      ],
    });
  }
  /* ---------- Buscar carátula y datos en RAWG para un juego existente ---------- */
  function vincula(g) {
    const w = el('div', 'gms-form'); const res = el('div', 'gms-results');
    const s = el('label', 'search'); s.appendChild(icon('i-search'));
    const inp = el('input'); inp.type = 'search'; inp.value = g.title; s.appendChild(inp);
    const buscar = async () => {
      const q = inp.value.trim(); res.textContent = ''; if (q.length < 2) return;
      res.appendChild(el('p', 'k-muted', 'Buscando…'));
      try {
        const r = await K.get('/api/games/search?' + K.qs({ q })); res.textContent = '';
        if (!r.items.length) res.appendChild(el('p', 'k-muted', 'Sin resultados. Prueba con otro nombre.'));
        r.items.forEach(it => {
          const row = el('button', 'gms-res'); row.type = 'button';
          const im = el('div', 'gms-res-img'); if (it.image) { const i = el('img'); i.src = it.image; i.alt = ''; i.loading = 'lazy'; im.appendChild(i); }
          const tx = el('div'); tx.append(el('strong', null, it.title), el('small', 'k-muted', [it.released && it.released.slice(0, 4), (it.platforms || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')));
          row.append(im, tx);
          row.addEventListener('click', async () => {
            row.disabled = true;
            try { await K.post(`/api/games/${g.id}/rawg`, { rawgId: it.rawgId }); m.close(); await load(); K.toast('Carátula y datos actualizados'); } catch (e) { row.disabled = false; K.fail(e); }
          });
          res.appendChild(row);
        });
      } catch (e) { res.textContent = ''; res.appendChild(el('p', 'k-muted', e.message || 'No se pudo buscar')); }
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
    w.append(s, res, el('p', 'k-faint gms-attr', 'Datos de RAWG.io · se pone la carátula y solo se rellenan los campos vacíos'));
    const m = K.modal({ title: 'Buscar en RAWG', content: w, actions: [{ label: 'Cerrar' }, { label: 'Buscar', primary: true, onClick: () => { buscar(); return false; } }] });
    setTimeout(buscar, 50);
  }
  function sesion(g) {
    const h = el('input'); h.type = 'number'; h.min = '0.25'; h.step = '0.25'; h.value = '1'; h.inputmode = 'decimal';
    const l = el('label', 'gms-field'); l.append(el('span', null, 'Horas jugadas hoy'), h);
    K.modal({ title: `Sesión de ${g.title}`, content: l, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { const n = Number(h.value); if (!(n > 0)) return false; return !!await guardar(() => K.post(`/api/games/${g.id}/sessions`, { hours: n })); } }] });
    setTimeout(() => h.select(), 50);
  }
  function subePortada(g) {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try { const fd = new FormData(); fd.append('image', f); const r = await fetch(`${BASE}/api/games/${g.id}/cover`, { method: 'PUT', body: fd, credentials: 'same-origin' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo subir'); await load(); K.toast('Carátula actualizada'); } catch (e) { K.fail(e); }
    });
    inp.click();
  }


  Object.assign(C, { ficha, vincula, sesion, subePortada });
})();
