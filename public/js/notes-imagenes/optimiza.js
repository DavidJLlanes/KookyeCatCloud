'use strict';
/* Imágenes de notas · optimizar antes de subir (fotos de móvil y de cámara pesan 5-15 MB).
   JPEG, HEIC y HEIF (iPhone) se pasan a JPEG y se reducen a 2560 px; PNG y WebP solo se reducen si son enormes;
   GIF, SVG, AVIF y lo que este navegador no sabe leer se suben tal cual. Todo ocurre en el dispositivo. */
(function () {
  if (!window.NB) return;
  const I = NB.imagenes = NB.imagenes || {};
  const MAX_LADO = 2560, UMBRAL = 1.5 * 1024 * 1024, CALIDAD = 0.86;
  const POR_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  const tipoDe = (f) => (f.type || POR_EXT[(String(f.name).split('.').pop() || '').toLowerCase()] || '').toLowerCase();
  const GENERICO = /^(image|imagen|captura|screenshot|blob|photo|foto|unnamed)(\s*\(\d+\))?\.\w+$/i;
  const p2 = (n) => String(n).padStart(2, '0');

  // «foto-20261111-170600.jpg» para los nombres que no dicen nada (pegar, cámara de algunos Android); el resto conserva su nombre
  function nombre(f, ext) {
    const base = GENERICO.test(f.name || '') || !f.name ? (() => { const d = new Date(); return `foto-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; })() : f.name.replace(/\.[^.]+$/, '');
    return `${base}.${ext}`;
  }
  const aBlob = (canvas, tipo, calidad) => new Promise((ok) => canvas.toBlob(ok, tipo, calidad));

  I.optimiza = async function (f) {
    const tipo = tipoDe(f);
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(tipo)) return f;
    let bmp;
    try { bmp = await createImageBitmap(f); } catch { return f; }          // p. ej. HEIC en Chrome: se sube tal cual
    try {
      const esc = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
      const foto = /jpeg|heic|heif/.test(tipo), heic = /heic|heif/.test(tipo);
      if (esc === 1 && !heic && !(foto && f.size > UMBRAL)) return f;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
      const ctx = c.getContext('2d'); if (!ctx) return f;
      if (foto) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const salida = foto ? 'image/jpeg' : tipo;
      const blob = await aBlob(c, salida, foto ? CALIDAD : undefined);
      c.width = c.height = 0;                                              // libera la memoria (iPhone es estricto)
      if (!blob || (!heic && blob.size >= f.size)) return f;                // no se ha ganado nada: el original
      return new File([blob], nombre(f, foto ? 'jpg' : tipo.split('/')[1]), { type: blob.type });
    } catch { return f; } finally { if (bmp.close) bmp.close(); }
  };
})();
