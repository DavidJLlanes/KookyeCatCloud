'use strict';
/* ---------------------------------------------------------------
   Buscador global (Ctrl+K): archivos, notas, prompts y eventos desde un solo sitio,
   más accesos rápidos para crear cosas y moverse entre secciones.
--------------------------------------------------------------- */
(function () {
  let abierto = null;

  // Cómo se abre cada tipo de resultado, esté donde esté
  K.openers.file = (ref, extra) => {
    switchTab('files');
    const dir = extra && extra.isDir ? ref : parentOf(ref === '/' ? '' : ref);
    goTo(ref === '/' ? '' : dir);
  };

  const ACCIONES = [
    { t: 'Nuevo prompt', s: 'Guardar un prompt con imágenes y etiquetas', i: 'i-sparkle', f: () => K.prompts.newPrompt() },
    { t: 'Nuevo evento', s: 'Añadir al calendario', i: 'i-calendar', f: () => K.calendar.newEvent() },
    { t: 'Nueva tarea', s: 'Añadir una tarea al calendario', i: 'i-list-check', f: () => K.calendar.newEvent({ kind: 'task' }) },
    { t: 'Ir a Archivos', i: 'i-folder', f: () => switchTab('files') },
    { t: 'Ir a Notas', i: 'i-note', f: () => switchTab('notes') },
    { t: 'Ir a Calendario', i: 'i-calendar', f: () => switchTab('calendar') },
    { t: 'Ir a Prompts', i: 'i-sparkle', f: () => switchTab('prompts') },
    { t: 'Gestionar etiquetas', s: 'Renombrar, cambiar color o borrar', i: 'i-tag', f: () => K.manageLabels() },
  ];

  function abre() {
    if (abierto || $('app').hidden) return;
    const box = el('div', 'omni');
    const top = el('div', 'omni-top'); top.appendChild(icon('i-search'));
    const inp = el('input'); inp.placeholder = 'Busca en archivos, notas, prompts y calendario…'; inp.autocomplete = 'off'; inp.spellcheck = false;
    top.appendChild(inp);
    const res = el('div', 'omni-res');
    box.append(top, res);
    const h = K.modal({ content: box, bare: true, onClose: () => { abierto = null; } });
    h.el.style.cssText = 'background:none;border:none;box-shadow:none;padding:0;max-width:640px;width:100%;align-self:flex-start';
    abierto = h;
    let filas = [], hot = 0, tok = 0;

    const fila = (ic, titulo, sub, fn) => {
      const b = el('button', 'row'); b.type = 'button'; b.appendChild(icon(ic));
      const d = el('div'); d.style.minWidth = 0; d.appendChild(el('b', null, titulo)); if (sub) d.appendChild(el('small', null, sub)); b.appendChild(d);
      b.addEventListener('click', () => { h.close(); fn(); });
      filas.push(b); return b;
    };
    const grupo = (txt) => el('div', 'grp', txt);
    const resalta = () => filas.forEach((f, i) => { f.classList.toggle('is-hot', i === hot); if (i === hot) f.scrollIntoView({ block: 'nearest' }); });

    function pintaInicio() {
      res.textContent = ''; filas = []; hot = 0;
      res.appendChild(grupo('Acciones'));
      ACCIONES.forEach(a => res.appendChild(fila(a.i, a.t, a.s, a.f)));
      resalta();
    }

    async function busca(q) {
      const n = ++tok;
      let archivos = { items: [] }, omni = { notes: [], prompts: [], events: [] };
      try {
        [archivos, omni] = await Promise.all([
          K.get('/api/search?' + K.qs({ q })).catch(() => ({ items: [] })),
          K.get('/api/omni?' + K.qs({ q })).catch(() => ({ notes: [], prompts: [], events: [] })),
        ]);
      } catch { /* sin red */ }
      if (n !== tok) return;
      res.textContent = ''; filas = []; hot = 0;
      let hay = false;
      const seccion = (titulo, items, mk) => { if (!items.length) return; hay = true; res.appendChild(grupo(titulo)); items.forEach(i => res.appendChild(mk(i))); };
      seccion('Prompts', omni.prompts.slice(0, 6), p => fila('i-sparkle', p.title, [(S_KIND[p.kind] || ''), p.model].filter(Boolean).join(' · ') || p.snippet.slice(0, 60), () => K.open('prompt', p.id)));
      seccion('Notas', omni.notes.slice(0, 6), nt => fila(nt.type === 'folder' ? 'i-folder' : 'i-note', nt.title, nt.type === 'folder' ? 'Carpeta de notas' : 'Nota', () => K.open('note', nt.id)));
      seccion('Calendario', omni.events.slice(0, 6), e => fila('i-calendar', e.title, (e.start ? `${K.d.short(K.d.parse(e.start))}${e.allDay ? '' : ' · ' + e.start.slice(11, 16)}` : 'Tarea sin fecha'), () => K.open('event', e.id)));
      seccion('Archivos', archivos.items.slice(0, 8), f => fila(f.isDir ? 'i-folder' : 'i-doc', f.name, f.dir || 'Inicio', () => K.open('file', (f.dir ? f.dir + '/' : '') + f.name, { isDir: f.isDir })));
      const acc = ACCIONES.filter(a => a.t.toLowerCase().includes(q.toLowerCase()));
      seccion('Acciones', acc, a => fila(a.i, a.t, a.s, a.f));
      if (!hay) res.appendChild(el('div', 'vacio', `Nada encontrado para “${q}”`));
      resalta();
    }
    const S_KIND = { imagen: 'Imagen', texto: 'Texto', codigo: 'Código', video: 'Vídeo', audio: 'Audio', agente: 'Agente', otro: 'Otro' };

    const buscaD = K.debounce((q) => { if (q.length < 2) { tok++; pintaInicio(); } else busca(q); }, 180);
    inp.addEventListener('input', () => buscaD(inp.value.trim()));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); hot = Math.min(filas.length - 1, hot + 1); resalta(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hot = Math.max(0, hot - 1); resalta(); }
      else if (e.key === 'Enter' && filas[hot]) { e.preventDefault(); filas[hot].click(); }
    });
    pintaInicio();
    setTimeout(() => inp.focus(), 20);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (abierto) abierto.close(); else abre(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('#btn-omni')) abre(); });
  K.omni = { open: abre };
})();
