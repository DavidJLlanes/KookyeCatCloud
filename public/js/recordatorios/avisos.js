'use strict';
/* Recordatorios · avisos: pedir el permiso de notificaciones al crear el primero, avisar dentro de la app mientras está abierta
   y marcar en el menú cuántos están vencidos o para hoy. Los avisos con la app cerrada son push (Cuenta → Avisos). */
(function () {
  if (!window.K || !K.recordatorios) return;
  const R = K.recordatorios, S = R.S;
  const NO_PREGUNTAR = 'kcc-rec-no-preguntar', VISTOS = 'kcc-rec-vistos';
  const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const lee = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

  // 'activos' | 'desactivados' (se puede activar) | 'bloqueado' (el navegador lo tiene prohibido) | 'sin-soporte' | 'error'
  R.estadoAvisos = async function () {
    if (!K.push) return { estado: 'sin-soporte' };
    const sop = K.push.soporte(); if (!sop.ok) return { estado: 'sin-soporte', motivo: sop.motivo };
    if (Notification.permission === 'denied') return { estado: 'bloqueado' };
    try { await K.push.carga(); await K.push.reconoce(); } catch { return { estado: 'error' }; }
    return { estado: K.push.mio && Notification.permission === 'granted' ? 'activos' : 'desactivados' };
  };
  // Pide el permiso al navegador (debe llamarse desde un clic) y registra este dispositivo
  R.activaAvisos = async function () { await K.push.activa(); K.toast('Avisos activados en este dispositivo'); };

  // Tras crear un recordatorio con aviso: si este dispositivo no recibe avisos, se ofrece activarlos (una vez; se puede no volver a preguntar)
  R.pideAvisos = async function () {
    if (lee(NO_PREGUNTAR) === '1') return;
    const e = await R.estadoAvisos(); if (e.estado !== 'desactivados') return;
    const caja = el('div', 'rc-pide');
    caja.append(el('p', null, 'Para que el navegador te avise a la hora del recordatorio, incluso con la app cerrada, hay que activar los avisos en este dispositivo. Chrome te pedirá permiso.'));
    const chk = el('input'); chk.type = 'checkbox'; const l = el('label', 'rc-check'); l.append(chk, el('span', null, 'No volver a preguntar')); caja.appendChild(l);
    K.modal({ title: '¿Recibir los avisos?', content: caja, actions: [
      { label: 'Ahora no', onClick: () => { if (chk.checked) guarda(NO_PREGUNTAR, '1'); } },
      { label: 'Activar avisos', primary: true, onClick: () => { R.activaAvisos().then(() => R.pinta && R.pinta()).catch(K.fail); } },
    ] });
  };

  /* ---------- Avisos dentro de la app (como los del calendario) ---------- */
  const vistos = (() => { try { return new Set(JSON.parse(lee(VISTOS) || '[]')); } catch { return new Set(); } })();
  R.revisa = function () {
    const ahora = Date.now();
    for (const r of R.pendientes()) {
      const t = R.momentoAviso(r); if (!t) continue;
      const clave = `${r.id}|${r.fecha}|${r.hora}|${r.antes}`;
      if (ahora < t.getTime() || ahora > t.getTime() + 12 * 3600000 || vistos.has(clave)) continue;
      vistos.add(clave); guarda(VISTOS, JSON.stringify([...vistos].slice(-300)));
      K.toast('🔔 ' + r.titulo + (r.hora ? ` · ${r.hora}` : ''));
      // Si este dispositivo ya recibe push, el sistema muestra el aviso: aquí solo el toast (no se duplica la notificación)
      if (!(K.push && K.push.mio) && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Recordatorio', { body: r.titulo }); } catch { /* sin permiso real */ } }
    }
    R.badge();
  };

  // Número de vencidos y de hoy junto a «Recordatorios» en el menú
  R.badge = function () {
    const n = R.pendientes().filter(r => ['vencido', 'hoy'].includes(R.estado(r))).length;
    document.querySelectorAll('[data-view="recordatorios"]').forEach((b) => {
      let i = b.querySelector('.rc-badge');
      if (!n) { if (i) i.remove(); return; }
      if (!i) { i = el('i', 'rc-badge'); b.appendChild(i); }
      i.textContent = n > 9 ? '9+' : String(n); i.title = `${n} vencidos o para hoy`;
    });
  };

  let timer = null;
  R.arranca = function () {
    if (timer) return;
    R.carga().then(R.revisa).catch(() => {});
    timer = setInterval(R.revisa, 30000);
    setInterval(() => { R.carga().catch(() => {}); }, 3 * 60000);
  };
})();
