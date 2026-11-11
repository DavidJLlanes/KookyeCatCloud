'use strict';
/* Bases · vista de galería: fichas con la imagen de una columna de tipo Archivo (de «Archivos») y los datos de la fila. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const ES_IMAGEN = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
  const url = (ruta) => BASE + '/api/preview?path=' + encodeURIComponent(ruta);

  B.pintaGaleria = (cont, v) => {
    const lista = B.filas(v); const pc = B.col(v.portada); const grid = el('div', 'bs-galeria');
    lista.forEach(r => {
      const a = el('article', 'bs-ficha'); a.tabIndex = 0;
      const ruta = pc ? r.c[pc.id] : ''; const portada = el('div', 'bs-portada');
      if (ruta && ES_IMAGEN.test(ruta)) { const img = el('img'); img.loading = 'lazy'; img.alt = ''; img.src = url(ruta); img.addEventListener('error', () => { img.remove(); portada.classList.add('sin'); portada.textContent = (B.titulo(r)[0] || '?').toUpperCase(); }); portada.appendChild(img); }
      else { portada.classList.add('sin'); portada.textContent = (B.titulo(r)[0] || '?').toUpperCase(); const col = B.colorFila && B.colorFila(r); if (col) portada.style.setProperty('--o', col); }
      a.append(portada, el('strong', null, B.titulo(r)));
      const meta = B.metaFila(r, v, pc ? [pc.id] : []); if (meta.childNodes.length) a.appendChild(meta);
      a.addEventListener('click', () => B.editaFila(r)); a.addEventListener('keydown', e => { if (e.key === 'Enter') B.editaFila(r); });
      grid.appendChild(a);
    });
    cont.appendChild(grid);
    if (!lista.length) cont.appendChild(el('p', 'k-muted bs-vacio', S.base.rows.length ? 'Ninguna fila coincide con el filtro o la búsqueda.' : 'Aún no hay filas.'));
    if (!pc) cont.appendChild(el('p', 'k-faint bs-vacio', 'Para ver imágenes, añade una columna de tipo «Archivo» y elígela como portada en «Vista».'));
    cont.appendChild(B.botonesNueva('Nueva ficha', async () => { const r = await B.nuevaFila(); if (r) B.editaFila(r); }));
  };
})();
