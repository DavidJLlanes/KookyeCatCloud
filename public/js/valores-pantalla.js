'use strict';
/* Pantalla «Valores reutilizables» (Cuenta → Valores): revisar duplicados y gestionar los valores guardados.
   Nada se cambia sin que el usuario lo confirme: los grupos de valores parecidos solo se proponen.
   Usa la API de lib/valores.js: GET /api/valores, GET /duplicados, POST /ignorar, POST /:campo/fusionar, DELETE /:campo. */
(function () {
  if (!window.K || !K.valores) return;
  const MODULOS = { prompts: 'Prompts', games: 'Juegos', contacts: 'Contactos', codigo: 'Código' };
  const TIPO = { igual: 'El mismo valor escrito de varias formas', parecido: 'Valores muy parecidos (¿errata?)' };

  K.valores.pantalla = async function (inicial) {
    const S = { tab: inicial || 'dup', campos: [], grupos: [], campo: '' };
    const raiz = el('div', 'vp');
    const tabs = el('div', 'vp-tabs'); tabs.setAttribute('role', 'tablist');
    const cuerpo = el('div', 'vp-body');
    raiz.append(tabs, cuerpo);
    const m = K.modal({ title: 'Valores reutilizables', sub: 'Los valores que escribes (modelo, plataforma, empresa…) se guardan para reutilizarlos sin duplicar. Aquí puedes revisarlos y unirlos.', cls: 'xl vp-modal', content: raiz, actions: [{ label: 'Cerrar', primary: true }] });

    async function recarga() {
      try {
        const [a, b] = await Promise.all([K.get('/api/valores'), K.get('/api/valores/duplicados')]);
        S.campos = a.campos || []; S.grupos = b.grupos || [];
        if (!S.campo || !S.campos.some(c => c.campo === S.campo)) S.campo = (S.campos[0] || {}).campo || '';
      } catch (e) { K.fail(e); }
      K.valores.cambio(); pinta();
    }
    const hecho = async (msg) => { if (msg) K.toast(msg); await recarga(); };

    function pintaTabs() {
      tabs.textContent = '';
      [['dup', `Por revisar${S.grupos.length ? ' · ' + S.grupos.length : ''}`], ['todos', 'Todos los valores']].forEach(([k, n]) => {
        const b = el('button', 'vp-tab' + (S.tab === k ? ' on' : ''), n); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.tab === k ? 'true' : 'false');
        b.addEventListener('click', () => { S.tab = k; pinta(); }); tabs.appendChild(b);
      });
    }
    function pinta() { pintaTabs(); cuerpo.textContent = ''; (S.tab === 'dup' ? pintaDup : pintaTodos)(); }

    /* ---- Duplicados: propuestas que el usuario confirma ---- */
    function pintaDup() {
      if (!S.grupos.length) { cuerpo.appendChild(el('p', 'k-muted vp-vacio', '✓ No hay valores repetidos ni parecidos. Todo está limpio.')); return; }
      cuerpo.appendChild(el('p', 'k-muted', 'Elige cómo quieres que quede cada grupo y pulsa «Unificar»: se cambiarán todos los elementos que usan esas variantes. Si no son lo mismo, pulsa «No son iguales».'));
      S.grupos.forEach((g) => {
        const c = el('section', 'vp-grupo');
        const h = el('header'); h.append(el('strong', null, `${(MODULOS[g.campo.split('.')[0]] || '')} · ${g.etiqueta}`), el('small', 'k-faint', TIPO[g.tipo] || ''));
        const lista = el('div', 'vp-vals');
        const final = el('input'); final.type = 'text'; final.value = g.sugerido; final.maxLength = 80; final.setAttribute('aria-label', 'Valor final');
        g.valores.forEach((v) => {
          const b = el('button', 'vp-val', v.v); b.type = 'button'; b.title = 'Usar este como valor final';
          if (v.n) b.appendChild(el('small', null, ' ×' + v.n));
          b.addEventListener('click', () => { final.value = v.v; });
          lista.appendChild(b);
        });
        const fila = el('div', 'vp-fin'); const l = el('label', 'vp-fin-l'); l.append(el('span', null, 'Dejar como'), final); fila.appendChild(l);
        const un = el('button', 'btn primary', 'Unificar'); un.type = 'button';
        un.addEventListener('click', async () => {
          const a = final.value.trim(); if (!a) { K.toast('Escribe el valor final'); return; }
          un.disabled = true;
          try { const r = await K.post(`/api/valores/${encodeURIComponent(g.campo)}/fusionar`, { de: g.valores.map(v => v.v), a }); await hecho(`Unificado en «${r.valor}»${r.cambiados ? ` (${r.cambiados} elemento${r.cambiados === 1 ? '' : 's'})` : ''}`); }
          catch (e) { un.disabled = false; K.fail(e); }
        });
        const no = el('button', 'btn ghost', 'No son iguales'); no.type = 'button';
        no.addEventListener('click', async () => { try { await K.post('/api/valores/ignorar', { campo: g.campo, valores: g.valores.map(v => v.v) }); await hecho('No se volverá a proponer'); } catch (e) { K.fail(e); } });
        fila.append(un, no);
        c.append(h, lista, fila); cuerpo.appendChild(c);
      });
    }

    /* ---- Todos los valores de un campo ---- */
    function pintaTodos() {
      if (!S.campos.length) { cuerpo.appendChild(el('p', 'k-muted vp-vacio', 'Aún no hay campos con valores guardados.')); return; }
      const sel = el('select'); sel.setAttribute('aria-label', 'Campo');
      S.campos.forEach((c) => { const o = el('option', null, `${MODULOS[c.modulo] || c.modulo} · ${c.etiqueta} (${c.valores.length})`); o.value = c.campo; sel.appendChild(o); });
      sel.value = S.campo; sel.addEventListener('change', () => { S.campo = sel.value; pinta(); });
      const cab = el('div', 'vp-cab'); cab.appendChild(sel);
      const nuevo = el('input'); nuevo.type = 'text'; nuevo.placeholder = 'Añadir un valor…'; nuevo.maxLength = 80; nuevo.setAttribute('aria-label', 'Añadir un valor');
      const add = el('button', 'btn', 'Añadir'); add.type = 'button';
      const anade = async () => { if (!nuevo.value.trim()) return; try { await K.post('/api/valores/' + encodeURIComponent(S.campo), { valor: nuevo.value }); await hecho('Valor guardado'); } catch (e) { K.fail(e); } };
      add.addEventListener('click', anade); nuevo.addEventListener('keydown', (e) => { if (e.key === 'Enter') anade(); });
      cab.append(nuevo, add); cuerpo.appendChild(cab);
      const ficha = S.campos.find(c => c.campo === S.campo);
      if (!ficha || !ficha.valores.length) { cuerpo.appendChild(el('p', 'k-muted vp-vacio', 'Este campo no tiene valores todavía.')); return; }
      const ul = el('div', 'vp-lista');
      ficha.valores.forEach((v) => {
        const f = el('div', 'vp-fila');
        const nombre = el('span', 'vp-nombre', v.v); nombre.title = v.v;
        const n = el('small', 'k-muted', v.n ? `${v.n} elemento${v.n === 1 ? '' : 's'}` : 'sin usar');
        const acc = el('div', 'vp-acc');
        if (v.n) { const ver = el('button', 'btn ghost tiny', 'Ver'); ver.type = 'button'; ver.addEventListener('click', () => { m.close(); K.filtrar(ficha.campo, v.v); }); acc.appendChild(ver); }
        const ren = el('button', 'btn ghost tiny', 'Renombrar'); ren.type = 'button';
        ren.addEventListener('click', async () => {
          const a = await K.ask('Renombrar «' + v.v + '»', { value: v.v, sub: 'Si el nuevo nombre ya existe, se unirán.' });
          if (!a || a === v.v) return;
          try { const r = await K.post(`/api/valores/${encodeURIComponent(ficha.campo)}/fusionar`, { de: [v.v], a }); await hecho(r.cambiados ? `Renombrado en ${r.cambiados} elemento${r.cambiados === 1 ? '' : 's'}` : 'Renombrado'); } catch (e) { K.fail(e); }
        });
        const del = el('button', 'btn ghost tiny', 'Quitar'); del.type = 'button';
        if (v.n) { del.disabled = true; del.title = 'Está en uso: renómbralo o únelo con otro valor'; }
        else del.addEventListener('click', async () => { try { await K.del(`/api/valores/${encodeURIComponent(ficha.campo)}?v=${encodeURIComponent(v.v)}`); await hecho('Valor quitado'); } catch (e) { K.fail(e); } });
        acc.append(ren, del);
        f.append(nombre, n, acc); ul.appendChild(f);
      });
      cuerpo.appendChild(ul);
    }

    pinta();
    await recarga();
  };

  // Tarjeta en Cuenta
  function monta() {
    const v = document.getElementById('valores-abrir'); if (!v || v.dataset.ok) return; v.dataset.ok = '1';
    v.addEventListener('click', () => K.valores.pantalla());
  }
  monta();
})();
