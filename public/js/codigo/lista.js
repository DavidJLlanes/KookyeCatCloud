'use strict';
/* codigo/lista.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { S, logros, root } = C;
  const btn = (...a) => C.btn(...a);
  const fecha = (...a) => C.fecha(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const langDe = (...a) => C.langDe(...a);
  const pintaProyecto = (...a) => C.pintaProyecto(...a);
  const q = (...a) => C.q(...a);
  const subeZip = (...a) => C.subeZip(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);
  const vistaArch = (...a) => C.vistaArch(...a);

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
    if (S.etiqueta) { const c = el('span', 'k-chip', 'Etiqueta: ' + S.etiqueta); const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar filtro'); x.addEventListener('click', () => { S.etiqueta = ''; pinta(); }); c.appendChild(x); bar.appendChild(c); }
    page.appendChild(bar);
    const g = el('div', 'cd-grid'); g.id = 'cd-grid'; page.appendChild(g); pintaTarjetas();
  }
  function pintaTarjetas() {
    const g = root.querySelector('#cd-grid'); if (!g) return; g.textContent = '';
    const b = S.q.toLocaleLowerCase('es');
    const l = S.items.filter(i => (!S.fav || i.favorito) && (!S.etiqueta || i.etiquetas.some(t => K.valores.clave(t) === K.valores.clave(S.etiqueta))) && (!b || (i.nombre + ' ' + i.descripcion + ' ' + i.etiquetas.join(' ')).toLocaleLowerCase('es').includes(b)));
    if (!l.length) { const e = el('div', 'cd-empty'); e.append(el('div', 'cd-empty-i', '</>'), el('p', 'k-muted', S.items.length ? 'Ningún proyecto coincide.' : 'Aún no tienes proyectos. Crea uno o sube un ZIP con tu web.')); g.appendChild(e); return; }
    l.forEach(i => {
      const c = el('article', 'cd-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
      const h = el('header'); h.append(el('strong', null, (i.favorito ? '★ ' : '') + i.nombre)); c.appendChild(h);
      if (i.descripcion) c.appendChild(el('p', 'cd-desc k-muted', i.descripcion));
      const ch = el('div', 'cd-chips'); i.langs.forEach(x => ch.appendChild(el('span', 'cd-lang', x))); (i.etiquetas || []).forEach(x => ch.appendChild(K.chipValor('codigo.etiquetas', x))); c.appendChild(ch);
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
  function entra() { S.js = false; S.tab = 'archivos'; S.ruta = null; S.ver = null; S.texto = ''; S.bin = null; S.abiertas = new Set(); S.guardado = true; S.movil = 'arbol'; S.vistaPrev = false; S.token = null; pinta(); }
  async function cierra() { if (!await guardaYa()) { K.toast('No se pudo guardar el archivo abierto: sigue aquí para no perder los cambios'); return; } S.p = null; clearTimeout(S.timer); await carga(); }

  // Proyecto como documento: descripción, árbol de archivos y el código de cada archivo de texto (tope para no desbordar)
  async function proyectoMd() {
    await guardaYa();
    const p = S.p, v = vistaArch(), rutas = Object.keys(v.archivos).sort((a, b) => a.localeCompare(b, 'es'));
    const L = [`# ${p.nombre}`]; if (p.descripcion) L.push('', p.descripcion);
    L.push('', '## Archivos', '', ...rutas.map(r => `- ${r}`));
    let total = 0, omitidos = 0;
    for (const r of rutas) {
      if (!v.archivos[r].texto || total > 600000) { if (v.archivos[r].texto) omitidos++; continue; }
      let d; try { d = await K.get(url('/texto?' + q({ ruta: r, v: S.ver && S.ver.id }))); } catch { continue; }
      if (d.binario) continue;
      total += d.contenido.length;
      let cerca = '```'; while (d.contenido.includes(cerca)) cerca += '`';
      L.push('', `## ${r}`, '', cerca + langDe(r), d.contenido.replace(/\n$/, ''), cerca);
    }
    if (omitidos) L.push('', `> ${omitidos} archivo${omitidos === 1 ? '' : 's'} de texto no se ${omitidos === 1 ? 'incluye' : 'incluyen'} por el tamaño del documento.`);
    return L.join('\n') + '\n';
  }


  Object.assign(C, { carga, pinta, pintaLista, pintaTarjetas, nuevo, zipNuevo, abre, entra, cierra, proyectoMd });
})();
