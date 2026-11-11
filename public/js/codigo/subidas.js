'use strict';
/* codigo/subidas.js: parte del módulo (se carga con el resto de codigo/ en index.html). Comparte el espacio K._codigo. */
(function () {
  const C = (K._codigo = K._codigo || {});
  const { MAXB, S, logros } = C;
  const asigna = (...a) => C.asigna(...a);
  const guardaYa = (...a) => C.guardaYa(...a);
  const padresAbre = (...a) => C.padresAbre(...a);
  const tam = (...a) => C.tam(...a);
  const url = (...a) => C.url(...a);

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


  Object.assign(C, { menuSubir, xhr, sube, subeZip, zipEn });
})();
