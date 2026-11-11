'use strict';
/* codigo/versiones.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { S, logros } = C;
  const bajar = (...a) => C.bajar(...a);
  const btn = (...a) => C.btn(...a);
  const fecha = (...a) => C.fecha(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const nombreZip = (...a) => C.nombreZip(...a);
  const pide = (...a) => C.pide(...a);
  const pinta = (...a) => C.pinta(...a);
  const q = (...a) => C.q(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);

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


  Object.assign(C, { guardaVersion, pintaVersiones, verVersion, restaura, borraVersion, diffLineas, comparar, muestraDiff });
})();
