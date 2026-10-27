'use strict';
/* ---------------------------------------------------------------
   Actualizaciones de la app:
   - Cuando el servidor tiene una versión nueva, aparece un aviso "Hay una versión nueva"
     con un botón para recargar, en vez de tener que abrir la app dos veces.
   - Se busca una versión nueva al volver a la pestaña, al recuperar la conexión y cada 30 min.
   - Tarjeta "Acerca de" en Cuenta con la versión instalada y un botón para comprobar ahora.
   (El service worker detecta la novedad porque su nombre de caché cambia con cada versión.)
--------------------------------------------------------------- */
(function () {
  if (!('serviceWorker' in navigator)) return;
  // Solo se avisa si la página ya estaba controlada por un service worker: la primera instalación no es una "actualización"
  let controlado = !!navigator.serviceWorker.controller;
  let avisado = false, recargando = false;

  function aviso() {
    if (avisado) return; avisado = true;
    const b = el('div', 'update-banner'); b.setAttribute('role', 'status');
    b.append(icon('i-refresh'), el('span', null, 'Hay una versión nueva de KookyeCatCloud'));
    const ok = el('button', 'btn primary sm', 'Actualizar'); ok.type = 'button';
    ok.addEventListener('click', () => { recargando = true; location.reload(); });
    const no = el('button', 'btn ghost sm', 'Luego'); no.type = 'button';
    no.addEventListener('click', () => { b.remove(); });
    b.append(ok, no);
    document.body.appendChild(b);
  }

  // Cada cambio de service worker que llega con la página ya controlada es una actualización.
  // (En una primera visita, el primer cambio es solo la instalación: se anota y no se avisa.)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlado && !recargando) aviso(); controlado = true; });

  let reg = null;
  navigator.serviceWorker.ready.then((r) => { reg = r; }).catch(() => {});
  // Como máximo una comprobación automática cada 30 minutos por dispositivo.
  // La petición al service worker utiliza validación HTTP condicional.
  let ultimaBusqueda = 0;
  const busca = (forzar = false) => {
    if (!reg || document.hidden || (!forzar && Date.now() - ultimaBusqueda < 30 * 60000)) return;
    ultimaBusqueda = Date.now();
    reg.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) busca(); });
  window.addEventListener('online', busca);
  setInterval(() => busca(), 30 * 60000);

  /* ---------- Tarjeta "Acerca de" en Cuenta ---------- */
  function tarjeta() {
    const v = $('view-cuenta'); if (!v || $('card-version')) return;
    const c = el('section', 'card'); c.id = 'card-version';
    const h = el('h3'); h.append(icon('i-info'), document.createTextNode(' Acerca de'));
    const info = el('p', 'card-sub', 'Comprobando versión…');
    const b = el('button', 'btn', 'Buscar actualizaciones'); b.type = 'button';
    c.append(h, info, b);
    v.appendChild(c);
    const lee = async () => {
      try {
        const r = await (await fetch(BASE + '/api/version', { cache: 'no-store' })).json();
        info.textContent = `Versión ${r.version} · compilación ${r.build} · servidor iniciado ${K.ago(r.startedAt)}`;
        return r;
      } catch { info.textContent = 'No se pudo comprobar la versión'; return null; }
    };
    lee();
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Buscando…';
      const antes = await lee();
      try { if (reg) await reg.update(); } catch {}
      // Si hay un service worker nuevo, controllerchange mostrará el aviso; si no, estamos al día
      await new Promise(r => setTimeout(r, 2500));
      const despues = await lee();
      if (!avisado) K.toast(antes && despues && antes.build === despues.build ? 'Ya tienes la última versión' : 'Comprobado');
      b.disabled = false; b.textContent = 'Buscar actualizaciones';
    });
  }
  // La vista Cuenta existe desde el principio; se monta al abrirla la primera vez
  const previa = window.KCC.views.cuenta;
  K.registerView('cuenta', { open() { tarjeta(); if (previa && previa.open) previa.open(); }, close() { if (previa && previa.close) previa.close(); } });

  K.updates = { aviso, busca };
})();
