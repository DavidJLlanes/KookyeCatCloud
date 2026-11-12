'use strict';
/* Documentos · órdenes de formato sobre el editor (D.ed): estilos de párrafo, fuente, tamaño, color, listas, enlaces, tablas y columnas. */
(function () {
  if (!window.K || !K.documentos) return;
  const D = K.documentos;
  const BLOQUES = 'p,h1,h2,h3,li,blockquote,pre,td,th,div.dc-col';

  const dentro = () => { const s = getSelection(); return s.rangeCount && D.ed && D.ed.contains(s.anchorNode) ? s : null; };
  const nodoSel = () => { const s = dentro(); if (!s) return null; const n = s.anchorNode; return n.nodeType === 3 ? n.parentNode : n; };
  D.cercano = (sel) => { const n = nodoSel(); const c = n && n.closest ? n.closest(sel) : null; return c && D.ed.contains(c) ? c : null; };
  D.cmd = (nombre, valor) => { if (!D.ed) return false; D.ed.focus({ preventScroll: true }); try { document.execCommand('styleWithCSS', false, true); } catch { /* sin CSS */ } const ok = document.execCommand(nombre, false, valor); D.cambio(); return ok; };

  D.bloque = (tag) => {
    const actual = (D.cercano('h1,h2,h3,blockquote') || {}).tagName;
    D.cmd('formatBlock', actual && actual.toLowerCase() === tag && tag !== 'p' ? 'p' : tag);
  };

  // Tamaño en píxeles: execCommand solo conoce 1-7, así que se pide el 7 y se cambia por el tamaño real
  D.tamano = (px) => {
    const s = dentro(); if (!s) return;
    if (s.isCollapsed) { const b = D.cercano(BLOQUES); if (!b) return; const r = document.createRange(); r.selectNodeContents(b); s.removeAllRanges(); s.addRange(r); }
    D.cmd('fontSize', '7');
    D.ed.querySelectorAll('font[size="7"], span[style*="xxx-large"]').forEach(f => {
      const sp = f.tagName === 'FONT' ? document.createElement('span') : f;
      if (f !== sp) { while (f.firstChild) sp.appendChild(f.firstChild); f.replaceWith(sp); }
      sp.style.fontSize = px + 'px';
    });
    D.cambio();
  };
  D.fuente = (f) => D.cmd('fontName', f);
  D.color = (c) => D.cmd('foreColor', c);
  D.resalta = (c) => D.cmd(c ? 'hiliteColor' : 'removeFormat', c || undefined);

  D.tareas = () => {
    let ul = D.cercano('ul');
    if (!ul) { D.cmd('insertUnorderedList'); ul = D.cercano('ul'); }
    if (ul) { ul.classList.toggle('dc-tareas'); ul.querySelectorAll('li.dc-hecha').forEach(li => { if (!ul.classList.contains('dc-tareas')) li.classList.remove('dc-hecha'); }); D.cambio(); }
  };
  D.limpia = () => { D.cmd('removeFormat'); D.cmd('formatBlock', 'p'); D.ed.querySelectorAll('font').forEach(f => f.replaceWith(...f.childNodes)); };

  D.enlace = async () => {
    const s = dentro(); if (!s) return;
    const guardado = s.getRangeAt(0).cloneRange();
    const a = D.cercano('a');
    const url = await K.ask('Enlace', { value: a ? a.getAttribute('href') : '', placeholder: 'https://…', ok: 'Poner enlace', sub: 'Déjalo vacío para quitar el enlace' });
    if (url === null) return;
    D.ed.focus({ preventScroll: true }); const t = getSelection(); t.removeAllRanges(); t.addRange(guardado);
    if (!url) D.cmd('unlink');
    else if (/^(https?:|mailto:|tel:)/i.test(url)) D.cmd('createLink', url);
    else if (/^[\w.-]+\.\w{2,}/.test(url)) D.cmd('createLink', 'https://' + url);
    else K.toast('Enlace no válido');
  };

  /* ---------- Tablas ---------- */
  D.tabla = (f = 3, c = 3) => {
    const celda = '<td><br></td>';
    D.cmd('insertHTML', `<table><tbody>${('<tr>' + celda.repeat(c) + '</tr>').repeat(f)}</tbody></table><p><br></p>`);
  };
  D.tablaOp = (op) => {
    const td = D.cercano('td,th'), tr = td && td.parentElement, tb = td && td.closest('table'); if (!td) return;
    const i = [...tr.children].indexOf(td);
    const vacia = (t) => { const n = document.createElement(t); n.innerHTML = '<br>'; return n; };
    if (op === 'fila+') { const n = tr.cloneNode(false); [...tr.children].forEach(() => n.appendChild(vacia('td'))); tr.after(n); }
    else if (op === 'col+') tb.querySelectorAll('tr').forEach(r => { const ref = r.children[i]; const n = vacia(ref && ref.tagName === 'TH' ? 'th' : 'td'); if (ref) ref.after(n); else r.appendChild(n); });
    else if (op === 'fila-') { if (tb.querySelectorAll('tr').length > 1) tr.remove(); else tb.remove(); }
    else if (op === 'col-') { if (tr.children.length > 1) tb.querySelectorAll('tr').forEach(r => r.children[i] && r.children[i].remove()); else tb.remove(); }
    else if (op === 'borrar') tb.remove();
    D.asegura(); D.cambio();
  };

  /* ---------- Columnas ---------- */
  const novaCol = () => { const c = document.createElement('div'); c.className = 'dc-col'; c.innerHTML = '<p><br></p>'; return c; };
  const raizDe = (n) => { let b = n; while (b && b.parentNode !== D.ed) b = b.parentNode; return b; };
  D.columnas = (n) => {
    const cols = D.cercano('.dc-cols');
    if (cols) {   // ya hay un bloque: se cambia el número de columnas, sin perder texto (lo que sobra pasa a la última)
      const hijos = [...cols.children].filter(c => c.classList.contains('dc-col'));
      while (hijos.length < n) { const c = novaCol(); cols.appendChild(c); hijos.push(c); }
      while (hijos.length > n) { const sobra = hijos.pop(); const ult = hijos[hijos.length - 1]; [...sobra.childNodes].filter(x => !(x.nodeName === 'P' && x.textContent === '' && !x.querySelector('img'))).forEach(x => ult.appendChild(x)); sobra.remove(); }
      cols.dataset.n = String(n); D.cambio(); return;
    }
    const b = raizDe(nodoSel()) || D.ed.lastElementChild; if (!b) return;
    const bloque = document.createElement('div'); bloque.className = 'dc-cols'; bloque.dataset.n = String(n);
    for (let k = 0; k < n; k++) bloque.appendChild(novaCol());
    const vacio = b.nodeName === 'P' && b.textContent === '';
    if (vacio) b.replaceWith(bloque); else b.after(bloque);
    D.asegura();
    const r = document.createRange(); r.setStart(bloque.querySelector('.dc-col p'), 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    D.cambio();
  };
  D.quitaColumnas = () => {
    const cols = D.cercano('.dc-cols'); if (!cols) return;
    const frag = document.createDocumentFragment();
    [...cols.children].forEach(c => [...c.childNodes].forEach(x => { if (!(x.nodeName === 'P' && x.textContent === '')) frag.appendChild(x); }));
    if (!frag.childNodes.length) { const p = document.createElement('p'); p.innerHTML = '<br>'; frag.appendChild(p); }
    cols.replaceWith(frag); D.asegura(); D.cambio();
  };

  // El documento siempre acaba en un párrafo (para poder escribir tras una tabla o unas columnas) y nunca queda vacío
  D.asegura = () => {
    const u = D.ed.lastElementChild;
    const cierra = !u || u.nodeName === 'TABLE' || u.nodeName === 'HR' || (u.nodeName === 'DIV' && u.classList.contains('dc-cols'));
    if (cierra) { const p = document.createElement('p'); p.innerHTML = '<br>'; D.ed.appendChild(p); }
  };

  /* ---------- Estado de los botones ---------- */
  D.estado = () => {
    const o = {};
    if (!dentro()) return o;
    for (const [k, c] of [['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['s', 'strikeThrough'], ['ul', 'insertUnorderedList'], ['ol', 'insertOrderedList'], ['izq', 'justifyLeft'], ['cen', 'justifyCenter'], ['der', 'justifyRight'], ['jus', 'justifyFull']]) { try { o[k] = document.queryCommandState(c); } catch { o[k] = false; } }
    const b = D.cercano('h1,h2,h3,blockquote'); o.bloque = b ? b.tagName.toLowerCase() : 'p';
    o.tareas = !!D.cercano('ul.dc-tareas'); o.ul = o.ul && !o.tareas;
    o.enTabla = !!D.cercano('td,th'); o.enCols = !!D.cercano('.dc-cols'); o.cols = o.enCols ? Number(D.cercano('.dc-cols').dataset.n) || 2 : 0;
    const f = D.cercano('[style*="font-family"]'); o.fuente = (f && (D.FUENTES.find(x => f.style.fontFamily.toLowerCase().includes(x.toLowerCase())))) || '';
    const t = D.cercano('[style*="font-size"]'); o.tam = t ? parseInt(t.style.fontSize, 10) || 0 : 0;
    return o;
  };
})();
