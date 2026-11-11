'use strict';
/* codigo/registro.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { S } = C;
  const carga = (...a) => C.carga(...a);
  const entra = (...a) => C.entra(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const pinta = (...a) => C.pinta(...a);

  // K.open('codigo', id): desde un prompt vinculado se salta directamente al proyecto
  K.openers.codigo = async (id) => {
    try {
      if (S.p) await guardaYa();
      const p = await K.get('/api/codigo/' + id);
      if (!S.built) await carga();
      S.p = p; entra(); switchTab('codigo');
    } catch (e) { K.fail(e); }
  };
  // Un chip de etiqueta de cualquier parte filtra los proyectos
  K.filtros.codigo = (prop, valor) => {
    if (prop !== 'etiquetas') return;
    S.etiqueta = valor; S.q = ''; S.fav = false;
    switchTab('codigo');
    (async () => { if (S.p) { await guardaYa(); S.p = null; clearTimeout(S.timer); } await carga(); })();
  };
  // Al ocultar la app (cambiar de app en el móvil, cerrar la pestaña) se guarda ya, sin esperar al temporizador
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.p && !S.guardado) guardaYa(); });
  // Al cerrar la pestaña, una petición normal puede cortarse: se manda con keepalive (si cabe, < 60 KB)
  window.addEventListener('pagehide', () => {
    if (!S.p || S.guardado || !S.ruta || S.ver) return;
    const cuerpo = JSON.stringify({ ruta: S.ruta, contenido: S.texto });
    if (cuerpo.length < 60000) { try { fetch(`${BASE}/api/codigo/${S.p.id}/archivo`, { method: 'PUT', keepalive: true, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: cuerpo }); return; } catch { /* sigue */ } }
    guardaYa();
  });
  K.registraSinGuardar(() => !!(S.p && !S.guardado));
  K.registerView('codigo', { open() { if (S.p) pinta(); else carga(); }, close() { guardaYa(); } });

  Object.assign(C, {  });
})();
