'use strict';
/* Papelera de archivos y subida. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Papelera
--------------------------------------------------------------- */
/* Los días hasta el vaciado automático son un ajuste del usuario; valen para archivos, notas y prompts */
const TRASH_OPC = [[0, 'Nunca'], [7, '7 días'], [14, '14 días'], [30, '30 días'], [60, '60 días'], [90, '90 días'], [180, '180 días']];
function textoTrash(dias) {
  return dias ? `Los elementos se borran solos pasados ${dias} días` : 'Los elementos no se borran solos: vacía la papelera cuando quieras';
}
function pintaAjusteTrash(dias) {
  $('trash-note').textContent = textoTrash(dias);
  const sel = $('trash-days');
  if (!sel.options.length) {
    TRASH_OPC.forEach(([v, n]) => sel.appendChild(new Option(n, String(v))));
    sel.addEventListener('change', async () => {
      try {
        const res = await api(BASE + '/api/trash/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: Number(sel.value) }) });
        const d = await res.json();
        if (!res.ok) { showToast(d.error || 'No se pudo guardar'); return; }
        $('trash-note').textContent = textoTrash(d.days);
        showToast(d.days ? `Se vaciará solo tras ${d.days} días` : 'La papelera ya no se vaciará sola');
        loadTrash();
      } catch { showToast('Error de conexión'); }
    });
  }
  sel.value = String(dias);
}

async function loadTrash() {
  const box = $('trash-list');
  box.className = 'list';
  box.textContent = '';
  box.appendChild(el('div', 'skel', ''));
  try {
    const res = await api(BASE + '/api/trash');
    const data = await res.json();
    pintaAjusteTrash(data.ttlDays);
    box.textContent = '';
    if (!data.items.length) {
      box.className = '';
      box.appendChild(emptyState('La papelera está vacía', 'Lo que elimines aparecerá aquí', 'i-trash'));
      $('btn-empty-trash').disabled = true;
      return;
    }
    $('btn-empty-trash').disabled = false;
    for (const entry of data.items) {
      const row = el('div', 'trash-row');
      row.appendChild(fileBadge(entry.name, entry.isDir));
      const info = el('div', 'info');
      info.appendChild(el('div', 'name', entry.name));
      info.appendChild(el('div', 'meta',
        `${entry.isDir ? 'Carpeta' : fmtSize(entry.size)} · desde ${entry.from || 'Inicio'} · ${fmtDate(entry.deletedAt)}`));
      row.appendChild(info);

      const restore = el('button', 'icon-btn');
      restore.appendChild(icon('i-restore'));
      restore.title = 'Restaurar';
      restore.setAttribute('aria-label', 'Restaurar');
      restore.addEventListener('click', () => restoreTrash(entry));
      row.appendChild(restore);

      const purge = el('button', 'icon-btn');
      purge.appendChild(icon('i-x'));
      purge.title = 'Eliminar definitivamente';
      purge.setAttribute('aria-label', 'Eliminar definitivamente');
      purge.addEventListener('click', () => purgeTrash(entry));
      row.appendChild(purge);

      box.appendChild(row);
    }
  } catch {
    box.textContent = '';
    box.className = '';
    box.appendChild(emptyState('No se pudo cargar la papelera'));
  }
}

async function restoreTrash(entry) {
  try {
    const res = await post(BASE + '/api/trash/restore', { id: entry.id });
    const data = await res.json();
    if (res.ok) {
      showToast(data.restoredAs !== entry.name
        ? `Restaurado como "${data.restoredAs}" (ya existía otro con ese nombre)`
        : `"${entry.name}" restaurado en ${entry.from || 'Inicio'}`);
      loadTrash();
    } else showToast(data.error || 'No se pudo restaurar');
  } catch { showToast('Error de conexión'); }
}

async function purgeTrash(entry) {
  if (!confirm(`¿Eliminar "${entry.name}" definitivamente? Esto no se puede deshacer.`)) return;
  try {
    const res = await api(BASE + '/api/trash/' + qs(entry.id), { method: 'DELETE' });
    if (res.ok) { showToast('Eliminado definitivamente'); loadTrash(); }
    else showToast(await errorOf(res, 'No se pudo eliminar'));
  } catch { showToast('Error de conexión'); }
}

async function emptyTrash() {
  if (!confirm('¿Vaciar la papelera por completo? Esto no se puede deshacer.')) return;
  try {
    const res = await api(BASE + '/api/trash', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) { showToast(`${data.removed} elemento(s) eliminados`); loadTrash(); }
    else showToast(data.error || 'No se pudo vaciar');
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Subida
--------------------------------------------------------------- */
/* ---------------------------------------------------------------
   Cola de subida
   Un archivo por petición y tres a la vez: si falla uno, se reintenta
   solo ese. Antes iba todo en una única petición y un corte a mitad
   se llevaba el lote entero sin decir cuáles habían llegado.
--------------------------------------------------------------- */
const UP = { items: [], activos: 0, MAX: 3, seq: 0 };
let refreshTimer = null;

function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (state.tab === 'files') refresh(); }, 600);
}

function handleUpload(files, destino) {
  if (!files || !files.length) return;
  const dest = destino === undefined ? state.path : destino;
  if (window.KCC.onUploadStart && !UP.items.length) window.KCC.onUploadStart();
  for (const f of Array.from(files)) {
    UP.items.push({ id: ++UP.seq, file: f, name: f.name, size: f.size, dest,
                    estado: 'espera', subido: 0, xhr: null, el: null });
  }
  $('upbar').classList.remove('plegada');
  show('upbar');
  hide('upbar-close');
  renderQueue();
  bombear();
}

function bombear() {
  while (UP.activos < UP.MAX) {
    const siguiente = UP.items.find(i => i.estado === 'espera');
    if (!siguiente) break;
    subirUno(siguiente);
  }
  if (!UP.items.some(i => i.estado === 'espera' || i.estado === 'subiendo')) terminarCola();
  actualizarCabecera();
}

function subirUno(item) {
  item.estado = 'subiendo';
  UP.activos++;
  const form = new FormData();
  form.append('files', item.file);

  const xhr = new XMLHttpRequest();
  item.xhr = xhr;
  xhr.open('POST', BASE + '/api/upload?path=' + qs(item.dest));
  xhr.withCredentials = true;
  xhr.setRequestHeader('X-KCC-Client', CID);
  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    item.subido = e.loaded;
    pintarFila(item);
    actualizarCabecera();
  });
  xhr.addEventListener('load', () => {
    UP.activos--;
    if (xhr.status === 200) {
      item.estado = 'ok';
      item.subido = item.size;
      // El servidor puede haber cambiado el nombre (foto_1.jpg si ya existía): se guarda el real
      try { item.guardado = JSON.parse(xhr.responseText).uploaded[0]; } catch { item.guardado = item.name; }
    } else if (xhr.status === 401) {
      item.estado = 'error';
      item.error = 'Sesión caducada';
      showLogin();
    } else {
      item.estado = 'error';
      try { item.error = JSON.parse(xhr.responseText).error || 'Error ' + xhr.status; }
      catch { item.error = 'Error ' + xhr.status; }
    }
    trasItem(item);
  });
  xhr.addEventListener('error', () => { UP.activos--; item.estado = 'error'; item.error = 'Sin conexión'; trasItem(item); });
  xhr.addEventListener('abort', () => { UP.activos--; item.estado = 'cancelado'; item.error = 'Cancelado'; trasItem(item); });
  xhr.send(form);
  pintarFila(item);
}

function trasItem(item) {
  item.xhr = null;
  pintarFila(item);
  if (item.estado === 'ok' && item.dest === state.path && !state.query) refreshSoon();
  bombear();
}

function renderQueue() {
  const lista = $('upbar-list');
  for (const item of UP.items) {
    if (item.el) continue;
    const row = el('div', 'uprow');
    row.appendChild(el('span', 'nm', item.name));
    const mini = el('span', 'mini');
    const barra = el('i');
    mini.appendChild(barra);
    row.appendChild(mini);
    row.appendChild(el('span', 'st', ''));
    item.el = row;
    item.barra = barra;
    lista.appendChild(row);
    pintarFila(item);
  }
}

function pintarFila(item) {
  if (!item.el) return;
  const pct = item.size ? Math.round((item.subido / item.size) * 100) : 0;
  item.barra.style.width = (item.estado === 'ok' ? 100 : pct) + '%';
  item.el.classList.toggle('ok', item.estado === 'ok');
  item.el.classList.toggle('err', item.estado === 'error' || item.estado === 'cancelado');
  const st = item.el.querySelector('.st');
  st.textContent =
    item.estado === 'ok' ? '✓ ' + fmtSize(item.size)
    : item.estado === 'error' || item.estado === 'cancelado' ? (item.error || 'Error')
    : item.estado === 'subiendo' ? pct + '%'
    : 'en cola';
}

function actualizarCabecera() {
  const total = UP.items.reduce((n, i) => n + i.size, 0);
  const hecho = UP.items.reduce((n, i) => n + (i.estado === 'ok' ? i.size : i.subido), 0);
  const pct = total ? Math.round((hecho / total) * 100) : 0;
  const listos = UP.items.filter(i => i.estado === 'ok').length;
  const fallidos = UP.items.filter(i => i.estado === 'error' || i.estado === 'cancelado').length;
  $('upbar-fill').style.width = pct + '%';
  $('upbar-pct').textContent = pct + '%';
  $('upbar-label').textContent = `${listos} de ${UP.items.length} subidos` +
    (fallidos ? ` · ${fallidos} con error` : '');
  $('upbar-retry').hidden = !fallidos;
}

function terminarCola() {
  const listos = UP.items.filter(i => i.estado === 'ok').length;
  const fallidos = UP.items.filter(i => i.estado === 'error' || i.estado === 'cancelado').length;
  hide('upbar-cancel');
  show('upbar-close');
  // Fecha de subida en el calendario (si el usuario la pidió en la barra de subida)
  if (window.KCC.onUploaded) {
    const nuevos = UP.items.filter(i => i.estado === 'ok' && !i.calEnviado);
    nuevos.forEach(i => { i.calEnviado = true; });
    if (nuevos.length) window.KCC.onUploaded(nuevos);
  }
  if (!fallidos) {
    showToast(listos === 1 ? 'Archivo subido' : `${listos} archivos subidos`);
    setTimeout(() => { if (!UP.items.some(i => i.estado === 'espera' || i.estado === 'subiendo')) cerrarCola(); }, 2500);
  }
  refreshSoon();
}

function cerrarCola() {
  UP.items = [];
  UP.activos = 0;
  $('upbar-list').textContent = '';
  $('upbar-fill').style.width = '0%';
  hide('upbar');
  show('upbar-cancel');
  hide('upbar-close');
  $('file-input').value = '';
}

function cancelarCola() {
  for (const i of UP.items) {
    if (i.estado === 'espera') { i.estado = 'cancelado'; i.error = 'Cancelado'; pintarFila(i); }
    else if (i.xhr) i.xhr.abort();
  }
  actualizarCabecera();
}

function reintentarFallidos() {
  for (const i of UP.items) {
    if (i.estado === 'error' || i.estado === 'cancelado') {
      i.estado = 'espera';
      i.subido = 0;
      i.error = null;
      pintarFila(i);
    }
  }
  show('upbar-cancel');
  hide('upbar-close');
  bombear();
}

async function createFolder() {
  const name = $('folder-name-input').value.trim();
  if (!name) return;
  try {
    const res = await post(BASE + '/api/mkdir', { path: state.path, name });
    if (res.ok) { hide('folder-modal'); showToast('Carpeta creada'); refresh(); }
    else showToast(await errorOf(res, 'No se pudo crear'));
  } catch { showToast('Error de conexión'); }
}
