'use strict';
/* registro: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const { R, S } = C;
  const build = (...a) => C.build(...a);
  const copyPrompt = (...a) => C.copyPrompt(...a);
  const kindBy = (...a) => C.kindBy(...a);
  const load = (...a) => C.load(...a);
  const openDetail = (...a) => C.openDetail(...a);
  const openEditor = (...a) => C.openEditor(...a);
  const resetNav = (...a) => C.resetNav(...a);

  /* ---------- Registro ---------- */
  K.registerView('prompts', {
    async open() {
      if (!S.built) build();
      await K.loadLabels().catch(() => {});
      load();
    },
    close() { S.selMode = false; S.sel.clear(); },
  });
  K.bus.on('labels', () => { if (S.built && !$('view-prompts').hidden) load(); });
  // Los chips de modelo, herramienta e idioma de cualquier parte de la web filtran la biblioteca
  K.filtros.prompts = (prop, valor) => { resetNav(); S.labels.clear(); S.q.q = ''; if (R.si) R.si.value = ''; S.q[prop] = valor; switchTab('prompts'); load(); };
  K.openers.prompt = (id) => { switchTab('prompts'); setTimeout(() => openDetail(id), 60); };
  // prompts-extra.js cuelga de aquí sus entradas de menú, la comparación de versiones y las estadísticas
  K.prompts = Object.assign(K.prompts || {}, {
    kindLabel: (id) => kindBy(id).name,
    kindIcon: (id) => kindBy(id).icon,
    open: (id) => K.openers.prompt(id),
    newPrompt: () => { switchTab('prompts'); openEditor(null); },
    extraMenu: (K.prompts && K.prompts.extraMenu) || [],
    reload: () => { K.bus.emit('prompts'); return load(); },
    detail: (id) => openDetail(id),
    copiar: (id) => copyPrompt(id),
    filtrar: (campo, valor) => { S.q[campo] = valor; load(); },
  });

  Object.assign(C, {  });
})();
