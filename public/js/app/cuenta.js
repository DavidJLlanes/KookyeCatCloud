'use strict';
/* Sesiones, tokens, verificación en dos pasos y PIN. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Sesiones abiertas y tokens de aplicación (Cuenta)
--------------------------------------------------------------- */
function navegadorDe(ua) {
  if (!ua) return 'Dispositivo desconocido';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}
async function cargarSesiones() {
  const box = $('sessions-list');
  box.textContent = '';
  box.appendChild(el('div', 'none', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/sessions');
    const data = await res.json();
    box.textContent = '';
    if (!data.length) { box.appendChild(el('p', 'card-sub', 'Sin sesiones registradas')); return; }
    for (const s of data) {
      const row = el('div', 'sess-row' + (s.current ? ' actual' : ''));
      const info = el('div', 'info');
      info.appendChild(el('div', 'nm', navegadorDe(s.ua)));
      info.appendChild(el('div', 'mt', `${s.ip} · última actividad ${fmtCuando(s.lastSeenAt)}`));
      row.appendChild(info);
      if (!s.current) {
        const del = el('button', 'icon-btn');
        del.appendChild(icon('i-x'));
        del.title = 'Cerrar esta sesión';
        del.setAttribute('aria-label', 'Cerrar esta sesión');
        del.addEventListener('click', async () => {
          const r = await api(BASE + '/api/sessions/' + s.jti, { method: 'DELETE' });
          if (r.ok) { showToast('Sesión cerrada'); cargarSesiones(); }
        });
        row.appendChild(del);
      }
      box.appendChild(row);
    }
  } catch {
    box.textContent = '';
    box.appendChild(el('p', 'card-sub', 'No se pudieron cargar'));
  }
}
async function cerrarOtrasSesiones() {
  if (!confirm('¿Cerrar todas las demás sesiones? Esta se mantiene.')) return;
  try {
    const res = await api(BASE + '/api/sessions', { method: 'DELETE' });
    const data = await res.json();
    showToast(`${data.removed} sesión(es) cerradas`);
    cargarSesiones();
  } catch { showToast('Error de conexión'); }
}

async function cargarAppTokens() {
  const box = $('apptokens-list');
  box.textContent = '';
  box.appendChild(el('div', 'none', 'Cargando…'));
  try {
    const res = await api(BASE + '/api/apptokens');
    const tokens = await res.json();
    box.textContent = '';
    if (!tokens.length) { box.appendChild(el('p', 'card-sub', 'Sin tokens creados')); return; }
    for (const t of tokens) {
      const row = el('div', 'token-row');
      const info = el('div', 'info');
      info.appendChild(el('div', 'nm', t.name));
      info.appendChild(el('div', 'mt',
        `Creado ${fmtDate(t.createdAt)}` + (t.lastUsedAt ? ` · usado ${fmtCuando(t.lastUsedAt)}` : ' · sin usar todavía')));
      row.appendChild(info);
      const del = el('button', 'icon-btn');
      del.appendChild(icon('i-trash'));
      del.title = 'Revocar';
      del.setAttribute('aria-label', 'Revocar token');
      del.addEventListener('click', async () => {
        if (!confirm(`¿Revocar el token "${t.name}"?`)) return;
        const r = await api(BASE + '/api/apptokens/' + t.id, { method: 'DELETE' });
        if (r.ok) { showToast('Token revocado'); cargarAppTokens(); }
      });
      row.appendChild(del);
      box.appendChild(row);
    }
  } catch {
    box.textContent = '';
    box.appendChild(el('p', 'card-sub', 'No se pudieron cargar'));
  }
}
async function crearAppToken() {
  const name = $('apptoken-name').value.trim();
  if (!name) { showToast('Escribe para qué es'); return; }
  try {
    const res = await post(BASE + '/api/apptokens', { name });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo crear'); return; }
    $('apptoken-name').value = '';
    await cargarAppTokens();
    try { await navigator.clipboard.writeText(data.token); } catch { /* sin permiso de portapapeles */ }
    alert(`Token creado (copiado al portapapeles si tu navegador lo permite):\n\n${data.token}\n\nGuárdalo ahora: no se volverá a mostrar.`);
  } catch { showToast('Error de conexión'); }
}

/* ---------------------------------------------------------------
   Verificación en dos pasos (Cuenta)
--------------------------------------------------------------- */
async function cargarEstado2fa() {
  hide('twofa-off'); hide('twofa-setup'); hide('twofa-on');
  $('twofa-sub').textContent = 'Comprobando…';
  try {
    const res = await api(BASE + '/api/2fa/status');
    const data = await res.json();
    if (data.enabled) {
      $('twofa-sub').textContent = 'Tu cuenta está protegida con verificación en dos pasos.';
      show('twofa-on');
    } else {
      $('twofa-sub').textContent = 'Añade un código de un solo uso al iniciar sesión, además de la contraseña.';
      show('twofa-off');
    }
  } catch { $('twofa-sub').textContent = 'No se pudo comprobar el estado'; }
}
async function iniciar2faSetup() {
  try {
    const res = await post(BASE + '/api/2fa/setup', {});
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo iniciar'); return; }
    $('twofa-secret').textContent = data.secret;
    $('twofa-code').value = '';
    hide('twofa-off');
    show('twofa-setup');
  } catch { showToast('Error de conexión'); }
}
async function confirmar2fa() {
  const code = $('twofa-code').value.trim();
  if (!code) { showToast('Escribe el código'); return; }
  try {
    const res = await post(BASE + '/api/2fa/confirm', { code });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Código incorrecto'); return; }
    showToast('Verificación en dos pasos activada');
    cargarEstado2fa();
  } catch { showToast('Error de conexión'); }
}
async function desactivar2fa() {
  const password = $('twofa-disable-pass').value;
  if (!password) { showToast('Escribe tu contraseña'); return; }
  try {
    const res = await post(BASE + '/api/2fa/disable', { password });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'No se pudo desactivar'); return; }
    $('twofa-disable-pass').value = '';
    showToast('Verificación en dos pasos desactivada');
    cargarEstado2fa();
  } catch { showToast('Error de conexión'); }
}

function loadCuenta() {
  cargarSesiones();
  cargarAppTokens();
  cargarEstado2fa();
  pintarEstadoPin();
  cargarActividad('activity-list', false);
}

/* ---------------------------------------------------------------
   Bloqueo con PIN
   Protege solo este dispositivo de un vistazo ajeno; la contraseña real
   sigue siendo la de la cuenta. El hash del PIN vive en localStorage,
   nunca llega al servidor.
--------------------------------------------------------------- */
const PIN_IDLE_MS = 10 * 60 * 1000;
let pinIdleTimer = null;
let pinIntento = '';

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kcc-pin:' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const pinActivo = () => localStorage.getItem('fc-pin-on') === '1';

function pintarEstadoPin() {
  $('pin-off').hidden = pinActivo();
  $('pin-on').hidden = !pinActivo();
}
async function activarPin() {
  const pin = $('pin-nuevo').value.trim();
  if (!/^\d{4,8}$/.test(pin)) { showToast('El PIN debe tener entre 4 y 8 dígitos'); return; }
  localStorage.setItem('fc-pin-hash', await hashPin(pin));
  localStorage.setItem('fc-pin-on', '1');
  $('pin-nuevo').value = '';
  pintarEstadoPin();
  showToast('Bloqueo con PIN activado en este dispositivo');
  reiniciarPinIdle();
}
function desactivarPin() {
  localStorage.removeItem('fc-pin-hash');
  localStorage.removeItem('fc-pin-on');
  pintarEstadoPin();
  showToast('Bloqueo con PIN desactivado');
  clearTimeout(pinIdleTimer);
}
function pintarPinDots() {
  const puntos = $('pindots').children;
  for (let i = 0; i < puntos.length; i++) puntos[i].classList.toggle('filled', i < pinIntento.length);
}
function bloquearApp() {
  if (!pinActivo() || $('app').hidden) return;
  pinIntento = '';
  pintarPinDots();
  $('pin-error').textContent = 'Introduce tu PIN';
  $('pin-error').classList.remove('err');
  show('pinlock');
}
async function tocarPinTecla(k) {
  if (k === 'borrar') { pinIntento = pinIntento.slice(0, -1); pintarPinDots(); return; }
  if (k === 'salir') { hide('pinlock'); logout(); return; }
  if (pinIntento.length >= 8) return;
  pinIntento += k;
  pintarPinDots();
  if (pinIntento.length < 4) return;
  const hash = await hashPin(pinIntento);
  if (hash === localStorage.getItem('fc-pin-hash')) {
    hide('pinlock');
    pinIntento = '';
    reiniciarPinIdle();
  } else if (pinIntento.length >= 8) {
    $('pin-error').textContent = 'PIN incorrecto, prueba de nuevo';
    $('pin-error').classList.add('err');
    pinIntento = '';
    setTimeout(pintarPinDots, 250);
  }
}
function reiniciarPinIdle() {
  clearTimeout(pinIdleTimer);
  if (!pinActivo()) return;
  pinIdleTimer = setTimeout(bloquearApp, PIN_IDLE_MS);
}
['click', 'keydown', 'touchstart', 'mousemove'].forEach(ev =>
  document.addEventListener(ev, () => { if ($('pinlock').hidden) reiniciarPinIdle(); }, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(pinIdleTimer); bloquearApp(); }
  else reiniciarPinIdle();
});
