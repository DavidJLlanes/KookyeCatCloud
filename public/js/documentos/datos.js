'use strict';
/* Documentos · estado, API y utilidades. Todo cuelga de K.documentos. */
(function () {
  if (!window.K) return;
  const D = K.documentos = { S: { lista: null, plantillas: [], q: '', abierto: null, busca: '' } };
  D.PAGINAS = [['a4', 'A4'], ['carta', 'Carta'], ['ancho', 'Fluida']];
  D.FUENTES = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Impact'];
  D.TAMANOS = [10, 12, 14, 16, 18, 24, 32, 48];
  D.COLORES = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#7f1d1d', '#14532d', '#1e3a8a', '#fde68a', '#bbf7d0', '#bfdbfe'];

  D.carga = async () => { const r = await K.get('/api/documentos'); D.S.lista = r.documentos; D.S.plantillas = r.plantillas; return r; };
  D.crea = async (plantilla) => (await K.post('/api/documentos', { plantilla })).documento;
  D.abre = async (id) => (await K.get('/api/documentos/' + id)).documento;
  D.guarda = (id, datos) => K.put('/api/documentos/' + id, datos);
  D.logros = K.debounce(() => { try { if (K.game && K.game.load) K.game.load(); } catch { /* sin avisos */ } }, 1500);
  D.fecha = (ms) => { const d = new Date(ms), h = new Date(); const mismo = d.toDateString() === h.toDateString(); return mismo ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === h.getFullYear() ? undefined : 'numeric' }); };
})();
