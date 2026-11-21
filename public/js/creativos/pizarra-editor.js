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
    const title = make('div', 'cr-e-title');
    title.contentEditable = 'true';
    title.setAttribute('role', 'textbox');
    title.dataset.placeholder = 'Título';
    title.setAttribute('aria-label', 'Título');
    title.textContent = item.titulo === 'Nueva nota' ? '' : item.titulo || '';
    if (item.tituloHtml) title.innerHTML = clean(item.tituloHtml);
    else if (title.textContent) {
      const strong = make('strong', '', title.textContent);
      title.replaceChildren(strong);
    }
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
    const blocks = make('div', 'cr-e-format-row');
    const marks = make('div', 'cr-e-format-row');
    toolbar.append(blocks, marks);
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
    let activeEditor = title;
    const owner = node => title.contains(node) ? title : editor.contains(node) ? editor : null;
    let savedRange = null;
    let toolbarRange = null;
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
      if (selection && selection.rangeCount && owner(selection.anchorNode) && owner(selection.anchorNode) === owner(selection.focusNode)) {
        // Al tocar una herramienta algunos navegadores colapsan la selección antes del click.
        if (toolbarRange) return;
        activeEditor = owner(selection.anchorNode);
        savedRange = selection.getRangeAt(0).cloneRange();
        updateToolbar();
      }
    }
    function captureForToolbar() {
      const selection = window.getSelection();
      if (selection?.rangeCount && owner(selection.anchorNode) && owner(selection.anchorNode) === owner(selection.focusNode) && !selection.isCollapsed) {
        activeEditor = owner(selection.anchorNode);
        toolbarRange = selection.getRangeAt(0).cloneRange();
      } else if (!toolbarRange && savedRange && !savedRange.collapsed) {
        toolbarRange = savedRange.cloneRange();
      }
    }
    function restore() {
      const candidate = toolbarRange || savedRange;
      toolbarRange = null;
      const range = candidate && activeEditor.contains(candidate.startContainer) && activeEditor.contains(candidate.endContainer)
        ? candidate.cloneRange() : null;
      activeEditor.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (!selection) return;
      const target = range || document.createRange();
      if (!range) { target.selectNodeContents(activeEditor); target.collapse(false); }
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
      let lastTouch = 0;
      let touchStart = null;
      const b = button(label, tooltip, () => { if (Date.now() - lastTouch > 700) format(command, value); });
      // pointerdown ocurre antes de que el botón robe el foco, incluso en pantallas táctiles.
      b.addEventListener('pointerdown', captureForToolbar);
      b.addEventListener('mousedown', e => { captureForToolbar(); e.preventDefault(); });
      b.addEventListener('touchstart', e => {
        captureForToolbar();
        touchStart = e.touches[0];
      }, { passive: true });
      b.addEventListener('touchend', e => {
        const end = e.changedTouches[0];
        if (!touchStart || Math.abs(end.clientX - touchStart.clientX) > 10 || Math.abs(end.clientY - touchStart.clientY) > 10) return;
        e.preventDefault();
        lastTouch = Date.now();
        format(command, value);
      }, { passive: false });
      b.dataset.command = command;
      if (value) b.dataset.value = value;
      b.setAttribute('aria-pressed', 'false');
      formatButtons.push(b);
      (command === 'formatBlock' ? blocks : marks).append(b);
    }
    for (const [tag, label] of [['p', 'Texto'], ['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3']]) {
      control(tag === 'p' ? 'Texto' : tag.toUpperCase(), label, 'formatBlock', tag);
    }
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
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      const block = element?.closest('h1,h2,h3');
      const tag = block && activeEditor.contains(block) ? block.tagName.toLowerCase() : 'p';
      for (const b of formatButtons) {
        let pressed = false;
        try { pressed = b.dataset.command === 'formatBlock' ? b.dataset.value === tag : document.queryCommandState(b.dataset.command); } catch { /* sin estado */ }
        b.setAttribute('aria-pressed', String(pressed));
      }
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
        titulo: title.textContent.trim().slice(0, 120) || 'Sin título',
        tituloHtml: clean(title.innerHTML),
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
        if (snapshot === last || (!item.id && !title.textContent.trim() && !editor.textContent.trim())) break;
        if (payload.contenido.length > 100000 || payload.tituloHtml.length > 8000 || title.textContent.length > 120) {
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
    for (const field of [title, editor]) {
      field.addEventListener('focus', () => { if (activeEditor !== field) { activeEditor = field; savedRange = null; toolbarRange = null; } });
      field.addEventListener('pointerdown', () => { toolbarRange = null; });
      field.addEventListener('keyup', remember);
      field.addEventListener('pointerup', remember);
    }
    editor.addEventListener('input', schedule);
    editor.addEventListener('pointerdown', () => { toolbarRange = null; });
    editor.addEventListener('keydown', () => { toolbarRange = null; });
    editor.addEventListener('keyup', remember);
    editor.addEventListener('pointerup', remember);
    editor.addEventListener('touchend', remember, { passive: true });
    // Imported text is plain; saved HTML is whitelisted.
    for (const field of [title, editor]) field.addEventListener('paste', e => {
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
