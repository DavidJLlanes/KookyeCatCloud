'use strict';
/* notes/ricos-columnas.js: columnas con bloques dentro (texto, listas, listas numeradas, tareas e imágenes).
     :::columns                  Cada columna es Markdown normal; los bloques se separan con una línea en blanco:
     texto - lista - [ ] tarea   "texto", "- elemento", "1. elemento", "- [ ] tarea", "![](kcc:file/…)"
     :::col
     ![](kcc:file/foto.jpg)
     :::                                                                                                                  */
(function () {
  const C = (K._notes = K._notes || {});
  const MAX_COLS = 4;
  const n = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; return x; };
  const boton = (cls, titulo, texto, fn) => { const b = n('button', cls, texto); b.type = 'button'; b.title = titulo; b.setAttribute('aria-label', titulo); b.addEventListener('click', (e) => { e.preventDefault(); fn(); }); return b; };
  const RE_TODO = /^[-*+] \[( |x|X)\](?: (.*))?$/, RE_UL = /^[-*+](?: (.*))?$/, RE_OL = /^\d+[.)](?: (.*))?$/, RE_IMG = /^!\[([^\]]*)\]\((kcc:file\/[^)\s]+)\)\s*$/;
  const tipoDe = (l) => (RE_TODO.test(l) ? 'todo' : RE_UL.test(l) ? 'ul' : RE_OL.test(l) ? 'ol' : '');
  const esc = (t) => String(t || '').replace(/<br>/g, ' ').replace(/^(?=:{2,3}|\$\$)/, '\\');

  // Markdown de una columna → bloques anidados { k: 'p'|'ul'|'ol'|'todo'|'img', … }
  function parseCol(lines) {
    const out = []; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      const im = RE_IMG.exec(l);
      if (im) { out.push({ k: 'img', src: im[2], alt: im[1] }); i++; continue; }
      const k = tipoDe(l);
      if (k) {
        const items = [];
        while (i < lines.length && tipoDe(lines[i]) === k) {
          const m = (k === 'todo' ? RE_TODO : k === 'ul' ? RE_UL : RE_OL).exec(lines[i]);
          items.push(k === 'todo' ? { text: C.desescapa([m[2] || '']), done: m[1] !== ' ' } : { text: C.desescapa([m[1] || '']) }); i++;
        }
        out.push({ k, items }); continue;
      }
      const par = [];
      while (i < lines.length && lines[i].trim() && !tipoDe(lines[i]) && !RE_IMG.test(lines[i])) par.push(lines[i++]);
      out.push({ k: 'p', text: C.desescapa(par) });
    }
    return out;
  }
  // Bloques anidados → líneas de Markdown (separados por una línea en blanco)
  function lineasCol(items) {
    const bloques = (items || []).map(it => {
      if (it.k === 'img') return [`![${String(it.alt || '').replace(/\\?[[\]]/g, '')}](${it.src})`];
      if (it.k === 'p') return C.lineasMd(it.text);
      return (it.items || []).map((x, j) => (it.k === 'ol' ? `${j + 1}. ` : it.k === 'todo' ? (x.done ? '- [x] ' : '- [ ] ') : '- ') + esc(x.text));
    }).filter(l => l.length);
    return bloques.flatMap((l, j) => [...(j ? [''] : []), ...l]);
  }

  /* ---------- Dibujo ---------- */
  const foco = (sub, fin) => C.ricoFoco({ querySelectorAll: () => [sub] }, fin);
  const marca = (lista) => {
    const k = lista.dataset.k;
    [...lista.children].forEach((f, j) => { const m = f.querySelector('.nb-nmk'); if (m && k !== 'todo') m.textContent = k === 'ol' ? (j + 1) + '.' : '•'; });
  };
  function quita(nb) {
    const b = boton('nb-nx', 'Quitar este bloque', '×', () => {
      const cuerpo = nb.parentNode; nb.remove();
      if (!cuerpo.children.length) cuerpo.appendChild(pintaBloque({ k: 'p', text: '' }));
      C.change(true);
    });
    return b;
  }
  function saleDeLista(fila, lista, nb) {
    const cuerpo = nb.parentNode; fila.remove();
    if (!lista.children.length) nb.remove();
    const p = pintaBloque({ k: 'p', text: '' });
    const ref = lista.children.length ? nb : null;
    if (ref) ref.after(p); else cuerpo.appendChild(p);
    foco(p.querySelector('.nb-sub')); C.change(true);
  }
  function pintaFila(k, it) {
    const f = n('div', 'nb-nli' + (it.done ? ' is-done' : ''));
    const mk = n('span', 'nb-nmk');
    if (k === 'todo') {
      const b = n('button', 'nb-chk' + (it.done ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', 'Marcar tarea'); b.appendChild(icon('i-check'));
      b.addEventListener('click', (e) => { e.preventDefault(); f.classList.toggle('is-done'); b.classList.toggle('on'); C.change(true); });
      mk.appendChild(b);
    }
    const s = C.subEditable('nb-una-linea nb-nlt', it.text, 'Elemento');
    s.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const lista = f.parentNode, nb = lista.parentNode;
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (!s.textContent.trim()) { saleDeLista(f, lista, nb); return; }
        const nueva = pintaFila(k, { text: '' }); f.after(nueva); marca(lista); foco(nueva.querySelector('.nb-sub')); C.change(true);
      } else if (e.key === 'Backspace' && !s.textContent) {
        e.preventDefault(); e.stopPropagation();
        const antes = f.previousElementSibling; f.remove();
        if (!lista.children.length) { const cuerpo = nb.parentNode; nb.remove(); if (!cuerpo.children.length) cuerpo.appendChild(pintaBloque({ k: 'p', text: '' })); foco(cuerpo.lastElementChild.querySelector('.nb-sub')); }
        else { marca(lista); foco((antes || lista.firstElementChild).querySelector('.nb-sub'), true); }
        C.change(true);
      }
    });
    f.append(mk, s); return f;
  }
  function pintaBloque(it) {
    const nb = n('div', 'nb-nb'); nb.dataset.k = it.k;
    if (it.k === 'p') nb.appendChild(C.subEditable('nb-np', it.text, 'Escribe aquí'));
    else if (it.k === 'img') {
      nb.dataset.src = it.src || ''; nb.dataset.alt = it.alt || '';
      const fig = n('figure', 'nb-nimg'); const img = n('img'); img.alt = it.alt || ''; img.loading = 'lazy';
      img.src = BASE + '/api/preview?path=' + encodeURIComponent(C.rutaDeSrc(it.src || ''));
      img.addEventListener('error', () => { fig.classList.add('rota'); fig.title = 'No se encuentra esta imagen'; });
      fig.appendChild(img); nb.appendChild(fig);
    } else {
      const lista = n('div', 'nb-nl'); lista.dataset.k = it.k;
      (it.items && it.items.length ? it.items : [{ text: '' }]).forEach(x => lista.appendChild(pintaFila(it.k, x)));
      marca(lista); nb.appendChild(lista);
    }
    nb.appendChild(quita(nb)); return nb;
  }
  async function anadeImagenes(cuerpo, files) {
    const I = window.NB && NB.imagenes; if (!I || !I.sube) { K.toast('Las imágenes no están disponibles'); return; }
    const lista = [...files].filter(f => /^image\//.test(f.type) || I.EXT.test(f.name || ''));
    if (!lista.length) { K.toast('Elige una imagen (JPG, PNG, WebP, GIF, HEIC…)'); return; }
    K.toast(lista.length === 1 ? 'Subiendo imagen…' : `Subiendo ${lista.length} imágenes…`);
    const { rutas, fallos } = await I.sube(lista);
    rutas.forEach(r => cuerpo.appendChild(pintaBloque({ k: 'img', src: 'kcc:file/' + C.refArchivo(r), alt: '' })));
    if (rutas.length) C.change(true);
    if (fallos.length) K.fail(new Error(fallos.join('\n')));
  }
  function pintaCol(items) {
    const col = n('div', 'nb-ncol'); const cuerpo = n('div', 'nb-ncol-cuerpo');
    (items.length ? items : [{ k: 'p', text: '' }]).forEach(it => cuerpo.appendChild(pintaBloque(it)));
    const tools = n('div', 'nb-ncol-tools');
    const anade = (it) => () => { const b = pintaBloque(it); cuerpo.appendChild(b); const s = b.querySelector('.nb-sub'); if (s) foco(s); C.change(true); };
    [['¶ Texto', 'Añadir un párrafo', { k: 'p', text: '' }], ['• Lista', 'Añadir una lista', { k: 'ul', items: [{ text: '' }] }], ['1. Lista', 'Añadir una lista numerada', { k: 'ol', items: [{ text: '' }] }], ['☑ Tareas', 'Añadir una lista de tareas', { k: 'todo', items: [{ text: '', done: false }] }]]
      .forEach(([t, ayuda, it]) => tools.appendChild(boton('btn ghost sm', ayuda, t, anade(it))));
    const entrada = n('input'); entrada.type = 'file'; entrada.accept = 'image/*'; entrada.multiple = true; entrada.hidden = true;
    entrada.addEventListener('change', () => { const fs = [...entrada.files]; entrada.value = ''; anadeImagenes(cuerpo, fs); });
    tools.append(boton('btn ghost sm', 'Añadir una imagen', '🖼 Imagen', () => entrada.click()), entrada);
    col.append(cuerpo, tools); return col;
  }

  /* ---------- Lectura del DOM ---------- */
  function leeBloque(nb) {
    const k = nb.dataset.k;
    if (k === 'p') return { k, text: C.leeSub(nb.querySelector('.nb-sub')) };
    if (k === 'img') return { k, src: nb.dataset.src || '', alt: nb.dataset.alt || '' };
    return { k, items: [...nb.querySelectorAll('.nb-nli')].map(f => ({ text: C.leeSub(f.querySelector('.nb-sub')).replace(/<br>/g, ' '), done: f.classList.contains('is-done') })) };
  }
  const leeCols = (rejilla) => [...rejilla.querySelectorAll(':scope > .nb-ncol')].map(col => [...col.querySelectorAll(':scope > .nb-ncol-cuerpo > .nb-nb')].map(leeBloque));

  C.registraRico('columns', {
    slash: ['Columnas', 'Columnas con texto, listas e imágenes (hasta 4)', '▥'],
    nuevo: () => ({ cols: [[], []] }),
    alCrear: (w) => { const s = w.querySelector('.nb-sub'); if (s) s.focus(); },
    parse(lines, i) {
      if (!/^:::columns\s*$/.test(lines[i])) return null;
      const cols = [[]]; i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { if (/^:::col\s*$/.test(lines[i])) { if (cols.length < MAX_COLS) cols.push([]); } else cols[cols.length - 1].push(lines[i]); i++; }
      while (cols.length < 2) cols.push([]);
      return { b: { t: 'columns', cols: cols.map(parseCol) }, next: i + 1 };
    },
    md: (b) => [':::columns', ...(b.cols || [[], []]).flatMap((c, k) => [...(k ? [':::col'] : []), ...lineasCol(typeof c === 'string' ? parseCol(C.lineasMd(c)) : c)]), ':::'].join('\n'),
    pinta(w, c, b) {
      const rejilla = n('div', 'nb-cols');
      const dibuja = (cols) => { rejilla.textContent = ''; rejilla.dataset.n = cols.length; cols.forEach(col => rejilla.appendChild(pintaCol(typeof col === 'string' ? parseCol(C.lineasMd(col)) : col))); };
      dibuja(b.cols && b.cols.length ? b.cols : [[], []]);
      const barra = n('div', 'nb-cols-tools');
      barra.append(
        boton('btn ghost sm', 'Añadir una columna', '+ Columna', () => { const v = leeCols(rejilla); if (v.length < MAX_COLS) { v.push([]); dibuja(v); C.change(true); } }),
        boton('btn ghost sm', 'Quitar la última columna', '− Columna', () => { const v = leeCols(rejilla); if (v.length > 2) { v.pop(); dibuja(v); C.change(true); } }));
      c.append(rejilla, barra);
    },
    lee: (w, b) => ({ ...b, cols: leeCols(w.querySelector('.nb-cols')) }),
  });
})();
