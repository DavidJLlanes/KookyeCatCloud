'use strict';
/* Papelera de notas. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Papelera de notas
--------------------------------------------------------------- */
async function refrescarContadorPapeleraNotas() {
  try {
    const res = await api(BASE + '/api/notes-trash');
    const data = await res.json();
    NT.papelera = data.items || [];
    $('notes-trash-n').textContent = NT.papelera.length
      ? `Papelera (${NT.papelera.length})` : 'Papelera';
  } catch {}
}

async function abrirPapeleraNotas() {
  show('notes-trash-modal');
  const caja = $('notes-trash-list');
  caja.textContent = '';
  caja.appendChild(el('div', 'none', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/notes-trash');
    const data = await res.json();
    // Un error del servidor NO es «papelera vacía»: así no se confunde un fallo con que la nota ha desaparecido
    if (!res.ok) throw new Error(data.error || 'No se pudo cargar la papelera');
    NT.papelera = data.items || [];
    $('notes-trash-sub').textContent = data.ttlDays ? `Se borran solas pasados ${data.ttlDays} días` : 'No se borran solas';
    caja.textContent = '';
    // Solo se muestra el elemento raíz de cada borrado: sus hijos vuelven con él
    const grupos = NT.papelera.filter(t => t.id === t.grupo);
    if (!grupos.length) {
      caja.appendChild(el('div', 'none', 'No hay nada en la papelera'));
      $('btn-empty-notes-trash').disabled = true;
      return;
    }
    $('btn-empty-notes-trash').disabled = false;
    for (const t of grupos) {
      const hijos = NT.papelera.filter(x => x.grupo === t.grupo).length - 1;
      const row = el('div', 'trash-nota');
      row.appendChild(icon(t.type === 'folder' ? 'i-folder' : 'i-note'));
      const info = el('div', 'info');
      info.appendChild(el('div', 'nm', t.title));
      info.appendChild(el('div', 'mt',
        (t.type === 'folder' ? `Carpeta${hijos ? ` · ${hijos} dentro` : ''}` : 'Nota') +
        ` · ${fmtDate(t.deletedAt)}`));
      row.appendChild(info);

      const rest = el('button', 'icon-btn');
      rest.appendChild(icon('i-restore'));
      rest.title = 'Restaurar';
      rest.addEventListener('click', () => restaurarNota(t));
      row.appendChild(rest);

      const del = el('button', 'icon-btn');
      del.appendChild(icon('i-x'));
      del.title = 'Eliminar definitivamente';
      del.addEventListener('click', () => purgarNota(t));
      row.appendChild(del);

      caja.appendChild(row);
    }
  } catch (e) {
    caja.textContent = '';
    caja.appendChild(el('div', 'none', e && e.message && e.message !== 'No autenticado' ? e.message : 'No se pudo cargar la papelera'));
    const otra = el('button', 'btn sm', 'Reintentar'); otra.type = 'button';
    otra.addEventListener('click', abrirPapeleraNotas);
    caja.appendChild(otra);
  }
}

// Notas cuyo texto está en el servidor pero que la lista no muestra (índice dañado o sobrescrito): se dan de alta en
// la carpeta «Notas recuperadas»
async function buscarNotasPerdidas() {
  const b = $('btn-recover-notes');
  b.disabled = true;
  try {
    const res = await post(BASE + '/api/notes-recover', {});
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo buscar'); return; }
    if (!data.recuperadas) { showToast('No hay notas perdidas: todo está en su sitio'); return; }
    showToast(`${data.recuperadas} nota${data.recuperadas === 1 ? '' : 's'} recuperada${data.recuperadas === 1 ? '' : 's'} en «Notas recuperadas»`);
    hide('notes-trash-modal');
    await loadNotes(true);
    refrescarContadorPapeleraNotas();
  } catch (e) { showToast(e && e.name === 'TimeoutError' ? e.message : 'Error de conexión'); }
  finally { b.disabled = false; }
}

async function restaurarNota(t) {
  try {
    const res = await post(BASE + '/api/notes-trash/restore', { id: t.id });
    const data = await res.json();
    if (res.ok) {
      showToast(data.restaurados > 1 ? `${data.restaurados} elementos restaurados` : 'Restaurado');
      await loadNotes(true);
      abrirPapeleraNotas();
      refrescarContadorPapeleraNotas();
    } else showToast(data.error || 'No se pudo restaurar');
  } catch { showToast('Error de conexión'); }
}

async function purgarNota(t) {
  if (!confirm(`¿Eliminar "${t.title}" definitivamente? Esto no se puede deshacer.`)) return;
  try {
    const res = await api(BASE + '/api/notes-trash/' + qs(t.id), { method: 'DELETE' });
    if (res.ok) { showToast('Eliminado definitivamente'); abrirPapeleraNotas(); refrescarContadorPapeleraNotas(); }
    else showToast(await errorOf(res, 'No se pudo eliminar'));
  } catch { showToast('Error de conexión'); }
}

async function vaciarPapeleraNotas() {
  if (!confirm('¿Vaciar la papelera de notas? Esto no se puede deshacer.')) return;
  try {
    const res = await api(BASE + '/api/notes-trash', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) { showToast(`${data.removed} elemento(s) eliminados`); abrirPapeleraNotas(); refrescarContadorPapeleraNotas(); }
    else showToast(data.error || 'No se pudo vaciar');
  } catch { showToast('Error de conexión'); }
}
