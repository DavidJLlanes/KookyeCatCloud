'use strict';
/* Bases · estado compartido y utilidades (todo cuelga de K.bases; cada archivo añade sus funciones). */
(function () {
  if (!window.K || !document.getElementById('view-bases')) return;
  const B = K.bases = { root: document.getElementById('view-bases') };

  B.TIPOS = [['text', 'Texto'], ['number', 'Número'], ['date', 'Fecha'], ['checkbox', 'Casilla'], ['select', 'Selección'], ['multiselect', 'Etiquetas'], ['url', 'Enlace'], ['email', 'Correo'], ['phone', 'Teléfono'], ['file', 'Archivo'], ['formula', 'Fórmula'], ['relation', 'Relación'], ['rollup', 'Resumen']];
  B.TIPO_NOMBRE = Object.fromEntries(B.TIPOS);
  B.TIPOS_DATO = B.TIPOS.slice(0, 10).map(t => t[0]);
  B.VISTAS = [['table', 'Tabla', '☰'], ['kanban', 'Tablero (Kanban)', '▦'], ['calendar', 'Calendario', '📅'], ['gallery', 'Galería', '▣'], ['timeline', 'Línea de tiempo', '▭']];
  B.OPS = { contains: 'contiene', equals: 'es igual a', not: 'no es', checked: 'marcada', unchecked: 'sin marcar', empty: 'está vacío', filled: 'tiene valor', gt: 'mayor que', lt: 'menor que', gte: 'mayor o igual que', lte: 'menor o igual que', before: 'antes de', after: 'después de' };
  B.SIN_VALOR = ['checked', 'unchecked', 'empty', 'filled'];
  B.RESUMEN = { cuenta: 'Contar filas', rellenas: 'Contar las que tienen valor', suma: 'Suma', media: 'Media', min: 'Mínimo', max: 'Máximo', unicos: 'Valores distintos', marcadas: '% de casillas marcadas' };
  B.S = { lista: [], plantillas: [], base: null, vista: '', q: '', built: false, ordenLocal: null, destinos: new Map(), mes: null, dia: '' };

  B.btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (label) b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };
  B.campo = (etiqueta, control, cls = 'bs-field') => { const l = el('label', cls); l.append(el('span', null, etiqueta), control); return l; };
  B.select = (pares, valor) => { const s = el('select'); pares.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; s.appendChild(o); }); if (valor !== undefined) s.value = valor; return s; };
  B.col = (id) => B.S.base.columns.find(c => c.id === id);
  B.opcion = (c, id) => (c.opciones || []).find(o => o.id === id);
  B.esCalc = (c) => c.tipo === 'formula' || c.tipo === 'rollup';
  B.nf = (n) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 1000) / 1000).replace('.', ','));
  B.fechaTxt = (d) => { if (!d) return ''; const [y, m, dd] = String(d).split('-'); return `${dd}/${m}/${y}`; };
  B.vistaActual = () => B.S.base.views.find(x => x.id === B.S.vista) || B.S.base.views[0];
  // Los logros se recalculan en el servidor al cambiar la base; aquí solo se pide el estado para mostrar los avisos
  B.logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);

  // Valor de la celda tal como se compara y se ordena (las columnas calculadas vienen del servidor en fila.f)
  B.crudo = (r, c) => {
    if (c.tipo === 'relation') return ((r.f || {})[c.id] || []).map(x => x.t);
    if (B.esCalc(c)) { const v = (r.f || {})[c.id]; return v && typeof v === 'object' && v.e ? '' : (v === null || v === undefined ? '' : v); }
    return r.c[c.id];
  };
  B.error = (r, c) => { const v = (r.f || {})[c.id]; return v && typeof v === 'object' && !Array.isArray(v) && v.e ? v : null; };
  // Valor como texto para mostrar o buscar
  B.texto = (r, c) => {
    const v = B.crudo(r, c);
    if (c.tipo === 'select') return (B.opcion(c, v) || {}).nombre || '';
    if (c.tipo === 'multiselect') return (v || []).map(i => (B.opcion(c, i) || {}).nombre).filter(Boolean).join(', ');
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (typeof v === 'number') return B.nf(v);
    if (c.tipo === 'date' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) return B.fechaTxt(v);
    return String(v ?? '');
  };
  B.titulo = (r) => { const c = B.S.base.columns.find(x => x.tipo === 'text'); return (c && r.c[c.id]) || 'Sin título'; };
  B.columnasVisibles = (v) => B.S.base.columns.filter(c => !(v.ocultas || []).includes(c.id));
  // Chip de color de una opción (selección y etiquetas) o neutro (texto de una relación)
  B.chip = (c, id) => { const o = B.opcion(c, id); if (!o) return null; const s = el('span', 'bs-opt', o.nombre); s.style.setProperty('--o', o.color); return s; };
  B.chipTexto = (t) => el('span', 'bs-opt bs-opt-rel', t);
  B.iconoVista = (tipo) => (B.VISTAS.find(x => x[0] === tipo) || ['', '', '☰'])[2];
})();
