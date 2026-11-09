'use strict';
/* Recorte cuadrado de la foto de perfil: arrastra para encuadrar, rueda, deslizador o pellizco para el zoom.
   P.recorta(archivo) devuelve una promesa con la imagen ya recortada (PNG) o `null` si se cancela.
   Si el navegador no puede abrir el formato (p. ej. HEIC) se devuelve el original y el servidor la recorta al centro. */
(function () {
  if (!window.K || !K.perfil) return;
  const LADO_SALIDA = 600;          // el servidor la reduce a 300 × 300; se manda de más para no perder nitidez

  K.perfil.recorta = function (archivo) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); resolve(archivo); };
      img.onload = () => abre(img, url, resolve);
      img.src = url;
    });
  };

  const MAX_LADO = 2400;            // las fotos enormes se reducen antes de encuadrar: arrastrar y hacer zoom sigue fluido

  function abre(img0, url, resolve) {
    let img = img0, nw = img0.naturalWidth, nh = img0.naturalHeight;
    if (!nw || !nh) { URL.revokeObjectURL(url); K.toast('No se pudo abrir la imagen'); resolve(null); return; }
    if (Math.max(nw, nh) > MAX_LADO) {
      const r = MAX_LADO / Math.max(nw, nh), c = document.createElement('canvas');
      c.width = Math.round(nw * r); c.height = Math.round(nh * r);
      try { c.getContext('2d').drawImage(img0, 0, 0, c.width, c.height); img = c; nw = c.width; nh = c.height; } catch { /* se usa el original */ }
    }
    const caja = el('div', 'pf-rec-caja'), lienzo = el('canvas', 'pf-rec-lienzo');
    const guia = el('div', 'pf-rec-guia');
    caja.append(lienzo, guia);
    const zoomIn = el('input'); zoomIn.type = 'range'; zoomIn.min = '0'; zoomIn.max = '100'; zoomIn.value = '0'; zoomIn.className = 'pf-rec-zoom'; zoomIn.setAttribute('aria-label', 'Zoom');
    const cont = el('div', 'pf-rec');
    cont.append(caja, el('p', 'k-faint pf-rec-ayuda', 'Arrastra para encuadrar. El círculo es cómo se verá en la cabecera.'), zoomIn);

    let lado = 280, escala = 1, min = 1, ox = 0, oy = 0, terminado = false;
    const max = () => min * 4;
    const limita = () => {
      const w = nw * escala, h = nh * escala;
      ox = Math.min(0, Math.max(lado - w, ox)); oy = Math.min(0, Math.max(lado - h, oy));
    };
    function pinta() {
      limita();
      const dpr = window.devicePixelRatio || 1;
      lienzo.width = Math.round(lado * dpr); lienzo.height = Math.round(lado * dpr);
      lienzo.style.width = lienzo.style.height = lado + 'px';
      const c = lienzo.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, lado, lado); c.drawImage(img, ox, oy, nw * escala, nh * escala);
    }
    // Cambia el zoom manteniendo fijo el punto (cx, cy) del visor
    function zoom(nuevo, cx = lado / 2, cy = lado / 2) {
      nuevo = Math.max(min, Math.min(max(), nuevo));
      const k = nuevo / escala; ox = cx - (cx - ox) * k; oy = cy - (cy - oy) * k; escala = nuevo;
      zoomIn.value = String(Math.round(((escala - min) / (max() - min)) * 100)); pinta();
    }
    function mide() {
      lado = Math.max(160, Math.min(280, Math.floor(window.innerWidth * 0.72)));
      min = lado / Math.min(nw, nh); escala = Math.max(escala, min);
      if (!terminado && ox === 0 && oy === 0) { ox = (lado - nw * escala) / 2; oy = (lado - nh * escala) / 2; }
      caja.style.width = caja.style.height = lado + 'px'; pinta();
    }

    // Arrastre y pellizco con eventos de puntero (ratón y táctil)
    const punteros = new Map(); let distAntes = 0;
    caja.addEventListener('pointerdown', (e) => { caja.setPointerCapture(e.pointerId); punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); distAntes = 0; });
    caja.addEventListener('pointermove', (e) => {
      const p = punteros.get(e.pointerId); if (!p) return;
      if (punteros.size === 1) { ox += e.clientX - p.x; oy += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; pinta(); return; }
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...punteros.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (distAntes) { const r = caja.getBoundingClientRect(); zoom(escala * (d / distAntes), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      distAntes = d;
    });
    const suelta = (e) => { punteros.delete(e.pointerId); distAntes = 0; };
    caja.addEventListener('pointerup', suelta); caja.addEventListener('pointercancel', suelta);
    // Teclado: flechas para mover, + y − para el zoom
    caja.tabIndex = 0; caja.setAttribute('aria-label', 'Encuadre de la foto: flechas para mover, más y menos para el zoom');
    caja.addEventListener('keydown', (e) => {
      const paso = e.shiftKey ? 30 : 10, k = e.key;
      if (k === 'ArrowLeft') ox += paso; else if (k === 'ArrowRight') ox -= paso; else if (k === 'ArrowUp') oy += paso; else if (k === 'ArrowDown') oy -= paso;
      else if (k === '+' || k === '=') zoom(escala * 1.1); else if (k === '-') zoom(escala / 1.1); else return;
      e.preventDefault(); pinta();
    });
    caja.addEventListener('wheel', (e) => { e.preventDefault(); const r = caja.getBoundingClientRect(); zoom(escala * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoomIn.addEventListener('input', () => zoom(min + (Number(zoomIn.value) / 100) * (max() - min)));

    function recorta() {
      const salida = Math.min(LADO_SALIDA, Math.round(lado / escala));          // nunca se amplía más que el original
      const out = document.createElement('canvas'); out.width = out.height = salida;
      const sx = -ox / escala, sy = -oy / escala, sl = lado / escala;
      out.getContext('2d').drawImage(img, sx, sy, sl, sl, 0, 0, salida, salida);
      return new Promise((ok) => out.toBlob((b) => ok(b), 'image/png'));
    }

    const m = K.modal({
      title: 'Recortar foto', cls: 'pf-rec-modal', content: cont, dismiss: true,
      actions: [
        { label: 'Cancelar', onClick: () => { terminado = true; } },
        { label: 'Usar esta foto', primary: true, onClick: async () => {
          const b = await recorta(); terminado = true;
          if (!b) { K.toast('No se pudo recortar la foto'); return false; }
          resolve(new File([b], 'perfil.png', { type: 'image/png' }));
        } },
      ],
      onClose: () => { URL.revokeObjectURL(url); window.removeEventListener('resize', mide); if (!terminado) { terminado = true; } resolve(null); },
    });
    window.addEventListener('resize', mide);
    mide();
    return m;
  }
})();
