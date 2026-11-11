'use strict';
/* app/visores/documentos.js: parte de visores.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Visor de documentos
--------------------------------------------------------------- */
function estadoDoc(iconName, titulo, sub, item) {
  const caja = el('div', 'doc-estado');
  const em = el('div', 'em');
  em.appendChild(icon(iconName));
  caja.appendChild(em);
  caja.appendChild(el('h3', null, titulo));
  if (sub) caja.appendChild(el('p', null, sub));
  if (item) {
    const btn = el('button', 'btn primary');
    btn.appendChild(icon('i-download'));
    btn.appendChild(el('span', null, 'Descargar'));
    btn.addEventListener('click', () => downloadRel(item.rel));
    caja.appendChild(btn);
  }
  return caja;
}

// Marco para PDF y para Office. Los dos van dentro del mismo envoltorio: sin él,
// un iframe suelto se queda con su altura por defecto de 150 px.
function marcoDocumento(url, nombre) {
  const envoltorio = el('div', 'lb-pdf');
  const marco = el('iframe', 'lb-frame');
  marco.src = url;
  marco.title = nombre;
  envoltorio.appendChild(marco);
  // Salida de emergencia: algunos navegadores, sobre todo en móvil, no pintan
  // documentos dentro de un marco y no avisan de ello
  const salida = el('button', 'lb-fallback');
  salida.appendChild(icon('i-external'));
  salida.appendChild(el('span', null, '¿No se ve bien? Ábrelo en una pestaña'));
  salida.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
  envoltorio.appendChild(salida);
  return envoltorio;
}
