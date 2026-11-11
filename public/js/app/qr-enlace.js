'use strict';
/* QR de un enlace compartido (imagen PNG descargable) y cambio de caducidad.
   Usa la librería qrcode-generator (public/vendor/qrcode). Expone K.qrEnlace(url, id, etiqueta). */
(function () {
  const ESC = 10;                 // píxeles por módulo del QR
  const MARGEN = 4;               // módulos de margen blanco

  function dibujaQr(canvas, texto) {
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const lado = (n + MARGEN * 2) * ESC;
    canvas.width = lado; canvas.height = lado;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, lado, lado);
    c.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect((x + MARGEN) * ESC, (y + MARGEN) * ESC, ESC, ESC);
  }

  function qrEnlace(url, id, etiqueta) {
    if (!window.qrcode) { showToast('No se pudo cargar el generador de QR'); return; }
    const ov = el('div', 'overlay'); ov.id = 'qr-modal';
    const m = el('div', 'modal');
    m.appendChild(el('h3', null, 'Código QR'));
    m.appendChild(el('p', 'sub', etiqueta || 'Escanéalo para abrir el enlace'));
    const canvas = el('canvas'); canvas.style.cssText = 'width:min(260px,70vw);height:auto;display:block;margin:6px auto 10px;border-radius:12px;background:#fff;image-rendering:pixelated';
    canvas.setAttribute('aria-label', 'Código QR del enlace');
    m.appendChild(canvas);
    const u = el('code', null, url); u.style.cssText = 'display:block;text-align:center;word-break:break-all;font-size:calc(12px*var(--fs,1));margin-bottom:12px';
    m.appendChild(u);
    const acc = el('div', 'modal-actions');
    const cerrar = el('button', 'btn', 'Cerrar'); cerrar.type = 'button';
    const copiar = el('button', 'btn', 'Copiar enlace'); copiar.type = 'button';
    const bajar = el('button', 'btn primary', 'Descargar PNG'); bajar.type = 'button';
    acc.append(cerrar, copiar, bajar); m.appendChild(acc); ov.appendChild(m);
    document.body.appendChild(ov);
    try { dibujaQr(canvas, url); } catch { showToast('El enlace es demasiado largo para un QR'); ov.remove(); return; }
    const fin = () => ov.remove();
    cerrar.addEventListener('click', fin);
    ov.addEventListener('click', (e) => { if (e.target === ov) fin(); });
    copiar.addEventListener('click', () => copiarTexto(url, 'Enlace copiado al portapapeles'));
    bajar.addEventListener('click', () => {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `qr-${id}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        try { await post(BASE + '/api/sharelinks/' + qs(id) + '/qr', {}); if (window.K && K.game && K.game.load) K.game.load(); } catch { /* sin conexión: el PNG ya está descargado */ }
      }, 'image/png');
    });
  }

  // Cambiar la caducidad de un enlace propio. Pide días (0 = sin caducidad; admite 0,04 ≈ 1 hora).
  async function cambiaCaducidad(link, alTerminar) {
    const v = prompt('Días hasta que caduque (0 = sin caducidad; 0,04 ≈ 1 hora):', link.expiresAt ? String(Math.max(1, Math.round((link.expiresAt - Date.now()) / 86400000))) : '0');
    if (v === null) return;
    const dias = Number(String(v).replace(',', '.'));
    if (!(dias >= 0) || dias > 3650) { showToast('Pon un número entre 0 y 3650'); return; }
    const res = await api(BASE + '/api/sharelinks/' + qs(link.id) + '/caducidad', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: dias }) });
    if (!res.ok) { showToast('No se pudo cambiar'); return; }
    showToast(dias > 0 ? 'Caducidad actualizada' : 'El enlace ya no caduca');
    if (alTerminar) alTerminar();
  }

  window.K = window.K || {};
  K.qrEnlace = qrEnlace;
  K.cambiaCaducidad = cambiaCaducidad;
})();
