'use strict';
/* games/anadir.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { ESTADOS, S } = C;
  const guarda = (...a) => C.guarda(...a);
  const guardar = (...a) => C.guardar(...a);
  const load = (...a) => C.load(...a);
  const logros = (...a) => C.logros(...a);
  const pinta = (...a) => C.pinta(...a);

  /* ---------- Añadir (RAWG o manual) ---------- */
  function anadir() {
    const w = el('div', 'gms-form');
    const estado = el('select'); ESTADOS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; estado.appendChild(o); }); estado.value = ['proximo', 'deseado', 'pendiente', 'jugando', 'jugado', 'abandonado'].includes(S.tab) ? S.tab : 'deseado';
    const res = el('div', 'gms-results');
    if (S.rawg) {
      const s = el('label', 'search'); s.appendChild(icon('i-search'));
      const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar juego en RAWG…'; s.appendChild(inp);
      const buscar = K.debounce(async () => {
        const q = inp.value.trim(); res.textContent = ''; if (q.length < 2) return;
        res.appendChild(el('p', 'k-muted', 'Buscando…'));
        try {
          const r = await K.get('/api/games/search?' + K.qs({ q })); res.textContent = '';
          const arr = r.items || [];
          if (!arr.length) res.appendChild(el('p', 'k-muted', 'Sin resultados. Puedes añadirlo a mano.'));
          arr.forEach(it => {
            const row = el('button', 'gms-res'); row.type = 'button';
            const im = el('div', 'gms-res-img'); if (it.image) { const i = el('img'); i.src = it.image; i.alt = ''; i.loading = 'lazy'; im.appendChild(i); }
            const tx = el('div'); tx.append(el('strong', null, it.title || it.name), el('small', 'k-muted', [it.released && it.released.slice(0, 4), (it.platforms || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')));
            row.append(im, tx);
            row.addEventListener('click', async () => {
              row.disabled = true;
              try { await K.post('/api/games/from-rawg', { rawgId: it.rawgId ?? it.id, status: estado.value }); modal.close(); S.tab = estado.value; guarda(); await load(); logros(); K.toast('Juego añadido'); } catch (e) { row.disabled = false; K.fail(e); }
            });
            res.appendChild(row);
          });
        } catch (e) { res.textContent = ''; res.appendChild(el('p', 'k-muted', e.message || 'No se pudo buscar')); }
      }, 350);
      inp.addEventListener('input', buscar);
      w.append(s, res);
      w.appendChild(el('p', 'k-faint gms-attr', 'Datos de RAWG.io'));
    } else {
      w.appendChild(el('p', 'k-muted', 'La búsqueda automática se activa con RAWG_KEY en el .env del servidor. Mientras tanto puedes añadir juegos a mano.'));
    }
    const fila = el('label', 'gms-field'); fila.append(el('span', null, 'Estado inicial'), estado); w.appendChild(fila);
    const modal = K.modal({ title: 'Añadir juego', content: w, actions: [{ label: 'Cancelar' }, { label: 'Añadir a mano', primary: !S.rawg, onClick: () => { const e = estado.value; setTimeout(() => editar(null, e), 0); } }] });
  }

  /* ---------- Formulario completo ---------- */
  function editar(g, estadoInicial) {
    const d = g || { status: estadoInicial || 'deseado', title: '', platforms: [], genres: [], tags: [] };
    const f = {};
    const campo = (clave, etiqueta, tipo = 'text', extra = {}) => {
      const i = el(tipo === 'textarea' ? 'textarea' : 'input'); if (tipo !== 'textarea') i.type = tipo; if (tipo === 'textarea') i.rows = extra.rows || 3;
      const v = d[clave]; i.value = Array.isArray(v) ? v.join(', ') : (v ?? '');
      Object.entries(extra).forEach(([k, val]) => { if (k !== 'rows') i.setAttribute(k, val); });
      f[clave] = i; const l = el('label', 'gms-field'); l.append(el('span', null, etiqueta), i); return l;
    };
    // Valores reutilizables: sugiere los ya usados y unifica variantes al guardar (K.campoValor)
    const vcampo = (clave, etiqueta, multiple, placeholder) => {
      const api = K.campoValor({ campo: 'games.' + clave, value: multiple ? (d[clave] || []) : (d[clave] || ''), multiple, placeholder: placeholder || '' });
      f[clave] = api; const l = el('div', 'gms-field'); l.append(el('span', null, etiqueta), api.el); return l;
    };
    const w = el('div', 'gms-form');
    const st = el('select'); ESTADOS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; st.appendChild(o); }); st.value = d.status; f.status = st;
    const stL = el('label', 'gms-field'); stL.append(el('span', null, 'Estado'), st);
    const fmt = el('select'); [['', 'Sin indicar'], ['fisico', 'Físico'], ['digital', 'Digital']].forEach(([v, n]) => { const o = el('option', null, n); o.value = v; fmt.appendChild(o); }); fmt.value = d.format || ''; f.format = fmt;
    const fmtL = el('label', 'gms-field'); fmtL.append(el('span', null, 'Formato'), fmt);
    const pr = el('select'); [['0', 'Normal'], ['1', 'Baja'], ['2', 'Media'], ['3', 'Alta']].forEach(([v, n]) => { const o = el('option', null, `Prioridad: ${n}`); o.value = v; pr.appendChild(o); }); pr.value = String(d.priority || 0); f.priority = pr;
    const grid = (...x) => { const r = el('div', 'gms-row'); r.append(...x); return r; };
    w.append(
      campo('title', 'Título', 'text', { maxlength: 160, required: 'true' }),
      grid(stL, campo('rating', 'Nota personal (0-10)', 'number', { min: 0, max: 10, step: 0.5, inputmode: 'decimal' })),
      vcampo('platforms', 'Plataformas', true, 'PC, PlayStation 5, Switch…'), vcampo('genres', 'Géneros', true, 'RPG, Aventura…'),
      grid(vcampo('developer', 'Estudio'), vcampo('series', 'Saga')),
      grid(campo('released', 'Salida', 'date'), campo('hours', 'Horas jugadas', 'number', { min: 0, step: 0.5, inputmode: 'decimal' })),
      grid(campo('started', 'Empezado', 'date'), campo('finished', 'Terminado', 'date')),
      grid(campo('percent', '% completado', 'number', { min: 0, max: 100, inputmode: 'numeric' }), campo('replays', 'Rejugadas', 'number', { min: 0, inputmode: 'numeric' })),
      campo('review', 'Reseña', 'textarea', { rows: 4, maxlength: 4000 }),
      grid(campo('pros', 'Lo mejor', 'textarea', { rows: 2 }), campo('cons', 'Lo peor', 'textarea', { rows: 2 })),
      vcampo('tags', 'Etiquetas', true),
      grid(fmtL, pr),
      grid(vcampo('store', 'Tienda'), campo('price', 'Precio pagado (€)', 'number', { min: 0, step: 0.01, inputmode: 'decimal' })),
      grid(campo('targetPrice', 'Precio objetivo (€)', 'number', { min: 0, step: 0.01, inputmode: 'decimal' }), campo('lentTo', 'Prestado a')),
      campo('url', 'Enlace', 'url'),
      (() => { const i = el('input'); i.type = 'file'; i.accept = 'image/*'; f.portada = i; const l = el('label', 'gms-field'); l.append(el('span', null, g && g.cover ? 'Cambiar carátula' : 'Carátula (imagen)'), i); return l; })());
    const cal = K.calField({ value: g && g.cal ? { date: g.cal.date, time: g.cal.time, calendarId: 'juegos' } : null, label: 'Añadir la salida al calendario', hint: 'Se crea un evento en el calendario «Juegos»', defaultDate: d.released || undefined, defaultCalendar: 'juegos' });
    w.appendChild(cal);
    const modal = K.modal({
      title: g ? 'Editar juego' : 'Nuevo juego', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, {
        label: 'Guardar', primary: true, onClick: async () => {
          const v = k => f[k].value;
          const body = {
            title: v('title').trim(), status: v('status'), rating: v('rating') === '' ? null : Number(v('rating')),
            platforms: f.platforms.get(), genres: f.genres.get(), developer: f.developer.get(), series: f.series.get(),
            released: v('released'), hours: v('hours') === '' ? 0 : Number(v('hours')), started: v('started'), finished: v('finished'),
            percent: v('percent') === '' ? 0 : Number(v('percent')), replays: v('replays') === '' ? 0 : Number(v('replays')),
            review: v('review'), pros: v('pros'), cons: v('cons'), tags: f.tags.get(), format: v('format'), priority: Number(v('priority')),
            store: f.store.get(), price: v('price') === '' ? null : Number(v('price')), targetPrice: v('targetPrice') === '' ? null : Number(v('targetPrice')),
            lentTo: v('lentTo'), url: v('url'),
          };
          if (!body.title) { K.toast('Escribe el título'); return false; }
          const c = cal.get(); body.calendar = c ? { date: c.date, time: c.time, calendarId: c.calendarId || 'juegos' } : null;
          if (!g && !c) delete body.calendar;
          const r = await guardar(async () => {
            const res = await (g ? K.put('/api/games/' + g.id, { ...body, base: g.updatedAt }) : K.post('/api/games', body));
            const img = f.portada.files[0];
            if (img && res && res.id) { const fd = new FormData(); fd.append('image', img); const up = await fetch(`${BASE}/api/games/${res.id}/cover`, { method: 'PUT', body: fd, credentials: 'same-origin' }); if (!up.ok) K.toast('El juego se guardó, pero la carátula no se pudo subir'); }
            return res;
          });
          if (r) { K.valores.cambio(); S.tab = body.status; guarda(); pinta(); }
          return !!r;
        },
      }],
    });
  }


  Object.assign(C, { anadir, editar });
})();
