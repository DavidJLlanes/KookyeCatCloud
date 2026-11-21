'use strict';
/* Galería de dibujos y editor vectorial: conserva los trazos originales editables. */
(function () {
  const root = document.getElementById('view-dibujos');
  if (!root) return;
  const PAPER = '#f7f6f2';
  const mobile = matchMedia('(max-width:700px)');
  const keys = { mobile: 'kcc-dibujos-columnas-movil', desktop: 'kcc-dibujos-columnas-escritorio' };
  function preference(key, fallback, max) {
    try { const n = Number(localStorage.getItem(key)); return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback; } catch { return fallback; }
  }
  const columns = { mobile: preference(keys.mobile, 2, 3), desktop: preference(keys.desktop, 3, 5) };
  const gridIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx=".8"/><rect x="14" y="3" width="7" height="7" rx=".8"/><rect x="3" y="14" width="7" height="7" rx=".8"/><rect x="14" y="14" width="7" height="7" rx=".8"/></svg>';
  root.innerHTML = `<div class="cr-wrap cr-dibujos cr-p-new-ui"><header class="cr-head cr-p-head kcc-section-head"><div><h2>Dibujos</h2></div><div class="cr-p-head-actions"><button type="button" id="cr-d-view-toggle" class="cr-p-view-toggle" aria-label="Cambiar columnas">${gridIcon}</button><button type="button" id="cr-d-new" class="btn primary">+ Nuevo dibujo</button></div></header><div class="cr-d-gallery" id="cr-d-gallery"></div><div class="cr-d-empty-state" id="cr-d-empty" hidden><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m16 4 4 4-11 11-5 1 1-5Z M14 6l4 4"/></svg><h3>Un espacio para tus ideas</h3><p>Crea tu primer dibujo y guárdalo en tu galería.</p><button class="btn primary" type="button" id="cr-d-first">Crear un dibujo</button></div><p id="cr-d-message" role="status" class="cr-d-message"></p></div>`;
  const $ = selector => root.querySelector(selector);
  const gallery = $('#cr-d-gallery');
  let items = [], loading = false, currentEditor = null;
  function paint(canvas, strokes) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / 1200, canvas.height / 750);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      if (!stroke.puntos?.length) continue;
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.grosor;
      ctx.beginPath();
      if (stroke.puntos.length === 1) {
        ctx.arc(stroke.puntos[0][0] * 1200, stroke.puntos[0][1] * 750, stroke.grosor / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        stroke.puntos.forEach(([x, y], index) => index ? ctx.lineTo(x * 1200, y * 750) : ctx.moveTo(x * 1200, y * 750));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function layout() {
    const mode = mobile.matches ? 'mobile' : 'desktop';
    const n = columns[mode], next = n % (mobile.matches ? 3 : 5) + 1;
    gallery.style.setProperty('--cr-d-cols', String(n));
    gallery.dataset.columns = String(n);
    const button = $('#cr-d-view-toggle');
    button.title = `${n} ${n === 1 ? 'columna' : 'columnas'} · pulsar para ${next}`;
    button.setAttribute('aria-label', `Cambiar columnas: ${n} ${n === 1 ? 'actual' : 'actuales'}, siguiente ${next}`);
  }
  $('#cr-d-view-toggle').addEventListener('click', () => {
    const mode = mobile.matches ? 'mobile' : 'desktop';
    columns[mode] = columns[mode] % (mobile.matches ? 3 : 5) + 1;
    try { localStorage.setItem(keys[mode], String(columns[mode])); } catch { /* privada */ }
    layout();
  });
  mobile.addEventListener('change', layout);
  layout();
  function render() {
    gallery.replaceChildren();
    $('#cr-d-empty').hidden = items.length > 0;
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'cr-d-card';
      card.setAttribute('aria-label', 'Editar dibujo ' + item.titulo);
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 480; thumbnail.height = 300; thumbnail.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('span'); caption.className = 'cr-d-card-caption';
      const title = document.createElement('strong'); title.textContent = item.titulo || 'Sin título';
      const detail = document.createElement('small');
      detail.textContent = 'Abrir dibujo';
      caption.append(title, detail); card.append(thumbnail, caption);
      card.addEventListener('click', () => edit(item)); gallery.append(card);
      paint(thumbnail, item.contenido || []);
    }
  }
  async function load() {
    if (loading || currentEditor) return;
    loading = true; $('#cr-d-message').textContent = 'Cargando dibujos…';
    try {
      items = (await K.get('/api/creativos/dibujos')).items || [];
      items.sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));
      render(); $('#cr-d-message').textContent = '';
    } catch (error) { $('#cr-d-message').textContent = 'No se pudieron cargar los dibujos. Vuelve a abrir esta sección para reintentar.'; K.fail(error); }
    finally { loading = false; }
  }
  function edit(item) {
    if (currentEditor) return;
    const previousFocus = document.activeElement;
    let actual = item || null, strokes = structuredClone(item?.contenido || []), redo = [], active = null, erasing = false, busy = false, frame = 0;
    const overlay = document.createElement('div'); overlay.className = 'cr-d-editor-overlay';
    overlay.innerHTML = `<section class="cr-d-editor" role="dialog" aria-modal="true" aria-label="${item ? 'Editar dibujo' : 'Nuevo dibujo'}" tabindex="-1"><header class="cr-d-editor-head"><div><span class="cr-d-eyebrow">${item ? 'EDITAR DIBUJO' : 'NUEVO DIBUJO'}</span><input id="cr-d-title" maxlength="120" placeholder="Dibujo sin título" aria-label="Nombre del dibujo" autocomplete="off"></div><button type="button" class="btn" id="cr-d-close">Cerrar</button></header><div class="cr-d-editor-tools"><div class="cr-d-tool-group" role="group" aria-label="Herramienta"><button type="button" class="btn" id="cr-d-pen" aria-pressed="true">Lápiz</button><button type="button" class="btn" id="cr-d-eraser" aria-pressed="false">Borrador</button></div><div class="cr-d-colors" role="group" aria-label="Colores del lápiz"></div><label class="cr-d-custom-color">Color<input id="cr-d-color" type="color" value="#303030" aria-label="Color personalizado"></label><label class="cr-d-brush">Trazo<input id="cr-d-width" type="range" min="1" max="48" value="5"><output id="cr-d-width-value">5 px</output></label><div class="cr-d-tool-group"><button type="button" class="btn" id="cr-d-undo">Deshacer</button><button type="button" class="btn" id="cr-d-redo">Rehacer</button></div></div><div class="cr-d-stage"><canvas id="cr-d-canvas" width="1200" height="750" aria-label="Superficie de dibujo"></canvas></div><footer class="cr-d-editor-foot"><span role="status" id="cr-d-status"></span><div><button type="button" class="btn cr-d-danger" id="cr-d-delete">Eliminar</button><button type="button" class="btn" id="cr-d-export">Descargar PNG</button><button type="button" class="btn primary" id="cr-d-save">Guardar y cerrar</button></div></footer></section>`;
    const q = selector => overlay.querySelector(selector);
    const title = q('#cr-d-title'), canvas = q('#cr-d-canvas');
    title.value = item?.titulo === 'Sin título' ? '' : item?.titulo || '';
    const state = () => JSON.stringify({ titulo: title.value.trim(), contenido: strokes });
    let snapshot = state();
    const dirty = () => state() !== snapshot;
    const scrollPosition = { x: window.scrollX, y: window.scrollY }, oldStyles = {};
    for (const key of ['position', 'top', 'left', 'width', 'overflow']) oldStyles[key] = document.body.style[key];
    Object.assign(document.body.style, { position: 'fixed', top: -scrollPosition.y + 'px', left: -scrollPosition.x + 'px', width: '100%', overflow: 'hidden' });
    document.body.append(overlay);
    function status(message) {
      q('#cr-d-status').textContent = message || (dirty() ? 'Cambios sin guardar' : actual ? 'Guardado' : 'Dibuja con el dedo, ratón o lápiz');
      q('#cr-d-undo').disabled = busy || !strokes.length;
      q('#cr-d-redo').disabled = busy || !redo.length;
      q('#cr-d-delete').hidden = !actual;
    }
    function draw() { paint(canvas, strokes); status(); }
    function close(force = false) {
      if (busy || (!force && dirty() && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?'))) return;
      cancelAnimationFrame(frame); overlay.remove(); currentEditor = null;
      Object.assign(document.body.style, oldStyles);
      window.removeEventListener('beforeunload', beforeUnload);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      window.scrollTo(scrollPosition.x, scrollPosition.y);
      (previousFocus?.isConnected ? previousFocus : $('#cr-d-new')).focus({ preventScroll: true });
    }
    function fit() {
      const view = window.visualViewport;
      overlay.style.top = (view?.offsetTop || 0) + 'px';
      overlay.style.left = (view?.offsetLeft || 0) + 'px';
      overlay.style.width = (view?.width || window.innerWidth) + 'px';
      overlay.style.height = (view?.height || window.innerHeight) + 'px';
    }
    function beforeUnload(event) { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    currentEditor = { close }; fit();
    function tool() {
      q('#cr-d-pen').setAttribute('aria-pressed', String(!erasing));
      q('#cr-d-eraser').setAttribute('aria-pressed', String(erasing));
      for (const swatch of q('.cr-d-colors').children) swatch.setAttribute('aria-pressed', String(!erasing && swatch.dataset.color === q('#cr-d-color').value));
    }
    for (const color of ['#303030', '#df5368', '#e69b3b', '#49a87c', '#4e83dc', '#9270ca']) {
      const swatch = document.createElement('button');
      swatch.type = 'button'; swatch.className = 'cr-d-swatch'; swatch.dataset.color = color;
      swatch.style.setProperty('--swatch', color); swatch.setAttribute('aria-label', 'Color ' + color);
      swatch.addEventListener('click', () => { q('#cr-d-color').value = color; erasing = false; tool(); });
      q('.cr-d-colors').append(swatch);
    }
    tool();
    q('#cr-d-pen').onclick = () => { erasing = false; tool(); };
    q('#cr-d-eraser').onclick = () => { erasing = true; tool(); };
    q('#cr-d-color').oninput = () => { erasing = false; tool(); };
    q('#cr-d-width').oninput = () => { q('#cr-d-width-value').value = q('#cr-d-width').value + ' px'; };
    title.oninput = () => status();
    function point(event) { const r = canvas.getBoundingClientRect(); return [Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (event.clientY - r.top) / r.height))]; }
    canvas.addEventListener('pointerdown', event => {
      if (busy || active || event.button !== 0) return;
      if (strokes.length >= 3000) { K.toast('Este dibujo ha alcanzado el límite de trazos'); return; }
      event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      active = { id: event.pointerId, stroke: { color: erasing ? PAPER : q('#cr-d-color').value, grosor: Number(q('#cr-d-width').value), puntos: [point(event)] } };
      strokes.push(active.stroke); redo = []; draw();
    });
    canvas.addEventListener('pointermove', event => {
      if (!active || active.id !== event.pointerId) return;
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) { if (active.stroke.puntos.length < 12000) active.stroke.puntos.push(point(sample)); }
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => { if (active?.id === event.pointerId) { active = null; draw(); } });
    q('#cr-d-undo').onclick = () => { if (!busy && strokes.length) { redo.push(strokes.pop()); draw(); } };
    q('#cr-d-redo').onclick = () => { if (!busy && redo.length) { strokes.push(redo.pop()); draw(); } };
    q('#cr-d-close').onclick = () => close();
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const nodes = [...overlay.querySelectorAll('button:not([disabled]):not([hidden]),input')].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === q('.cr-d-editor'))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    function setBusy(value) { busy = value; for (const field of overlay.querySelectorAll('button,input')) field.disabled = value; status(value ? 'Guardando…' : undefined); }
    q('#cr-d-save').onclick = async () => {
      if (busy) return;
      if (!strokes.length && !actual) { K.toast('Dibuja algo antes de guardar'); return; }
      const payload = { titulo: title.value.trim() || 'Sin título', contenido: structuredClone(strokes) };
      setBusy(true);
      try {
        const url = '/api/creativos/dibujos' + (actual ? '/' + encodeURIComponent(actual.id) : '');
        const result = await (actual ? K.put(url, payload) : K.post(url, payload));
        const index = items.findIndex(other => other.id === result.item.id);
        if (index < 0) items.unshift(result.item); else items[index] = result.item;
        snapshot = state(); render(); setBusy(false); close(true); K.toast('Dibujo guardado');
      } catch (error) { setBusy(false); status('No se pudo guardar. Tus cambios siguen aquí.'); K.fail(error); }
    };
    q('#cr-d-delete').onclick = async () => {
      if (busy || !actual || !window.confirm('¿Eliminar este dibujo?')) return;
      setBusy(true);
      try {
        await K.del('/api/creativos/dibujos/' + encodeURIComponent(actual.id));
        items = items.filter(other => other.id !== actual.id); render(); setBusy(false); close(true); K.toast('Dibujo eliminado');
      } catch (error) { setBusy(false); K.fail(error); }
    };
    q('#cr-d-export').onclick = () => {
      paint(canvas, strokes);
      const link = document.createElement('a'); link.download = (title.value.trim() || 'dibujo').replace(/[\\/:*?"<>|]/g, '-') + '.png';
      link.href = canvas.toDataURL('image/png'); link.click();
    };
    draw();
    (matchMedia('(pointer:coarse)').matches ? q('.cr-d-editor') : title).focus({ preventScroll: true });
  }
  $('#cr-d-new').onclick = () => edit(null);
  $('#cr-d-first').onclick = () => edit(null);
  K.registerView('dibujos', { open: load, close() { currentEditor?.close(); } });
})();
