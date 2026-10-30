'use strict';
/* ---------------------------------------------------------------
   Notas: imágenes (subir o elegir de tu nube), backlinks, exportación a Markdown y PDF,
   y plantillas de nota (de serie y propias). Usa el editor de notes.js a través de NB.int.
--------------------------------------------------------------- */
(function () {
  const INT = () => NB.int;
  const DIR_ADJUNTOS = 'Adjuntos de notas';
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif)$/i;

  /* ============ Imágenes ============ */
  // Inserta bloques de imagen; si el bloque actual es un párrafo vacío, lo sustituye
  function insertaImagenes(rutas, w) {
    const I = INT();
    let ref = w || I.host().lastElementChild;
    rutas.forEach((ruta, k) => {
      const b = I.makeBlock({ t: 'image', src: 'kcc:file/' + I.refArchivo(ruta), text: '' });
      const vacio = k === 0 && ref && ref.dataset.t === 'p' && !I.contentOf(ref).textContent.trim();
      if (vacio) { ref.replaceWith(b); } else if (ref) { ref.after(b); } else { I.host().appendChild(b); }
      ref = b;
    });
    if (!ref.nextElementSibling) I.insertAfter(ref, { t: 'p', text: '' });
    I.change(true);
  }

  async function sube(files) {
    const rutas = [];
    for (const f of files) {
      if (f.size > 30 * 1024 * 1024) { K.toast(`“${f.name}” es demasiado grande para una nota (máx. 30 MB)`); continue; }
      const fd = new FormData(); fd.append('files', f, f.name || 'imagen.png');
      const res = await api(BASE + '/api/upload?path=' + encodeURIComponent(DIR_ADJUNTOS), { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No se pudo subir la imagen');
      rutas.push(DIR_ADJUNTOS + '/' + j.uploaded[0]);
    }
    if (rutas.length) K.bus.emit('files');
    return rutas;
  }

  NB.subeImagenes = async function (files, w) {
    try {
      K.toast(`Subiendo ${files.length} imagen${files.length === 1 ? '' : 'es'}…`);
      const rutas = await sube(files);
      if (rutas.length) { insertaImagenes(rutas, w); K.toast('Imagen añadida'); }
    } catch (e) { K.fail(e); }
  };

  NB.elegirImagen = function (w) {
    const root = el('div');
    const up = el('label', 'btn'); up.style.cssText = 'display:flex;width:100%;justify-content:center;margin-bottom:14px;cursor:pointer';
    up.append(icon('i-upload'), document.createTextNode(' Subir desde este dispositivo'));
    const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.hidden = true; up.appendChild(fi);
    root.appendChild(up);
    const busca = el('input'); busca.placeholder = 'O busca una imagen de tus archivos…'; root.appendChild(busca);
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:9px;margin-top:12px;max-height:46vh;overflow:auto';
    root.appendChild(grid);
    const m = K.modal({ title: 'Insertar imagen', content: root, cls: 'wide', actions: [{ label: 'Cancelar' }] });

    const pinta = (items, vacio) => {
      grid.textContent = '';
      if (!items.length) { const p = el('p', 'k-faint', vacio); p.style.gridColumn = '1/-1'; grid.appendChild(p); return; }
      items.forEach(it => {
        const b = el('button'); b.type = 'button'; b.title = it.rel;
        b.style.cssText = 'aspect-ratio:1;border:1px solid var(--line);border-radius:12px;overflow:hidden;padding:0;background:#000;cursor:pointer';
        const im = el('img'); im.loading = 'lazy'; im.alt = it.name; im.src = BASE + '/api/thumb?path=' + encodeURIComponent(it.rel); im.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        b.appendChild(im);
        b.addEventListener('click', () => { m.close(); insertaImagenes([it.rel], w); });
        grid.appendChild(b);
      });
    };
    // Por defecto, las últimas imágenes de la carpeta de adjuntos de las notas
    K.get('/api/files?' + K.qs({ path: DIR_ADJUNTOS })).then(r => {
      pinta(r.items.filter(i => !i.isDir && IMG_EXT.test(i.name)).slice(0, 60).map(i => ({ name: i.name, rel: DIR_ADJUNTOS + '/' + i.name })), 'Aún no has subido imágenes a tus notas. Busca una en tus archivos o súbela.');
    }).catch(() => pinta([], 'Busca una imagen por su nombre.'));
    busca.addEventListener('input', K.debounce(async () => {
      const q = busca.value.trim();
      if (q.length < 2) return;
      try { const r = await K.get('/api/search?' + K.qs({ q })); pinta(r.items.filter(i => !i.isDir && IMG_EXT.test(i.name)).slice(0, 60).map(i => ({ name: i.name, rel: (i.dir ? i.dir + '/' : '') + i.name })), 'No hay imágenes con ese nombre.'); }
      catch (e) { K.fail(e); }
    }, 250));
    fi.addEventListener('change', async () => {
      if (!fi.files.length) return;
      m.close();
      NB.subeImagenes([...fi.files], w);
    });
  };

  /* ============ Backlinks ============ */
  let panel = null;
  function montaPanel() {
    if (panel || !$('editor-cuerpo')) return;
    panel = el('div', 'nb-backlinks'); panel.hidden = true;
    const pie = $('editor-cuerpo').querySelector('.editor-pie');
    $('editor-cuerpo').insertBefore(panel, pie);
  }
  async function pintaBacklinks(id) {
    montaPanel();
    panel.hidden = true; panel.textContent = '';
    if (!id) return;
    try {
      const r = await K.get('/api/backlinks?' + K.qs({ type: 'note', ref: id }));
      if (NT.abierta !== id || !r.items.length) return;
      panel.appendChild(el('span', 'k-faint', 'Enlazada desde'));
      r.items.forEach(n => {
        const b = el('button', 'btn tiny'); b.type = 'button'; b.append(icon('i-note'), document.createTextNode(((n.icon ? n.icon + ' ' : '') + n.title)));
        b.addEventListener('click', () => K.open('note', n.id));
        panel.appendChild(b);
      });
      panel.hidden = false;
    } catch { /* sin backlinks */ }
  }
  const abrir0 = window.abrirNota;
  window.abrirNota = async function (id) { await abrir0(id); pintaBacklinks(NT.abierta === id ? id : null); };
  const cerrar0 = window.cerrarNota;
  window.cerrarNota = function () { cerrar0(); if (panel) panel.hidden = true; };
  K.bus.on('notes', () => { if (NT.abierta) pintaBacklinks(NT.abierta); });

  /* ============ Exportar ============ */
  const fechaLarga = () => new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function exportMd(item) {
    if (NB.flush) NB.flush();
    try { await guardarAhora(); } catch {}
    const a = document.createElement('a'); a.href = BASE + '/api/notes/' + encodeURIComponent(item.id) + '/export'; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Texto plano: título y cuerpo de cada nota (si es carpeta, todas las de dentro) sin marcas de Markdown
  async function exportTxt(item) {
    if (NB.flush) NB.flush();
    try { await guardarAhora(); } catch {}
    const notas = notasDe(item);
    if (!notas.length) { K.toast('No hay notas que exportar'); return; }
    const partes = [];
    try {
      for (const n of notas) { const r = await K.get('/api/notes/' + encodeURIComponent(n.id)); partes.push(`# ${r.title || 'Sin título'}\n\n${r.body || ''}`); }
    } catch (e) { K.fail(e); return; }
    K.doc.exporta('txt', { titulo: item.title, nombre: item.title || 'nota', md: partes.join('\n\n---\n\n') });
  }

  // Los bloques a HTML estático para imprimir
  function bloquesAHtml(blocks) {
    const I = INT();
    let out = '', ol = [0, 0, 0, 0], prev = null;
    const listaT = (t) => t === 'ul' || t === 'ol' || t === 'todo';
    for (const b of blocks) {
      const tx = I.inlineHtml(b.text || '');
      if (b.t === 'ol') { for (let j = b.i + 1; j < 4; j++) ol[j] = 0; ol[b.i]++; } else if (!listaT(b.t)) ol = [0, 0, 0, 0];
      if (b.t === 'p') out += `<p>${tx || '&nbsp;'}</p>`;
      else if (/^h[1-3]$/.test(b.t)) out += `<${b.t}>${tx}</${b.t}>`;
      else if (b.t === 'ul') out += `<div class="li" style="margin-left:${b.i * 1.4}em"><span class="mk">${['•', '◦', '▪', '·'][b.i % 4]}</span><span>${tx}</span></div>`;
      else if (b.t === 'ol') out += `<div class="li" style="margin-left:${b.i * 1.4}em"><span class="mk">${ol[b.i]}.</span><span>${tx}</span></div>`;
      else if (b.t === 'todo') out += `<div class="li" style="margin-left:${b.i * 1.4}em"><span class="mk">${b.done ? '☑' : '☐'}</span><span${b.done ? ' class="hecho"' : ''}>${tx}</span></div>`;
      else if (b.t === 'quote') out += `<blockquote>${tx}</blockquote>`;
      else if (b.t === 'callout') { const k = I.CALLOUTS[b.kind || 'NOTE']; out += `<div class="callout" style="--c:${k[2]}"><span class="ic">${k[0]}</span><div>${tx}</div></div>`; }
      else if (b.t === 'code') out += `<pre>${I.esc(b.text || '')}</pre>`;
      else if (b.t === 'divider') out += '<hr>';
      else if (b.t === 'table') {
        out += '<table>' + b.rows.map((r, ri) => '<tr>' + r.map(c => `<${ri ? 'td' : 'th'}>${I.inlineHtml(c)}</${ri ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
      } else if (b.t === 'image') {
        const ruta = I.rutaDeSrc(b.src);
        out += `<figure><img src="${BASE}/api/preview?path=${encodeURIComponent(ruta)}" alt="">${tx ? `<figcaption>${tx}</figcaption>` : ''}</figure>`;
      }
      prev = b.t;
    }
    return out;
  }

  const CSS_PDF = `
    @page{margin:18mm 16mm}
    *{box-sizing:border-box}
    body{font:11pt/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0}
    .nota{page-break-after:always} .nota:last-child{page-break-after:auto}
    .nota-titulo{font-size:22pt;margin:0 0 2pt;letter-spacing:-.02em} .nota-meta{color:#666;font-size:9pt;margin:0 0 14pt}
    h1{font-size:18pt;margin:14pt 0 4pt} h2{font-size:14.5pt;margin:12pt 0 4pt} h3{font-size:12pt;margin:10pt 0 3pt}
    p{margin:0 0 6pt} blockquote{margin:6pt 0;padding:2pt 10pt;border-left:3pt solid #6366f1;color:#444;font-style:italic}
    pre{background:#f4f4f6;border:1px solid #ddd;border-radius:6pt;padding:8pt 10pt;white-space:pre-wrap;font:9.5pt/1.5 Consolas,Menlo,monospace;page-break-inside:avoid}
    code{font:.9em Consolas,Menlo,monospace;background:#f0f0f4;padding:0 3pt;border-radius:3pt} mark{background:#fde68a}
    .li{display:flex;gap:6pt;margin:1pt 0} .li .mk{min-width:1.4em;text-align:right} .li .hecho{text-decoration:line-through;color:#777}
    .callout{display:flex;gap:8pt;margin:8pt 0;padding:8pt 10pt;border:1px solid var(--c);border-radius:8pt;background:#fafafa;page-break-inside:avoid}
    table{border-collapse:collapse;width:100%;margin:8pt 0;page-break-inside:avoid} th,td{border:1px solid #bbb;padding:4pt 7pt;text-align:left;vertical-align:top} th{background:#f0f0f4}
    figure{margin:8pt 0;text-align:center;page-break-inside:avoid} img{max-width:100%;max-height:230mm} figcaption{font-size:9pt;color:#666;margin-top:3pt}
    hr{border:0;border-top:1px solid #ccc;margin:10pt 0} a{color:#4338ca}`;

  // Notas incluidas al exportar algo: la propia nota o, si es carpeta, todas las de dentro en orden
  function notasDe(item) {
    if (item.type !== 'folder') return [item];
    const salida = [];
    const rec = (id) => hijosDe(id).forEach(h => { if (h.type === 'note') salida.push(h); else rec(h.id); });
    rec(item.id);
    return salida;
  }

  async function exportPdf(item) {
    const I = INT();
    if (NB.flush) NB.flush();
    try { await guardarAhora(); } catch {}
    const notas = notasDe(item);
    if (!notas.length) { K.toast('No hay notas que exportar'); return; }
    K.toast('Preparando el PDF…');
    let cuerpo = '';
    try {
      for (const n of notas) {
        const r = await K.get('/api/notes/' + encodeURIComponent(n.id));
        const fecha = new Date(r.updatedAt || Date.now()).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        cuerpo += `<section class="nota"><h1 class="nota-titulo">${I.esc(((n.icon ? n.icon + ' ' : '') + r.title))}</h1><p class="nota-meta">Editada el ${fecha}</p>${bloquesAHtml(I.parseMd(r.body || ''))}</section>`;
      }
    } catch (e) { K.fail(e); return; }
    imprimeHtml(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${I.esc(item.title)}</title><style>${CSS_PDF}</style></head><body>${cuerpo}</body></html>`);
  }

  // Se imprime desde un iframe oculto: el navegador ofrece "Guardar como PDF"
  function imprimeHtml(html) {
    window.__ultimoHtmlImpresion = html;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    f.srcdoc = html;
    f.addEventListener('load', () => {
      const d = f.contentDocument, w = f.contentWindow;
      const listo = () => [...d.images].every(i => i.complete);
      let n = 0;
      const espera = setInterval(() => {
        if (listo() || ++n > 40) { clearInterval(espera); try { w.focus(); w.print(); } catch { K.toast('No se pudo abrir la impresión'); } setTimeout(() => f.remove(), 60000); }
      }, 150);
    });
    document.body.appendChild(f);
  }

  /* ============ Plantillas ============ */
  const BASICAS = [
    { id: 'reunion', icon: '📋', name: 'Reunión', desc: 'Orden del día, notas, acuerdos y próximos pasos', titulo: 'Reunión · {{fecha_corta}}',
      body: '> [!NOTE] **Fecha:** {{fecha}} · **Asistentes:** \n\n## Orden del día\n\n- [ ] \n- [ ] \n\n## Notas\n\n&nbsp;\n\n## Acuerdos\n\n- \n\n## Próximos pasos\n\n- [ ] Responsable · fecha límite' },
    { id: 'diario', icon: '📔', name: 'Diario', desc: 'Un registro diario con ánimo, prioridades y gratitud', titulo: 'Diario · {{fecha_corta}}',
      body: '> [!TIP] {{fecha}}\n\n## ¿Cómo me siento?\n\n&nbsp;\n\n## Prioridades de hoy\n\n- [ ] \n- [ ] \n- [ ] \n\n## Lo que ha pasado\n\n&nbsp;\n\n## Agradezco\n\n1. \n2. \n3. ' },
    { id: 'proyecto', icon: '🚀', name: 'Proyecto', desc: 'Objetivo, alcance, hitos, tareas y riesgos', titulo: 'Proyecto · ',
      body: '## Objetivo\n\n&nbsp;\n\n## Alcance\n\n- Incluye: \n- No incluye: \n\n## Hitos\n\n| Hito | Fecha | Estado |\n| --- | --- | --- |\n|   |   | Pendiente |\n|   |   | Pendiente |\n\n## Tareas\n\n- [ ] \n- [ ] \n\n## Riesgos\n\n> [!WARNING] \n\n## Enlaces y recursos\n\n- ' },
    { id: 'semana', icon: '🗓️', name: 'Planificación semanal', desc: 'Una tabla de lunes a domingo y objetivos de la semana', titulo: 'Semana del {{semana}}',
      body: '## Objetivos de la semana\n\n- [ ] \n- [ ] \n- [ ] \n\n## Plan\n\n| Día | Prioridad | Notas |\n| --- | --- | --- |\n| Lunes |   |   |\n| Martes |   |   |\n| Miércoles |   |   |\n| Jueves |   |   |\n| Viernes |   |   |\n| Fin de semana |   |   |\n\n## Balance\n\n&nbsp;' },
    { id: 'estudio', icon: '📚', name: 'Apuntes de lectura', desc: 'Resumen, ideas clave, citas y preguntas', titulo: 'Apuntes · ',
      body: '> [!NOTE] **Fuente:** \n\n## Resumen\n\n&nbsp;\n\n## Ideas clave\n\n1. \n2. \n3. \n\n## Citas\n\n> \n\n## Preguntas y dudas\n\n- [ ] ' },
  ];

  const lunes = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  function rellenaPlantilla(txt) {
    const hoy = new Date();
    const corta = hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const l = lunes(), d = new Date(l); d.setDate(d.getDate() + 6);
    return String(txt).replace(/\{\{fecha_corta\}\}/g, corta).replace(/\{\{fecha\}\}/g, fechaLarga())
      .replace(/\{\{hora\}\}/g, hoy.toTimeString().slice(0, 5))
      .replace(/\{\{semana\}\}/g, `${l.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`);
  }

  async function creaDesde(t) {
    try {
      const titulo = rellenaPlantilla(t.titulo || t.name).slice(0, 120);
      const r = await K.post('/api/notes', { type: 'note', title: titulo, body: rellenaPlantilla(t.body || ''), icon: t.icon || '' });
      await loadNotes(true);
      abrirNota(r.item.id);
    } catch (e) { K.fail(e); }
  }

  async function plantillas() {
    let propias = [];
    try { propias = (await K.get('/api/note-templates')).templates; } catch {}
    const root = el('div');
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px';
    let m;
    const tarjeta = (t, borrar) => {
      const c = el('button', 'tpl-card'); c.type = 'button';
      c.append(el('span', 'ic', t.icon || '📝'), el('b', null, t.name), el('small', null, t.desc || 'Plantilla propia'));
      c.addEventListener('click', (e) => { if (e.target.closest('.del')) return; m.close(); creaDesde(t); });
      if (borrar) {
        const x = el('span', 'del', '×'); x.title = 'Borrar plantilla';
        x.addEventListener('click', async (e) => { e.stopPropagation(); if (!await K.confirm(`Se borrará la plantilla “${t.name}”.`, { ok: 'Borrar', danger: true })) return; try { await K.del('/api/note-templates/' + t.id); c.remove(); } catch (er) { K.fail(er); } });
        c.appendChild(x);
      }
      return c;
    };
    const vacia = { name: 'Nota en blanco', icon: '📄', desc: 'Empezar desde cero', titulo: 'Nota sin título', body: '' };
    grid.appendChild(tarjeta(vacia));
    BASICAS.forEach(t => grid.appendChild(tarjeta(t)));
    root.appendChild(grid);
    if (propias.length) {
      const h = el('div', 'k-faint', 'Tus plantillas'); h.style.cssText = 'margin:18px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.1em';
      const g2 = el('div'); g2.style.cssText = grid.style.cssText; propias.forEach(t => g2.appendChild(tarjeta(t, true)));
      root.append(h, g2);
    }
    const nota = el('p', 'k-faint', 'Puedes guardar cualquier nota como plantilla desde su menú ⋯. Se rellenan {{fecha}}, {{hora}} y {{semana}}.'); nota.style.cssText = 'font-size:12px;margin-top:16px';
    root.appendChild(nota);
    m = K.modal({ title: 'Nueva nota desde plantilla', content: root, cls: 'wide', actions: [{ label: 'Cerrar' }] });
  }

  async function guardaPlantilla(item) {
    if (NB.flush) NB.flush();
    try { await guardarAhora(); } catch {}
    const nombre = await K.ask('Guardar como plantilla', { value: item.title, ok: 'Guardar', sub: 'Podrás crear notas nuevas a partir de esta.' });
    if (!nombre) return;
    try {
      const r = await K.get('/api/notes/' + encodeURIComponent(item.id));
      await K.post('/api/note-templates', { name: nombre, icon: item.icon || '', body: r.body || '' });
      K.toast('Plantilla guardada');
    } catch (e) { K.fail(e); }
  }

  /* ============ Menús y botones ============ */
  // Enviar una nota (o una carpeta con su contenido) a Archivos o Código
  function enviaNota(it) {
    K.transferir.abre({ tipo: 'notas', ids: [it.id], titulo: it.title || 'Nota' }, { alTerminar: () => loadNotes(true) });
  }
  // Menú contextual del árbol de notas (app.js llama a este gancho)
  window.KCC.noteMenu = (menu, item) => {
    opcionCtx(menu, 'i-download', item.type === 'folder' ? 'Exportar carpeta (.zip de Markdown)' : 'Exportar a Markdown', () => exportMd(item));
    opcionCtx(menu, 'i-download', 'Exportar como texto (.txt)', () => exportTxt(item));
    opcionCtx(menu, 'i-doc', 'Exportar a PDF…', () => exportPdf(item));
    opcionCtx(menu, 'i-move', 'Copiar o mover a…', () => enviaNota(item));
    if (item.type === 'note') opcionCtx(menu, 'i-stack', 'Guardar como plantilla…', () => guardaPlantilla(item));
  };

  function botones() {
    const nuevo = $('btn-new-note');
    if (nuevo && !$('btn-note-templates')) {
      const b = el('button', 'icon-btn'); b.id = 'btn-note-templates'; b.type = 'button'; b.title = 'Nueva nota desde plantilla'; b.setAttribute('aria-label', 'Nueva nota desde plantilla');
      b.appendChild(icon('i-stack')); b.addEventListener('click', plantillas);
      nuevo.after(b);
    }
    const del = $('btn-note-delete');
    if (del && !$('btn-note-more')) {
      const b = el('button', 'icon-btn'); b.id = 'btn-note-more'; b.type = 'button'; b.title = 'Exportar y más'; b.setAttribute('aria-label', 'Más opciones');
      b.appendChild(icon('i-dots'));
      b.addEventListener('click', () => {
        const it = NT.items.find(i => i.id === NT.abierta); if (!it) return;
        K.menu(b, [
          { label: 'Exportar a Markdown', icon: 'i-download', onClick: () => exportMd(it) },
          { label: 'Exportar como texto (.txt)', icon: 'i-download', onClick: () => exportTxt(it) },
          { label: 'Exportar a PDF…', icon: 'i-doc', onClick: () => exportPdf(it) },
          { label: 'Copiar o mover a…', icon: 'i-move', onClick: () => enviaNota(it) },
          '-', { label: 'Guardar como plantilla…', icon: 'i-stack', onClick: () => guardaPlantilla(it) },
        ], { align: 'end' });
      });
      del.before(b);
    }
  }
  botones();
  montaPanel();

  K.notes = { plantillas, exportPdf, exportMd, exportTxt, bloquesAHtml };
})();
