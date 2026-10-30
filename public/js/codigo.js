'use strict';
/* Código: proyectos tipo GitHub. Carpetas y archivos, subida de archivos y de ZIP (con descompresión), versiones con
   comparación y restauración, y vista web aislada (sin JavaScript). Cada proyecto es su propio JSON en el servidor
   y sus archivos se guardan por contenido (hash). El coloreado usa highlight.js (public/vendor/highlightjs). */
(function () {
  const root = document.getElementById('view-codigo');
  if (!root || !window.K) return;
  const S = { items: [], lim: null, q: '', fav: false, p: null, tab: 'archivos', ruta: null, texto: '', bin: null, abiertas: new Set(), ver: null,
    guardado: true, timer: null, movil: 'arbol', usoPrev: new Set(), built: false, ed: null, vistaPrev: false, token: null };
  const MAXB = 50 * 1024 * 1024;
  const EXT_LANG = { html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', markdown: 'markdown', py: 'python', php: 'php', sql: 'sql', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', java: 'java', cs: 'csharp', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', go: 'go', rs: 'rust', rb: 'ruby', kt: 'kotlin', swift: 'swift', ini: 'ini', conf: 'nginx' };
  const BARRA = [['⇥', '\t', 'Tabulador'], ['{', '{', ''], ['}', '}', ''], ['(', '(', ''], [')', ')', ''], ['[', '[', ''], [']', ']', ''], ['<', '<', ''], ['>', '>', ''], ['/', '/', ''], [';', ';', ''], ['=', '=', ''], ['"', '"', ''], ["'", "'", ''], ['`', '`', ''], ['$', '$', ''], ['#', '#', '']];
  const btn = (label, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (label) b.appendChild(el('span', null, label)); b.addEventListener('click', fn); return b; };
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ext = (r) => (r.includes('.') ? r.split('.').pop().toLowerCase() : '');
  const langDe = (r) => EXT_LANG[ext(r)] || '';
  const nombreDe = (r) => r.split('/').pop();
  const carpetaDe = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');
  const tam = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const fecha = (t) => new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  const url = (s) => `/api/codigo/${S.p.id}${s}`;
  const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const accion = (tipo) => { K.post('/api/codigo/accion', { tipo }).then(() => logros()).catch(() => {}); };
  function colorea(codigo, lang) {
    try { if (window.hljs && lang && codigo.length < 200000 && hljs.getLanguage(lang)) return hljs.highlight(codigo, { language: lang, ignoreIllegals: true }).value; } catch { /* sin coloreado */ }
    return esc(codigo);
  }
  const pide = (title, valor, ok, sub) => new Promise((res) => {
    const i = el('input'); i.value = valor || ''; i.maxLength = 240; i.style.width = '100%'; i.setAttribute('aria-label', title); let fin = false;
    const h = K.modal({ title, sub, content: i, actions: [{ label: 'Cancelar' }, { label: ok || 'Aceptar', primary: true, onClick: () => { fin = true; res(i.value.trim()); } }], onClose: () => { if (!fin) res(null); } });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fin = true; res(i.value.trim()); h.close(); } });
    setTimeout(() => { i.focus(); i.select(); }, 60);
  });
  async function bajar(ruta, nombre) {
    try {
      const r = await api(BASE + ruta); if (!r.ok) { let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ } throw new Error(j.error || 'No se pudo descargar'); }
      const u = URL.createObjectURL(await r.blob()); const a = el('a'); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
    } catch (e) { K.fail(e); }
  }

  /* ---------- Lista de proyectos ---------- */
  async function carga() {
    try { const d = await K.get('/api/codigo'); S.items = d.items; S.lim = d.limites; S.built = true; pinta(); } catch (e) { K.fail(e); }
  }
  function pinta() {
    if (!S.built) return; root.textContent = '';
    const page = el('section', 'cd-page'); root.appendChild(page);
    if (S.p) pintaProyecto(page); else pintaLista(page);
  }
  function pintaLista(page) {
    const head = el('header', 'cd-head'); const t = el('div'); t.append(el('h1', null, 'Código'), el('p', 'k-muted', 'Proyectos con carpetas, archivos, versiones y vista web'));
    const acc = el('div', 'cd-acc'); acc.append(btn('Subir ZIP', 'i-zip', zipNuevo), btn('Nuevo proyecto', 'i-plus', nuevo, 'btn primary')); head.append(t, acc); page.appendChild(head);
    const bar = el('div', 'cd-bar2');
    const s = el('label', 'search cd-search'); s.appendChild(icon('i-search')); const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Buscar proyecto…'; inp.value = S.q; inp.setAttribute('aria-label', 'Buscar');
    inp.addEventListener('input', K.debounce(() => { S.q = inp.value; pintaTarjetas(); }, 150)); s.appendChild(inp); bar.appendChild(s);
    const fv = el('button', 'btn cd-favbtn' + (S.fav ? ' on' : ''), '★ Favoritos'); fv.type = 'button'; fv.addEventListener('click', () => { S.fav = !S.fav; fv.classList.toggle('on', S.fav); pintaTarjetas(); }); bar.appendChild(fv);
    page.appendChild(bar);
    const g = el('div', 'cd-grid'); g.id = 'cd-grid'; page.appendChild(g); pintaTarjetas();
  }
  function pintaTarjetas() {
    const g = root.querySelector('#cd-grid'); if (!g) return; g.textContent = '';
    const b = S.q.toLocaleLowerCase('es');
    const l = S.items.filter(i => (!S.fav || i.favorito) && (!b || (i.nombre + ' ' + i.descripcion + ' ' + i.etiquetas.join(' ')).toLocaleLowerCase('es').includes(b)));
    if (!l.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', '</>'), el('p', 'k-muted', S.items.length ? 'Ningún proyecto coincide.' : 'Aún no tienes proyectos. Crea uno o sube un ZIP con tu web.')); g.appendChild(e); return; }
    l.forEach(i => {
      const c = el('article', 'cd-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
      const h = el('header'); h.append(el('strong', null, (i.favorito ? '★ ' : '') + i.nombre)); c.appendChild(h);
      if (i.descripcion) c.appendChild(el('p', 'cd-desc k-muted', i.descripcion));
      const ch = el('div', 'cd-chips'); i.langs.forEach(x => ch.appendChild(el('span', 'cd-lang', x))); c.appendChild(ch);
      const f = el('footer'); f.append(el('small', 'k-muted', `${i.nArchivos} archivo${i.nArchivos === 1 ? '' : 's'} · ${i.nVersiones} versión${i.nVersiones === 1 ? '' : 'es'} · ${tam(i.tam)}`), el('small', 'k-faint', fecha(i.actualizado))); c.appendChild(f);
      const go = () => abre(i.id); c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); g.appendChild(c);
    });
  }
  function nuevo() {
    const w = el('div', 'cd-form');
    const n = el('input'); n.placeholder = 'Nombre del proyecto'; n.maxLength = 120; n.setAttribute('aria-label', 'Nombre');
    const d = el('input'); d.placeholder = 'Descripción (opcional)'; d.maxLength = 300; d.setAttribute('aria-label', 'Descripción');
    let plan = 'web'; const pl = el('div', 'cd-plantillas');
    [['web', 'Web básica', 'index.html, CSS y JS'], ['vacio', 'Vacío', 'Solo un README'], ['ninguna', 'Sin archivos', 'Para subir los tuyos']].forEach(([k, a, b]) => {
      const x = el('button', 'cd-plantilla' + (k === plan ? ' on' : '')); x.type = 'button'; x.append(el('strong', null, a), el('small', 'k-muted', b));
      x.addEventListener('click', () => { plan = k; pl.querySelectorAll('.cd-plantilla').forEach(y => y.classList.toggle('on', y === x)); }); pl.appendChild(x);
    });
    w.append(n, d, pl);
    K.modal({ title: 'Nuevo proyecto', content: w, actions: [{ label: 'Cancelar' }, { label: 'Crear', primary: true, onClick: async () => {
      try { S.p = await K.post('/api/codigo', { nombre: n.value, descripcion: d.value, plantilla: plan }); entra(); logros(); } catch (e) { K.fail(e); return false; }
    } }] });
    setTimeout(() => n.focus(), 60);
  }
  function zipNuevo() {
    const f = el('input'); f.type = 'file'; f.accept = '.zip,application/zip'; f.addEventListener('change', async () => {
      const z = f.files[0]; if (!z) return;
      try {
        S.p = await K.post('/api/codigo', { nombre: z.name.replace(/\.zip$/i, '') || 'Proyecto', plantilla: 'ninguna' });
        const r = await subeZip(z, { descomprimir: true, sinRaiz: true, destino: '' });
        entra(); K.toast(`${r.anadidos} archivos importados`); logros();
      } catch (e) { K.fail(e); if (S.p) { try { await K.del('/api/codigo/' + S.p.id); } catch { /* ya no existe */ } S.p = null; } carga(); }
    }); f.click();
  }
  async function abre(id) { try { S.p = await K.get('/api/codigo/' + id); entra(); } catch (e) { K.fail(e); } }
  function entra() { S.tab = 'archivos'; S.ruta = null; S.ver = null; S.texto = ''; S.bin = null; S.abiertas = new Set(); S.guardado = true; S.movil = 'arbol'; S.vistaPrev = false; S.token = null; pinta(); }
  async function cierra() { await guardaYa(); S.p = null; clearTimeout(S.timer); await carga(); }

  /* ---------- Proyecto ---------- */
  function pintaProyecto(page) {
    const p = S.p;
    const head = el('header', 'cd-edhead');
    const back = btn('Código', null, cierra, 'btn sm'); back.prepend(el('span', null, '← '));
    const tit = el('button', 'cd-nombre'); tit.type = 'button'; tit.textContent = (p.favorito ? '★ ' : '') + p.nombre; tit.title = 'Editar nombre y descripción'; tit.addEventListener('click', datos);
    const acc = el('div', 'cd-acc');
    acc.append(btn('Exportar ZIP', 'i-zip', async () => { await guardaYa(); bajar(url('/zip'), nombreZip()); }, 'btn sm'), btn('Guardar versión', 'i-archive', guardaVersion, 'btn primary sm'));
    const mas = btn('', 'i-dots', () => K.menu(mas, [
      { label: p.favorito ? 'Quitar de favoritos' : 'Marcar como favorito', icon: 'i-star', onClick: async () => { try { S.p = await K.put(url(''), { favorito: !p.favorito }); pinta(); } catch (e) { K.fail(e); } } },
      { label: 'Editar nombre y descripción', icon: 'i-pencil', onClick: datos },
      { label: 'Descargar como ZIP', icon: 'i-download', onClick: async () => { await guardaYa(); bajar(url('/zip'), nombreZip()); } },
      { label: 'Copiar o mover a Archivos…', icon: 'i-move', onClick: () => K.transferir.abre({ tipo: 'codigo', id: p.id, vid: S.ver ? S.ver.id : undefined }, { carpeta: '', alTerminar: () => { S.built && carga(); } }) },
      { label: 'Historial de envíos…', icon: 'i-restore', onClick: () => K.transferir.historial(() => { if (S.p) abre(S.p.id); }) },
      '-', { label: 'Eliminar proyecto', icon: 'i-trash', danger: true, onClick: elimina }]), 'btn sm'); mas.setAttribute('aria-label', 'Más acciones'); acc.appendChild(mas);
    head.append(back, tit, acc); page.appendChild(head);
    const cuota = el('div', 'cd-cuota'); const pct = Math.min(100, Math.round(p.almacen / MAXB * 100));
    const barra = el('div', 'cd-barra'); const rell = el('i'); rell.style.width = pct + '%'; if (pct > 85) rell.classList.add('alto'); barra.appendChild(rell);
    cuota.append(barra, el('small', 'k-muted', `${tam(p.almacen)} de 50 MB (incluye versiones) · ${p.nArchivos}/${p.limites.archivos} archivos · ${p.nVersiones}/${p.limites.versiones} versiones`));
    page.appendChild(cuota);
    const tabs = el('div', 'cd-tabs2');
    [['archivos', 'Archivos'], ['versiones', `Versiones (${p.nVersiones})`], ['web', 'Vista web']].forEach(([k, n]) => { const b = el('button', S.tab === k ? 'is-active' : '', n); b.type = 'button'; b.addEventListener('click', async () => { await guardaYa(); S.tab = k; pinta(); }); tabs.appendChild(b); });
    page.appendChild(tabs);
    const cont = el('div', 'cd-contenido'); page.appendChild(cont);
    if (S.tab === 'archivos') pintaArchivos(cont); else if (S.tab === 'versiones') pintaVersiones(cont); else pintaWeb(cont);
  }
  const nombreZip = () => (S.p.nombre.replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '-') || 'proyecto') + '.zip';
  function datos() {
    const w = el('div', 'cd-form'); const n = el('input'); n.value = S.p.nombre; n.maxLength = 120; n.setAttribute('aria-label', 'Nombre');
    const d = el('input'); d.value = S.p.descripcion; d.maxLength = 300; d.placeholder = 'Descripción'; d.setAttribute('aria-label', 'Descripción');
    const e = el('input'); e.value = (S.p.etiquetas || []).join(', '); e.placeholder = 'etiquetas, separadas por comas'; e.setAttribute('aria-label', 'Etiquetas'); w.append(n, d, e);
    K.modal({ title: 'Proyecto', content: w, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { S.p = await K.put(url(''), { nombre: n.value, descripcion: d.value, etiquetas: e.value.split(',') }); pinta(); } catch (er) { K.fail(er); return false; } } }] });
  }
  async function elimina() {
    if (!await K.confirm(`Se eliminará «${S.p.nombre}» con todos sus archivos y versiones.`, { ok: 'Eliminar', danger: true })) return;
    try { await K.del(url('')); clearTimeout(S.timer); S.guardado = true; S.p = null; await carga(); logros(); } catch (e) { K.fail(e); }
  }

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
    try { await guardaYa(); const x = await K.put(url('/archivo'), { ruta: r, contenido: '' }); logros(); const d = await K.get(url('')); S.p = d; padresAbre(r); await abreArchivo(r.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')); void x; } catch (e) { K.fail(e); }
  }
  const padresAbre = (r) => { const p = r.replace(/\\/g, '/').split('/').filter(Boolean); p.pop(); let a = ''; p.forEach(x => { a += (a ? '/' : '') + x; S.abiertas.add(a); }); };
  async function nuevaCarpeta(base) {
    const r = await pide('Nueva carpeta', base ? base + '/' : '', 'Crear'); if (!r) return;
    try { const d = await K.post(url('/carpeta'), { ruta: r }); padresAbre(r + '/x'); S.abiertas.add(r.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')); asigna(d); } catch (e) { K.fail(e); }
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
    await guardaYa();
    try {
      const d = await K.get(url('/texto?' + q({ ruta, v: S.ver && S.ver.id })));
      S.ruta = ruta; S.bin = d.binario ? d : null; S.texto = d.binario ? '' : d.contenido; S.guardado = true; S.vistaPrev = false; S.movil = 'editor'; S.token = null; pinta();
    } catch (e) { K.fail(e); }
  }

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
      try { const t = await token(); const fr = el('iframe', 'cd-frame'); fr.setAttribute('sandbox', ''); fr.title = 'Vista previa'; fr.src = `${BASE}/api/codigo-vista/${t}/${ruta.split('/').map(encodeURIComponent).join('/')}`; pv.appendChild(fr);
        pv.appendChild(el('small', 'k-faint cd-nota', 'Vista aislada: se ven HTML, CSS e imágenes del proyecto; los scripts no se ejecutan.')); } catch (e) { K.fail(e); }
    } else if (ext(ruta) === 'svg') {
      const img = el('img', 'cd-svg'); img.alt = 'Vista previa SVG'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.texto); pv.appendChild(img);
    } else if (lang === 'json') {
      try { const o = JSON.parse(S.texto); const pre = el('pre', 'cd-json hljs'); const co = el('code'); co.innerHTML = colorea(JSON.stringify(o, null, 2), 'json'); pre.appendChild(co); pv.append(el('p', 'cd-ok', '✔ JSON válido'), pre); }
      catch (e) { pv.appendChild(el('p', 'cd-err', '✖ ' + e.message)); }
    } else { const d = el('div', 'cd-md'); d.innerHTML = markdown(S.texto); pv.appendChild(d); }
  }
  async function token() { if (!S.token || S.token.v !== (S.ver ? S.ver.id : '')) { const v = S.ver ? S.ver.id : ''; const r = await K.post(url('/vista'), { v }); S.token = { v, t: r.token }; } return S.token.t; }
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
    clearTimeout(S.timer); if (!S.p || !S.ruta || S.guardado || S.ver) return; const ruta = S.ruta, texto = S.texto, id = S.p.id;
    try {
      const r = await K.put(`/api/codigo/${id}/archivo`, { ruta, contenido: texto });
      if (S.p && S.p.id === id && S.p.archivos[ruta]) { S.p.archivos[ruta] = { t: r.archivo[1], l: r.archivo[2], texto: true }; if (S.ruta === ruta && S.texto === texto) marca(true); const sz = root.querySelector('.cd-fila.sel .cd-sz'); if (sz) sz.textContent = tam(r.archivo[1]); }
      logros();
    } catch (e) { K.fail(e); }
  }

  /* ---------- Subidas ---------- */
  function menuSubir(anchor, base) {
    const elige = (carpeta) => {
      const f = el('input'); f.type = 'file'; f.multiple = true; if (carpeta) { f.webkitdirectory = true; }
      f.addEventListener('change', () => { const fs = [...f.files]; if (fs.length) sube(fs, base); }); f.click();
    };
    K.menu(anchor, [{ label: 'Archivos…', icon: 'i-upload', onClick: () => elige(false) }, { label: 'Carpeta completa…', icon: 'i-folder', onClick: () => elige(true) },
      { label: 'ZIP o web comprimida…', icon: 'i-zip', onClick: () => zipEn(base) }]);
  }
  function xhr(ruta, fd, progreso) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', BASE + ruta); x.withCredentials = true; try { x.setRequestHeader('X-KCC-Client', CID); } catch { /* sin id */ }
      x.upload.onprogress = (e) => { if (e.lengthComputable && progreso) progreso(Math.round(e.loaded / e.total * 100)); };
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* sin cuerpo */ } x.status >= 200 && x.status < 300 ? resolve(j) : reject(new Error(j.error || `Error ${x.status}`)); };
      x.onerror = () => reject(new Error('Error de conexión')); x.send(fd);
    });
  }
  async function sube(fs, base) {
    const total = fs.reduce((n, f) => n + f.size, 0); if (total > MAXB) return K.fail(new Error('Lo que subes supera los 50 MB'));
    if (fs.some(f => f.size > 10 * 1024 * 1024)) return K.fail(new Error('Un archivo supera los 10 MB'));
    try {
      await guardaYa(); const fd = new FormData(); fd.append('base', base || ''); fd.append('rutas', JSON.stringify(fs.map(f => f.webkitRelativePath || f.name)));
      fs.forEach(f => fd.append('f', f, f.name)); K.toast(`Subiendo ${fs.length} archivo${fs.length === 1 ? '' : 's'}…`);
      const d = await xhr(url('/subir'), fd); if (base) S.abiertas.add(base); fs.forEach(f => padresAbre((base ? base + '/' : '') + (f.webkitRelativePath || f.name))); asigna(d); K.toast('Subida completada'); logros();
    } catch (e) { K.fail(e); }
  }
  async function subeZip(z, o) {
    if (z.size > MAXB) throw new Error('El ZIP supera los 50 MB');
    const fd = new FormData(); fd.append('destino', o.destino || ''); fd.append('descomprimir', o.descomprimir ? '1' : '0'); fd.append('sinRaiz', o.sinRaiz ? '1' : '0'); fd.append('z', z, z.name);
    const d = await xhr(url('/zip'), fd); S.p = d; return d;
  }
  function zipEn(base) {
    const f = el('input'); f.type = 'file'; f.accept = '.zip,application/zip';
    f.addEventListener('change', () => {
      const z = f.files[0]; if (!z) return; const w = el('div', 'cd-form'); let modo = 'des';
      const ops = el('div', 'bs-checks');
      [['des', 'Descomprimir dentro del proyecto' + (base ? ` (en «${base}»)` : '')], ['tal', 'Guardar el ZIP tal cual']].forEach(([k, n]) => { const l = el('label', 'bs-check'); const r = el('input'); r.type = 'radio'; r.name = 'cd-zip'; r.checked = k === modo; r.addEventListener('change', () => { modo = k; sr.disabled = k !== 'des'; }); l.append(r, el('span', null, n)); ops.appendChild(l); });
      const l2 = el('label', 'bs-check'); const sr = el('input'); sr.type = 'checkbox'; sr.checked = true; l2.append(sr, el('span', null, 'Quitar la carpeta raíz si todo viene dentro de una'));
      w.append(el('p', 'k-muted', `${z.name} · ${tam(z.size)}`), ops, l2, el('small', 'k-faint', 'Se rechazan rutas peligrosas; máximo 1000 archivos, 10 MB por archivo y 50 MB en total.'));
      K.modal({ title: 'Subir ZIP', content: w, actions: [{ label: 'Cancelar' }, { label: 'Subir', primary: true, onClick: async () => {
        try { await guardaYa(); const d = await subeZip(z, { descomprimir: modo === 'des', sinRaiz: sr.checked, destino: base }); if (base) S.abiertas.add(base); asigna(d); K.toast(modo === 'des' ? `${d.anadidos} archivos descomprimidos` : 'ZIP guardado'); logros(); } catch (e) { K.fail(e); return false; } } }] });
    }); f.click();
  }

  /* ---------- Versiones ---------- */
  async function guardaVersion() {
    await guardaYa(); const m = await pide('Guardar versión', '', 'Guardar', 'Una foto de todo el proyecto ahora mismo. Añade un mensaje que la describa.'); if (m === null) return;
    try { S.p = await K.post(url('/versiones'), { mensaje: m }); S.tab = 'versiones'; pinta(); K.toast('Versión guardada'); logros(); } catch (e) { K.fail(e); }
  }
  function pintaVersiones(cont) {
    const p = S.p;
    if (!p.versiones.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', 'v1'), el('p', 'k-muted', 'Aún no hay versiones. Guarda una versión cuando algo funcione para poder volver a ella.'), btn('Guardar versión', 'i-archive', guardaVersion, 'btn primary')); cont.appendChild(e); return; }
    const ul = el('ul', 'cd-vers');
    p.versiones.forEach((v, i) => {
      const li = el('li', 'cd-ver'); const t = el('div', 'cd-ver-t'); t.append(el('span', 'cd-vn', 'v' + v.n), el('strong', null, v.mensaje + (i === 0 ? '  · última' : '')), el('small', 'k-muted', `${fecha(v.fecha)} · ${v.nArchivos} archivo${v.nArchivos === 1 ? '' : 's'} · ${tam(v.tam)}`));
      const a = el('div', 'cd-ver-a');
      a.append(btn('Ver', null, () => verVersion(v.id), 'btn sm'), btn('Comparar', null, () => comparar(v.id), 'btn sm'), btn('Restaurar', 'i-restore', () => restaura(v.id, v.n), 'btn sm'));
      const mas = btn('', 'i-dots', () => K.menu(mas, [{ label: 'Descargar ZIP', icon: 'i-download', onClick: () => bajar(url('/zip?' + q({ v: v.id })), nombreZip().replace(/\.zip$/, `-v${v.n}.zip`)) },
        { label: 'Vista web de esta versión', icon: 'i-globe', onClick: () => { S.webVer = v.id; S.tab = 'web'; pinta(); } }, '-',
        { label: 'Eliminar versión', icon: 'i-trash', danger: true, onClick: () => borraVersion(v) }]), 'btn sm'); mas.setAttribute('aria-label', 'Más acciones'); a.appendChild(mas);
      li.append(t, a); ul.appendChild(li);
    });
    cont.appendChild(ul);
  }
  async function verVersion(vid) {
    try { const d = await K.get(url('/versiones/' + vid)); S.ver = { id: d.id, n: d.n, mensaje: d.mensaje, archivos: d.archivos, carpetas: d.carpetas }; S.tab = 'archivos'; S.ruta = null; S.movil = 'arbol'; S.abiertas = new Set(); S.token = null; pinta(); } catch (e) { K.fail(e); }
  }
  async function restaura(vid, n) {
    if (!await K.confirm(`El proyecto volverá a como estaba en la versión ${n}. Si tienes cambios sin guardar como versión, se guardan antes automáticamente.`, { ok: 'Restaurar', title: 'Restaurar versión' })) return;
    try { await guardaYa(); S.p = await K.post(url(`/versiones/${vid}/restaurar`), {}); S.ver = null; S.ruta = null; S.token = null; S.tab = 'archivos'; S.movil = 'arbol'; pinta(); K.toast(`Restaurada la versión ${n}`); logros(); } catch (e) { K.fail(e); }
  }
  async function borraVersion(v) {
    if (!await K.confirm(`Se eliminará la versión ${v.n} («${v.mensaje}»). No afecta a tus archivos actuales.`, { ok: 'Eliminar', danger: true })) return;
    try { S.p = await K.del(url('/versiones/' + v.id)); if (S.ver && S.ver.id === v.id) S.ver = null; pinta(); logros(); } catch (e) { K.fail(e); }
  }
  function diffLineas(a, b) {
    const n = a.length, m = b.length; let s = 0; while (s < n && s < m && a[s] === b[s]) s++;
    let e = 0; while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
    const A = a.slice(s, n - e), B = b.slice(s, m - e); if (A.length * B.length > 4e6) return null;
    const L = A.length, M = B.length; const dp = Array.from({ length: L + 1 }, () => new Uint32Array(M + 1));
    for (let i = L - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; for (let i = 0; i < s; i++) out.push([' ', a[i]]);
    let i = 0, j = 0; while (i < L && j < M) { if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', A[i++]]); else out.push(['+', B[j++]]); }
    while (i < L) out.push(['-', A[i++]]); while (j < M) out.push(['+', B[j++]]);
    for (let k = n - e; k < n; k++) out.push([' ', a[k]]); return out;
  }
  async function comparar(vid) {
    try {
      const d = await K.get(url('/versiones/' + vid)); const v = d.archivos, a = d.actual; const cam = [];
      new Set([...Object.keys(v), ...Object.keys(a)]).forEach(r => { if (!v[r]) cam.push([r, 'nuevo']); else if (!a[r]) cam.push([r, 'borrado']); else if (v[r].h !== a[r].h) cam.push([r, 'cambiado']); });
      cam.sort((x, y) => x[0].localeCompare(y[0], 'es'));
      const w = el('div', 'cd-cmp'); w.appendChild(el('p', 'k-muted', `Versión ${d.n} → trabajo actual: ${cam.length ? cam.length + ' archivo' + (cam.length === 1 ? '' : 's') + ' con diferencias' : 'sin diferencias'}`));
      const det = el('div', 'cd-diff'); const ul = el('ul', 'cd-cl');
      cam.forEach(([r, st]) => { const li = el('li'); const b = el('button', 'cd-cb'); b.type = 'button'; b.append(el('span', 'cd-st ' + st, st === 'nuevo' ? 'nuevo' : st === 'borrado' ? 'eliminado' : 'modificado'), el('span', null, r));
        b.addEventListener('click', () => muestraDiff(det, r, st, vid)); li.appendChild(b); ul.appendChild(li); });
      w.append(ul, det); K.modal({ title: `Comparar con la v${d.n}`, content: w, cls: 'wide', actions: [{ label: 'Cerrar' }] });
    } catch (e) { K.fail(e); }
  }
  async function muestraDiff(cont, ruta, st, vid) {
    cont.textContent = '';
    try {
      const ant = st === 'nuevo' ? { binario: false, contenido: '' } : await K.get(url('/texto?' + q({ ruta, v: vid })));
      const act = st === 'borrado' ? { binario: false, contenido: '' } : await K.get(url('/texto?' + q({ ruta })));
      if (ant.binario || act.binario) { cont.appendChild(el('p', 'k-muted', 'Archivo binario: no se muestran las diferencias de líneas.')); return; }
      const r = diffLineas(ant.contenido ? ant.contenido.split('\n') : [], act.contenido ? act.contenido.split('\n') : []);
      if (!r) { cont.appendChild(el('p', 'k-muted', 'El archivo es demasiado grande para compararlo línea a línea.')); return; }
      const mostrar = new Array(r.length).fill(false); r.forEach((x, i) => { if (x[0] !== ' ') for (let k = Math.max(0, i - 3); k <= Math.min(r.length - 1, i + 3); k++) mostrar[k] = true; });
      const pre = el('div', 'cd-dl'); let oculto = false;
      r.forEach((x, i) => { if (!mostrar[i]) { if (!oculto) { pre.appendChild(el('div', 'cd-dl-sep', '⋯')); oculto = true; } return; } oculto = false; const l = el('div', 'cd-dl-l ' + (x[0] === '+' ? 'mas' : x[0] === '-' ? 'menos' : '')); l.append(el('span', 'cd-dl-s', x[0] === ' ' ? '' : x[0]), el('code', null, x[1] || ' ')); pre.appendChild(l); });
      cont.appendChild(pre);
    } catch (e) { cont.appendChild(el('p', 'cd-err', e.message)); }
  }

  /* ---------- Vista web ---------- */
  async function pintaWeb(cont) {
    const p = S.p; const htmls = Object.keys(p.archivos).filter(r => /\.html?$/i.test(r)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b, 'es')));
    if (!htmls.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', '🌐'), el('p', 'k-muted', 'Este proyecto no tiene archivos HTML. Añade un index.html o sube tu web en un ZIP.')); cont.appendChild(e); return; }
    const bar = el('div', 'cd-webbar'); const sa = el('select'); sa.setAttribute('aria-label', 'Página'); htmls.forEach(r => { const o = el('option', null, r); o.value = r; sa.appendChild(o); });
    const sv = el('select'); sv.setAttribute('aria-label', 'Versión'); const o0 = el('option', null, 'Trabajo actual'); o0.value = ''; sv.appendChild(o0); p.versiones.forEach(v => { const o = el('option', null, `v${v.n} · ${v.mensaje}`); o.value = v.id; sv.appendChild(o); }); sv.value = S.webVer && p.versiones.some(v => v.id === S.webVer) ? S.webVer : '';
    const marco = el('div', 'cd-webmarco'); const nota = el('small', 'k-faint cd-nota', 'Vista aislada: se ven HTML, CSS, imágenes y fuentes; los scripts de la web no se ejecutan y los enlaces no navegan.');
    const carga2 = async () => {
      marco.textContent = ''; S.webVer = sv.value;
      try {
        if (S.webVer === '') await guardaYa();
        const r = await K.post(url('/vista'), { v: sv.value }); const fr = el('iframe', 'cd-frame grande'); fr.setAttribute('sandbox', ''); fr.title = 'Vista web';
        const lista = sv.value ? await K.get(url('/versiones/' + sv.value)).then(d => Object.keys(d.archivos)) : htmls; const pag = lista.includes(sa.value) ? sa.value : (lista.find(x => /\.html?$/i.test(x)) || sa.value);
        fr.src = `${BASE}/api/codigo-vista/${r.token}/${pag.split('/').map(encodeURIComponent).join('/')}`; marco.appendChild(fr); accionPrev();
      } catch (e) { marco.appendChild(el('p', 'cd-err', e.message)); }
    };
    sa.addEventListener('change', carga2); sv.addEventListener('change', carga2);
    bar.append(sa, sv, btn('Recargar', 'i-refresh', carga2, 'btn sm')); cont.append(bar, marco, nota); carga2();
  }

  // Markdown básico y seguro: todo se escapa antes de dar formato
  function markdown(src) {
    const lines = src.replace(/\r/g, '').split('\n'); let out = '', lista = null, en = false, buf = [], lang = '';
    const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`);
    const cierra2 = () => { if (lista) { out += `</${lista}>`; lista = null; } };
    for (const ln of lines) {
      const f = /^```(\w*)/.exec(ln);
      if (f) { if (!en) { cierra2(); en = true; buf = []; lang = f[1]; } else { out += `<pre class="hljs"><code>${colorea(buf.join('\n'), lang)}</code></pre>`; en = false; } continue; }
      if (en) { buf.push(ln); continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) { cierra2(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = /^\s*[-*+]\s+(.*)$/.exec(ln))) { if (lista !== 'ul') { cierra2(); out += '<ul>'; lista = 'ul'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { if (lista !== 'ol') { cierra2(); out += '<ol>'; lista = 'ol'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = /^>\s?(.*)$/.exec(ln))) { cierra2(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
      else if (/^---+$/.test(ln.trim())) { cierra2(); out += '<hr>'; }
      else if (!ln.trim()) cierra2();
      else { cierra2(); out += `<p>${inl(ln)}</p>`; }
    }
    if (en) out += `<pre class="hljs"><code>${esc(buf.join('\n'))}</code></pre>`;
    cierra2(); return out;
  }

  K.registerView('codigo', { open() { if (S.p) pinta(); else carga(); }, close() { guardaYa(); } });
})();
