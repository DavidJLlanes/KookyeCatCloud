'use strict';
/* app/visores/hojas.js: parte de visores.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Visor de hojas de cálculo (solo lectura)
--------------------------------------------------------------- */
// Letra de columna al estilo de Excel: A, B… Z, AA, AB…
function letraColumna(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function renderHoja(datos, item) {
  const caja = el('div', 'hoja');
  let indice = 0;

  const pestanas = el('div', 'hoja-pestanas');
  const zona = el('div', 'hoja-zona');

  function pintar() {
    const hoja = datos.hojas[indice];
    zona.textContent = '';
    [...pestanas.children].forEach((b, i) => b.classList.toggle('is-active', i === indice));

    if (!hoja || !hoja.filas.length) {
      zona.appendChild(el('div', 'hoja-vacia', 'Esta hoja está vacía'));
      return;
    }
    const columnas = hoja.filas.reduce((n, f) => Math.max(n, f.length), 0);
    const tabla = el('table', 'hoja-tabla');

    const thead = el('thead');
    const trh = el('tr');
    trh.appendChild(el('th', 'esquina', ''));
    for (let c = 1; c <= columnas; c++) {
      const th = el('th', 'col', letraColumna(c));
      const ancho = hoja.anchos[c - 1];
      // El ancho de Excel va en caracteres: se pasa a píxeles a ojo
      if (ancho) th.style.minWidth = Math.min(Math.round(ancho * 8), 420) + 'px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    tabla.appendChild(thead);

    const tbody = el('tbody');
    hoja.filas.forEach((fila, i) => {
      const tr = el('tr');
      tr.appendChild(el('th', 'fila', String(i + 1)));
      for (let c = 0; c < columnas; c++) {
        const celda = fila[c];
        const td = el('td', celda && celda.n ? 'num' : null, celda ? celda.t : '');
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    zona.appendChild(tabla);

    if (datos.recortado) {
      zona.appendChild(el('div', 'doc-aviso',
        `Hoja muy grande: se muestran las primeras ${datos.maxFilas} filas y ${datos.maxCols} columnas. ` +
        'Descarga el archivo para verlo entero.'));
    }
  }

  datos.hojas.forEach((h, i) => {
    const b = el('button', 'hoja-pestana');
    b.appendChild(el('span', null, h.nombre));
    const n = h.filas.length;
    b.appendChild(el('small', null, n ? `${n} fila${n === 1 ? '' : 's'}` : 'vacía'));
    b.addEventListener('click', () => { indice = i; pintar(); });
    pestanas.appendChild(b);
  });

  caja.appendChild(zona);
  if (datos.hojas.length > 1) caja.appendChild(pestanas);
  else if (datos.hojas.length === 1) {
    const sola = el('div', 'hoja-pie', datos.hojas[0].nombre);
    caja.appendChild(sola);
  }
  pintar();
  return caja;
}

async function pintarDocumento(caja, item) {
  // Hoja de cálculo: rejilla de verdad, no un PDF paginado
  if (isSheet(item.name)) {
    const cargando = el('div', 'doc-estado');
    cargando.appendChild(el('h3', null, 'Abriendo la hoja…'));
    caja.appendChild(cargando);
    try {
      const res = await api(BASE + '/api/sheet?path=' + qs(item.rel));
      const datos = await res.json();
      if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;
      caja.textContent = '';
      if (!res.ok) {
        caja.appendChild(estadoDoc('i-doc-alert', 'No se pudo abrir', datos.error, item));
        return;
      }
      caja.appendChild(renderHoja(datos, item));
    } catch {
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
    }
    return;
  }

  // PDF: lo pinta el visor propio del navegador
  if (isPdf(item.name)) {
    caja.appendChild(marcoDocumento(BASE + '/api/preview?path=' + qs(item.rel), item.name));
    return;
  }

  // Office: convertido a PDF en el servidor
  if (isOffice(item.name)) {
    if (state.caps && state.caps.office === false) {
      caja.appendChild(estadoDoc('i-doc-alert', 'Sin vista previa',
        'Este servidor no tiene LibreOffice instalado para convertir documentos de Office.', item));
      return;
    }
    caja.appendChild(estadoDoc('i-refresh', 'Convirtiendo el documento…',
      'La primera vez tarda unos segundos; después queda en caché.'));
    const url = BASE + '/api/office?path=' + qs(item.rel);
    try {
      // HEAD primero: dispara la conversión y deja saber si salió bien, sin
      // arriesgarse a que el marco acabe enseñando un error en JSON
      const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
      if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;  // ya cambió de archivo
      caja.textContent = '';
      if (!res.ok) {
        caja.appendChild(estadoDoc('i-doc-alert', 'No se pudo convertir',
          res.status === 501 ? 'Falta LibreOffice en el servidor.' : 'El documento no se pudo abrir.', item));
        return;
      }
      caja.appendChild(marcoDocumento(url, item.name));
    } catch {
      caja.textContent = '';
      caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
    }
    return;
  }

  // Texto, Markdown, CSV
  const cargando = el('div', 'doc-estado');
  cargando.appendChild(el('h3', null, 'Cargando…'));
  caja.appendChild(cargando);
  try {
    const res = await api(BASE + '/api/text?path=' + qs(item.rel));
    const data = await res.json();
    if (state.lbIndex < 0 || state.viewables[state.lbIndex] !== item) return;
    caja.textContent = '';
    if (!res.ok) {
      caja.appendChild(estadoDoc('i-doc-alert', 'No se puede mostrar', data.error, item));
      return;
    }
    const doc = el('div', 'lb-doc');
    if (isMarkdown(item.name)) doc.appendChild(renderMarkdown(data.text));
    else if (isCsv(item.name)) doc.appendChild(renderCsv(data.text, item.name));
    else doc.appendChild(el('pre', 'doc-texto', data.text));
    if (data.truncated) {
      doc.appendChild(el('p', 'doc-aviso',
        `Mostrando los primeros ${fmtSize(data.shown)} de ${fmtSize(data.size)}. Descarga el archivo para verlo entero.`));
    }
    caja.appendChild(doc);
  } catch {
    caja.textContent = '';
    caja.appendChild(estadoDoc('i-doc-alert', 'Error de conexión', null, item));
  }
}
