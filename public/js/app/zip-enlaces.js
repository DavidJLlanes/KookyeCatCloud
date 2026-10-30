'use strict';
/* Descargar como ZIP y enlaces de descarga. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Descargar como ZIP
--------------------------------------------------------------- */
function descargarZip(rutas) {
  if (!rutas.length) return;
  if (rutas.length > 200) { showToast('Máximo 200 elementos por ZIP'); return; }
  const url = BASE + '/api/zip?' + rutas.map(r => 'p=' + qs(r)).join('&');
  const a = el('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast(rutas.length === 1 ? 'Preparando el ZIP…' : `Preparando un ZIP con ${rutas.length} elementos…`);
}

/* ---------------------------------------------------------------
   Enlaces de descarga
--------------------------------------------------------------- */
function openShare(item) {
  state.compartiendo = item;
  $('share-sub').textContent = item.album
    ? `El álbum "${item.name}" se verá como una galería pública y se podrá descargar en ZIP`
    : item.isDir
    ? `La carpeta "${item.name}" se descargará como ZIP`
    : `${item.name} · ${fmtSize(item.size)}`;
  $('share-label').value = item.name;
  $('share-pass').value = '';
  $('share-days').value = '30';
  show('share-form');
  hide('share-result');
  show('btn-create-share');
  show('share-modal');
}

async function crearCompartir() {
  const item = state.compartiendo;
  if (!item) return;
  try {
    const res = await post(BASE + '/api/sharelinks', {
      path: item.rel,
      album: item.album || undefined,
      label: $('share-label').value.trim() || item.name,
      days: Number($('share-days').value),
      password: $('share-pass').value || undefined,
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo crear'); return; }
    const url = `${location.origin}${BASE}/s/${data.link.id}`;
    $('share-url').textContent = url;
    hide('share-form');
    hide('btn-create-share');
    show('share-result');
    copiarTexto(url, 'Enlace copiado al portapapeles');
    loadLinks();
  } catch { showToast('Error de conexión'); }
}

async function copiarTexto(texto, exito) {
  try { await navigator.clipboard.writeText(texto); showToast(exito); return; }
  catch { /* sin permiso: se intenta a la vieja usanza */ }
  try {
    const ta = el('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    showToast(ok ? exito : 'Copia el enlace a mano');
  } catch { showToast('Copia el enlace a mano'); }
}
