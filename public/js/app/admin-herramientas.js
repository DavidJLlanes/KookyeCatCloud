'use strict';
/* Renombrado en lote, analizador, duplicados y actividad. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Renombrado en lote
--------------------------------------------------------------- */
let renameRutas = [];
function openRenameModal(rels) {
  if (!rels.length) return;
  renameRutas = rels;
  $('rename-sub').textContent = `Se renombrarán ${rels.length} elemento${rels.length === 1 ? '' : 's'}`;
  $('rename-pattern').value = '{name}';
  $('rename-start').value = '1';
  show('rename-modal');
}
async function confirmRename() {
  const pattern = $('rename-pattern').value.trim();
  if (!pattern) { showToast('Escribe un patrón'); return; }
  try {
    const res = await post(BASE + '/api/batch', {
      op: 'rename', paths: renameRutas, pattern, start: Number($('rename-start').value) || 1,
    });
    const data = await res.json();
    hide('rename-modal');
    reportBatch(data, 'elemento renombrado', 'elementos renombrados');
    exitSelectMode();
    refresh();
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Analizador de espacio por carpeta (Administración)
--------------------------------------------------------------- */
let duPath = '';
async function loadDiskUsage(rel) {
  duPath = rel || '';
  $('du-path').textContent = duPath || 'Inicio';
  $('du-up').hidden = !duPath;
  const box = $('du-list');
  box.textContent = '';
  box.appendChild(el('div', 'skel', ''));
  try {
    const res = await api(BASE + '/api/diskusage?path=' + qs(duPath));
    let data;
    try { data = await res.json(); }
    // Un 502/504 del propio nginx (por ejemplo, si la carpeta tarda demasiado) no
    // llega como JSON: sin esto se perdía el estado real detrás de un mensaje genérico.
    catch { throw new Error(`El servidor respondió con un error (${res.status})`); }
    box.textContent = '';
    if (!res.ok) { box.appendChild(el('p', 'card-sub', data.error || `No se pudo analizar (${res.status})`)); return; }
    if (!data.items.length) { box.appendChild(el('p', 'card-sub', 'Carpeta vacía')); return; }
    const max = Math.max(...data.items.map(i => i.size), 1);
    for (const it of data.items) {
      const row = el('div', 'du-row');
      if (it.isDir) {
        const btn = el('button');
        btn.appendChild(icon('i-folder'));
        btn.appendChild(el('span', 'nm', it.name));
        btn.addEventListener('click', () => loadDiskUsage(joinPath(duPath, it.name)));
        row.appendChild(btn);
      } else {
        row.appendChild(el('span', 'nm', it.name));
      }
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.width = Math.max(2, (it.size / max) * 100) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'sz', fmtSize(it.size)));
      box.appendChild(row);
    }
    if (data.cortado) {
      box.appendChild(el('p', 'card-sub',
        'Hay tantos archivos que el análisis se ha cortado: algunos tamaños pueden salir por debajo del real.'));
    }
  } catch (err) {
    box.textContent = '';
    box.appendChild(el('p', 'card-sub', err.message || 'No se pudo analizar'));
  }
}

/* ---------------------------------------------------------------
   Buscador de duplicados (Administración)
--------------------------------------------------------------- */
async function scanDuplicates() {
  const resumen = $('dup-resumen');
  const list = $('dup-list');
  resumen.textContent = 'Buscando… puede tardar si hay muchos archivos.';
  list.textContent = '';
  $('btn-scan-dup').disabled = true;
  try {
    const res = await api(BASE + '/api/duplicates');
    const data = await res.json();
    if (!res.ok) { resumen.textContent = data.error || 'No se pudo escanear'; return; }
    if (!data.grupos.length) {
      resumen.textContent = `Sin duplicados en ${data.escaneados} archivos analizados.`;
      return;
    }
    resumen.textContent = `${data.grupos.length} grupo${data.grupos.length === 1 ? '' : 's'} de duplicados · ` +
      `${fmtSize(data.espacioRecuperable)} recuperables` + (data.cortado ? ' · análisis parcial (tope de archivos alcanzado)' : '');
    data.grupos.forEach(grupo => list.appendChild(buildDupGroup(grupo)));
  } catch {
    resumen.textContent = 'Error de conexión';
  } finally {
    $('btn-scan-dup').disabled = false;
  }
}

function buildDupGroup(grupo) {
  const ordenado = [...grupo].sort((a, b) => new Date(a.modified) - new Date(b.modified));
  const wrap = el('div', 'dup-grupo');
  const cab = el('div', 'dup-grupo-cab');
  cab.appendChild(el('span', null, `${grupo.length} copias · ${fmtSize(ordenado[0].size)} cada una`));
  const btnBorrar = el('button', 'btn', 'Enviar marcados a la papelera');
  cab.appendChild(btnBorrar);
  wrap.appendChild(cab);

  const checks = [];
  ordenado.forEach((f, i) => {
    const row = el('div', 'dup-item');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = i > 0;                 // se preselecciona todo menos el más antiguo, que se conserva
    checks.push({ chk, rel: f.rel });
    row.appendChild(chk);
    row.appendChild(el('span', 'nm', f.rel));
    row.appendChild(el('span', 'sz', fmtDate(f.modified)));
    if (i === 0) row.appendChild(el('span', 'orig', 'se conserva'));
    wrap.appendChild(row);
  });

  btnBorrar.addEventListener('click', async () => {
    const marcados = checks.filter(c => c.chk.checked).map(c => c.rel);
    if (!marcados.length) { showToast('No has marcado ninguna copia'); return; }
    if (!confirm(`¿Enviar ${marcados.length} archivo(s) a la papelera?`)) return;
    try {
      const res = await post(BASE + '/api/batch', { op: 'delete', paths: marcados });
      const data = await res.json();
      reportBatch(data, 'copia eliminada', 'copias eliminadas');
      wrap.remove();
    } catch { showToast('Error de conexión'); }
  });
  return wrap;
}

/* ---------------------------------------------------------------
   Actividad reciente (propia en Cuenta, de todos en Administración)
--------------------------------------------------------------- */
function fmtCuando(t) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fmtDate(t);
}
const ICONO_ACCION = {
  login: 'i-power', archivo_subido: 'i-upload', enviado_papelera: 'i-trash',
  enviado_papelera_lote: 'i-trash', movido_lote: 'i-move', renombrado: 'i-pencil',
  renombrado_lote: 'i-pencil', carpeta_creada: 'i-folder-plus', restaurado_papelera: 'i-restore',
  usuario_creado: 'i-users', usuario_eliminado: 'i-users', password_cambiada: 'i-key',
  enlace_compartido_creado: 'i-share', archivo_editado: 'i-pencil', descarga_convertida: 'i-download',
  '2fa_activado': 'i-shield', '2fa_desactivado': 'i-shield', apptoken_creado: 'i-key',
  apptoken_revocado: 'i-key', sesion_cerrada_remoto: 'i-monitor', sesiones_cerradas_todas: 'i-monitor',
};
const TEXTO_ACCION = {
  login: 'Inició sesión', archivo_subido: 'Subió archivos', enviado_papelera: 'Envió a la papelera',
  enviado_papelera_lote: 'Envió varios elementos a la papelera', movido_lote: 'Movió varios elementos',
  renombrado: 'Renombró un elemento', renombrado_lote: 'Renombró varios elementos',
  carpeta_creada: 'Creó una carpeta', restaurado_papelera: 'Restauró de la papelera',
  usuario_creado: 'Creó un usuario', usuario_eliminado: 'Eliminó un usuario',
  password_cambiada: 'Cambió una contraseña', enlace_compartido_creado: 'Creó un enlace compartido',
  archivo_editado: 'Editó un archivo de texto', descarga_convertida: 'Descargó un archivo convertido',
  '2fa_activado': 'Activó la verificación en dos pasos', '2fa_desactivado': 'Desactivó la verificación en dos pasos',
  apptoken_creado: 'Creó un token de aplicación', apptoken_revocado: 'Revocó un token de aplicación',
  sesion_cerrada_remoto: 'Cerró una sesión en remoto', sesiones_cerradas_todas: 'Cerró todas sus otras sesiones',
};
async function cargarActividad(containerId, global) {
  const box = $(containerId);
  box.textContent = '';
  box.appendChild(el('div', 'none', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/activity?limit=' + (global ? 500 : 300));
    const data = await res.json();
    box.textContent = '';
    if (!data.items.length) { box.appendChild(el('p', 'card-sub', 'Sin actividad todavía')); return; }
    // Las acciones iguales seguidas (y del mismo usuario) se juntan en una línea con su contador; se muestran las 20 últimas
    const grupos = [];
    for (const e of data.items) {
      const g = grupos[grupos.length - 1];
      if (g && g.accion === e.accion && g.user === e.user) g.n++;
      else grupos.push({ accion: e.accion, user: e.user, t: e.t, n: 1 });
    }
    for (const e of grupos.slice(0, 20)) {
      const row = el('div', 'act-row');
      const em = el('div', 'em');
      em.appendChild(icon(ICONO_ACCION[e.accion] || 'i-info'));
      row.appendChild(em);
      const tx = el('div', 'tx');
      const linea = el('div');
      if (global) {
        linea.appendChild(el('b', null, e.user || '?'));
        linea.appendChild(document.createTextNode(' — '));
      }
      linea.appendChild(document.createTextNode((TEXTO_ACCION[e.accion] || e.accion) + (e.n > 1 ? ` ×${e.n}` : '')));
      tx.appendChild(linea);
      row.appendChild(tx);
      row.appendChild(el('span', 'when', fmtCuando(e.t)));
      box.appendChild(row);
    }
  } catch {
    box.textContent = '';
    box.appendChild(el('p', 'card-sub', 'No se pudo cargar'));
  }
}
