'use strict';
/* Documentos · registro de la vista y del abridor (K.open('documento', id)) que usan la búsqueda y los enlaces. */
(function () {
  if (!window.K || !K.documentos || !document.getElementById('view-documentos')) return;
  const D = K.documentos, S = D.S, raiz = document.getElementById('view-documentos');
  let pedido = null;

  async function abre() {
    if (pedido) { const id = pedido; pedido = null; if (!S.lista) await D.carga().catch(() => {}); return D.pintaEditor(raiz, id); }
    if (S.abierto && D.ed) return;   // al volver a la pestaña se sigue donde se estaba
    try { await D.carga(); } catch (e) { K.fail(e); S.lista = S.lista || []; }
    D.pintaLista(raiz);
  }
  K.registerView('documentos', { open: abre, close() { if (D.ed && S.sucio) D.guardaYa(); } });
  K.openers.documento = (id) => { pedido = id; switchTab('documentos'); };
})();
