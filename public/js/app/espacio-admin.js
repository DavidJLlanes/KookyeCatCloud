'use strict';
/* Reparto del espacio, enlaces de subida y administración. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Reparto del espacio por tipo
   Barra de composición apilada. La paleta es la de referencia del sistema
   de gráficos, validada para fondo oscuro (separación CVD 8.4, visión
   normal 19.3). El color va atado a la categoría, nunca a su tamaño.
--------------------------------------------------------------- */
const TIPOS = [
  { id: 'image', nombre: 'Imágenes',   color: '#3987e5' },
  { id: 'video', nombre: 'Vídeos',     color: '#d95926' },
  { id: 'audio', nombre: 'Audio',      color: '#199e70' },
  { id: 'doc',   nombre: 'Documentos', color: '#c98500' },
  { id: 'other', nombre: 'Otros archivos', color: '#d55181' },
];
// Datos de la propia app (carpetas ocultas de cada usuario), un color por módulo
const TIPOS_APP = [
  { id: 'trash',    color: '#64748b' }, { id: 'notes',    color: '#e0c341' }, { id: 'prompts',  color: '#8b5cf6' },
  { id: 'contacts', color: '#22d3ee' }, { id: 'codigo',   color: '#34d399' }, { id: 'bases',    color: '#f97316' },
  { id: 'pagos',    color: '#f472b6' }, { id: 'marcadores', color: '#60a5fa' }, { id: 'recordatorios', color: '#fbbf24' }, { id: 'albums', color: '#a3e635' },
  { id: 'perfil',   color: '#fb7185' }, { id: 'juegos',   color: '#c084fc' }, { id: 'transfer', color: '#2dd4bf' },
  { id: 'versions', color: '#a16207' }, { id: 'clip',     color: '#fbbf24' }, { id: 'vault',    color: '#ef4444' },
  { id: 'calendar', color: '#38bdf8' }, { id: 'datos',    color: '#94a3b8' },
];
const COLOR_APP = Object.fromEntries(TIPOS_APP.map(t => [t.id, t.color]));

function pctTxt(pct) { return pct > 0 && pct < 1 ? '<1%' : Math.round(pct) + '%'; }

// Una barra apilada + leyenda en forma de tabla (valor exacto sin depender del color)
function grupoReparto(titulo, datos) {
  const sub = datos.reduce((n, d) => n + d.bytes, 0), cuenta = datos.reduce((n, d) => n + d.count, 0);
  const g = el('div', 'bt-grupo');
  const cab = el('div', 'bt-cab'); cab.appendChild(el('h4', null, titulo));
  const tot = el('div', 'tot', fmtSize(sub)); tot.appendChild(el('span', null, ` · ${cuenta} archivo${cuenta === 1 ? '' : 's'}`)); cab.appendChild(tot);
  g.appendChild(cab);
  const barra = el('div', 'bt-bar'); barra.setAttribute('role', 'img'); barra.setAttribute('aria-label', titulo);
  const leyenda = el('div', 'bt-legend');
  for (const t of datos) {
    const pct = (t.bytes / sub) * 100;
    const seg = el('div', 'bt-seg'); seg.style.background = t.color; seg.style.flex = `${t.bytes} 0 0`; seg.tabIndex = 0;
    seg.setAttribute('aria-label', `${t.nombre}: ${fmtSize(t.bytes)} · ${pct.toFixed(1)}% · ${t.count} archivo${t.count === 1 ? '' : 's'}`);
    seg.addEventListener('mouseenter', e => mostrarTip(e, t, pct)); seg.addEventListener('mousemove', moverTip); seg.addEventListener('mouseleave', ocultarTip);
    barra.appendChild(seg);
    const item = el('div', 'bt-item'); item.title = t.nombre;
    const dot = el('span', 'bt-dot'); dot.style.background = t.color; item.appendChild(dot);
    item.appendChild(el('span', 'lbl', t.nombre)); item.appendChild(el('span', 'val', fmtSize(t.bytes))); item.appendChild(el('span', 'pc', pctTxt(pct)));
    leyenda.appendChild(item);
  }
  g.appendChild(barra); g.appendChild(leyenda);
  return g;
}

// byType: tipos de archivo; app: datos de la app [{id, nombre, bytes, count}]
function renderByType(byType, app) {
  const caja = $('bytype');
  const archivos = TIPOS.map(t => ({ ...t, ...(byType && byType[t.id] || { bytes: 0, count: 0 }) })).filter(t => t.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  const datos = (app || []).filter(d => d.bytes > 0).map(d => ({ ...d, color: COLOR_APP[d.id] || '#94a3b8' })).sort((a, b) => b.bytes - a.bytes);
  caja.textContent = '';
  if (!archivos.length && !datos.length) { caja.hidden = true; return; }
  if (archivos.length) caja.appendChild(grupoReparto('Tus archivos', archivos));
  if (datos.length) caja.appendChild(grupoReparto('Datos de la app', datos));
  caja.hidden = false;
}

let tipEl = null;
function mostrarTip(ev, t, pct) {
  ocultarTip();
  tipEl = el('div', 'bt-tip');
  tipEl.appendChild(el('b', null, t.nombre));
  tipEl.appendChild(document.createTextNode(' '));
  tipEl.appendChild(el('span', null,
    `${fmtSize(t.bytes)} · ${pct.toFixed(1)}% · ${t.count} archivo${t.count === 1 ? '' : 's'}`));
  document.body.appendChild(tipEl);
  moverTip(ev);
}
function moverTip(ev) {
  if (!tipEl) return;
  const r = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.min(ev.clientX + 14, window.innerWidth - r.width - 10) + 'px';
  tipEl.style.top = Math.max(10, ev.clientY - r.height - 12) + 'px';
}
function ocultarTip() {
  if (tipEl) { tipEl.remove(); tipEl = null; }
}

/* ---------------------------------------------------------------
   Enlaces de subida
--------------------------------------------------------------- */
async function loadLinks() {
  try {
    const res = await api(BASE + '/api/uploadlinks');
    const links = await res.json();
    const box = $('links-list');
    box.textContent = '';
    if (!links.length) {
      box.appendChild(el('p', 'card-sub', 'Todavía no has creado ninguno.'));
      return;
    }
    for (const l of links) {
      const row = el('div', 'lrow' + (l.expired ? ' caducado' : ''));
      const info = el('div', 'info');
      info.appendChild(el('div', 'nm', l.label));
      const caduca = l.expiresAt
        ? (l.expired ? 'caducado' : 'caduca el ' + fmtDate(l.expiresAt))
        : 'sin caducidad';
      const compartido = l.kind === 'share';
      info.appendChild(el('div', 'meta', compartido
        ? `${l.album ? 'Álbum' : (l.isDir ? 'Carpeta' : 'Archivo')} compartido · ${l.downloads || 0} descarga${l.downloads === 1 ? '' : 's'} · ${caduca}`
        : `→ ${l.path || 'Inicio'} · ${l.files} archivo${l.files === 1 ? '' : 's'} recibidos · ${caduca}`));
      info.appendChild(el('div', 'url', urlDelEnlace(l.id, l.kind)));
      row.appendChild(info);

      const copiar = el('button', 'icon-btn');
      copiar.appendChild(icon('i-copy'));
      copiar.title = 'Copiar enlace';
      copiar.setAttribute('aria-label', 'Copiar enlace');
      copiar.addEventListener('click', () => copiarEnlace(l.id, l.kind));
      row.appendChild(copiar);

      const borrar = el('button', 'icon-btn');
      borrar.appendChild(icon('i-trash'));
      borrar.title = 'Revocar';
      borrar.setAttribute('aria-label', 'Revocar enlace');
      borrar.addEventListener('click', () => revocarEnlace(l));
      row.appendChild(borrar);

      box.appendChild(row);
    }
  } catch {}
}

const urlDelEnlace = (id, kind) => `${location.origin}${BASE}/${kind === 'share' ? 's' : 'u'}/${id}`;

async function copiarEnlace(id, kind) {
  copiarTexto(urlDelEnlace(id, kind), 'Enlace copiado al portapapeles');
}

async function crearEnlace() {
  const label = $('link-label').value.trim();
  const days = Number($('link-days').value);
  try {
    const res = await post(BASE + '/api/uploadlinks', { path: state.linkPath || '', label, days });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo crear'); return; }
    $('link-label').value = '';
    await loadLinks();
    copiarEnlace(data.link.id);
  } catch { showToast('Error de conexión'); }
}

async function revocarEnlace(l) {
  if (!confirm(`¿Revocar el enlace "${l.label}"? Quien lo tenga dejará de poder subir.`)) return;
  try {
    const res = await api(BASE + '/api/uploadlinks/' + qs(l.id), { method: 'DELETE' });
    if (res.ok) { showToast('Enlace revocado'); loadLinks(); }
    else showToast(await errorOf(res, 'No se pudo revocar'));
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Administración
--------------------------------------------------------------- */
async function loadAdmin() {
  if (window.K && K.perfil) K.perfil.tarjeta();
  try {
    const res = await api(BASE + '/api/stats');
    const s = await res.json();
    $('stat-size').textContent = fmtSize(s.totalBytes);
    $('stat-count').textContent = s.fileCount;
    if (s.diskTotal) {
      $('stat-free').textContent = fmtSize(s.diskFree);
      const used = s.diskTotal - s.diskFree;
      $('usage-fill').style.width = Math.min(100, (used / s.diskTotal) * 100).toFixed(1) + '%';
      $('usage-left').textContent = `${fmtSize(used)} usados de ${fmtSize(s.diskTotal)}`;
      $('usage-right').textContent = `${Math.round((used / s.diskTotal) * 100)}%`;
      show('usage-wrap');
    } else {
      $('stat-free').textContent = 'n/d';
      hide('usage-wrap');
    }
    renderByType(s.byType, s.app);
  } catch {}

  loadLinks();

  try {
    const res = await api(BASE + '/api/users');
    const users = await res.json();
    const box = $('user-list');
    box.textContent = '';
    for (const u of users) {
      const row = el('div', 'urow');
      const av = el('div', 'av', u.username.charAt(0).toUpperCase());
      av.dataset.user = u.username;
      row.appendChild(av);
      const un = el('div', 'un', u.username); un.dataset.user = u.username; row.appendChild(un);
      row.appendChild(el('span', 'pill' + (u.role === 'admin' ? ' admin' : ''), u.role));
      if (u.username !== 'admin') {
        const del = el('button', 'icon-btn');
        del.appendChild(icon('i-trash'));
        del.setAttribute('aria-label', 'Eliminar usuario');
        del.addEventListener('click', () => deleteUser(u.username));
        row.appendChild(del);
      }
      box.appendChild(row);
    }
    // Las fotos y los nombres visibles se piden cuando las filas ya existen
    if (window.K && K.perfil) K.perfil.lista();
  } catch {}
}

async function addUser() {
  const username = $('new-username').value.trim();
  const password = $('new-userpass').value;
  const role = $('new-userrole').value;
  if (!username || !password) { showToast('Faltan datos'); return; }
  try {
    const res = await post(BASE + '/api/users', { username, password, role });
    if (res.ok) {
      showToast('Usuario creado');
      $('new-username').value = '';
      $('new-userpass').value = '';
      loadAdmin();
    } else showToast(await errorOf(res, 'No se pudo crear'));
  } catch { showToast('Error de conexión'); }
}

async function deleteUser(username) {
  if (!confirm(`¿Eliminar el usuario "${username}"? Sus archivos no se borran.`)) return;
  try {
    const res = await api(BASE + '/api/users/' + qs(username), { method: 'DELETE' });
    if (res.ok) { showToast('Usuario eliminado'); loadAdmin(); }
    else showToast(await errorOf(res, 'No se pudo eliminar'));
  } catch { showToast('Error de conexión'); }
}

async function changeMyPassword() {
  const password = $('my-newpass').value;
  if (!password || password.length < 8) { showToast('Mínimo 8 caracteres'); return; }
  try {
    const res = await post(BASE + '/api/users/' + qs(state.user.username) + '/password', { password });
    if (res.ok) { showToast('Contraseña actualizada'); $('my-newpass').value = ''; }
    else showToast(await errorOf(res, 'No se pudo cambiar'));
  } catch { showToast('Error de conexión'); }
}
