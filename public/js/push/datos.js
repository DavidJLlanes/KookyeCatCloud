'use strict';
/* Avisos push · acceso al navegador y al servidor (todo cuelga de K.push). */
(function () {
  if (!window.K) return;
  const P = K.push = { cfg: null };

  // ¿Puede este navegador recibir avisos? En iPhone solo si la web está instalada en la pantalla de inicio.
  P.soporte = function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      return { ok: false, motivo: ios ? 'En iPhone y iPad hay que instalar la app: Compartir → «Añadir a pantalla de inicio», y activar los avisos desde ahí.' : 'Este navegador no admite avisos push.' };
    }
    return { ok: true };
  };

  const aBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };

  P.carga = async function () { P.cfg = await K.get('/api/push/config'); return P.cfg; };
  P.guarda = async function (cambios) { const r = await K.put('/api/push/ajustes', cambios); P.cfg.ajustes = r.ajustes; return r.ajustes; };

  async function registro() { return (await navigator.serviceWorker.getRegistration(BASE + '/')) || navigator.serviceWorker.ready; }
  P.suscripcion = async function () { try { return await (await registro()).pushManager.getSubscription(); } catch { return null; } };

  // Pide permiso, se suscribe y registra el dispositivo en el servidor
  P.activa = async function () {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error(permiso === 'denied' ? 'Has bloqueado los avisos de esta web en el navegador. Actívalos en los ajustes del sitio y vuelve a intentarlo.' : 'No has dado permiso para los avisos.');
    if (!P.cfg) await P.carga();
    const reg = await registro();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(P.cfg.clavePublica) });
    const r = await K.post('/api/push/dispositivos', { suscripcion: sub.toJSON() });
    P.cfg.dispositivos = r.dispositivos; P.cfg.ajustes = r.ajustes; P.mio = r.id;
    return r;
  };

  P.desactiva = async function () {
    const sub = await P.suscripcion();
    if (sub) { try { await sub.unsubscribe(); } catch { /* ya no estaba */ } }
    if (P.mio) { const r = await K.del('/api/push/dispositivos/' + P.mio); P.cfg.dispositivos = r.dispositivos; P.mio = null; }
  };

  // ¿Este dispositivo ya está registrado? (para marcarlo en la lista y saber el estado del interruptor)
  P.reconoce = async function () {
    const sub = await P.suscripcion();
    if (!sub || !P.cfg) { P.mio = null; return null; }
    const buf = new TextEncoder().encode(sub.endpoint);
    const h = await crypto.subtle.digest('SHA-256', buf);
    const id = [...new Uint8Array(h)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    P.mio = P.cfg.dispositivos.some(d => d.id === id) ? id : null;
    return P.mio;
  };

  // Al pulsar un aviso, el service worker abre la app con ?ver=<sección>
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
    const v = e.data && e.data.tipo === 'abrir-vista' && /^[a-z]{2,20}$/.test(String(e.data.vista)) ? e.data.vista : '';
    if (v && typeof switchTab === 'function' && document.getElementById('view-' + v)) switchTab(v);
  });
  P.abreDesdeAviso = function () {
    try {
      const u = new URL(location.href), v = u.searchParams.get('ver');
      if (!v) return;
      u.searchParams.delete('ver'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      const intenta = (n) => { if (typeof state !== 'undefined' && state.user && typeof switchTab === 'function' && document.getElementById('view-' + v)) switchTab(v); else if (n > 0) setTimeout(() => intenta(n - 1), 300); };
      intenta(20);
    } catch { /* sin más */ }
  };
})();
