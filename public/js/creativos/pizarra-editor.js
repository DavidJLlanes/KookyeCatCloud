'use strict';
/* Editor de post-it aislado de la vista de cuadrícula: accesible en iOS, con selección persistente. */
(function () {
  const COLORS = [
    ['crema', 'Crema'], ['amarillo', 'Amarillo'], ['rosa', 'Rosa'],
    ['menta', 'Menta'], ['azul', 'Azul'], ['lavanda', 'Lavanda']
  ];
  const TAGS = new Set(['DIV', 'P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN']);
  function clean(html) {
    const doc = new DOMParser().parseFromString('<section>' + String(html || '') + '</section>', 'text/html');
    const area = doc.body.firstElementChild;
    function walk(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType === 8) { child.remove(); continue; }
        if (child.nodeType !== 1) continue;
        if (!TAGS.has(child.tagName)) {
          child.replaceWith(doc.createTextNode(child.textContent || ''));
          continue;
        }
        const align = child.style.textAlign;
        const weight = child.style.fontWeight;
        const italic = child.style.fontStyle === 'italic';
        const decoration = child.style.textDecorationLine || child.style.textDecoration;
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (['left', 'center', 'right', 'justify'].includes(align)) child.style.textAlign = align;
        walk(child);
        if (child.tagName === 'STRIKE' || child.tagName === 'DEL') {
          const strike = doc.createElement('s');
          strike.append(...child.childNodes);
          child.replaceWith(strike);
          continue;
        }
        let contents = [...child.childNodes];
        for (const [enabled, tag] of [[weight === 'bold' || Number(weight) >= 600, 'strong'], [italic, 'em'], [decoration.includes('underline'), 'u'], [decoration.includes('line-through'), 's']]) {
          if (!enabled || !contents.length) continue;
          const wrapper = doc.createElement(tag);
          wrapper.append(...contents);
          child.append(wrapper);
          contents = [wrapper];
        }
      }
    }
    walk(area);
    return area.innerHTML;
  }
  function make(tag, cls, label) {
    const elem = document.createElement(tag);
    if (cls) elem.className = cls;
    if (label !== undefined) elem.textContent = label;
    return elem;
  }
  function button(label, tooltip, fn) {
    const b = make('button', 'cr-e-button', label);
    b.type = 'button';
    b.title = tooltip;
    b.setAttribute('aria-label', tooltip);
    b.addEventListener('click', fn);
    return b;
  }
  function open(item, onSaved, onDeleted) {
    if (document.querySelector('.cr-e-overlay')) return;
    const overlay = make('div', 'cr-e-overlay');
    const dialog = make('section', 'cr-e-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Editar nota adhesiva');
    dialog.dataset.color = COLORS.some(c => c[0] === item.color) ? item.color : 'amarillo';
    const header = make('header', 'cr-e-header');
    const done = button('Hecho', 'Guardar y cerrar', () => finish());
    done.classList.add('cr-e-done');
    const status = make('span', 'cr-e-status', 'Guardado');
    header.append(make('span', 'cr-e-header-label', 'Editar nota'), status, done);
    const body = make('div', 'cr-e-body');
    const title = make('input', 'cr-e-title');
    title.type = 'text';
    title.maxLength = 120;
    title.placeholder = 'Título';
    title.setAttribute('aria-label', 'Título');
    title.value = item.titulo === 'Nueva nota' ? '' : item.titulo || '';
    const editor = make('div', 'cr-e-content');
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.lang = 'es';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Contenido de la nota');
    editor.dataset.placeholder = 'Escribe una nota…';
    editor.innerHTML = clean(item.contenido);
    const toolbar = make('div', 'cr-e-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Formato del texto');
    const palette = make('div', 'cr-e-palette');
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Color de la nota');
    const foot = make('footer', 'cr-e-footer');
    const remove = button(item.id ? 'Eliminar' : 'Descartar', 'Eliminar esta nota', async () => {
      if (!item.id) { cleanup(); return; }
      if (!window.confirm('¿Eliminar esta nota?')) return;
      try {
        await K.del('/api/creativos/pizarra/' + encodeURIComponent(item.id));
        cleanup();
        onDeleted(item);
      } catch (error) { K.fail(error); }
    });
    remove.classList.add('cr-e-remove');
    foot.append(remove);
    body.append(title, editor);
    dialog.append(header, toolbar, body, palette, foot);
    overlay.append(dialog);
    document.body.append(overlay);
    const oldFocus = document.activeElement;
    let savedRange = null;
    let timer = 0;
    let saving = false;
    let pending = false;
    let closed = false;
    let last = item.id ? JSON.stringify(values()) : null;
    const formatButtons = [];
    const escape = e => { if (e.key === 'Escape') { e.preventDefault(); finish(); } };
    document.addEventListener('keydown', escape);
    // The toolbar deliberately sits outside contenteditable: iOS blurs when toolbar controls are tapped.
    document.addEventListener('selectionchange', remember);
    function remember() {
      const selection = window.getSelection();
      if (selection && selection.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
        savedRange = selection.getRangeAt(0).cloneRange();
        updateToolbar();
      }
    }
    function restore() {
      const range = savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)
        ? savedRange.cloneRange() : null;
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (!selection) return;
      const target = range || document.createRange();
      if (!range) { target.selectNodeContents(editor); target.collapse(false); }
      selection.removeAllRanges();
      selection.addRange(target);
    }
    function format(command, value) {
      restore();
      // El editor de Documentos activa styleWithCSS globalmente. Aquí se guardan etiquetas semánticas.
      document.execCommand('styleWithCSS', false, false);
      const applied = document.execCommand(command, false, value);
      remember();
      if (applied) schedule();
      else status.textContent = 'No se pudo aplicar el formato';
    }
    function control(label, tooltip, command, value) {
      const b = button(label, tooltip, () => format(command, value));
      // On desktop maintain the selection; on touch we restore the range after the tap.
      b.addEventListener('mousedown', e => { remember(); e.preventDefault(); });
      b.addEventListener('touchstart', remember, { passive: true });
      b.addEventListener('pointerdown', remember);
      b.dataset.command = command;
      b.setAttribute('aria-pressed', 'false');
      formatButtons.push(b);
      toolbar.append(b);
    }
    const heading = make('select', 'cr-e-heading');
    heading.setAttribute('aria-label', 'Estilo de párrafo');
    for (const [value, label] of [['p','Párrafo'],['h1','H1'],['h2','H2'],['h3','H3']]) {
      const opt = make('option', '', label);
      opt.value = value;
      heading.append(opt);
    }
    heading.addEventListener('touchstart', remember, { passive: true });
    heading.addEventListener('mousedown', remember);
    heading.addEventListener('change', () => { format('formatBlock', heading.value); });
    toolbar.append(heading);
    control('B', 'Negrita', 'bold');
    control('I', 'Cursiva', 'italic');
    control('U', 'Subrayado', 'underline');
    control('S', 'Tachado', 'strikeThrough');
    control('•', 'Viñetas', 'insertUnorderedList');
    control('1.', 'Lista numerada', 'insertOrderedList');
    control('↤', 'Alinear izquierda', 'justifyLeft');
    control('↔', 'Centrar texto', 'justifyCenter');
    control('↦', 'Alinear derecha', 'justifyRight');
    control('☷', 'Justificar texto', 'justifyFull');
    function updateToolbar() {
      for (const b of formatButtons) {
        let pressed = false;
        try { pressed = document.queryCommandState(b.dataset.command); } catch { /* navegador sin estado */ }
        b.setAttribute('aria-pressed', String(pressed));
      }
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      const block = element?.closest('h1,h2,h3');
      heading.value = block && editor.contains(block) ? block.tagName.toLowerCase() : 'p';
    }
    const swatches = [];
    for (const [id, name] of COLORS) {
      const swatch = button('', 'Color ' + name, () => {
        dialog.dataset.color = id;
        paintSwatches();
        schedule();
      });
      swatch.classList.add('cr-e-swatch');
      swatch.dataset.color = id;
      swatch.setAttribute('aria-pressed', 'false');
      palette.append(swatch);
      swatches.push(swatch);
    }
    function paintSwatches() {
      for (const swatch of swatches) {
        const selected = swatch.dataset.color === dialog.dataset.color;
        swatch.classList.toggle('is-active', selected);
        swatch.setAttribute('aria-pressed', String(selected));
      }
    }
    paintSwatches();
    function values() {
      return {
        titulo: title.value.trim() || 'Sin título',
        contenido: clean(editor.innerHTML),
        color: dialog.dataset.color
      };
    }
    async function save() {
      clearTimeout(timer);
      if (closed) return false;
      if (saving) { pending = true; return false; }
      saving = true;
      let ok = true;
      do {
        pending = false;
        const payload = values();
        const snapshot = JSON.stringify(payload);
        if (snapshot === last || (!item.id && !title.value.trim() && !editor.textContent.trim())) break;
        if (payload.contenido.length > 100000) {
          status.textContent = 'Nota demasiado larga';
          ok = false;
          break;
        }
        status.textContent = 'Guardando…';
        try {
          const response = item.id
            ? await K.put('/api/creativos/pizarra/' + encodeURIComponent(item.id), payload)
            : await K.post('/api/creativos/pizarra', payload);
          Object.assign(item, response.item);
          remove.textContent = 'Eliminar';
          last = snapshot;
          onSaved(item);
        } catch (error) {
          status.textContent = 'Error al guardar';
          K.fail(error);
          ok = false;
          break;
        }
        if (JSON.stringify(values()) !== last) pending = true;
      } while (pending && !closed);
      saving = false;
      if (ok) status.textContent = 'Guardado';
      return ok;
    }
    function schedule() {
      status.textContent = 'Sin guardar';
      clearTimeout(timer);
      timer = setTimeout(save, 900);
    }
    title.addEventListener('input', schedule);
    editor.addEventListener('input', schedule);
    editor.addEventListener('keyup', remember);
    editor.addEventListener('pointerup', remember);
    editor.addEventListener('touchend', remember, { passive: true });
    // Imported text is plain; saved HTML is whitelisted.
    editor.addEventListener('paste', e => {
      if (!e.clipboardData) return;
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      schedule();
    });
    function cleanup() {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('selectionchange', remember);
      overlay.remove();
      if (oldFocus && oldFocus.isConnected && typeof oldFocus.focus === 'function') oldFocus.focus({ preventScroll: true });
    }
    async function finish() {
      done.disabled = true;
      // If a request is already running, wait for it rather than closing mid-write.
      while (saving) await new Promise(resolve => setTimeout(resolve, 50));
      const ok = await save();
      if (ok) cleanup();
      else done.disabled = false;
    }
    title.focus({ preventScroll: true });
    return { close: finish };
  }
  window.KCCPizarraEditor = { open, clean };
})();
