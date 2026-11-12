'use strict';
// Descompresión de ZIP con topes sobre los bytes REALES inflados (no los de la cabecera, que
// un ZIP manipulado puede falsear). Aborta en cuanto una entrada o el total pasan el límite.
const { Unzip, UnzipInflate } = require('fflate');

function descomprimeZip(buffer, { maxArchivos, maxArchivo, maxTotal, ignora, error }) {
  const salida = Object.create(null);   // un nombre «__proto__» no toca el prototipo
  let contados = 0, total = 0;
  const uz = new Unzip();
  uz.register(UnzipInflate);
  uz.onfile = (f) => {
    if (f.name.endsWith('/') || (ignora && ignora(f.name))) return;
    if (++contados > maxArchivos) throw error(`El ZIP tiene demasiados archivos (máximo ${maxArchivos})`);
    if (f.originalSize > maxArchivo) throw error(`«${f.name}» supera los 10 MB`);
    const trozos = []; let tam = 0;
    f.ondata = (err, datos, fin) => {
      if (err) throw error('El ZIP no es válido o está dañado');
      tam += datos.length; total += datos.length;
      if (tam > maxArchivo) throw error(`«${f.name}» supera los 10 MB`);
      if (total > maxTotal) throw error('El contenido del ZIP supera los 50 MB');
      trozos.push(datos);
      if (fin) salida[f.name] = Buffer.concat(trozos);
    };
    f.start();
  };
  try { uz.push(new Uint8Array(buffer), true); }
  catch (e) { if (e && e.status) throw e; throw error('El ZIP no es válido o está dañado'); }
  return salida;
}
module.exports = { descomprimeZip };
