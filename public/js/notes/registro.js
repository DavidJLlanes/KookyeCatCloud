'use strict';
/* notes/registro.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});
  const { EST, NB } = C;
  const itemActual = (...a) => C.itemActual(...a);
  const montaProps = (...a) => C.montaProps(...a);
  const mount = (...a) => C.mount(...a);
  const pintaProps = (...a) => C.pintaProps(...a);

  function enganchar() {
    mount(); montaProps();
    // abrirNota y cerrarNota son globales de app.js: se envuelven para cargar/limpiar el editor
    const abrir0 = window.abrirNota;
    window.abrirNota = async function (id) {
      NB.flush();
      await abrir0(id);
      if (NT.abierta === id) { NB.load(EST.store.value); pintaProps(); }
    };
    const cerrar0 = window.cerrarNota;
    window.cerrarNota = function () { NB.flush(); NB.clear(); cerrar0(); };
  }

  K.openers.note = async (id) => {
    switchTab('notes');
    await loadNotes(true);
    // Se abren las carpetas padre para que la nota quede visible en el árbol
    let it = NT.items.find(i => i.id === id);
    while (it && it.parent) { NT.abiertas.add(it.parent); it = NT.items.find(i => i.id === it.parent); }
    guardarAbiertas(); renderNotes();
    abrirNota(id);
  };
  K.bus.on('labels', () => { if (itemActual()) pintaProps(); });
  K.bus.on('calendar', () => { if ($('view-notes') && !$('view-notes').hidden) loadNotes(true).then(pintaProps); });

  // app.js ya está cargado (este script va detrás): se engancha de inmediato
  enganchar();

  Object.assign(C, { enganchar });
})();
