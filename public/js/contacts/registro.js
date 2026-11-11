'use strict';
/* contacts/registro.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const { R, S } = C;
  const build = (...a) => C.build(...a);
  const load = (...a) => C.load(...a);
  const openDetail = (...a) => C.openDetail(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Registro ---------- */
  K.registerView('contacts', {
    async open() {
      if (!S.built) build();
      await K.loadLabels().catch(() => {});
      if (!S.loaded) render();
      load();
      if (R.si && S.q === '') R.si.value = '';
    },
    close() { S.selMode = false; S.sel.clear(); if (R.selb) R.selb.classList.remove('is-on'); },
  });
  K.bus.on('labels', () => { if (S.built && !$('view-contacts').hidden) load(); else S.loaded = false; });
  // Un chip de empresa, cargo, departamento, ciudad, provincia o país de cualquier parte filtra la agenda
  K.filtros.contacts = (prop, valor) => {
    switchTab('contacts');
    const aplica = () => { S.fav = false; S.label = ''; S.q = ''; if (R.si) R.si.value = ''; S.val = { prop, valor }; render(); };
    aplica();
    if (!S.loaded) load().then(aplica); else load().then(render);
  };
  K.openers.contact = (id) => { switchTab('contacts'); const ir = () => openDetail(id); S.loaded ? setTimeout(ir, 60) : setTimeout(ir, 400); };
  K.contacts = { open: (id) => K.openers.contact(id), newContact: () => { switchTab('contacts'); setTimeout(() => openEditor(null), 60); } };

  Object.assign(C, {  });
})();
