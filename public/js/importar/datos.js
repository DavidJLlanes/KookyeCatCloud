'use strict';
/* Importar · estado y utilidades de la vista «Importar» (Notion, Evernote, Google Docs, Apple Notes y CSV). Todo cuelga de K.importar. */
(function () {
  if (!window.K) return;
  const I = K.importar = { S: { paso: 'elegir', fuente: '', analisis: null, ocupado: false, error: '', resultado: null, carpetas: [], destino: '', notas: true, ajustes: [] } };
  // Orígenes: cómo se exporta en cada app y qué archivo hay que subir
  I.FUENTES = [
    { id: 'notion', nombre: 'Notion', icono: 'i-note', acepta: '.zip', pasos: 'En Notion: ••• → Exportar → «Markdown y CSV» (con subpáginas). Sube el .zip.' },
    { id: 'evernote', nombre: 'Evernote', icono: 'i-note', acepta: '.enex,.zip', pasos: 'En Evernote: elige las notas o la libreta → Exportar → formato .enex. Sube el .enex.' },
    { id: 'docs', nombre: 'Google Docs', icono: 'i-doc', acepta: '.docx,.zip,.html,.htm,.md', pasos: 'En Google Docs: Archivo → Descargar → Microsoft Word (.docx), o «Página web (.html, comprimido)».' },
    { id: 'apple', nombre: 'Apple Notes', icono: 'i-note', acepta: '.zip,.md,.txt,.html,.htm', pasos: 'Apple Notes no exporta en bloque: usa una app de exportación (Exporter, Obsidian Importer…) a Markdown o HTML y sube la carpeta comprimida en .zip, o un .txt con el texto.' },
    { id: 'csv', nombre: 'CSV', icono: 'i-table', acepta: '.csv,.tsv', pasos: 'Cualquier hoja de cálculo o contactos exportados en .csv. Elegirás qué columna es cada cosa.' },
  ];
  I.TIPOS = [['text', 'Texto'], ['number', 'Número'], ['date', 'Fecha'], ['checkbox', 'Casilla'], ['select', 'Selección'], ['multiselect', 'Selección múltiple'], ['url', 'Enlace'], ['email', 'Correo'], ['phone', 'Teléfono']];
  I.nombreTipo = (t) => (I.TIPOS.find(x => x[0] === t) || [0, t])[1];
  I.peso = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB');

  I.reset = () => { Object.assign(I.S, { paso: 'elegir', fuente: '', analisis: null, ocupado: false, error: '', resultado: null, destino: '', notas: true, ajustes: [] }); };

  // Sube el archivo y recibe el análisis (no se escribe nada todavía)
  I.analiza = async (file, fuente) => {
    const fd = new FormData(); fd.append('fuente', fuente || ''); fd.append('archivo', file, file.name);
    const res = await api(BASE + '/api/importar/analizar', { method: 'POST', body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'No se pudo leer el archivo');
    return j;
  };
  I.ejecuta = async () => {
    const S = I.S, a = S.analisis;
    const tablas = S.ajustes.filter(x => x && x.activa).map(x => ({ tabla: x.tabla, destino: x.destino, nombre: x.nombre, baseId: x.baseId, columnas: x.columnas, destinoCols: x.destinoCols, campos: x.campos }));
    return K.post('/api/importar/ejecutar', { token: a.token, destino: S.destino, notas: S.notas && a.notas > 0, tablas });
  };

  // Carpetas de notas, con sangría, para elegir dónde cae la importación
  I.cargaCarpetas = async () => {
    const d = await K.get('/api/notes'); const items = d.items || [];
    const hijos = (p) => items.filter(i => i.type === 'folder' && (i.parent || '') === p).sort((x, y) => x.title.localeCompare(y.title, 'es'));
    const out = []; const rec = (p, n) => { for (const f of hijos(p)) { out.push({ id: f.id, nombre: '  '.repeat(n) + f.title }); if (n < 6) rec(f.id, n + 1); } };
    rec('', 0); I.S.carpetas = out;
  };
  I.logros = K.debounce(() => { try { if (K.game && K.game.load) K.game.load(); } catch { /* sin avisos */ } }, 600);
})();
