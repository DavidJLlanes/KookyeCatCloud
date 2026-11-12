'use strict';
/* Buscar · datos y utilidades de la vista «Buscar» (búsqueda global sin IA + preguntas a la IA). Todo cuelga de K.buscar. */
(function () {
  if (!window.K) return;
  const B = K.buscar = { S: { q: '', m: '', modo: 'buscar', res: null, ia: null, resumen: null, config: null, recientes: [], ocupado: false, error: '' } };
  B.FUENTES = {
    notas: ['Notas', 'i-note'], prompts: ['Prompts', 'i-sparkle'], bases: ['Bases', 'i-table'], documentos: ['Documentos', 'i-doc'], codigo: ['Código', 'i-code'],
    contactos: ['Contactos', 'i-contact'], calendario: ['Calendario', 'i-calendar'], pagos: ['Pagos', 'i-wallet'], recordatorios: ['Recordatorios', 'i-bell'],
    marcadores: ['Marcadores', 'i-bookmark'], sincronizados: ['Bloques sincronizados', 'i-note'], portapapeles: ['Portapapeles', 'i-doc'], archivos: ['Archivos', 'i-doc'],
  };
  const nombreDe = (f) => (B.FUENTES[f] || [f])[0];
  B.nombreDe = nombreDe;
  B.iconoDe = (f) => (B.FUENTES[f] || [0, 'i-doc'])[1];

  // Abre el elemento donde vive: cada módulo registra su «abridor» en K.openers
  B.abrir = (r) => {
    const f = r.fuente, id = r.id;
    if (f === 'notas') return K.open('note', id);
    if (f === 'prompts') return K.open('prompt', id);
    if (f === 'contactos') return K.open('contact', id);
    if (f === 'calendario') return K.open('event', id);
    if (f === 'pagos') return K.open('pago', id);
    if (f === 'codigo') return K.open('codigo', id);
    if (f === 'archivos') return K.open('file', id, { isDir: false });
    const tab = { documentos: 'documentos', bases: 'bases', marcadores: 'marcadores', recordatorios: 'recordatorios', sincronizados: 'notes', portapapeles: 'clip' }[f];
    if (tab) switchTab(tab);
  };

  // Texto con las coincidencias en <mark>, construido con nodos (nunca innerHTML: el contenido es del usuario)
  B.marcado = (texto, marcas) => {
    const fr = document.createDocumentFragment();
    let pos = 0;
    for (const [a, b] of marcas || []) {
      if (a < pos || b <= a || a >= texto.length) continue;
      if (a > pos) fr.appendChild(document.createTextNode(texto.slice(pos, a)));
      fr.appendChild(el('mark', null, texto.slice(a, Math.min(b, texto.length))));
      pos = Math.min(b, texto.length);
    }
    if (pos < texto.length) fr.appendChild(document.createTextNode(texto.slice(pos)));
    return fr;
  };

  B.fecha = (t) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  B.logros = K.debounce(() => { try { if (K.game && K.game.load) K.game.load(); } catch { /* los logros no son críticos */ } }, 1200);

  B.busca = (q, m) => K.get('/api/busqueda?' + K.qs({ q, m: m || '', n: 60 }));
  B.cargaConfig = async () => { B.S.config = await K.get('/api/ia/config'); return B.S.config; };
  // ¿Hay un proveedor listo para usar?
  B.nombreProv = (id) => { const p = B.S.config && B.S.config.proveedores.find(x => x.id === id); return p ? p.nombre : id; };
  B.iaLista = () => { const c = B.S.config; if (!c) return null; const p = c.proveedores.find(x => x.id === c.activo); return p && p.listo ? p : null; };
})();
