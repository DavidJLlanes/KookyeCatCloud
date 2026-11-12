'use strict';
/* Buscar · pantalla principal: caja de búsqueda, modo «Buscar» (sin IA) o «Preguntar a la IA», filtros por módulo y registro de la vista. */
(function () {
  if (!window.K || !K.buscar || !document.getElementById('view-buscar')) return;
  const B = K.buscar, S = B.S;
  const root = document.getElementById('view-buscar');
  let caja = null;

  function esqueleto() {
    root.textContent = '';
    const page = el('div', 'bu-page');
    const cab = el('div', 'bu-head');
    const tit = el('div'); tit.append(el('h1', null, 'Buscar'), el('p', 'k-faint', 'Todo lo tuyo en un solo sitio, sin IA. Y, si conectas una, hazle preguntas sobre tus notas y datos.'));
    const aj = el('button', 'btn sm'); aj.type = 'button'; aj.append(icon('i-key'), el('span', null, 'Ajustes de IA')); aj.addEventListener('click', () => B.ajustes());
    cab.append(tit, aj);
    const barra = el('div', 'bu-barra');
    const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.maxLength = 600; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar o preguntar');
    const ir = el('button', 'btn primary bu-ir', 'Preguntar'); ir.type = 'button';
    const modos = el('div', 'bu-modos');
    const modo = (v, t, ic) => { const b = el('button', 'bu-modo' + (S.modo === v ? ' on' : '')); b.type = 'button'; b.append(icon(ic), el('span', null, t)); b.addEventListener('click', () => { S.modo = v; S.error = ''; B.pintaTodo(); if (v === 'ia' && !S.config) B.cargaConfig().then(B.pintaTodo).catch(() => {}); }); return b; };
    modos.append(modo('buscar', 'Buscar', 'i-search'), modo('ia', 'Preguntar a la IA', 'i-sparkle'));
    barra.append(inp, ir);
    const chips = el('div', 'bu-chips');
    const cuerpo = el('div', 'bu-cuerpo');
    page.append(cab, modos, barra, chips, cuerpo); root.appendChild(page);
    caja = { inp, ir, chips, cuerpo, modos };
    const lanzaD = K.debounce(() => { if (S.modo === 'buscar') B.lanza(); }, 220);
    inp.addEventListener('input', () => { S.q = inp.value; lanzaD(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (S.modo === 'ia') B.pregunta(); else B.lanza(); } });
    ir.addEventListener('click', () => (S.modo === 'ia' ? B.pregunta() : B.lanza()));
  }

  B.pintaTodo = () => {
    if (!caja) return;
    caja.modos.querySelectorAll('.bu-modo').forEach((b, i) => b.classList.toggle('on', (i === 0) === (S.modo === 'buscar')));
    caja.ir.hidden = S.modo !== 'ia'; caja.ir.disabled = S.ocupado;
    caja.inp.placeholder = S.modo === 'ia' ? 'Pregunta algo sobre tus notas, pagos, contactos…' : 'Busca en todo: notas, prompts, bases, archivos…';
    if (S.modo === 'ia') { caja.chips.textContent = ''; B.pintaIA(caja.cuerpo); }
    else { B.pintaChips(caja.chips); B.pintaResultados(caja.cuerpo); }
  };

  let tok = 0;
  B.lanza = async () => {
    const q = S.q.trim();
    if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 2) { tok++; S.res = null; S.error = ''; B.pintaTodo(); return; }
    const n = ++tok;
    try {
      const r = await B.busca(q, S.m);
      if (n !== tok) return;
      S.res = r; S.error = '';
      if (q.length >= 3) { S.recientes = [q, ...S.recientes.filter(x => x !== q)].slice(0, 15); B.logros(); }
    } catch (e) { if (n !== tok) return; S.res = null; S.error = (e && e.message) || 'No se pudo buscar'; }
    B.pintaTodo();
  };

  // Abrir la vista con una consulta ya escrita (Ctrl K → «Ver todos los resultados»)
  B.abreCon = (q) => { S.q = q || ''; S.modo = 'buscar'; S.m = ''; switchTab('buscar'); };

  // Acceso rápido a la IA, siempre visible bajo la barra superior
  B.abreIA = () => { S.modo = 'ia'; S.error = ''; switchTab('buscar'); if (!S.config) B.cargaConfig().then(B.pintaTodo).catch(() => {}); };
  const acceso = document.getElementById('btn-ia');
  if (acceso) acceso.addEventListener('click', B.abreIA);

  K.registerView('buscar', {
    async open() {
      if (!caja || !root.contains(caja.inp)) esqueleto();
      caja.inp.value = S.q;
      B.pintaTodo();
      K.get('/api/busqueda/recientes').then(r => { S.recientes = r.recientes || []; if (!S.res && S.modo === 'buscar') B.pintaTodo(); }).catch(() => {});
      B.cargaConfig().then(() => { if (S.modo === 'ia' || S.res) B.pintaTodo(); }).catch(() => {});
      if (S.q) B.lanza();
      setTimeout(() => { try { caja.inp.focus({ preventScroll: true }); } catch { /* sin foco */ } }, 60);
    },
    close() {},
  });
})();
