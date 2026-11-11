'use strict';
/* notes/tablas.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST } = C;
  const change = (...a) => C.change(...a);
  const focusBlock = (...a) => C.focusBlock(...a);
  const inlineHtml = (...a) => C.inlineHtml(...a);
  const makeBlock = (...a) => C.makeBlock(...a);
  const abreImagen = (...a) => C.abreImagen(...a);

  /* ---------- Tablas e imágenes ---------- */
  function construyeTabla(rows) {
    const filas = rows && rows.length ? rows : [['', '', ''], ['', '', ''], ['', '', '']];
    const tabla = document.createElement('table'); tabla.className = 'nb-table';
    const tb = document.createElement('tbody');
    filas.forEach((r, ri) => {
      const tr = document.createElement('tr');
      r.forEach((txt) => {
        const td = document.createElement(ri === 0 ? 'th' : 'td'); td.contentEditable = 'true';
        td.innerHTML = inlineHtml(txt || '');
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    tabla.appendChild(tb);
    const caja = document.createElement('div'); caja.className = 'nb-table-wrap'; caja.appendChild(tabla);
    return caja;
  }
  const tablaDe = (w) => w.querySelector('table.nb-table');
  function pintaTools(mk) {
    mk.textContent = '';
    const t = document.createElement('div'); t.className = 'nb-tbl-tools';
    [['row', '＋ fila', 'Añadir fila debajo'], ['col', '＋ col', 'Añadir columna a la derecha'], ['delrow', '− fila', 'Quitar la fila'],
      ['delcol', '− col', 'Quitar la columna'], ['deltable', '🗑', 'Borrar la tabla']].forEach(([a, txt, tt]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a; b.title = tt; b.textContent = txt; t.appendChild(b);
    });
    mk.appendChild(t);
  }
  function celdaActual() { const n = getSelection().anchorNode; const e = n && (n.nodeType === 3 ? n.parentNode : n); return e && e.closest ? e.closest('td,th') : null; }
  function tablaOp(w, op, celda) {
    const tabla = tablaDe(w); if (!tabla) return;
    const filas = [...tabla.rows];
    const nuevaCelda = (th) => { const td = document.createElement(th ? 'th' : 'td'); td.contentEditable = 'true'; return td; };
    const ri = celda ? celda.parentNode.rowIndex : filas.length - 1;
    const ci = celda ? celda.cellIndex : filas[0].cells.length - 1;
    if (op === 'row') {
      const tr = tabla.insertRow(ri + 1);
      for (let k = 0; k < filas[0].cells.length; k++) tr.appendChild(nuevaCelda(false));
      tr.cells[Math.min(ci, tr.cells.length - 1)].focus();
    } else if (op === 'col') {
      filas.forEach((tr, k) => tr.insertBefore(nuevaCelda(k === 0), tr.cells[ci + 1] || null));
      filas[ri].cells[ci + 1].focus();
    } else if (op === 'delrow') {
      if (filas.length <= 1) return;
      tabla.deleteRow(ri);
      const f = tabla.rows[Math.min(ri, tabla.rows.length - 1)]; f.cells[Math.min(ci, f.cells.length - 1)].focus();
      if (ri === 0) [...tabla.rows[0].cells].forEach(td => { const th = document.createElement('th'); th.contentEditable = 'true'; th.innerHTML = td.innerHTML; td.replaceWith(th); });
    } else if (op === 'delcol') {
      if (filas[0].cells.length <= 1) return;
      filas.forEach(tr => tr.deleteCell(ci));
      tabla.rows[ri].cells[Math.min(ci, tabla.rows[ri].cells.length - 1)].focus();
    } else if (op === 'deltable') {
      const n = w.nextElementSibling || w.previousElementSibling;
      w.remove();
      if (!EST.host.querySelector('.nb-block')) EST.host.appendChild(makeBlock({ t: 'p', text: '' }));
      if (n) focusBlock(n);
    }
    change(true);
  }
  // Tab / Enter / flechas dentro de una tabla
  function tablaTecla(e, w) {
    const celda = e.target.closest && e.target.closest('td,th'); if (!celda) return;
    const tabla = tablaDe(w);
    const ri = celda.parentNode.rowIndex, ci = celda.cellIndex;
    const ultimaFila = ri === tabla.rows.length - 1, ultimaCol = ci === tabla.rows[ri].cells.length - 1;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { const prev = ci > 0 ? celda.previousElementSibling : (ri > 0 ? tabla.rows[ri - 1].cells[tabla.rows[ri - 1].cells.length - 1] : null); if (prev) prev.focus(); return; }
      if (!ultimaCol) celda.nextElementSibling.focus();
      else if (!ultimaFila) tabla.rows[ri + 1].cells[0].focus();
      else { tablaOp(w, 'row', celda); tabla.rows[ri + 1].cells[0].focus(); }
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (e.shiftKey) { document.execCommand('insertLineBreak'); change(); return; }
      if (!ultimaFila) tabla.rows[ri + 1].cells[ci].focus(); else { tablaOp(w, 'row', celda); }
      return;
    }
    if (e.key === 'ArrowDown' && ultimaFila && !e.shiftKey) { const nx = w.nextElementSibling; if (nx) { e.preventDefault(); focusBlock(nx); } }
    if (e.key === 'ArrowUp' && ri === 0 && !e.shiftKey) { const pv = w.previousElementSibling; if (pv) { e.preventDefault(); focusBlock(pv, true); } }
  }
  function rutaDeSrc(src) { try { return decodeURIComponent(String(src).replace(/^kcc:file\//, '')); } catch { return String(src).replace(/^kcc:file\//, ''); } }
  function pintaImagen(w, mk) {
    mk.textContent = '';
    const ruta = rutaDeSrc(w.dataset.src || '');
    const fig = document.createElement('div'); fig.className = 'nb-img';
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
    img.src = BASE + '/api/preview?path=' + encodeURIComponent(ruta);
    img.addEventListener('error', () => { fig.classList.add('rota'); fig.title = 'No se encuentra: ' + ruta; });
    img.addEventListener('click', () => abreImagen(img));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'nb-img-del'; del.title = 'Quitar la imagen'; del.textContent = '×';
    fig.append(img, del); mk.appendChild(fig);
  }
  // Un archivo -> referencia estable dentro del Markdown (los paréntesis se codifican para no romper el enlace)
  const refArchivo = (ruta) => encodeURIComponent(ruta).replace(/\(/g, '%28').replace(/\)/g, '%29');


  Object.assign(C, { construyeTabla, tablaDe, pintaTools, celdaActual, tablaOp, tablaTecla, rutaDeSrc, pintaImagen, refArchivo });
})();
