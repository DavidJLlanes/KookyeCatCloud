'use strict';
/* Documentos · pantalla del editor: título, hoja, autoguardado con control de conflictos entre dispositivos, atajos, tareas y tablas. */
(function () {
  if (!window.K || !K.documentos) return;
  const D = K.documentos, S = D.S;
  let cabeza = null, timer = null, guardando = false, otraVez = false, raiz = null;

  const estado = (t, cls) => { if (D.el && D.el.estado) { D.el.estado.textContent = t; D.el.estado.dataset.e = cls || ''; } };
  const cuenta = () => {
    const t = (D.ed.innerText || '').trim(); const n = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    if (D.el.pie) D.el.pie.textContent = `${n.toLocaleString('es-ES')} palabra${n === 1 ? '' : 's'} · ${t.length.toLocaleString('es-ES')} caracteres`;
  };

  D.cambio = () => { if (!D.ed || !cabeza) return; S.sucio = true; estado('Sin guardar…', 'sucio'); cuenta(); clearTimeout(timer); timer = setTimeout(D.guardaYa, 1200); };

  D.guardaYa = async (extra) => {
    clearTimeout(timer);
    if (!cabeza || (!S.sucio && !extra)) return;
    if (guardando) { otraVez = true; return; }
    guardando = true; estado('Guardando…', 'ocupado');
    const html = D.ed.innerHTML, title = D.el.titulo.value;
    try {
      const r = await D.guarda(cabeza.id, { html, title, pagina: cabeza.pagina, base: extra && extra.sinBase ? undefined : S.base });
      S.base = r.updatedAt; if (D.ed.innerHTML === html && D.el.titulo.value === title) S.sucio = false;
      estado(S.sucio ? 'Sin guardar…' : 'Guardado', S.sucio ? 'sucio' : 'ok'); D.logros();
    } catch (e) {
      if (e.status === 409) { estado('Conflicto', 'error'); conflicto(); }
      else { estado('No se pudo guardar', 'error'); if (!S.avisoError) { S.avisoError = true; K.fail(e); setTimeout(() => { S.avisoError = false; }, 8000); } }
    }
    guardando = false;
    if (otraVez) { otraVez = false; D.guardaYa(); }
  };

  async function conflicto() {
    const sigue = await K.confirm('Este documento se cambió en otro dispositivo después de abrirlo. ¿Guardar igualmente lo que tienes aquí (sustituye a la otra versión, que queda como copia de seguridad si es mucho más corta)?', { ok: 'Guardar la mía', title: 'Conflicto de edición' });
    if (sigue) { S.sucio = true; D.guardaYa({ sinBase: true }); }
    else K.toast('Copia lo que necesites y vuelve a abrir el documento para ver la versión actual.');
  }

  const alSeleccionar = () => { if (D.ed && cabeza) requestAnimationFrame(D.refrescaBarra); };
  document.addEventListener('selectionchange', alSeleccionar);
  const alOcultar = () => { if (document.hidden && cabeza && S.sucio) D.guardaYa(); };
  document.addEventListener('visibilitychange', alOcultar); window.addEventListener('pagehide', () => { if (cabeza && S.sucio) D.guardaYa(); });

  function teclas(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); D.enlace(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); S.sucio = true; D.guardaYa(); }
    else if (e.key === 'Tab') {   // dentro de una tabla, Tab pasa a la celda siguiente (y al final crea una fila)
      const td = D.cercano('td,th'); if (!td) return;
      e.preventDefault();
      const celdas = [...td.closest('table').querySelectorAll('td,th')]; const i = celdas.indexOf(td) + (e.shiftKey ? -1 : 1);
      if (i >= celdas.length) { D.tablaOp('fila+'); const n = [...td.closest('table').querySelectorAll('td,th')][i]; if (n) ir(n); }
      else if (celdas[i]) ir(celdas[i]);
    }
  }
  const ir = (n) => { const r = document.createRange(); r.selectNodeContents(n); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };

  // Casilla de las listas de tareas: se marca tocando a la izquierda del elemento
  function alClic(e) {
    const li = e.target.closest && e.target.closest('ul.dc-tareas > li');
    if (!li || !D.ed.contains(li)) return;
    const r = li.getBoundingClientRect();
    if (e.clientX - r.left <= 28) { e.preventDefault(); li.classList.toggle('dc-hecha'); D.cambio(); }
  }

  D.pintaEditor = async (raizVista, id) => {
    raiz = raizVista; raiz.textContent = '';
    let doc;
    try { doc = await D.abre(id); } catch (e) { K.fail(e); S.abierto = null; D.pintaLista(raiz); return; }
    cabeza = doc; S.abierto = id; S.base = doc.updatedAt; S.sucio = false;
    const page = el('div', 'dc-ed');
    const top = el('div', 'dc-top');
    const atras = el('button', 'btn sm dc-atras'); atras.type = 'button'; atras.setAttribute('aria-label', 'Volver a Documentos'); atras.append(icon('i-down'), el('span', null, 'Documentos'));
    atras.addEventListener('click', () => D.cierraEditor());
    const titulo = el('input', 'dc-titulo'); titulo.type = 'text'; titulo.value = doc.title; titulo.maxLength = 120; titulo.setAttribute('aria-label', 'Título del documento'); titulo.placeholder = 'Documento sin título';
    titulo.addEventListener('input', D.cambio); titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); D.ed.focus(); } });
    const est = el('span', 'dc-estado', 'Guardado'); est.dataset.e = 'ok';
    const mas = el('button', 'btn sm dc-mas'); mas.type = 'button'; mas.setAttribute('aria-label', 'Más opciones'); mas.textContent = '⋯'; mas.addEventListener('click', () => D.menuMas(mas, cabeza));
    top.append(atras, titulo, est, mas);
    const barra = D.creaBarra();
    const tactil = K.esTactil();
    const scroll = el('div', 'dc-scroll');
    const hoja = el('div', 'dc-hoja'); hoja.dataset.p = doc.pagina || 'a4';
    const cuerpo = el('div', 'dc-cuerpo'); cuerpo.contentEditable = 'true'; cuerpo.spellcheck = true; cuerpo.lang = 'es'; cuerpo.setAttribute('role', 'textbox'); cuerpo.setAttribute('aria-multiline', 'true'); cuerpo.setAttribute('aria-label', 'Texto del documento');
    cuerpo.innerHTML = doc.html || '<p><br></p>';
    hoja.appendChild(cuerpo); scroll.appendChild(hoja);
    const pie = el('div', 'dc-pie');
    page.append(top, tactil ? scroll : barra, ...(tactil ? [] : [scroll]), pie);
    if (tactil) page.appendChild(barra);
    raiz.appendChild(page);
    D.ed = cuerpo; D.el = { titulo, estado: est, pie, hoja, barra, page };
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* por defecto */ }
    D.asegura(); cuenta();
    cuerpo.addEventListener('input', D.cambio);
    cuerpo.addEventListener('keydown', teclas);
    cuerpo.addEventListener('paste', (e) => D.alPegar(e, D.cambio));
    cuerpo.addEventListener('click', alClic);
    // Soltar texto o HTML arrastrado desde otra página: pasa por el mismo saneado que pegar (si no, el navegador lo mete tal cual)
    let arrastreInterno = false;
    cuerpo.addEventListener('dragstart', () => { arrastreInterno = true; });
    cuerpo.addEventListener('dragend', () => { arrastreInterno = false; });
    cuerpo.addEventListener('drop', (e) => {
      if (arrastreInterno) { arrastreInterno = false; setTimeout(D.cambio, 0); return; }   // mover texto dentro del propio documento
      const dt = e.dataTransfer; if (!dt || !(dt.types || []).some(t => t === 'text/html' || t === 'text/plain')) { e.preventDefault(); return; }
      e.preventDefault();
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      D.alPegar({ clipboardData: dt, preventDefault() {} }, D.cambio);
    });
    if (tactil) {
      // La barra solo estorba cuando no se está escribiendo: aparece con el foco y se acopla encima del teclado
      barra.classList.add('dc-oculta');
      cuerpo.addEventListener('focus', () => { barra.classList.remove('dc-oculta'); K.acoplaBarra(barra); page.classList.add('dc-escribiendo'); });
      cuerpo.addEventListener('blur', () => setTimeout(() => { if (!D.ed || D.ed.contains(document.activeElement) || (document.activeElement && document.activeElement.closest && document.activeElement.closest('.dc-barra,.dc-pop,.k-modal'))) return; barra.classList.add('dc-oculta'); page.classList.remove('dc-escribiendo'); D.cierraPop && D.cierraPop(); }, 250));
    }
    D.refrescaBarra();
    if (!doc.palabras && !doc.caracteres) setTimeout(() => { try { cuerpo.focus({ preventScroll: true }); } catch { /* sin foco */ } }, 80);
  };

  D.cierraEditor = async () => {
    if (S.sucio) await D.guardaYa();
    cabeza = null; D.ed = null; D.el = null; S.abierto = null; clearTimeout(timer); D.cierraPop && D.cierraPop();
    await D.carga().catch(() => {}); D.pintaLista(raiz);
  };

  D.fijaPagina = (p) => { if (!cabeza) return; cabeza.pagina = p; D.el.hoja.dataset.p = p; S.sucio = true; D.guardaYa({ forzar: true }); };
  D.documentoActual = () => cabeza;
})();
