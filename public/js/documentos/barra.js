'use strict';
/* Documentos · barra de formato. En escritorio va fija sobre la hoja; en táctil se acopla encima del teclado (K.acoplaBarra), una fila
   desplazable con botones grandes. Los botones actúan al soltar (click) y no al tocar, para que deslizar la barra no dispare nada, y
   evitan que el editor pierda el foco/la selección (pointerdown + preventDefault). Los menús son propios, no <select>, por lo mismo. */
(function () {
  if (!window.K || !K.documentos) return;
  const D = K.documentos;
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'dc-ic'); s.innerHTML = d; return s; };
  const ALINEA = { izq: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', cen: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', der: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', jus: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>' };
  const COLS = (n) => `<rect x="3" y="4" width="${n === 2 ? 8 : n === 3 ? 5 : 3.5}" height="16" rx="1"/>` + Array.from({ length: n - 1 }, (_, k) => `<rect x="${n === 2 ? 13 : n === 3 ? 9.5 + k * 5.5 : 8 + k * 4.2}" y="4" width="${n === 2 ? 8 : n === 3 ? 5 : 3.5}" height="16" rx="1"/>`).join('');

  let pop = null;
  const cierraPop = () => { if (pop) { pop.remove(); pop = null; } };
  document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.dc-barra'))) cierraPop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cierraPop(); });
  const noRobaFoco = (n) => { n.addEventListener('pointerdown', (e) => e.preventDefault()); n.addEventListener('mousedown', (e) => e.preventDefault()); return n; };

  function abrePop(ancla, contenido) {
    cierraPop();
    pop = document.createElement('div'); pop.className = 'k-pop dc-pop'; noRobaFoco(pop); pop.appendChild(contenido);
    document.body.appendChild(pop);
    const r = ancla.getBoundingClientRect(), barra = ancla.closest('.dc-barra'), dock = barra && barra.classList.contains('k-dock');
    pop.style.left = Math.max(6, Math.min(r.left, innerWidth - pop.offsetWidth - 6)) + 'px';
    if (dock) { pop.style.top = 'auto'; pop.style.bottom = (innerHeight - barra.getBoundingClientRect().top + 6) + 'px'; }
    else pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 6) + 'px';
  }

  D.creaBarra = () => {
    const bar = document.createElement('div'); bar.className = 'dc-barra'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Formato del documento');
    const refs = [];
    const btn = (cont, titulo, fn, on) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dc-btn'; b.title = titulo; b.setAttribute('aria-label', titulo);
      if (typeof cont === 'string') b.textContent = cont; else b.appendChild(cont);
      noRobaFoco(b); b.addEventListener('click', () => { cierraPop(); try { fn(b); } catch (e) { K.fail(e); } setTimeout(D.refrescaBarra, 0); });
      if (on) refs.push({ b, on }); bar.appendChild(b); return b;
    };
    const sep = () => { const s = document.createElement('span'); s.className = 'dc-sep'; bar.appendChild(s); };
    const menu = (etiqueta, titulo, items, ancho, alRefrescar) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dc-btn dc-btn-menu'; b.title = titulo; b.setAttribute('aria-label', titulo); b.setAttribute('aria-haspopup', 'true');
      if (ancho) b.style.minWidth = ancho + 'px';
      const t = document.createElement('span'); t.textContent = etiqueta; b.append(t, svg('<path d="M7 10l5 5 5-5"/>'));
      noRobaFoco(b);
      b.addEventListener('click', () => {
        if (pop && pop._dueno === b) { cierraPop(); return; }
        const caja = document.createElement('div'); caja.className = 'dc-lista';
        for (const it of items(D.estado())) {
          const f = document.createElement('button'); f.type = 'button'; f.className = 'dc-item' + (it.on ? ' on' : ''); f.textContent = it.t; if (it.estilo) f.setAttribute('style', it.estilo);
          noRobaFoco(f); f.addEventListener('click', () => { cierraPop(); try { it.f(); } catch (e) { K.fail(e); } setTimeout(D.refrescaBarra, 0); });
          caja.appendChild(f);
        }
        abrePop(b, caja); pop._dueno = b;
      });
      refs.push({ b, txt: t, alRefrescar }); bar.appendChild(b); return b;
    };
    const paleta = (cont, titulo, fn, sinColor) => {
      const b = btn(cont, titulo, () => {
        const g = document.createElement('div'); g.className = 'dc-paleta';
        for (const c of D.COLORES) { const s = document.createElement('button'); s.type = 'button'; s.className = 'dc-color'; s.style.background = c; s.title = c; s.setAttribute('aria-label', c); noRobaFoco(s); s.addEventListener('click', () => { cierraPop(); fn(c); }); g.appendChild(s); }
        if (sinColor) { const n = document.createElement('button'); n.type = 'button'; n.className = 'dc-color dc-nada'; n.textContent = '∅'; n.title = 'Sin ' + titulo.toLowerCase(); noRobaFoco(n); n.addEventListener('click', () => { cierraPop(); fn(''); }); g.appendChild(n); }
        abrePop(b, g);
      });
      return b;
    };

    btn('↶', 'Deshacer (Ctrl+Z)', () => D.cmd('undo')); btn('↷', 'Rehacer (Ctrl+Y)', () => D.cmd('redo'));
    sep();
    const NOMBRE = { p: 'Texto normal', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', blockquote: 'Cita' };
    menu('Texto normal', 'Estilo de párrafo', (e) => [['p', 'Texto normal', ''], ['h1', 'Título 1', 'font-size:1.6em;font-weight:700'], ['h2', 'Título 2', 'font-size:1.3em;font-weight:700'], ['h3', 'Título 3', 'font-size:1.1em;font-weight:700'], ['blockquote', 'Cita', 'font-style:italic']].map(([k, t, st]) => ({ t, estilo: st, on: e.bloque === k, f: () => (k === 'p' ? D.cmd('formatBlock', 'p') : D.bloque(k)) })), 118, (e, t) => { t.textContent = NOMBRE[e.bloque] || 'Texto normal'; });
    menu('Georgia', 'Fuente', (e) => D.FUENTES.map(f => ({ t: f, estilo: `font-family:'${f}'`, on: e.fuente === f, f: () => D.fuente(f) })), 96, (e, t) => { t.textContent = e.fuente || 'Fuente'; });
    menu('16', 'Tamaño de letra', (e) => D.TAMANOS.map(n => ({ t: n + ' px', on: e.tam === n, f: () => D.tamano(n) })), 54, (e, t) => { t.textContent = e.tam ? String(e.tam) : 'Tamaño'; });
    sep();
    btn('B', 'Negrita (Ctrl+B)', () => D.cmd('bold'), (e) => e.b).style.fontWeight = '800';
    btn('I', 'Cursiva (Ctrl+I)', () => D.cmd('italic'), (e) => e.i).style.fontStyle = 'italic';
    btn('U', 'Subrayado (Ctrl+U)', () => D.cmd('underline'), (e) => e.u).style.textDecoration = 'underline';
    btn('S', 'Tachado', () => D.cmd('strikeThrough'), (e) => e.s).style.textDecoration = 'line-through';
    paleta('A', 'Color del texto', (c) => D.color(c)).classList.add('dc-btn-color');
    paleta('▮', 'Resaltado', (c) => D.resalta(c), true);
    sep();
    for (const [k, c, t] of [['izq', 'justifyLeft', 'Alinear a la izquierda'], ['cen', 'justifyCenter', 'Centrar'], ['der', 'justifyRight', 'Alinear a la derecha'], ['jus', 'justifyFull', 'Justificar']]) btn(svg(ALINEA[k]), t, () => D.cmd(c), (e) => e[k]);
    sep();
    btn('•', 'Lista con viñetas', () => { if (D.cercano('ul.dc-tareas')) D.tareas(); D.cmd('insertUnorderedList'); }, (e) => e.ul);
    btn('1.', 'Lista numerada', () => D.cmd('insertOrderedList'), (e) => e.ol);
    btn('☑', 'Lista de tareas', () => D.tareas(), (e) => e.tareas);
    btn('⇤', 'Reducir sangría', () => D.cmd('outdent')); btn('⇥', 'Aumentar sangría', () => D.cmd('indent'));
    sep();
    btn('🔗', 'Enlace (Ctrl+K)', () => D.enlace());
    menu('Tabla', 'Tabla', (e) => (e.enTabla
      ? [{ t: 'Añadir fila debajo', f: () => D.tablaOp('fila+') }, { t: 'Añadir columna a la derecha', f: () => D.tablaOp('col+') }, { t: 'Quitar esta fila', f: () => D.tablaOp('fila-') }, { t: 'Quitar esta columna', f: () => D.tablaOp('col-') }, { t: 'Borrar la tabla', f: () => D.tablaOp('borrar') }]
      : [{ t: 'Insertar 2 × 2', f: () => D.tabla(2, 2) }, { t: 'Insertar 3 × 3', f: () => D.tabla(3, 3) }, { t: 'Insertar 4 × 3', f: () => D.tabla(4, 3) }, { t: 'Insertar 6 × 4', f: () => D.tabla(6, 4) }]), 70);
    menu('Columnas', 'Columnas de texto', (e) => [2, 3, 4].map(n => ({ t: e.enCols ? `Cambiar a ${n} columnas` : `Insertar ${n} columnas`, on: e.cols === n, f: () => D.columnas(n) })).concat(e.enCols ? [{ t: 'Quitar las columnas (dejar el texto)', f: () => D.quitaColumnas() }] : []), 92);
    btn('―', 'Línea horizontal', () => { D.cmd('insertHorizontalRule'); D.asegura(); });
    btn('❝', 'Cita', () => D.bloque('blockquote'));
    btn('⌫', 'Quitar formato', () => D.limpia());

    D.refrescaBarra = () => { const e = D.estado(); refs.forEach(r => { if (r.on) { const v = !!r.on(e); r.b.classList.toggle('on', v); r.b.setAttribute('aria-pressed', v ? 'true' : 'false'); } if (r.alRefrescar) r.alRefrescar(e, r.txt); }); };
    D.cierraPop = cierraPop;
    return bar;
  };
})();
