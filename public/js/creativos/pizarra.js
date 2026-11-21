'use strict';
/* Pizarra tipo notas adhesivas: editor compacto, autosalvado y formato seguro. */
(function () {
  const root = document.getElementById('view-pizarra');
  if (!root) return;
  const COLORES = ['crema', 'amarillo', 'rosa', 'menta', 'azul', 'lavanda'];
  const TAGS = new Set(['DIV', 'P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN']);
  let elementos = [];
  let cargando = false;
  const estado = new Map();
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  // Solo etiquetas conocidas, sin atributos salvo text-align limitado.
  function limpiar(html) {
    const doc = new DOMParser().parseFromString('<section>' + String(html || '') + '</section>', 'text/html');
    const section = doc.body.firstElementChild;
    function walk(parent) {
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === 8) { child.remove(); continue; }
        if (child.nodeType !== 1) continue;
        if (!TAGS.has(child.tagName)) {
          const replacement = doc.createTextNode(child.textContent || '');
          child.replaceWith(replacement);
          continue;
        }
        const align = child.style.textAlign;
        for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
        if (['left', 'center', 'right', 'justify'].includes(align)) child.style.textAlign = align;
        walk(child);
      }
    }
    walk(section);
    return section.innerHTML.slice(0, 100000);
  }
  function boton(label, title, handler) {
    const b = node('button', 'cr-p-btn', label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', handler);
    return b;
  }
  root.innerHTML = '<div class="cr-wrap cr-pizarra"><header class="cr-head cr-p-head"><div><h2>Pizarra</h2><p class="cr-p-sub">Tus ideas, de un vistazo</p></div><button type="button" id="cr-p-new" class="btn primary">+ Nueva nota</button></header><div class="cr-p-layout"><span id="cr-p-layout-label">Columnas</span><div class="cr-p-columns" id="cr-p-columns" role="group" aria-labelledby="cr-p-layout-label"></div></div><div class="cr-board" id="cr-p-board"></div><p class="cr-p-empty" id="cr-p-empty" hidden>Tu pizarra está vacía. Añade tu primera nota.</p></div>';
  const board = root.querySelector('#cr-p-board');
  const vacio = root.querySelector('#cr-p-empty');
  const columnControls = root.querySelector('#cr-p-columns');
  const movil = window.matchMedia('(max-width:700px)');
  const pref = { movil: 'kcc-pizarra-columnas-movil', escritorio: 'kcc-pizarra-columnas-escritorio' };
  const leer = (key, fallback, max) => {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
    } catch { return fallback; }
  };
  const columnas = { movil: leer(pref.movil, 1, 3), escritorio: leer(pref.escritorio, 3, 5) };
  function pintarColumnas() {
    const isMobile = movil.matches;
    const count = columnas[isMobile ? 'movil' : 'escritorio'];
    board.style.setProperty('--cr-p-cols', count);
    columnControls.replaceChildren();
    const max = isMobile ? 3 : 5;
    for (let n = 1; n <= max; n++) {
      const option = boton(String(n), n + (n === 1 ? ' columna' : ' columnas'), () => {
        const mode = movil.matches ? 'movil' : 'escritorio';
        columnas[mode] = n;
        try { localStorage.setItem(pref[mode], String(n)); } catch { /* almacenamiento privado */ }
        pintarColumnas();
      });
      option.classList.add('cr-p-col-option');
      option.setAttribute('aria-pressed', String(n === count));
      if (n === count) option.classList.add('is-active');
      columnControls.append(option);
    }
  }
  if (movil.addEventListener) movil.addEventListener('change', pintarColumnas);
  else movil.addListener(pintarColumnas);
  pintarColumnas();

  function actualizarVacio() { vacio.hidden = !!board.children.length; }
  function tarjeta(item) {
    const card = node('article', 'cr-postit');
    card.dataset.color = COLORES.includes(item.color) ? item.color : 'amarillo';
    const title = node('input', 'cr-p-title');
    title.type = 'text';
    title.value = item.titulo === 'Nueva nota' ? '' : item.titulo || '';
    title.placeholder = 'Título';
    title.maxLength = 120;
    title.setAttribute('aria-label', 'Título de la nota');
    const editor = node('div', 'cr-p-editor');
    editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', 'Contenido de la nota');
    editor.dataset.placeholder = 'Escribe una nota…';
    editor.innerHTML = limpiar(item.contenido);
    const actions = node('div', 'cr-p-actions');
    const tools = node('div', 'cr-p-format');
    tools.hidden = true;
    tools.setAttribute('aria-label', 'Formato del texto');
    const foot = node('div', 'cr-p-foot');
    const status = node('span', 'cr-p-status', 'Guardado');
    let timer = null, saving = false, pending = false, destroyed = false;
    let cachedSelection = null;
    let last = '';


    function datos() {
      return {
        titulo: title.value.trim() || 'Sin título',
        color: card.dataset.color,
        contenido: limpiar(editor.innerHTML)
      };
    }
    last = JSON.stringify(datos());
    function selectionInside() {
      const selection = window.getSelection();
      return selection && selection.rangeCount && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange() : null;
    }
    function memorizar() { cachedSelection = selectionInside() || cachedSelection; }
    editor.addEventListener('keyup', memorizar);
    editor.addEventListener('mouseup', memorizar);
    editor.addEventListener('touchend', memorizar, { passive: true });
    function aplicar(cmd, value) {
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (cachedSelection && selection) {
        try { selection.removeAllRanges(); selection.addRange(cachedSelection); } catch { /* contenido modificado */ }
      }
      document.execCommand(cmd, false, value);
      memorizar();
      programar();
    }
    // No roba la selección al pulsar un botón de formato.
    function formato(label, title, cmd, value) {
      const b = boton(label, title, () => aplicar(cmd, value));
      b.addEventListener('pointerdown', e => { memorizar(); e.preventDefault(); });
      tools.append(b);
      return b;
    }
    const headings = node('select', 'cr-p-heading');
    headings.setAttribute('aria-label', 'Estilo de párrafo');
    for (const [value, label] of [['p', 'Texto'], ['h1', 'Título H1'], ['h2', 'Título H2'], ['h3', 'Título H3']]) {
      const option = node('option', '', label);
      option.value = value;
      headings.append(option);
    }
    headings.addEventListener('pointerdown', memorizar);
    headings.addEventListener('change', () => {
      aplicar('formatBlock', '<' + headings.value + '>');
      headings.value = 'p';
    });
    tools.append(headings);
    formato('B', 'Negrita', 'bold');
    formato('I', 'Cursiva', 'italic');
    formato('U', 'Subrayado', 'underline');
    formato('S', 'Tachado', 'strikeThrough');
    formato('•', 'Lista de viñetas', 'insertUnorderedList');
    formato('1.', 'Lista numerada', 'insertOrderedList');
    formato('≡', 'Alinear a la izquierda', 'justifyLeft');
    formato('≡', 'Centrar', 'justifyCenter');
    formato('≡', 'Alinear a la derecha', 'justifyRight');
    formato('≡', 'Justificar', 'justifyFull');

    async function guardar() {
      if (destroyed) return;
      if (timer) { clearTimeout(timer); timer = null; }
      const payload = datos();
      const serialized = JSON.stringify(payload);
      if (serialized === last && !pending) { status.textContent = 'Guardado'; return; }
      pending = true;
      status.textContent = 'Guardando…';
      if (saving) return;
      saving = true;
      while (pending && !destroyed) {
        pending = false;
        const current = datos();
        const snapshot = JSON.stringify(current);
        if (snapshot === last) continue;
        try {
          const response = await K.put('/api/creativos/pizarra/' + encodeURIComponent(item.id), current);
          Object.assign(item, response.item);
          last = snapshot;
        } catch (e) {
          status.textContent = 'Error al guardar';
          K.fail(e);
          break;
        }
        if (JSON.stringify(datos()) !== last) pending = true;
      }
      saving = false;
      if (!destroyed && status.textContent !== 'Error al guardar') status.textContent = 'Guardado';
    }
    function programar() {
      status.textContent = 'Sin guardar';
      if (timer) clearTimeout(timer);
      timer = setTimeout(guardar, 750);
    }
    title.addEventListener('input', programar);
    editor.addEventListener('input', programar);
    editor.addEventListener('paste', e => {
      const clipboard = e.clipboardData;
      if (!clipboard) return;
      e.preventDefault();
      const plain = clipboard.getData('text/plain');
      document.execCommand('insertText', false, plain);
      programar();
    });
    const color = node('select', 'cr-p-color');
    color.setAttribute('aria-label', 'Color de la nota');
    for (const c of COLORES) {
      const opt = node('option', '', c[0].toUpperCase() + c.slice(1));
      opt.value = c;
      color.append(opt);
    }
    color.value = card.dataset.color;
    color.addEventListener('change', () => { card.dataset.color = color.value; programar(); });
    const toggle = boton('Aa', 'Mostrar u ocultar formato', () => {
      tools.hidden = !tools.hidden;
      toggle.setAttribute('aria-expanded', String(!tools.hidden));
      if (!tools.hidden) editor.focus({ preventScroll: true });
    });
    toggle.classList.add('cr-p-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    const remove = boton('✕', 'Eliminar nota', async () => {
      if (!confirm('¿Eliminar esta nota?')) return;
      destroyed = true;
      if (timer) clearTimeout(timer);
      try {
        await K.del('/api/creativos/pizarra/' + encodeURIComponent(item.id));
        estado.delete(item.id);
        elementos = elementos.filter(x => x.id !== item.id);
        card.remove();
        actualizarVacio();
      } catch (e) { destroyed = false; K.fail(e); }
    });
    remove.classList.add('cr-p-delete');
    actions.append(toggle, color, remove);
    foot.append(status);
    card.append(title, editor, tools, actions, foot);
    title.addEventListener('blur', () => { if (timer) { clearTimeout(timer); timer = null; } guardar(); });
    editor.addEventListener('blur', () => { if (timer) { clearTimeout(timer); timer = null; } guardar(); });
    estado.set(item.id, { guardar, get dirty() { return !!timer || pending || saving || JSON.stringify(datos()) !== last; } });
    return card;
  }
  async function cargar() {
    if (cargando) return;
    if (Array.from(estado.values()).some(s => s.dirty)) return;
    cargando = true;
    try {
      elementos = (await K.get('/api/creativos/pizarra')).items;
      estado.clear();
      board.replaceChildren(...elementos.map(tarjeta));
      actualizarVacio();
    } catch (e) { K.fail(e); }
    finally { cargando = false; }
  }
  root.querySelector('#cr-p-new').addEventListener('click', async () => {
    try {
      const response = await K.post('/api/creativos/pizarra', { titulo: 'Nueva nota', color: 'amarillo', contenido: '' });
      elementos.push(response.item);
      const card = tarjeta(response.item);
      board.prepend(card);
      actualizarVacio();
      card.querySelector('.cr-p-title').focus();
    } catch (e) { K.fail(e); }
  });
  K.registerView('pizarra', {
    open: cargar,
    close() { for (const state of estado.values()) if (state.dirty) state.guardar(); }
  });
})();
