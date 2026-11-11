'use strict';
/* avisos: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._calendar. */
(function () {
  const C = (K._calendar = K._calendar || {});
  const evStart = (...a) => C.evStart(...a);

  /* ---------- Recordatorios ---------- */
  const avisados = (() => { try { return new Set(JSON.parse(localStorage.getItem('kcc-rem') || '[]')); } catch { return new Set(); } })();
  let proximos = [];
  async function cargaProximos() {
    try {
      const hoy = K.d.day(new Date());
      const r = await K.get('/api/calendar/events?' + K.qs({ from: K.d.ymd(K.d.add(hoy, -1)), to: K.d.ymd(K.d.add(hoy, 8)) }));
      proximos = r.events.filter(e => (e.reminders || []).length && !e.allDay && !e.done);
    } catch { /* sin red */ }
  }
  function revisaAvisos() {
    const ahora = Date.now();
    for (const e of proximos) {
      const ini = evStart(e).getTime();
      for (const m of e.reminders) {
        const cuando = ini - m * 60000;
        const clave = `${e.id}|${e.occurrence}|${m}`;
        if (ahora >= cuando && ahora < ini + 60000 && !avisados.has(clave)) {
          avisados.add(clave);
          try { localStorage.setItem('kcc-rem', JSON.stringify([...avisados].slice(-300))); } catch {}
          const txt = `${e.title} — ${m === 0 ? 'ahora' : 'en ' + (m >= 1440 ? Math.round(m / 1440) + ' d' : m >= 60 ? Math.round(m / 60) + ' h' : m + ' min')}`;
          K.toast('🔔 ' + txt);
          if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('KookyeCatCloud', { body: txt }); } catch {} }
        }
      }
    }
  }
  let remTimer = null;
  function arrancaAvisos() {
    if (remTimer) return;
    cargaProximos();
    remTimer = setInterval(revisaAvisos, 30000);
    setInterval(cargaProximos, 5 * 60000);
  }


  Object.assign(C, { avisados, proximos, cargaProximos, revisaAvisos, remTimer, arrancaAvisos });
})();
