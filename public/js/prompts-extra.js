'use strict';
/* Prompts: crear desde imágenes de ComfyUI / Automatic1111, comparar versiones y estadísticas.
   Se engancha a prompts.js a través de K.prompts (menú "⋯" y bloque Historial del detalle). */
(function () {
  if (!window.K || !K.prompts) return;
  const STATUS = { borrador: 'Borrador', probando: 'Probando', final: 'Final', archivado: 'Archivado' };
  const num = (n) => Number(n || 0).toLocaleString('es-ES');
  const mb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  /* ---------- Crear prompts desde imágenes ---------- */
  function desdeImagenes() {
    const w = el('div');
    const p = el('p', 'k-muted', 'Elige imágenes generadas por ComfyUI, Automatic1111 / Forge u otras herramientas compatibles. Se leen los metadatos disponibles y se crea un prompt por imagen con su texto, negativo, modelo, semilla, pasos, LoRA… y la imagen como muestra.');
    p.style.cssText = 'font-size:13.5px;margin:0 0 12px';
    const fi = el('input'); fi.type = 'file'; fi.multiple = true; fi.accept = 'image/*';
    const f1 = el('label', 'field'); f1.append(el('span', null, 'Imágenes (hasta 20 a la vez)'), fi);
    const nota = el('p', 'k-faint', 'Los metadatos dependen de la herramienta y del formato. Si una red social o un editor los eliminó, se importará la imagen solo si conserva datos compatibles.');
    nota.style.cssText = 'font-size:12.5px;margin:8px 0 0';
    w.append(p, f1, nota);
    K.modal({ title: 'Crear prompts desde imágenes', content: w, actions: [{ label: 'Cancelar' }, { label: 'Importar', primary: true, onClick: async () => {
      const files = [...fi.files];
      if (!files.length) { K.toast('Elige al menos una imagen'); return false; }
      if (files.length > 20) { K.toast('Máximo 20 imágenes por vez'); return false; }
      try {
        const fd = new FormData();
        files.forEach(f => fd.append('images', f, f.name));
        const res = await api(BASE + '/api/prompts/from-image', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'No se pudo importar');
        const n = j.created.length;
        const saltadas = (j.noMetadata || []).length + (j.failed || []).length;
        K.toast(n ? `${n} prompt${n === 1 ? '' : 's'} creado${n === 1 ? '' : 's'}${saltadas ? ` · ${saltadas} sin datos de generación` : ''}`
          : 'Ninguna imagen llevaba datos de ComfyUI ni de Automatic1111');
        await K.prompts.reload();
        if (n === 1) K.prompts.detail(j.created[0].id);
      } catch (e) { K.fail(e); return false; }
    } }] });
  }

  /* ---------- Comparar versiones ---------- */
  // Diferencias por palabras. Se recortan el principio y el final comunes y se calcula la subsecuencia
  // común más larga solo del centro; si el centro es enorme se marca entero como cambiado.
  function diff(a, b) {
    const x = a.split(/(\s+)/).filter(t => t !== ''), y = b.split(/(\s+)/).filter(t => t !== '');
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    let fx = x.length, fy = y.length;
    while (fx > i && fy > i && x[fx - 1] === y[fy - 1]) { fx--; fy--; }
    const ax = x.slice(i, fx), by = y.slice(i, fy);
    const out = x.slice(0, i).map(t => [0, t]);
    if (ax.length * by.length > 4e6) {
      if (ax.length) out.push([-1, ax.join('')]);
      if (by.length) out.push([1, by.join('')]);
    } else {
      const n = ax.length, m = by.length, W = m + 1;
      const L = new Uint32Array((n + 1) * W);
      for (let p = n - 1; p >= 0; p--) for (let q = m - 1; q >= 0; q--) {
        L[p * W + q] = ax[p] === by[q] ? L[(p + 1) * W + q + 1] + 1 : Math.max(L[(p + 1) * W + q], L[p * W + q + 1]);
      }
      let p = 0, q = 0;
      while (p < n && q < m) {
        if (ax[p] === by[q]) { out.push([0, ax[p]]); p++; q++; }
        else if (L[(p + 1) * W + q] >= L[p * W + q + 1]) out.push([-1, ax[p++]]);
        else out.push([1, by[q++]]);
      }
      while (p < n) out.push([-1, ax[p++]]);
      while (q < m) out.push([1, by[q++]]);
    }
    for (const t of x.slice(fx)) out.push([0, t]);
    // Se juntan los tramos contiguos del mismo tipo
    const junto = [];
    for (const [t, s] of out) {
      if (junto.length && junto[junto.length - 1][0] === t) junto[junto.length - 1][1] += s; else junto.push([t, s]);
    }
    return junto;
  }

  function bloqueDiff(titulo, antes, despues) {
    const b = el('div', 'pd-blk');
    const h = el('header'); h.appendChild(el('span', null, titulo));
    const partes = diff(antes || '', despues || '');
    const cambios = partes.filter(([t]) => t !== 0).length;
    h.appendChild(el('span', 'k-faint', cambios ? `${cambios} cambio${cambios === 1 ? '' : 's'}` : 'sin cambios'));
    b.appendChild(h);
    const pre = el('pre', 'df');
    if (!(antes || despues)) pre.appendChild(el('span', 'k-faint', '(vacío)'));
    for (const [t, s] of partes) {
      if (t === 0) pre.appendChild(document.createTextNode(s));
      else pre.appendChild(el(t < 0 ? 'del' : 'ins', t < 0 ? 'df-del' : 'df-add', s));
    }
    b.appendChild(pre);
    return b;
  }

  function comparar(p) {
    const fecha = (ms) => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const opciones = [
      ...(p.versions || []).map((v, i) => ({ id: 'v' + i, texto: `${fecha(v.at)} · ${K.ago(v.at)}`, v })),
      { id: 'now', texto: 'Versión actual', v: { title: p.title, body: p.body, negative: p.negative } },
    ];
    const w = el('div');
    const fila = el('div', 'k-2');
    const sel = (etq, def) => {
      const s = el('select');
      opciones.forEach(o => s.appendChild(new Option(o.texto, o.id)));
      s.value = def;
      const l = el('label', 'field tight'); l.append(el('span', null, etq), s);
      return [s, l];
    };
    const [sa, la] = sel('Antes', opciones[0].id);
    const [sb, lb] = sel('Después', 'now');
    fila.append(la, lb);
    const nota = el('p', 'k-faint', 'En rojo tachado lo que se quitó; en verde lo que se añadió.');
    nota.style.cssText = 'font-size:12.5px;margin:6px 0 10px';
    const cuerpo = el('div', 'df-cuerpo');
    w.append(fila, nota, cuerpo);
    const pinta = () => {
      const a = opciones.find(o => o.id === sa.value).v, b = opciones.find(o => o.id === sb.value).v;
      cuerpo.textContent = '';
      cuerpo.appendChild(bloqueDiff('Título', a.title, b.title));
      cuerpo.appendChild(bloqueDiff('Prompt', a.body, b.body));
      if (a.negative || b.negative) cuerpo.appendChild(bloqueDiff('Prompt negativo', a.negative, b.negative));
    };
    sa.addEventListener('change', pinta); sb.addEventListener('change', pinta);
    pinta();
    K.modal({ title: 'Comparar versiones', sub: p.title, content: w, cls: 'xl', actions: [{ label: 'Cerrar', primary: true }] });
  }

  /* ---------- Estadísticas ---------- */
  function barras(titulo, filas, opts = {}) {
    if (!filas.length) return null;
    const max = Math.max(...filas.map(f => f.count), 1);
    const b = el('section', 'st-card');
    b.appendChild(el('h4', null, titulo));
    for (const f of filas) {
      const r = el(opts.filtro ? 'button' : 'div', 'st-fila');
      if (opts.filtro) {
        r.type = 'button';
        r.title = 'Ver estos prompts';
        r.addEventListener('click', () => { opts.cerrar(); K.prompts.filtrar(opts.filtro, f.name); });
      }
      r.appendChild(el('span', 'st-nom', opts.nombre ? opts.nombre(f.name) : f.name));
      const barra = el('span', 'st-barra'); const rel = el('i'); rel.style.width = Math.max(4, Math.round(f.count / max * 100)) + '%'; barra.appendChild(rel);
      r.append(barra, el('span', 'st-n', num(f.count)));
      b.appendChild(r);
    }
    return b;
  }

  function lista(titulo, items, texto, cerrar) {
    if (!items.length) return null;
    const b = el('section', 'st-card');
    b.appendChild(el('h4', null, titulo));
    for (const p of items) {
      const r = el('button', 'st-fila st-lnk'); r.type = 'button';
      r.appendChild(el('span', 'st-nom', p.title));
      r.appendChild(el('span', 'st-n', texto(p)));
      r.addEventListener('click', () => { cerrar(); K.prompts.detail(p.id); });
      b.appendChild(r);
    }
    return b;
  }

  async function estadisticas() {
    let d;
    try { d = await K.get('/api/prompts/stats'); } catch (e) { K.fail(e); return; }
    const t = d.totals;
    const w = el('div', 'st');
    let m;
    const cerrar = () => m && m.close();

    if (!t.total) { w.appendChild(el('p', 'k-muted', 'Aún no hay prompts. Cuando crees algunos, aquí verás cómo los usas.')); }
    else {
      const kpis = el('div', 'st-kpis');
      const kpi = (valor, etq) => { const k = el('div', 'st-kpi'); k.append(el('b', null, valor), el('span', null, etq)); kpis.appendChild(k); };
      kpi(num(t.total), 'Prompts');
      kpi(num(t.favorites), 'Favoritos');
      kpi(num(t.uses), 'Veces copiados');
      kpi(num(t.unused), 'Sin usar nunca');
      kpi(t.rated ? `${t.avgRating} ★` : '—', t.rated ? `Valoración media (${num(t.rated)})` : 'Sin valoraciones');
      kpi(num(t.withImages), 'Con imágenes');
      kpi(`${num(t.images)} · ${mb(t.imageBytes)}`, 'Imágenes y peso');
      kpi(num(t.versions), 'Versiones guardadas');
      w.appendChild(kpis);

      // Creados por mes
      const meses = el('section', 'st-card');
      meses.appendChild(el('h4', null, 'Creados en los últimos 12 meses'));
      const max = Math.max(...d.months.map(x => x.count), 1);
      const graf = el('div', 'st-meses');
      for (const x of d.months) {
        const c = el('div', 'st-mes');
        const col = el('div', 'st-col'); const i = el('i'); i.style.height = (x.count ? Math.max(6, Math.round(x.count / max * 100)) : 0) + '%'; col.appendChild(i);
        const [y, mm] = x.name.split('-');
        c.title = `${new Date(+y, +mm - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}: ${x.count}`;
        c.append(el('span', 'st-v', x.count ? String(x.count) : ''), col, el('span', 'st-e', new Date(+y, +mm - 1, 1).toLocaleDateString('es-ES', { month: 'narrow' })));
        graf.appendChild(c);
      }
      meses.appendChild(graf);
      w.appendChild(meses);

      const rej = el('div', 'st-rejilla');
      [
        barras('Por herramienta', d.tool, { filtro: 'tool', cerrar }),
        barras('Por modelo', d.model, { filtro: 'model', cerrar }),
        barras('Por tipo', d.kind, { filtro: 'kind', cerrar, nombre: (k) => K.prompts.kindLabel(k) }),
        barras('Por estado', d.status, { filtro: 'status', cerrar, nombre: (k) => STATUS[k] || k }),
        barras('Por categoría', d.category),
        barras('Etiquetas más usadas', d.label),
        barras('Listas', d.list),
        lista('Los más copiados', d.mostUsed, (p) => `${num(p.uses)}×`, cerrar),
        lista('Mejor valorados', d.topRated, (p) => '★'.repeat(p.rating), cerrar),
        lista('Sin usar desde hace tiempo', d.stale, () => 'revisar', cerrar),
      ].filter(Boolean).forEach(x => rej.appendChild(x));
      w.appendChild(rej);
    }
    m = K.modal({ title: 'Estadísticas de prompts', sub: t.trash ? `${num(t.trash)} más en la papelera` : '', content: w, cls: 'xl', actions: [{ label: 'Cerrar', primary: true }] });
  }

  K.prompts.extraMenu.push(
    { label: 'Crear desde imágenes (ComfyUI / A1111)…', icon: 'i-image-plus', onClick: desdeImagenes },
    { label: 'Estadísticas…', icon: 'i-activity', onClick: estadisticas },
  );
  K.prompts.comparar = comparar;
})();
