'use strict';
/* Sesión y avisos en directo. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Sesión
--------------------------------------------------------------- */
let esperando2fa = false;

async function doLogin(ev) {
  ev.preventDefault();
  const errBox = $('login-error');
  const btn = $('login-btn');
  errBox.textContent = '';
  btn.disabled = true;

  try {
    if (esperando2fa) {
      btn.textContent = 'Comprobando…';
      const res = await fetch(BASE + '/api/login/2fa', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: $('login-2fa-code').value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { errBox.textContent = data.error || 'Error'; return; }
      state.user = data;
      salirModo2fa();
      showApp();
      return;
    }

    btn.textContent = 'Entrando…';
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    const res = await fetch(BASE + '/api/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.error || 'Error'; return; }
    if (data.need2fa) { entrarModo2fa(); return; }
    state.user = data;
    $('login-pass').value = '';
    showApp();
  } catch {
    errBox.textContent = 'Error de conexión con el servidor';
  } finally {
    btn.disabled = false;
    btn.textContent = esperando2fa ? 'Verificar' : 'Entrar';
  }
}

// El formulario de login se reutiliza para el segundo paso: se ocultan usuario/
// contraseña y aparece el campo de código, sin duplicar toda la pantalla.
function entrarModo2fa() {
  esperando2fa = true;
  $('login-pass').value = '';
  $('login-campos').hidden = true;
  $('login-2fa-campo').hidden = false;
  $('login-btn').textContent = 'Verificar';
  $('login-sub').textContent = 'Introduce el código de tu app de verificación';
  $('login-2fa-code').focus();
}
function salirModo2fa() {
  esperando2fa = false;
  $('login-campos').hidden = false;
  $('login-2fa-campo').hidden = true;
  $('login-2fa-code').value = '';
  $('login-btn').textContent = 'Entrar';
  $('login-sub').textContent = 'Tu nube personal';
}

async function logout() {
  try { await fetch(BASE + '/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
  state.user = null;
  showLogin();
}

function showLogin() { desconectaEventos(); salirModo2fa(); show('login-screen'); hide('app'); }

/* ---------------------------------------------------------------
   Avisos en directo: una conexión (EventSource) y el servidor avisa cuando cambia algo.
   Si la pestaña estaba oculta o la conexión se cortó, se refresca al volver.
--------------------------------------------------------------- */
const LIVE = { es: null, timer: null, sucio: false, ultimo: 0, abierta: false };
function refrescoEnDirecto() {
  LIVE.sucio = false; LIVE.ultimo = Date.now();
  if (state.tab !== 'files' || state.query || state.selectMode || UP.activos > 0) { LIVE.sucio = true; return; }
  refresh({ silent: true });
}
function avisoDeCambio() {
  if (document.visibilityState !== 'visible') { LIVE.sucio = true; return; }
  clearTimeout(LIVE.timer);
  LIVE.timer = setTimeout(refrescoEnDirecto, 400);
}
function conectaEventos() {
  if (LIVE.es || !window.EventSource) return;
  const es = new EventSource(`${BASE}/api/events?cid=${encodeURIComponent(CID)}`, { withCredentials: true });
  LIVE.es = es;
  es.addEventListener('files', avisoDeCambio);
  es.addEventListener('clip', () => { if (window.K && K.clip) K.clip.aviso(); });
  es.addEventListener('hola', () => { if (LIVE.abierta) avisoDeCambio(); LIVE.abierta = true; });   // al reconectar, por si se perdió algún aviso
  es.onerror = () => { if (es.readyState === 2) { LIVE.es = null; LIVE.abierta = false; } };          // cerrada del todo (p. ej. sin sesión)
}
function desconectaEventos() {
  if (LIVE.es) LIVE.es.close();
  LIVE.es = null; LIVE.abierta = false; clearTimeout(LIVE.timer);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('app').hidden) return;
  if (!LIVE.es) conectaEventos();
  if (LIVE.sucio || Date.now() - LIVE.ultimo > 60000) avisoDeCambio();
});

function showApp() {
  conectaEventos();
  hide('login-screen');
  show('app');
  medirAlturaNav();
  if (window.K) K.preload();
  const name = state.user.username;
  $('user-av').textContent = name.charAt(0).toUpperCase();
  $('user-name').textContent = name;
  $('user-role').textContent = state.user.role === 'admin' ? 'admin' : '';
  const isAdmin = state.user.role === 'admin';
  $('tab-admin').hidden = !isAdmin;
  $('mnav-admin').hidden = !isAdmin;
  $('dav-url').textContent = location.origin + BASE + '/dav/';
  $('dav-user').textContent = name;
  cargarCapacidades();       // aquí, no en checkSession: así vale entrando por el formulario
  cargarFavoritosSet();
  pintaOrden();
  applyViewButtons();
  aplicarBotonAgrupar();
  refresh();
  bloquearApp();
  reiniciarPinIdle();
  // Viene del "Compartir" de Android o del atajo de la app: se abre directamente el portapapeles
  if (location.hash === '#clip') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* sin historial */ }
    switchTab('clip');
  }
}

async function checkSession() {
  try {
    const res = await api(BASE + '/api/me');
    if (res.ok) { state.user = await res.json(); showApp(); return; }
  } catch {}
  showLogin();
}

// Qué sabe hacer el servidor (sharp, ffmpeg, LibreOffice): sirve para no
// prometer una vista previa que luego no va a existir
async function cargarCapacidades() {
  try {
    const res = await api(BASE + '/api/capabilities');
    if (res.ok) state.caps = await res.json();
  } catch {}
}

function switchTab(tab) {
  state.tab = tab;
  $('view-files').hidden = tab !== 'files';
  $('view-notes').hidden = tab !== 'notes';
  $('view-map').hidden = tab !== 'map';
  $('view-trash').hidden = tab !== 'trash';
  $('view-colecciones').hidden = tab !== 'colecciones';
  $('view-cuenta').hidden = tab !== 'cuenta';
  $('view-admin').hidden = tab !== 'admin';
  document.querySelectorAll('main.kcc-view').forEach(m => { m.hidden = m.id !== 'view-' + tab; });
  document.querySelectorAll('.tab, .mobilenav button').forEach(b => {
    b.classList.toggle('is-active', b.dataset.view === tab);
  });
  // En la barra inferior (que se desliza) la pestaña activa debe quedar a la vista
  const navAct = document.querySelector('.mobilenav button.is-active');
  if (navAct && navAct.offsetParent) {
    const inner = navAct.parentElement;
    inner.scrollTo({ left: navAct.offsetLeft - (inner.clientWidth - navAct.offsetWidth) / 2, behavior: 'smooth' });
  }
  if (tab !== 'files') exitSelectMode();
  if (tab !== 'notes') guardarAhora();          // salir de Notas no debe perder lo escrito
  if (tab === 'notes') { loadNotes(true); refrescarContadorPapeleraNotas(); }
  if (tab === 'admin') { loadAdmin(); loadDiskUsage(''); }
  if (tab === 'map') loadMap();
  if (tab === 'trash') loadTrash();
  if (tab === 'colecciones') loadColecciones();
  if (tab === 'cuenta') { renderApariencia(); loadCuenta(); }
  for (const [nombre, vista] of Object.entries(window.KCC.views)) {
    if (nombre !== tab && vista.close) vista.close();
  }
  if (window.KCC.views[tab]) window.KCC.views[tab].open();
  try { sessionStorage.setItem('kcc-tab', tab); } catch {}
}
