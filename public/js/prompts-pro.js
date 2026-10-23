'use strict';
/* Prompts: herramientas para cualquier tipo de prompt (no solo imagen).
   Resultados guardados y comparación entre modelos, cadenas de prompts, fragmentos reutilizables {{@nombre}},
   plantillas de inicio, aviso de parecidos, exportar, compartir con enlace y envío opcional a ComfyUI.
   Se engancha a prompts.js a través de K.prompts.pro. */
(function () {
  if (!window.K || !K.prompts) return;
  const PRO = {};
  const pr = () => K.prompts;

  const KIND_NOMBRE = { imagen: 'Imagen', texto: 'Texto', codigo: 'Código', video: 'Vídeo', audio: 'Audio', agente: 'Agente', fragmento: 'Fragmento', otro: 'Otro' };

  /* ---------- Utilidades ---------- */
  // Estimación gruesa: ~4 caracteres por token en español e inglés. Sirve para ver el orden de magnitud, no para facturar.
  PRO.tokens = (texto) => Math.ceil(String(texto || '').length / 4);
  PRO.slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  // Qué campos tiene sentido enseñar según el tipo: la ficha se adapta en vez de mostrar siempre los de imagen
  PRO.campos = (kind) => ({
    sistema: ['texto', 'codigo', 'agente', 'otro'].includes(kind),
    negativo: ['imagen', 'video', 'audio'].includes(kind),
    cadena: kind !== 'fragmento',
    resultados: kind !== 'fragmento',
  });
  PRO.etiquetaCuerpo = (kind) => ({ imagen: 'Prompt', video: 'Prompt', audio: 'Prompt', texto: 'Mensaje de usuario', codigo: 'Mensaje de usuario', agente: 'Mensaje de usuario', otro: 'Mensaje', fragmento: 'Texto del fragmento' }[kind] || 'Prompt');
  PRO.paramSugeridos = (kind) => ({
    imagen: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'width', 'height', 'ar', 'lora', 'version'],
    video: ['duración', 'fps', 'resolución', 'cámara', 'estilo', 'seed'],
    audio: ['duración', 'bpm', 'voz', 'estilo', 'idioma'],
    texto: ['temperature', 'top_p', 'max_tokens', 'tono', 'formato de salida', 'idioma de salida'],
    codigo: ['lenguaje', 'framework', 'versión', 'estilo', 'temperature'],
    agente: ['herramientas', 'max_steps', 'memoria', 'temperature'],
  }[kind] || []);

  /* ---------- Fragmentos ---------- */
  let cacheFrag = { t: 0, items: [] };
  PRO.fragmentos = async (fresco) => {
    if (!fresco && Date.now() - cacheFrag.t < 20000) return cacheFrag.items;
    try { cacheFrag = { t: Date.now(), items: (await K.get('/api/prompts/fragments')).items }; } catch { /* se queda con lo anterior */ }
    return cacheFrag.items;
  };
  PRO.expande = async (texto) => {
    const t = String(texto || '');
    if (!t.includes('{{@')) return t;
    const frags = new Map((await PRO.fragmentos()).map(f => [f.slug, f.body]));
    const un = (x, n) => (n > 3 ? x : x.replace(/\{\{@([a-z0-9-]{1,60})\}\}/g, (m, k) => (frags.has(k) ? un(frags.get(k), n + 1) : m)));
    return un(t, 0);
  };
  PRO.menuFragmentos = async (ancla, alInsertar) => {
    const lista = await PRO.fragmentos(true);
    if (!lista.length) { K.toast('Aún no tienes fragmentos: crea un prompt de tipo «Fragmento»'); return; }
    K.menu(ancla, [{ head: 'Insertar fragmento' }, ...lista.map(f => ({ label: f.title, onClick: () => alInsertar(`{{@${f.slug}}}`) }))]);
  };

  /* ---------- Plantillas de inicio ---------- */
  const PLANTILLAS = [
    { n: 'Rol, tarea, contexto y formato', kind: 'texto', system: 'Eres {{rol=un experto en el tema}}. Respondes con precisión y sin rellenar.', body: 'Tarea: {{tarea:largo}}\n\nContexto: {{contexto:largo}}\n\nFormato de la respuesta: {{formato=lista con viñetas|párrafos cortos|tabla}}\n\nTono: {{tono=profesional|cercano|técnico}}' },
    { n: 'Resumir un texto', kind: 'texto', system: 'Resumes con fidelidad: no añades datos que no estén en el texto.', body: 'Resume el siguiente texto en {{longitud=5}} puntos clave y termina con una frase de conclusión.\n\nTexto:\n{{texto:largo}}' },
    { n: 'Razonar paso a paso', kind: 'texto', system: '', body: 'Resuelve el problema razonando paso a paso. Primero resume los datos, luego explica el razonamiento y por último da la respuesta final en una línea que empiece por «Respuesta:».\n\nProblema:\n{{problema:largo}}' },
    { n: 'Extraer datos en JSON', kind: 'texto', system: 'Devuelves únicamente JSON válido, sin texto antes ni después.', body: 'Extrae del texto los campos: {{campos=nombre, fecha, importe}}. Si un campo no aparece, usa null.\n\nTexto:\n{{texto:largo}}' },
    { n: 'Reescribir con otro tono', kind: 'texto', system: '', body: 'Reescribe el texto con tono {{tono=formal|cercano|persuasivo|técnico}} sin cambiar su significado y manteniendo la longitud aproximada.\n\nTexto:\n{{texto:largo}}' },
    { n: 'Revisión de código', kind: 'codigo', system: 'Eres un revisor de código senior. Priorizas errores reales y riesgos de seguridad sobre el estilo.', body: 'Revisa este código en {{lenguaje=JavaScript}}. Indica: 1) errores, 2) riesgos de seguridad, 3) mejoras de claridad. Cita las líneas afectadas.\n\n{{codigo:largo}}' },
    { n: 'Agente con herramientas', kind: 'agente', system: 'Eres un agente que resuelve tareas paso a paso.\n\nHerramientas disponibles:\n- {{herramienta_1=buscar_web}}\n- {{herramienta_2=leer_archivo}}\n\nReglas:\n1. Piensa qué falta por saber antes de actuar.\n2. Usa una herramienta por paso y comprueba el resultado.\n3. Si no puedes continuar, di qué te bloquea en vez de inventar.', body: 'Objetivo: {{objetivo:largo}}\n\nCriterio de éxito: {{exito}}' },
    { n: 'Descripción de imagen', kind: 'imagen', system: '', body: '{{sujeto}}, {{estilo=fotografía analógica|ilustración|3D|acuarela}}, iluminación {{luz=natural suave}}, plano {{plano=medio}}, alta calidad' },
  ];
  PRO.menuPlantillas = (ancla, kind, alElegir) => {
    const lista = PLANTILLAS.filter(p => !kind || p.kind === kind || ['texto'].includes(p.kind) && ['otro', 'texto'].includes(kind));
    K.menu(ancla, [{ head: 'Plantilla de inicio' }, ...(lista.length ? lista : PLANTILLAS).map(p => ({ label: p.n, onClick: () => alElegir(p) }))]);
  };

  /* ---------- Resultados guardados (editor) ---------- */
  PRO.salidasEditor = (iniciales, modelosLista) => {
    const lista = (iniciales || []).map(x => ({ ...x }));
    const nodo = el('div', 'po-salidas');
    const pinta = () => {
      nodo.textContent = '';
      lista.forEach((x, i) => {
        const c = el('div', 'po-salida');
        const cab = el('div', 'po-cab');
        const m = el('input'); m.value = x.model || ''; m.placeholder = 'Modelo (Claude, GPT-5…)'; m.maxLength = 60; if (modelosLista) m.setAttribute('list', 'pr-models');
        m.addEventListener('input', () => { x.model = m.value; });
        const st = K.stars(x.rating || 0, (v) => { x.rating = v; });
        const mej = el('label', 'k-switch'); const ck = el('input'); ck.type = 'checkbox'; ck.checked = !!x.best;
        mej.append(ck, el('span', 'track'), el('span', null, 'Mejor'));
        ck.addEventListener('change', () => { lista.forEach(o => { o.best = false; }); x.best = ck.checked; pinta(); });
        const del = el('button', 'btn ghost icon'); del.type = 'button'; del.title = 'Quitar'; del.appendChild(icon('i-trash'));
        del.addEventListener('click', () => { lista.splice(i, 1); pinta(); });
        cab.append(m, st, mej, del);
        const entrada = el('textarea'); entrada.rows = 2; entrada.placeholder = 'Entrada con la que lo probaste (opcional)'; entrada.value = x.input || ''; entrada.addEventListener('input', () => { x.input = entrada.value; });
        const texto = el('textarea'); texto.rows = 5; texto.placeholder = 'Respuesta del modelo'; texto.value = x.text || ''; texto.addEventListener('input', () => { x.text = texto.value; });
        c.append(cab, entrada, texto);
        nodo.appendChild(c);
      });
      const add = el('button', 'btn tiny'); add.type = 'button'; add.append(icon('i-plus'), document.createTextNode('Añadir resultado'));
      add.addEventListener('click', () => { lista.push({ model: '', input: '', text: '', rating: 0, best: false }); pinta(); });
      nodo.appendChild(add);
    };
    pinta();
    return { node: nodo, get: () => lista.filter(x => (x.text || '').trim() || (x.input || '').trim()) };
  };

  /* ---------- Cadena de prompts (editor) ---------- */
  PRO.selectorPrompt = (titulo, alElegir) => {
    const w = el('div');
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar un prompt…'; q.autocomplete = 'off';
    const caja = el('div', 'po-picker');
    w.append(q, caja);
    const busca = async () => {
      let r; try { r = await K.get('/api/prompts?' + K.qs({ q: q.value.trim(), limit: 25, sort: 'updated' })); } catch (e) { K.fail(e); return; }
      caja.textContent = '';
      if (!r.items.length) { caja.appendChild(el('p', 'k-faint', 'Nada coincide')); return; }
      r.items.forEach(it => {
        const b = el('button', 'po-pick'); b.type = 'button';
        b.append(el('b', null, it.title), el('span', 'k-faint', KIND_NOMBRE[it.kind] || it.kind));
        b.addEventListener('click', () => { m.close(); alElegir(it); });
        caja.appendChild(b);
      });
    };
    q.addEventListener('input', K.debounce(busca, 200));
    const m = K.modal({ title: titulo, content: w, actions: [{ label: 'Cancelar' }] });
    busca(); setTimeout(() => q.focus(), 60);
  };
  PRO.cadenaEditor = (ids, propioId) => {
    const pasos = [];   // { id, title }
    const nodo = el('div', 'po-cadena');
    const pinta = () => {
      nodo.textContent = '';
      pasos.forEach((s, i) => {
        const f = el('div', 'po-paso');
        f.append(el('span', 'po-n', String(i + 1)), el('span', 'po-t', s.title));
        const mk = (ic, tt, fn, dis) => { const b = el('button', 'btn ghost icon tiny'); b.type = 'button'; b.title = tt; b.disabled = !!dis; b.appendChild(icon(ic)); b.addEventListener('click', fn); return b; };
        const sube = mk('i-caret', 'Subir', () => { [pasos[i - 1], pasos[i]] = [pasos[i], pasos[i - 1]]; pinta(); }, i === 0); sube.firstChild.style.transform = 'rotate(-90deg)';
        const baja = mk('i-caret', 'Bajar', () => { [pasos[i + 1], pasos[i]] = [pasos[i], pasos[i + 1]]; pinta(); }, i === pasos.length - 1); baja.firstChild.style.transform = 'rotate(90deg)';
        f.append(sube, baja, mk('i-x', 'Quitar', () => { pasos.splice(i, 1); pinta(); }));
        nodo.appendChild(f);
      });
      const add = el('button', 'btn tiny'); add.type = 'button'; add.append(icon('i-plus'), document.createTextNode('Añadir paso'));
      add.disabled = pasos.length >= 20;
      add.addEventListener('click', () => PRO.selectorPrompt('Añadir un paso a la cadena', (it) => {
        if (it.id === propioId) { K.toast('Un prompt no puede ser un paso de su propia cadena'); return; }
        pasos.push({ id: it.id, title: it.title }); pinta();
      }));
      nodo.appendChild(add);
    };
    (async () => {
      for (const id of ids || []) {
        try { const p = await K.get('/api/prompts/' + id); pasos.push({ id, title: p.title }); } catch { /* paso borrado: se descarta */ }
      }
      pinta();
    })();
    pinta();
    return { node: nodo, get: () => pasos.map(s => s.id) };
  };

  /* ---------- Parecidos al guardar ---------- */
  // Devuelve true si se puede seguir guardando
  PRO.confirmaParecidos = async ({ title, body, excludeId }) => {
    let r;
    try { r = await K.post('/api/prompts/similar', { title, body, excludeId, min: 0.6 }); } catch { return true; }
    if (!r.items.length) return true;
    const txt = r.items.map(x => `• ${x.title} (${x.score} % parecido)`).join('\n');
    return K.confirm(`Ya tienes prompts muy parecidos:\n\n${txt}\n\n¿Guardar de todos modos?`, { ok: 'Guardar igualmente', title: 'Posible duplicado' });
  };

  /* ---------- Detalle: resultados, cadena, parecidos ---------- */
  const preCorto = (texto) => {
    const pre = el('pre'); pre.textContent = texto;
    pre.className = 'po-pre';
    if (texto.length > 500 || texto.split('\n').length > 8) pre.classList.add('corto');
    return pre;
  };
  PRO.comparar = (p) => {
    const lista = p.outputs || [];
    const w = el('div', 'po-cmp');
    lista.forEach(x => {
      const c = el('div', 'po-cmp-col');
      const cab = el('div', 'po-cab');
      cab.append(el('b', null, x.model || 'Sin modelo'), K.stars(x.rating || 0, () => {}, { readonly: true }));
      if (x.best) cab.appendChild(el('span', 'k-chip', '★ Mejor'));
      c.appendChild(cab);
      if (x.input) { const i = el('div', 'k-faint', 'Entrada: ' + x.input); i.style.cssText = 'font-size:12px;margin-bottom:6px'; c.appendChild(i); }
      const pre = el('pre', 'po-pre'); pre.textContent = x.text; c.appendChild(pre);
      const cp = el('button', 'btn tiny ghost'); cp.type = 'button'; cp.append(icon('i-copy'), document.createTextNode('Copiar'));
      cp.addEventListener('click', async () => { K.toast((await K.copy(x.text)) ? 'Copiado' : 'No se pudo copiar'); });
      c.appendChild(cp);
      w.appendChild(c);
    });
    K.modal({ title: 'Comparar resultados', sub: p.title, cls: 'xl', content: w, actions: [{ label: 'Cerrar', primary: true }] });
  };
  PRO.ejecutarCadena = async (p) => {
    const pasos = [];
    for (const id of p.chain || []) { try { pasos.push(await K.get('/api/prompts/' + id)); } catch { /* borrado */ } }
    if (!pasos.length) { K.toast('La cadena no tiene pasos disponibles'); return; }
    let i = 0;
    const w = el('div', 'po-run');
    const info = el('p', 'k-muted'); info.style.cssText = 'font-size:13px;margin:0 0 10px';
    const caja = el('div');
    w.append(info, caja);
    const pinta = async () => {
      const s = pasos[i];
      info.textContent = `Paso ${i + 1} de ${pasos.length}: copia el prompt, pégalo en tu herramienta y, cuando tengas la respuesta, pasa al siguiente.`;
      caja.textContent = '';
      caja.appendChild(el('h3', null, s.title));
      const texto = await PRO.expande(s.body);
      if (s.system) { const t = el('div', 'k-faint', 'Mensaje de sistema'); t.style.cssText = 'font-size:11px;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.08em'; caja.append(t, preCorto(await PRO.expande(s.system))); }
      caja.appendChild(preCorto(texto));
      m.buttons.prev.disabled = i === 0;
      m.buttons.next.textContent = i === pasos.length - 1 ? 'Terminar' : 'Siguiente paso';
    };
    const m = K.modal({ title: `Cadena: ${p.title}`, content: w, cls: 'wide', dismiss: false, actions: [
      { id: 'prev', label: 'Anterior', close: false, onClick: async () => { if (i > 0) { i--; await pinta(); } return false; } },
      { id: 'copy', label: 'Copiar este paso', close: false, onClick: async () => { await pr().copiar(pasos[i].id); return false; } },
      { id: 'next', label: 'Siguiente paso', primary: true, close: false, onClick: async () => { if (i < pasos.length - 1) { i++; await pinta(); return false; } m.close(); } },
    ] });
    await pinta();
  };
  PRO.seccionesDetalle = (p, info, cerrar) => {
    // Resultados guardados
    const salidas = p.outputs || [];
    if (salidas.length) {
      const b = el('div', 'pd-blk'); const h = el('header'); h.appendChild(el('span', null, `Resultados guardados (${salidas.length})`));
      if (salidas.length > 1) { const c = el('button', 'btn ghost tiny'); c.type = 'button'; c.append(icon('i-columns'), document.createTextNode('Comparar')); c.addEventListener('click', () => PRO.comparar(p)); h.appendChild(c); }
      b.appendChild(h);
      [...salidas].sort((a, z) => (z.best - a.best) || (z.rating - a.rating)).forEach(x => {
        const f = el('div', 'po-res');
        const cab = el('div', 'po-cab');
        cab.append(el('b', null, x.model || 'Sin modelo'), K.stars(x.rating || 0, () => {}, { readonly: true }));
        if (x.best) cab.appendChild(el('span', 'k-chip', '★ Mejor'));
        const cp = el('button', 'btn ghost tiny'); cp.type = 'button'; cp.append(icon('i-copy'), document.createTextNode('Copiar')); cp.style.marginLeft = 'auto';
        cp.addEventListener('click', async () => { K.toast((await K.copy(x.text)) ? 'Copiado' : 'No se pudo copiar'); });
        cab.appendChild(cp);
        f.appendChild(cab);
        if (x.input) { const i = el('div', 'k-faint', 'Entrada: ' + x.input); i.style.cssText = 'font-size:12px;margin:4px 0'; f.appendChild(i); }
        const pre = preCorto(x.text);
        f.appendChild(pre);
        if (pre.classList.contains('corto')) { const mas = el('button', 'btn ghost tiny', 'Ver todo'); mas.type = 'button'; mas.addEventListener('click', () => { const c = pre.classList.toggle('corto'); mas.textContent = c ? 'Ver todo' : 'Ver menos'; }); f.appendChild(mas); }
        b.appendChild(f);
      });
      info.appendChild(b);
    }
    // Cadena
    if ((p.chain || []).length) {
      const b = el('div', 'pd-blk'); const h = el('header'); h.appendChild(el('span', null, `Cadena de ${p.chain.length} paso${p.chain.length === 1 ? '' : 's'}`));
      const run = el('button', 'btn primary tiny'); run.type = 'button'; run.append(icon('i-play'), document.createTextNode('Ejecutar cadena')); run.addEventListener('click', () => PRO.ejecutarCadena(p));
      h.appendChild(run); b.appendChild(h);
      const lista = el('ol', 'po-ol'); b.appendChild(lista);
      p.chain.forEach(async (id) => {
        const li = el('li'); lista.appendChild(li);
        try { const s = await K.get('/api/prompts/' + id); const a = el('button', 'btn ghost tiny', s.title); a.type = 'button'; a.addEventListener('click', () => { cerrar(); pr().detail(id); }); li.appendChild(a); }
        catch { li.textContent = '(prompt borrado)'; li.className = 'k-faint'; }
      });
      info.appendChild(b);
    }
    // Parecidos (se cargan aparte para no frenar la ficha)
    if (!p.deletedAt && p.kind !== 'fragmento') {
      const cont = el('div'); info.appendChild(cont);
      K.get(`/api/prompts/${p.id}/similar`).then(r => {
        if (!r.items.length) return;
        const h = el('div', 'pd-meta'); h.append(icon('i-stack'), document.createTextNode('Parecidos: '));
        r.items.forEach(x => { const a = el('button', 'btn tiny', `${x.title} · ${x.score} %`); a.type = 'button'; a.addEventListener('click', () => { cerrar(); pr().detail(x.id); }); h.appendChild(a); });
        cont.appendChild(h);
      }).catch(() => {});
    }
  };

  /* ---------- Exportar ---------- */
  async function descarga(url, cuerpo, nombreDefecto) {
    const res = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (!res.ok) { let msg = 'No se pudo exportar'; try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ } throw new Error(msg); }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const nombre = (cd.match(/filename="([^"]+)"/) || [])[1] || nombreDefecto;
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  PRO.exportar = (ids, listaId) => {
    const w = el('div');
    const alcance = ids && ids.length ? `${ids.length} prompt${ids.length === 1 ? '' : 's'} seleccionado${ids.length === 1 ? '' : 's'}` : listaId ? 'Todos los prompts de la lista' : 'Todos los prompts';
    w.appendChild(el('p', 'k-muted', alcance + '.')); w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 12px';
    const formatos = [
      ['json', 'JSON (para volver a importarlo aquí)'],
      ['md', 'Markdown (documento legible, con los fragmentos ya sustituidos)'],
      ['ci', 'Instrucciones personalizadas (texto listo para ChatGPT, Proyectos de Claude, GPTs o Gems)'],
    ];
    let formato = 'md';
    formatos.forEach(([v, t]) => {
      const l = el('label', 'po-radio'); const r = el('input'); r.type = 'radio'; r.name = 'po-fmt'; r.value = v; r.checked = v === formato;
      r.addEventListener('change', () => { formato = v; });
      l.append(r, el('span', null, t)); w.appendChild(l);
    });
    K.modal({ title: 'Exportar prompts', content: w, actions: [{ label: 'Cancelar' }, { label: 'Descargar', primary: true, onClick: async () => {
      try { await descarga(BASE + '/api/prompts/export', { ids: ids && ids.length ? ids : undefined, list: listaId || undefined, format: formato }, 'prompts.' + (formato === 'json' ? 'json' : 'md')); }
      catch (e) { K.fail(e); return false; }
    } }] });
  };

  /* ---------- Compartir con enlace ---------- */
  PRO.compartir = (ids) => {
    const w = el('div');
    w.appendChild(el('p', 'k-muted', `Cualquiera con el enlace podrá ver ${ids.length === 1 ? 'este prompt' : `estos ${ids.length} prompts`} y copiarlos, sin iniciar sesión. Los fragmentos se sustituyen por su texto. Se comparten el texto, los parámetros y las notas; no las imágenes ni los resultados guardados.`));
    w.lastChild.style.cssText = 'font-size:13.5px;margin:0 0 12px';
    const titulo = el('input'); titulo.placeholder = 'Título de la página (opcional)'; titulo.maxLength = 80;
    const dias = el('select'); [['7', 'Caduca en 7 días'], ['30', 'Caduca en 30 días'], ['90', 'Caduca en 90 días'], ['0', 'No caduca']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; dias.appendChild(o); }); dias.value = '30';
    const f1 = el('label', 'field'); f1.append(el('span', null, 'Título'), titulo);
    const f2 = el('label', 'field'); f2.append(el('span', null, 'Caducidad'), dias);
    const res = el('div'); res.style.marginTop = '12px';
    w.append(f1, f2, res);
    const lista = el('div'); lista.style.marginTop = '16px'; w.appendChild(lista);
    const url = (id) => `${location.origin}${BASE}/p/${id}`;
    const pintaLista = async () => {
      let l; try { l = await K.get('/api/uploadlinks?kind=prompts'); } catch { return; }
      lista.textContent = '';
      if (!l.length) return;
      lista.appendChild(el('div', 'k-faint', 'Enlaces activos')); lista.firstChild.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px';
      l.forEach(x => {
        const f = el('div', 'po-paso');
        f.append(el('span', 'po-t', `${x.label}${x.expired ? ' (caducado)' : ''} · ${x.views || 0} visitas`));
        const c = el('button', 'btn ghost tiny', 'Copiar'); c.type = 'button'; c.addEventListener('click', async () => { K.toast((await K.copy(url(x.id))) ? 'Enlace copiado' : 'No se pudo copiar'); });
        const d = el('button', 'btn ghost tiny', 'Revocar'); d.type = 'button'; d.addEventListener('click', async () => { try { await K.del('/api/uploadlinks/' + x.id); pintaLista(); } catch (e) { K.fail(e); } });
        f.append(c, d); lista.appendChild(f);
      });
    };
    K.modal({ title: 'Compartir con un enlace', content: w, cls: 'wide', actions: [{ label: 'Cerrar' }, { label: 'Crear enlace', primary: true, close: false, onClick: async (h) => {
      try {
        const r = await K.post('/api/prompts-share', { ids, days: +dias.value, title: titulo.value });
        res.textContent = '';
        const inp = el('input'); inp.readOnly = true; inp.value = url(r.link.id); inp.addEventListener('focus', () => inp.select());
        res.appendChild(inp);
        await K.copy(inp.value); K.toast('Enlace creado y copiado');
        pintaLista();
      } catch (e) { K.fail(e); }
      return false;
    } }] });
    pintaLista();
  };

  /* ---------- ComfyUI ---------- */
  PRO.configComfy = async () => {
    let c; try { c = await K.get('/api/prompts/comfy/config'); } catch (e) { K.fail(e); return; }
    const w = el('div');
    if (!c.enabled) w.appendChild(el('p', 'k-muted', 'Este servidor no tiene definida la variable COMFY_URL (p. ej. http://127.0.0.1:8188), así que el envío a ComfyUI está desactivado. Puedes guardar el workflow ya, y funcionará en cuanto se configure.'));
    w.lastChild && (w.lastChild.style.cssText = 'font-size:13px;margin:0 0 10px');
    const ayuda = el('p', 'k-faint', 'En ComfyUI usa «Save (API format)», pega aquí el JSON y sustituye en él los textos por marcadores: %PROMPT% (prompt), %NEGATIVE% (negativo), %SEED% (semilla, número) y %P:nombre% (un parámetro del prompt, p. ej. %P:steps%).');
    ayuda.style.cssText = 'font-size:12.5px;margin:0 0 8px';
    const ta = el('textarea'); ta.rows = 12; ta.value = c.workflow; ta.placeholder = '{ "3": { "class_type": "KSampler", "inputs": { "seed": "%SEED%", ... } }, ... }';
    ta.style.fontFamily = 'ui-monospace,Menlo,Consolas,monospace'; ta.style.fontSize = '12px';
    w.append(ayuda, ta);
    K.modal({ title: 'Workflow de ComfyUI', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => {
      try { await K.put('/api/prompts/comfy/config', { workflow: ta.value }); K.toast(ta.value.trim() ? 'Workflow guardado' : 'Workflow borrado'); }
      catch (e) { K.fail(e); return false; }
    } }] });
  };
  PRO.generarComfy = async (p, texto, negativo) => {
    const t = K.toast; t('Generando en ComfyUI… puede tardar un rato');
    try {
      const r = await K.post(`/api/prompts/${p.id}/comfy`, { text: texto, negative: negativo, randomSeed: !(p.params && p.params.seed) });
      K.toast('Imagen añadida al prompt'); await pr().reload(); pr().detail(p.id);
      return r;
    } catch (e) { K.fail(e); }
  };

  K.prompts.pro = PRO;
  // Entradas del menú ⋯ de la biblioteca
  K.prompts.extraMenu.push(
    { label: 'Exportar…', icon: 'i-download', onClick: () => PRO.exportar(null, null) },
    { label: 'Workflow de ComfyUI…', icon: 'i-server', onClick: PRO.configComfy },
  );
})();
