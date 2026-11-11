'use strict';
/* codigo/panel.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { BARRA, S, logros, root } = C;
  const accion = (...a) => C.accion(...a);
  const bajar = (...a) => C.bajar(...a);
  const btn = (...a) => C.btn(...a);
  const colorea = (...a) => C.colorea(...a);
  const ext = (...a) => C.ext(...a);
  const langDe = (...a) => C.langDe(...a);
  const markdown = (...a) => C.markdown(...a);
  const nombreDe = (...a) => C.nombreDe(...a);
  const pinta = (...a) => C.pinta(...a);
  const q = (...a) => C.q(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);

  /* ---------- Panel de archivo ---------- */
  function pintaPanel() {
    const pn = root.querySelector('#cd-panel'); if (!pn) return; pn.textContent = ''; S.ed = null;
    if (!S.ruta) { pn.appendChild(el('div', 'cd-sinsel k-muted', 'Elige un archivo para verlo o editarlo')); return; }
    const ruta = S.ruta; const ro = !!S.ver; const lang = langDe(ruta);
    const h = el('div', 'cd-phead'); const atras = btn('Archivos', null, async () => { await guardaYa(); S.movil = 'arbol'; pinta(); }, 'btn sm cd-solo-movil'); atras.prepend(el('span', null, '← '));
    const nom = el('strong', 'cd-ruta', ruta); const estado = el('small', 'k-muted cd-estado', ro ? 'Solo lectura' : 'Guardado'); estado.id = 'cd-estado'; h.append(atras, nom, estado); pn.appendChild(h);
    const acc = el('div', 'cd-pacc');
    if (S.bin) {
      const c = el('div', 'cd-binario');
      if (S.bin.imagen) { const im = el('img', 'cd-img'); im.alt = ruta; im.src = BASE + url('/archivo?' + q({ ruta, v: S.ver && S.ver.id })); c.appendChild(im); }
      else c.appendChild(el('p', 'k-muted', 'Archivo binario o demasiado grande para editarlo aquí.'));
      c.appendChild(el('small', 'k-muted', tam(S.bin.tam))); acc.append(btn('Descargar', 'i-download', () => bajar(url('/archivo?' + q({ ruta, descargar: 1, v: S.ver && S.ver.id })), nombreDe(ruta)), 'btn sm')); pn.append(acc, c); return;
    }
    acc.append(btn('Copiar', 'i-copy', async () => { try { await navigator.clipboard.writeText(S.texto); K.toast('Código copiado'); accion('copia'); } catch { K.toast('No se pudo copiar'); } }, 'btn sm'),
      btn('Descargar', 'i-download', () => bajar(url('/archivo?' + q({ ruta, descargar: 1, v: S.ver && S.ver.id })), nombreDe(ruta)), 'btn sm'));
    const prev = ['html', 'markdown', 'json'].includes(lang) || ext(ruta) === 'svg';
    if (prev) { const pb = btn(S.vistaPrev ? 'Editor' : 'Vista previa', null, async () => { await guardaYa(); S.vistaPrev = !S.vistaPrev; pintaPanel(); if (S.vistaPrev) accionPrev(); }, 'btn sm'); acc.appendChild(pb); }
    pn.appendChild(acc);
    if (S.vistaPrev) { const pv = el('div', 'cd-prev show'); pn.appendChild(pv); preview(pv, ruta, lang); return; }
    const ed = el('div', 'cd-editor'); const gut = el('div', 'cd-gutter'); gut.setAttribute('aria-hidden', 'true'); const wrap = el('div', 'cd-wrap');
    const pre = el('pre', 'cd-hl hljs'); pre.setAttribute('aria-hidden', 'true'); const co = el('code'); pre.appendChild(co);
    const ta = el('textarea', 'cd-ta'); ta.spellcheck = false; ta.autocapitalize = 'off'; ta.setAttribute('autocorrect', 'off'); ta.setAttribute('autocomplete', 'off'); ta.setAttribute('aria-label', 'Contenido de ' + ruta); ta.wrap = 'off'; ta.value = S.texto; ta.readOnly = ro; ta.placeholder = ro ? '' : 'Escribe o pega tu código…';
    wrap.append(pre, ta); ed.append(gut, wrap); pn.appendChild(ed);
    if (!ro) { const sim = el('div', 'cd-sym'); BARRA.forEach(([l, t, tt]) => { const b = el('button', null, l); b.type = 'button'; b.tabIndex = -1; if (tt) b.title = tt; b.addEventListener('pointerdown', (e) => { e.preventDefault(); inserta(ta, t); }); sim.appendChild(b); }); pn.appendChild(sim); }
    const repinta = () => { const c = ta.value; co.innerHTML = colorea(c, lang) + '\n'; const n = c ? c.split('\n').length : 1; let t = ''; for (let i = 1; i <= n; i++) t += i + '\n'; gut.textContent = t; gut.style.minWidth = (String(n).length + 1.4) + 'ch'; pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; };
    S.ed = { ta };
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; });
    if (!ro) { ta.addEventListener('input', () => { S.texto = ta.value; repinta(); programa(); }); ta.addEventListener('keydown', (e) => teclas(e, ta, lang)); }
    repinta();
  }
  function accionPrev() { if (S.p && !S.usoPrev.has(S.p.id)) { S.usoPrev.add(S.p.id); accion('preview'); } }
  async function preview(pv, ruta, lang) {
    if (lang === 'html') {
      try { const t = await token(); const fr = el('iframe', 'cd-frame'); fr.setAttribute('sandbox', S.js ? 'allow-scripts' : ''); fr.title = 'Vista previa'; fr.src = `${BASE}/api/codigo-vista/${t}/${ruta.split('/').map(encodeURIComponent).join('/')}`; pv.appendChild(fr);
        pv.append(interruptorJs(() => { pv.textContent = ''; preview(pv, ruta, lang); }), el('small', 'k-faint cd-nota', S.js ? AVISO_JS : 'Vista aislada: se ven HTML, CSS e imágenes del proyecto; los scripts no se ejecutan.')); } catch (e) { K.fail(e); }
    } else if (ext(ruta) === 'svg') {
      const img = el('img', 'cd-svg'); img.alt = 'Vista previa SVG'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.texto); pv.appendChild(img);
    } else if (lang === 'json') {
      try { const o = JSON.parse(S.texto); const pre = el('pre', 'cd-json hljs'); const co = el('code'); co.innerHTML = colorea(JSON.stringify(o, null, 2), 'json'); pre.appendChild(co); pv.append(el('p', 'cd-ok', '✔ JSON válido'), pre); }
      catch (e) { pv.appendChild(el('p', 'cd-err', '✖ ' + e.message)); }
    } else { const d = el('div', 'cd-md'); d.innerHTML = markdown(S.texto); pv.appendChild(d); }
  }
  async function token() { const v = S.ver ? S.ver.id : ''; if (!S.token || S.token.v !== v || S.token.js !== !!S.js) { const r = await K.post(url('/vista'), { v, js: !!S.js }); S.token = { v, js: !!S.js, t: r.token }; } return S.token.t; }
  // Interruptor «Permitir JavaScript» de las vistas previas (apagado al abrir cada proyecto)
  function interruptorJs(alCambiar) {
    const l = el('label', 'cd-js'); const c = el('input'); c.type = 'checkbox'; c.checked = !!S.js;
    c.addEventListener('change', () => { S.js = c.checked; alCambiar(); });
    l.append(c, document.createTextNode(' Permitir JavaScript')); return l;
  }
  const AVISO_JS = 'JavaScript activado: la web se ejecuta aislada (sin tu sesión ni cookies), pero puede cargar recursos de internet. Actívalo solo con webs en las que confíes.';
  // Teclado del editor (sangría, pares, Tab…)
  function inserta(ta, texto) {
    ta.focus(); let ok = false; try { ok = document.execCommand('insertText', false, texto); } catch { ok = false; }
    if (!ok) { const a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(texto, a, b, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  const PARES = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  function teclas(e, ta, lang) {
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardaYa(); return; }
    const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (a !== b && v.slice(a, b).includes('\n')) {
        const ini = v.lastIndexOf('\n', a - 1) + 1; let fin = v.indexOf('\n', b); if (fin < 0) fin = v.length;
        const bloque = v.slice(ini, fin); const nu = e.shiftKey ? bloque.replace(/^( {1,2}|\t)/gm, '') : bloque.replace(/^/gm, '  ');
        ta.setSelectionRange(ini, fin); inserta(ta, nu); ta.setSelectionRange(ini, ini + nu.length);
      } else if (e.shiftKey) {
        const ini = v.lastIndexOf('\n', a - 1) + 1; const m = /^( {1,2}|\t)/.exec(v.slice(ini)); if (m) { ta.setSelectionRange(ini, ini + m[0].length); inserta(ta, ''); ta.setSelectionRange(Math.max(ini, a - m[0].length), Math.max(ini, a - m[0].length)); }
      } else inserta(ta, '  ');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ini = v.lastIndexOf('\n', a - 1) + 1; const sangria = /^[ \t]*/.exec(v.slice(ini, a))[0];
      const antes = v.slice(0, a).trimEnd().slice(-1); const despues = v[b];
      if (/[{[(]/.test(antes) && PARES[antes] === despues) { inserta(ta, '\n' + sangria + '  \n' + sangria); const p = a + 1 + sangria.length + 2; ta.setSelectionRange(p, p); }
      else inserta(ta, '\n' + sangria + (/[{[(:>]$/.test(v.slice(ini, a).trimEnd()) && lang !== 'markdown' ? '  ' : ''));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) { if (e.key === 'Backspace' && a === b && PARES[v[a - 1]] && PARES[v[a - 1]] === v[a]) { e.preventDefault(); ta.setSelectionRange(a - 1, a + 1); inserta(ta, ''); } return; }
    if (PARES[e.key] && a !== b && !(e.key === "'" || e.key === '"' || e.key === '`')) { e.preventDefault(); const sel = v.slice(a, b); inserta(ta, e.key + sel + PARES[e.key]); ta.setSelectionRange(a + 1, a + 1 + sel.length); return; }
    if (')]}"\'`'.includes(e.key) && v[a] === e.key && a === b) { e.preventDefault(); ta.setSelectionRange(a + 1, a + 1); return; }
    if (PARES[e.key] && a === b && (!v[a] || /[\s)\]}>,;]/.test(v[a]))) {
      if ((e.key === '"' || e.key === "'" || e.key === '`') && (v[a] === e.key || /\w/.test(v[a - 1] || ''))) { if (v[a] === e.key) { e.preventDefault(); ta.setSelectionRange(a + 1, a + 1); } return; }
      e.preventDefault(); inserta(ta, e.key + PARES[e.key]); ta.setSelectionRange(a + 1, a + 1);
    }
  }

  /* ---------- Guardado ---------- */
  function marca(ok) { S.guardado = ok; const e = root.querySelector('#cd-estado'); if (e && !S.ver) e.textContent = ok ? 'Guardado' : 'Guardando…'; }
  function programa() { marca(false); clearTimeout(S.timer); S.timer = setTimeout(guardaYa, 800); }
  async function guardaYa() {
    // Devuelve false si no se pudo guardar: quien cambia de archivo o sale del proyecto se detiene para no perder lo escrito
    clearTimeout(S.timer); if (!S.p || !S.ruta || S.guardado || S.ver) return true; const ruta = S.ruta, texto = S.texto, id = S.p.id;
    try {
      const r = await K.put(`/api/codigo/${id}/archivo`, { ruta, contenido: texto });
      if (S.p && S.p.id === id && S.p.archivos[ruta]) { S.p.archivos[ruta] = { t: r.archivo[1], l: r.archivo[2], texto: true }; if (S.ruta === ruta && S.texto === texto) marca(true); const sz = root.querySelector('.cd-fila.sel .cd-sz'); if (sz) sz.textContent = tam(r.archivo[1]); }
      logros(); return true;
    } catch (e) { K.fail(e); return false; }
  }


  Object.assign(C, { pintaPanel, accionPrev, preview, token, interruptorJs, AVISO_JS, inserta, PARES, teclas, marca, programa, guardaYa });
})();
