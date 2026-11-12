'use strict';
/* Pulsar una pestaña (barra inferior o de escritorio) lleva siempre al inicio de su sección: raíz de Archivos, listado de Notas,
   de Documentos, de Bases y de Código, búsqueda vacía... Si lo abierto tiene cambios sin guardar, no se sale: se avisa y se queda como estaba.
   Parte de la aplicación principal; se carga antes de inicio.js y comparte el ámbito global. */

const SIN_GUARDAR = 'Hay cambios sin guardar: se mantiene abierto hasta que se guarden';

const INICIOS = {
  files: async () => {
    if (!$('lightbox').hidden) closeLightbox();
    goTo('');
  },
  notes: async () => {
    await guardarAhora();
    if (NT.sucia || (NT.pendientes && NT.pendientes.size)) { showToast(SIN_GUARDAR); return; }
    if (NT.abierta) cerrarNota();
  },
  colecciones: async () => { if (COL.albumAbierto) volverAAlbumes(); },
  admin: async () => { loadDiskUsage(''); },
  documentos: async () => {
    const D = K.documentos;
    if (!D || !D.ed) return;
    await D.guardaYa();
    if (D.S.sucio) { showToast(SIN_GUARDAR); return; }
    await D.cierraEditor();
  },
  bases: async () => {
    const B = K.bases;
    if (B && B.S.base) B.S.base = null;
  },
  codigo: async () => {
    const C = K._codigo;
    if (!C || !C.S.p) return;
    await C.guardaYa();
    if (!C.S.guardado) { showToast(SIN_GUARDAR); return; }
    C.S.p = null; clearTimeout(C.S.timer);
  },
  buscar: async () => {
    const S = K.buscar && K.buscar.S;
    if (S) Object.assign(S, { q: '', m: '', modo: 'buscar', res: null, error: '' });
  },
};

// Lleva a la sección y la deja en su pantalla de inicio (si no se puede, se queda en la sección tal cual estaba)
async function irASeccion(tab) {
  try { if (INICIOS[tab]) await INICIOS[tab](); } catch (e) { console.error('inicio de sección', tab, e); }
  switchTab(tab);
}
