'use strict';
/* Portapapeles compartido: texto y archivos que dejas desde un dispositivo y recoges desde otro.
   También es el destino del menú "Compartir" de Android (ver manifest.json → share_target).
   Se actualiza en directo con el evento SSE "clip". */
(function () {
  if (!window.K) return;
  const S = { built: false, items: [], limits: null, staged: [], busy: false, abierta: false };
  const R = {};
  const mb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const esUrl = (t) => /^https?:\/\/\S+$/i.test(t.trim());

  /* ---------- Datos ---------- */
  async function load(silencioso) {
    try {
      const d = await K.get('/api/clip');
      S.items = d.items; S.limits = d.limits; S.usado = d.usedBytes;
      pinta();
    } catch (e) { if (!silencioso) K.fail(e); }
  }

  // XMLHttpRequest y no fetch: es la única forma de ver el avance de una subida grande
  function subeArchivos(archivos, texto) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      if (texto) fd.append('text', texto);
      archivos.forEach(f => fd.append('files', f, f.name));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE + '/api/clip/files');
      xhr.withCredentials = true;
      try { xhr.setRequestHeader('X-KCC-Client', CID); } catch { /* sin id de pestaña */ }
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) R.progreso.textContent = `Enviando… ${Math.round(e.loaded / e.total * 100)} %`; };
      xhr.onload = () => {
        let j = {}; try { j = JSON.parse(xhr.responseText); } catch { /* sin cuerpo */ }
        xhr.status >= 200 && xhr.status < 300 ? resolve(j) : reject(new Error(j.error || `Error ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Error de conexión'));
      xhr.send(fd);
    });
  }

  async function enviar() {
    if (S.busy) return;
    const texto = R.ta.value.trim();
    if (!texto && !S.staged.length) { K.toast('Escribe algo o adjunta un archivo'); return; }
    S.busy = true; R.enviar.disabled = true; R.progreso.textContent = 'Enviando…';
    try {
      if (S.staged.length) await subeArchivos(S.staged, texto);
      else await K.post('/api/clip/text', { text: texto });
      R.ta.value = ''; S.staged = []; pintaStaged();
      await load(true);
      K.toast('Enviado');
    } catch (e) { K.fail(e); }
    finally { S.busy = false; R.enviar.disabled = false; R.progreso.textContent = ''; }
  }

  function añade(files) {
    const max = S.limits ? S.limits.maxMb * 1048576 : Infinity;
    const tope = S.limits ? S.limits.files : 10;
    for (const f of files) {
      if (f.size > max) { K.toast(`“${f.name}” pesa más de ${S.limits.maxMb} MB y no se puede enviar`); continue; }
      if (S.staged.length >= tope) { K.toast(`Máximo ${tope} archivos por vez`); break; }
      S.staged.push(f);
    }
    pintaStaged();
  }
  function pintaStaged() {
    R.staged.textContent = '';
    S.staged.forEach((f, i) => {
      const c = el('span', 'cb-chip');
      c.append(icon('i-doc'), el('span', null, `${f.name} · ${mb(f.size)}`));
      const x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar');
      x.addEventListener('click', () => { S.staged.splice(i, 1); pintaStaged(); });
      c.appendChild(x);
      R.staged.appendChild(c);
    });
  }

  /* ---------- Tarjetas ---------- */
  async function accion(fn, ok) { try { await fn(); if (ok) K.toast(ok); await load(true); } catch (e) { K.fail(e); } }

  function tarjeta(i) {
    const c = el('article', 'cb-card' + (i.pinned ? ' fijado' : ''));
    const cuerpo = el('div', 'cb-body');
    if (i.type === 'text') {
      const linea = esUrl(i.text);
      if (linea) { const a = el('a', 'cb-url', i.text); a.href = i.text; a.target = '_blank'; a.rel = 'noopener noreferrer'; cuerpo.appendChild(a); }
      else {
        const pre = el('pre', 'cb-texto', i.text);
        cuerpo.appendChild(pre);
        if (i.text.length > 400 || i.text.split('\n').length > 6) {
          pre.classList.add('corto');
          const mas = el('button', 'btn ghost tiny', 'Ver todo'); mas.type = 'button';
          mas.addEventListener('click', () => { const abierto = pre.classList.toggle('corto'); mas.textContent = abierto ? 'Ver todo' : 'Ver menos'; });
          cuerpo.appendChild(mas);
        }
      }
    } else {
      const fila = el('div', 'cb-archivo');
      if (i.image) {
        const img = el('img'); img.loading = 'lazy'; img.alt = i.name;
        img.src = `${BASE}/api/clip/${i.id}/file?inline=1`;
        img.addEventListener('click', () => ampliar(i));
        fila.appendChild(img);
      } else { const b = el('div', 'cb-ico'); b.appendChild(fileBadge(i.name, false)); fila.appendChild(b); }
      const t = el('div', 'cb-info'); t.append(el('b', null, i.name), el('span', 'k-faint', mb(i.size)));
      fila.appendChild(t);
      cuerpo.appendChild(fila);
    }
    c.appendChild(cuerpo);

    const pie = el('div', 'cb-pie');
    pie.appendChild(el('span', 'k-faint', `${i.device || 'Otro dispositivo'} · ${K.ago(i.createdAt)}`));
    pie.appendChild(el('span', 'grow'));
    const btn = (ic, txt, fn, cls) => { const b = el('button', 'btn tiny ' + (cls || 'ghost')); b.type = 'button'; b.title = txt; b.setAttribute('aria-label', txt); b.appendChild(icon(ic)); if (cls === 'primary') b.append(' ' + txt); b.addEventListener('click', fn); return b; };
    if (i.type === 'text') pie.appendChild(btn('i-copy', 'Copiar', async () => { K.toast((await K.copy(i.text)) ? 'Copiado' : 'No se pudo copiar'); }, 'primary'));
    else {
      pie.appendChild(btn('i-download', 'Descargar', () => { const a = el('a'); a.href = `${BASE}/api/clip/${i.id}/file`; document.body.appendChild(a); a.click(); a.remove(); }, 'primary'));
      pie.appendChild(btn('i-folder-plus', 'Guardar en Archivos', () => accion(async () => { const r = await K.post(`/api/clip/${i.id}/save`, {}); K.toast(`Guardado en ${r.path}`); })));
    }
    pie.appendChild(btn('i-move', 'Copiar o mover a…', () => K.transferir.abre({ tipo: 'portapapeles', ids: [i.id], titulo: i.type === 'text' ? 'texto del portapapeles' : i.name }, { alTerminar: () => load(true) })));
    pie.appendChild(btn(i.pinned ? 'i-pin-fill' : 'i-pin', i.pinned ? 'Dejar de fijar' : 'Fijar (no caduca)', () => accion(() => K.put('/api/clip/' + i.id, { pinned: !i.pinned }))));
    pie.appendChild(btn('i-trash', 'Borrar', () => accion(() => K.del('/api/clip/' + i.id))));
    c.appendChild(pie);
    return c;
  }

  // Una imagen del portapapeles se amplía en una ventana sencilla (no está en Archivos, así que no usa el visor)
  function ampliar(i) {
    const img = el('img'); img.src = `${BASE}/api/clip/${i.id}/file?inline=1`; img.alt = i.name; img.style.cssText = 'max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:10px';
    K.modal({ title: i.name, content: img, cls: 'wide', actions: [{ label: 'Cerrar', primary: true }] });
  }

  function pinta() {
    if (!S.built) return;
    R.lista.textContent = '';
    R.vaciar.disabled = !S.items.some(i => !i.pinned);
    if (S.limits) R.nota.textContent = `Lo que no fijes se borra a las ${S.limits.ttlHours} h · hasta ${S.limits.maxMb} MB por archivo · ${mb(S.usado || 0)} de ${S.limits.totalMb} MB usados`;
    if (!S.items.length) {
      R.lista.appendChild(emptyState('Nada por aquí', 'Envía un texto o un archivo y aparecerá al instante en tus otros dispositivos', 'i-copy'));
      return;
    }
    S.items.forEach(i => R.lista.appendChild(tarjeta(i)));
  }

  /* ---------- Vista ---------- */
  function build() {
    const v = $('view-clip');
    v.textContent = '';
    const head = el('div', 'kv-head');
    const t = el('div'); t.append(el('h2', null, 'Portapapeles'), el('p', 'sub', 'Envía texto o archivos de un dispositivo a otro'));
    const vaciar = el('button', 'btn'); vaciar.type = 'button'; vaciar.append(icon('i-trash'), el('span', 'lbl', 'Vaciar'));
    head.append(t, el('span', 'grow'), vaciar);

    const caja = el('section', 'cb-caja');
    const ta = el('textarea'); ta.rows = 3; ta.placeholder = 'Escribe o pega aquí lo que quieras enviar…'; ta.maxLength = 200000;
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } });
    ta.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData ? e.clipboardData.files : [])];
      if (files.length) { e.preventDefault(); añade(files); }
    });
    const staged = el('div', 'cb-staged');
    const barra = el('div', 'cb-barra');
    const fi = el('input'); fi.type = 'file'; fi.multiple = true; fi.hidden = true;
    fi.addEventListener('change', () => { añade([...fi.files]); fi.value = ''; });
    const bP = el('button', 'btn ghost'); bP.type = 'button'; bP.append(icon('i-copy'), el('span', null, 'Pegar'));
    bP.title = 'Pegar lo que tengas copiado';
    bP.addEventListener('click', async () => {
      try { const tx = await navigator.clipboard.readText(); if (tx) { ta.value = ta.value ? ta.value + '\n' + tx : tx; ta.focus(); } else K.toast('No hay texto copiado'); }
      catch { K.toast('El navegador no deja leer el portapapeles: pega con Ctrl+V en el cuadro'); }
    });
    const bA = el('button', 'btn ghost'); bA.type = 'button'; bA.append(icon('i-upload'), el('span', null, 'Adjuntar'));
    bA.addEventListener('click', () => fi.click());
    const progreso = el('span', 'k-faint cb-progreso');
    const bE = el('button', 'btn primary'); bE.type = 'button'; bE.append(icon('i-right'), el('span', null, 'Enviar'));
    bE.addEventListener('click', enviar);
    barra.append(bP, bA, progreso, el('span', 'grow'), bE, fi);
    caja.append(ta, staged, barra);

    const nota = el('p', 'cb-nota k-faint');
    const lista = el('div', 'cb-lista');
    v.append(head, caja, nota, lista);
    Object.assign(R, { ta, staged, enviar: bE, progreso, vaciar, nota, lista });

    vaciar.addEventListener('click', async () => {
      if (!await K.confirm('Se borrará todo lo que no esté fijado.', { ok: 'Vaciar', danger: true })) return;
      accion(() => K.del('/api/clip'), 'Portapapeles vaciado');
    });
    // Arrastrar archivos a cualquier parte de la vista
    ['dragenter', 'dragover'].forEach(n => v.addEventListener(n, (e) => { if ([...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files')) { e.preventDefault(); caja.classList.add('arrastrando'); } }));
    ['dragleave', 'drop'].forEach(n => v.addEventListener(n, (e) => { if (n === 'drop') { e.preventDefault(); añade([...e.dataTransfer.files]); } caja.classList.remove('arrastrando'); }));
    S.built = true;
  }

  K.registerView('clip', {
    async open() { if (!S.built) build(); S.abierta = true; await load(); },
    close() { S.abierta = false; },
  });
  // Otro dispositivo (u otra pestaña) cambió algo
  K.clip = {
    aviso() {
      if (S.abierta) load(true);
      else K.toast('📋 Hay algo nuevo en el portapapeles');
    },
  };
})();
