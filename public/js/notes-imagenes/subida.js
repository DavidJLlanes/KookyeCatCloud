'use strict';
/* Imágenes de notas · subida a «Adjuntos de notas»: una a una, con optimización, aviso de progreso y sin perder las que sí subieron. */
(function () {
  if (!window.NB || !NB.imagenes) return;
  const I = NB.imagenes;
  I.DIR = 'Adjuntos de notas';
  I.MAX_MB = 30;
  I.EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif)$/i;

  // Devuelve las rutas de las que se subieron; las que fallan se cuentan y se explican al final
  I.sube = async function (files) {
    const rutas = [], fallos = [];
    for (let i = 0; i < files.length; i++) {
      const original = files[i];
      if (files.length > 1) K.toast(`Subiendo imagen ${i + 1} de ${files.length}…`);
      try {
        const f = await I.optimiza(original);
        if (f.size > I.MAX_MB * 1024 * 1024) { fallos.push(`«${original.name}» pesa demasiado (máx. ${I.MAX_MB} MB)`); continue; }
        const fd = new FormData(); fd.append('files', f, f.name || 'imagen.jpg');
        const res = await api(BASE + '/api/upload?path=' + encodeURIComponent(I.DIR), { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'No se pudo subir la imagen');
        rutas.push(I.DIR + '/' + j.uploaded[0]);
      } catch (e) { fallos.push(`«${original.name || 'imagen'}»: ${e && e.message ? e.message : 'falló la subida'}`); }
    }
    if (rutas.length) K.bus.emit('files');
    return { rutas, fallos };
  };

  // Sube e inserta en la nota (después del bloque `w`, o al final)
  NB.subeImagenes = async function (files, w) {
    const lista = [...files].filter(f => /^image\//.test(f.type) || I.EXT.test(f.name || ''));
    if (!lista.length) { K.toast('Elige una imagen (JPG, PNG, WebP, GIF, HEIC…)'); return; }
    K.toast(lista.length === 1 ? 'Subiendo imagen…' : `Subiendo ${lista.length} imágenes…`);
    const { rutas, fallos } = await I.sube(lista);
    if (rutas.length) { I.inserta(rutas, w); K.toast(rutas.length === 1 ? 'Imagen añadida' : `${rutas.length} imágenes añadidas`); }
    if (fallos.length) K.fail(new Error(fallos.length === 1 ? fallos[0] : `${fallos.length} imágenes no se pudieron subir:\n${fallos.join('\n')}`));
  };
})();
