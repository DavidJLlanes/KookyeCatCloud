'use strict';
/* codigo/archivos.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { S, logros, root } = C;
  const bajar = (...a) => C.bajar(...a);
  const btn = (...a) => C.btn(...a);
  const carpetaDe = (...a) => C.carpetaDe(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const menuSubir = (...a) => C.menuSubir(...a);
  const nombreDe = (...a) => C.nombreDe(...a);
  const pide = (...a) => C.pide(...a);
  const pinta = (...a) => C.pinta(...a);
  const pintaPanel = (...a) => C.pintaPanel(...a);
  const q = (...a) => C.q(...a);
  const restaura = (...a) => C.restaura(...a);
  const subeZip = (...a) => C.subeZip(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);

  /* ---------- Archivos ---------- */
  const vistaArch = () => (S.ver ? { archivos: S.ver.archivos, carpetas: S.ver.carpetas } : { archivos: S.p.archivos, carpetas: S.p.carpetas });
  function pintaArchivos(cont) {
    if (S.ver) {
      const b = el('div', 'cd-bannerv'); b.append(el('span', null, `Estás viendo la versión ${S.ver.n}: «${S.ver.mensaje}» (solo lectura)`),
        btn('Restaurar', 'i-restore', () => restaura(S.ver.id, S.ver.n), 'btn sm primary'), btn('Volver al trabajo actual', null, async () => { S.ver = null; S.ruta = null; pinta(); }, 'btn sm')); cont.appendChild(b);
    }
    const w = el('div', 'cd-split'); w.dataset.m = S.movil; cont.appendChild(w);
    const izq = el('aside', 'cd-arbol'); izq.id = 'cd-arbol'; const der = el('div', 'cd-panel'); der.id = 'cd-panel'; w.append(izq, der);
    pintaArbol(); pintaPanel();
  }
  function construye() {
    const { archivos, carpetas } = vistaArch(); const raiz = { d: new Map(), f: [] };
    const nodo = (ruta) => { let n = raiz; for (const parte of ruta.split('/')) { if (!n.d.has(parte)) n.d.set(parte, { d: new Map(), f: [] }); n = n.d.get(parte); } return n; };
    carpetas.forEach(nodo);
    Object.keys(archivos).forEach(r => { const c = carpetaDe(r); (c ? nodo(c) : raiz).f.push(r); });
    return raiz;
  }
  function pintaArbol() {
    const a = root.querySelector('#cd-arbol'); if (!a) return; a.textContent = '';
    if (!S.ver) {
      const tb = el('div', 'cd-tb');
      tb.append(btn('', 'i-plus', () => nuevoArchivo(''), 'btn sm'), btn('', 'i-folder-plus', () => nuevaCarpeta(''), 'btn sm'), btn('Subir', 'i-upload', (ev) => menuSubir(ev.currentTarget, ''), 'btn sm'));
      tb.children[0].title = 'Nuevo archivo'; tb.children[0].setAttribute('aria-label', 'Nuevo archivo'); tb.children[1].title = 'Nueva carpeta'; tb.children[1].setAttribute('aria-label', 'Nueva carpeta');
      a.appendChild(tb);
    }
    const lista = el('ul', 'cd-ul'); a.appendChild(lista); const r = construye(); const { archivos } = vistaArch();
    if (!r.d.size && !r.f.length) lista.appendChild(el('li', 'cd-vacio k-muted', S.ver ? 'Versión vacía' : 'Proyecto vacío. Crea un archivo o sube los tuyos.'));
    const rec = (n, pref, nivel) => {
      [...n.d.keys()].sort((x, y) => x.localeCompare(y, 'es')).forEach(nom => {
        const ruta = pref + nom; const abierta = S.abiertas.has(ruta);
        const li = el('li', 'cd-fila'); li.style.setProperty('--n', nivel);
        const b = el('button', 'cd-nodo'); b.type = 'button'; b.append(el('span', 'cd-caret', abierta ? '▾' : '▸'), icon('i-folder'), el('span', 'cd-nom', nom));
        b.addEventListener('click', () => { abierta ? S.abiertas.delete(ruta) : S.abiertas.add(ruta); pintaArbol(); });
        li.appendChild(b); if (!S.ver) li.appendChild(menuFila(ruta, true)); lista.appendChild(li);
        if (abierta) rec(n.d.get(nom), ruta + '/', nivel + 1);
      });
      n.f.sort((x, y) => nombreDe(x).localeCompare(nombreDe(y), 'es')).forEach(ruta => {
        const li = el('li', 'cd-fila' + (S.ruta === ruta ? ' sel' : '')); li.style.setProperty('--n', nivel);
        const b = el('button', 'cd-nodo'); b.type = 'button'; b.append(el('span', 'cd-caret', ''), icon('i-doc'), el('span', 'cd-nom', nombreDe(ruta)), el('small', 'cd-sz k-faint', tam(archivos[ruta].t)));
        b.addEventListener('click', () => abreArchivo(ruta)); li.appendChild(b); if (!S.ver) li.appendChild(menuFila(ruta, false)); lista.appendChild(li);
      });
    };
    rec(r, '', 0);
  }
  function menuFila(ruta, carpeta) {
    const b = btn('', 'i-dots', () => {
      const it = [];
      if (carpeta) it.push({ label: 'Nuevo archivo aquí', icon: 'i-plus', onClick: () => nuevoArchivo(ruta) }, { label: 'Nueva carpeta aquí', icon: 'i-folder-plus', onClick: () => nuevaCarpeta(ruta) }, { label: 'Subir aquí…', icon: 'i-upload', onClick: () => menuSubir(b, ruta) });
      else {
        it.push({ label: 'Descargar', icon: 'i-download', onClick: () => bajar(url('/archivo?' + q({ ruta, descargar: 1 })), nombreDe(ruta)) });
        it.push({ label: 'Copiar o mover a Archivos…', icon: 'i-move', onClick: () => K.transferir.abre({ tipo: 'codigo', id: S.p.id, rutas: [ruta], vid: S.ver ? S.ver.id : undefined }, { carpeta: '', alTerminar: () => {} }) });
        if (/\.zip$/i.test(ruta)) it.push({ label: 'Descomprimir aquí', icon: 'i-archive', onClick: () => descomprimeArchivo(ruta) });
      }
      it.push({ label: 'Renombrar o mover', icon: 'i-move', onClick: () => mueve(ruta) }, '-', { label: 'Eliminar', icon: 'i-trash', danger: true, onClick: () => borra(ruta, carpeta) });
      K.menu(b, it);
    }, 'btn sm cd-mas'); b.setAttribute('aria-label', 'Acciones de ' + nombreDe(ruta)); return b;
  }
  // Descomprime un ZIP que ya está en el proyecto: lo lee, lo manda al mismo endpoint que la subida y deja el ZIP original
  function descomprimeArchivo(ruta) {
    const w = el('div', 'cd-form'); const l = el('label', 'bs-check'); const sr = el('input'); sr.type = 'checkbox'; sr.checked = true; l.append(sr, el('span', null, 'Quitar la carpeta raíz si todo viene dentro de una'));
    w.append(el('p', 'k-muted', `Se descomprimirá «${nombreDe(ruta)}» en la carpeta «${carpetaDe(ruta) || 'raíz del proyecto'}». El ZIP original se conserva.`), l);
    K.modal({ title: 'Descomprimir', content: w, actions: [{ label: 'Cancelar' }, { label: 'Descomprimir', primary: true, onClick: async () => {
      try {
        await guardaYa(); const r = await api(BASE + url('/archivo?' + q({ ruta })));
        if (!r.ok) throw new Error('No se pudo leer el ZIP');
        const f = new File([await r.blob()], nombreDe(ruta), { type: 'application/zip' });
        const carpeta = carpetaDe(ruta); const d = await subeZip(f, { descomprimir: true, sinRaiz: sr.checked, destino: carpeta });
        if (carpeta) S.abiertas.add(carpeta); S.p = d; pinta(); K.toast(`${d.anadidos} archivos descomprimidos`); logros();
      } catch (e) { K.fail(e); return false; }
    } }] });
  }
  const asigna = (d) => { S.p = d; if (S.ruta && !d.archivos[S.ruta]) { S.ruta = null; S.texto = ''; S.bin = null; S.movil = 'arbol'; } pinta(); };
  async function nuevoArchivo(base) {
    const r = await pide('Nuevo archivo', base ? base + '/' : '', 'Crear', 'Escribe la ruta, p. ej. css/estilos.css'); if (!r) return;
    try { await guardaYa(); const x = await K.put(url('/archivo'), { ruta: r, contenido: '' }); logros(); const d = await K.get(url('')); S.p = d; padresAbre(r); await abreArchivo(r.replace(/\\/g, '/').replace(/^\/+|(?<!\/)\/+$/g, '')); void x; } catch (e) { K.fail(e); }
  }
  const padresAbre = (r) => { const p = r.replace(/\\/g, '/').split('/').filter(Boolean); p.pop(); let a = ''; p.forEach(x => { a += (a ? '/' : '') + x; S.abiertas.add(a); }); };
  async function nuevaCarpeta(base) {
    const r = await pide('Nueva carpeta', base ? base + '/' : '', 'Crear'); if (!r) return;
    try { const d = await K.post(url('/carpeta'), { ruta: r }); padresAbre(r + '/x'); S.abiertas.add(r.replace(/\\/g, '/').replace(/^\/+|(?<!\/)\/+$/g, '')); asigna(d); } catch (e) { K.fail(e); }
  }
  async function mueve(ruta) {
    const n = await pide('Renombrar o mover', ruta, 'Mover', 'Cambia la ruta completa para moverlo a otra carpeta'); if (!n || n === ruta) return;
    try { await guardaYa(); const d = await K.post(url('/mover'), { desde: ruta, hacia: n }); if (S.ruta === ruta) S.ruta = n; else if (S.ruta && S.ruta.startsWith(ruta + '/')) S.ruta = n + S.ruta.slice(ruta.length); padresAbre(n + '/x'); S.p = d; pinta(); } catch (e) { K.fail(e); }
  }
  async function borra(ruta, carpeta) {
    if (!await K.confirm(carpeta ? `Se eliminará la carpeta «${ruta}» y todo lo que contiene.` : `Se eliminará «${ruta}».`, { ok: 'Eliminar', danger: true })) return;
    try { await guardaYa(); const d = await K.del(url('/ruta?' + q({ ruta }))); if (S.ruta === ruta || (S.ruta && S.ruta.startsWith(ruta + '/'))) { S.ruta = null; S.texto = ''; S.bin = null; S.movil = 'arbol'; } S.p = d; pinta(); logros(); } catch (e) { K.fail(e); }
  }
  async function abreArchivo(ruta) {
    if (!await guardaYa()) { K.toast('No se pudo guardar el archivo abierto: sigue aquí para no perder los cambios'); return; }
    try {
      const d = await K.get(url('/texto?' + q({ ruta, v: S.ver && S.ver.id })));
      S.ruta = ruta; S.bin = d.binario ? d : null; S.texto = d.binario ? '' : d.contenido; S.guardado = true; S.vistaPrev = false; S.movil = 'editor'; S.token = null; pinta();
    } catch (e) { K.fail(e); }
  }


  Object.assign(C, { vistaArch, pintaArchivos, construye, pintaArbol, menuFila, descomprimeArchivo, asigna, nuevoArchivo, padresAbre, nuevaCarpeta, mueve, borra, abreArchivo });
})();
