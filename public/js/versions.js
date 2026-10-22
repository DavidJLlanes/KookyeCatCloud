'use strict';
/* ---------------------------------------------------------------
   Historial de versiones de un archivo de texto: se ven las copias anteriores (se guardan
   solas al editar el archivo desde la web o desde WebDAV), se comparan con la actual línea
   a línea y se restauran. Restaurar guarda antes lo actual, así que siempre se puede deshacer.
--------------------------------------------------------------- */
(function () {
  const ES = (n) => new Date(n).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Diferencias por líneas (LCS). Con textos enormes se omite: la comparación sería lenta.
  function diffLineas(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    if (A.length * B.length > 4_000_000) return null;
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]);
      else out.push(['+', B[j++]]);
    }
    while (i < n) out.push(['-', A[i++]]);
    while (j < m) out.push(['+', B[j++]]);
    return out;
  }

  function pintaDiff(caja, antes, ahora) {
    caja.textContent = '';
    const d = diffLineas(antes, ahora);
    if (!d) { caja.appendChild(el('pre', 'ver-pre', antes)); caja.appendChild(el('p', 'k-faint', 'El archivo es demasiado grande para compararlo línea a línea.')); return; }
    const add = d.filter(x => x[0] === '+').length, del = d.filter(x => x[0] === '-').length;
    const res = el('div', 'ver-res');
    res.append(el('span', 'k-chip', `+${add} líneas`), el('span', 'k-chip', `−${del} líneas`));
    res.firstChild.style.setProperty('--c', '#22c55e'); res.lastChild.style.setProperty('--c', '#ef4444');
    const quien = el('span', 'k-faint', 'respecto a la versión actual'); quien.style.fontSize = '12px'; res.appendChild(quien);
    caja.appendChild(res);
    if (!add && !del) { caja.appendChild(el('p', 'k-faint', 'Es idéntica a la versión actual.')); return; }
    const pre = el('div', 'ver-diff');
    // Las líneas iguales largas se pliegan, para ver solo lo que cambió y su contexto
    let i = 0;
    while (i < d.length) {
      if (d[i][0] !== ' ') { pre.appendChild(linea(d[i])); i++; continue; }
      let j = i; while (j < d.length && d[j][0] === ' ') j++;
      const tramo = d.slice(i, j);
      if (tramo.length > 8 && i > 0 && j < d.length) {
        tramo.slice(0, 3).forEach(x => pre.appendChild(linea(x)));
        pre.appendChild(el('div', 'ver-gap', `… ${tramo.length - 6} líneas iguales …`));
        tramo.slice(-3).forEach(x => pre.appendChild(linea(x)));
      } else if (tramo.length > 4 && (i === 0 || j === d.length)) {
        if (i === 0) { pre.appendChild(el('div', 'ver-gap', `… ${tramo.length - 3} líneas iguales …`)); tramo.slice(-3).forEach(x => pre.appendChild(linea(x))); }
        else { tramo.slice(0, 3).forEach(x => pre.appendChild(linea(x))); pre.appendChild(el('div', 'ver-gap', `… ${tramo.length - 3} líneas iguales …`)); }
      } else tramo.forEach(x => pre.appendChild(linea(x)));
      i = j;
    }
    caja.appendChild(pre);
  }
  function linea([t, txt]) {
    const l = el('div', 'ver-l ' + (t === '+' ? 'add' : t === '-' ? 'del' : 'eq'));
    l.append(el('span', 'sg', t === ' ' ? '' : t), el('span', 'tx', txt || ' '));
    return l;
  }

  async function abrir(item) {
    const rel = item.rel;
    let v, actual;
    try {
      [v, actual] = await Promise.all([K.get('/api/versions?' + K.qs({ path: rel })), K.get('/api/text?' + K.qs({ path: rel }))]);
    } catch (e) { K.fail(e); return; }
    const root = el('div', 'ver');
    const izq = el('div', 'ver-lista');
    const der = el('div', 'ver-det');
    root.append(izq, der);
    const m = K.modal({ title: 'Historial de versiones', sub: item.name, content: root, cls: 'xl', actions: [{ label: 'Cerrar', primary: true }] });
    let sel = null;

    const recarga = async () => { v = await K.get('/api/versions?' + K.qs({ path: rel })); pintaLista(); };
    const pintaLista = () => {
      izq.textContent = '';
      if (!v.versions.length) {
        const e = el('div', 'k-empty'); e.append(el('h3', null, 'Aún no hay versiones'), el('p', null, 'Cada vez que edites y guardes este archivo, se guardará una copia de lo que había antes.'));
        izq.appendChild(e); der.textContent = ''; return;
      }
      izq.appendChild(el('div', 'k-faint', `${v.versions.length} versión${v.versions.length === 1 ? '' : 'es'} (se conservan las últimas ${v.keep})`)).style.cssText = 'font-size:12px;margin-bottom:8px';
      v.versions.forEach((x, k) => {
        const b = el('button', 'ver-item' + (sel === x.id ? ' on' : '')); b.type = 'button';
        b.append(el('b', null, ES(x.at)), el('small', null, `${fmtSize(x.size)}${k === 0 ? ' · la más reciente' : ''}`));
        b.addEventListener('click', () => { sel = x.id; pintaLista(); muestra(x); });
        izq.appendChild(b);
      });
    };

    async function muestra(x) {
      der.textContent = ''; der.appendChild(el('p', 'k-faint', 'Cargando…'));
      try {
        const r = await K.get('/api/versions/' + x.id + '?' + K.qs({ path: rel }));
        if (sel !== x.id) return;
        der.textContent = '';
        const barra = el('div', 'k-row'); barra.style.marginBottom = '10px';
        const t = el('b', null, ES(x.at));
        const rest = el('button', 'btn primary sm'); rest.type = 'button'; rest.append(icon('i-restore'), document.createTextNode(' Restaurar esta versión'));
        const des = el('a', 'btn sm', 'Descargar'); des.href = `${BASE}/api/versions/${x.id}?${K.qs({ path: rel, download: 1 })}`;
        const bor = el('button', 'btn ghost sm'); bor.type = 'button'; bor.appendChild(icon('i-trash')); bor.title = 'Borrar esta versión';
        barra.append(t, el('span', 'k-grow'), des, bor, rest);
        der.appendChild(barra);
        if (r.truncated) der.appendChild(el('p', 'k-faint', 'La versión es muy grande y solo se muestra el principio.'));
        const cuerpo = el('div'); der.appendChild(cuerpo);
        pintaDiff(cuerpo, r.text, actual.text);
        rest.addEventListener('click', async () => {
          if (!await K.confirm('El archivo volverá a como estaba en esa versión. Lo que hay ahora se guarda como versión, así que podrás deshacerlo.', { ok: 'Restaurar' })) return;
          try {
            await K.post('/api/versions/' + x.id + '/restore?' + K.qs({ path: rel }));
            K.toast('Versión restaurada'); K.bus.emit('files'); m.close();
            if (typeof pintarDocumento === 'function' && state.lbIndex >= 0 && state.viewables[state.lbIndex] === item) { DOC_EDITANDO = null; $('lb-edit').classList.remove('is-active'); pintarDocumento($('lb-media'), item); }
            else if (typeof refresh === 'function' && state.tab === 'files') refresh();
          } catch (e) { K.fail(e); }
        });
        bor.addEventListener('click', async () => {
          if (!await K.confirm('Se borrará esta versión para siempre.', { ok: 'Borrar', danger: true })) return;
          try { await K.del('/api/versions/' + x.id + '?' + K.qs({ path: rel })); sel = null; der.textContent = ''; await recarga(); } catch (e) { K.fail(e); }
        });
      } catch (e) { K.fail(e); }
    }
    pintaLista();
    if (v.versions[0]) { sel = v.versions[0].id; pintaLista(); muestra(v.versions[0]); }
  }

  window.KCC.fileVersions = abrir;
})();
