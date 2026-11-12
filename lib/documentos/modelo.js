'use strict';
// Documentos · normaliza lo que llega del cliente y calcula los datos derivados (palabras, caracteres, extracto).
const { cleanStr, HttpError } = require('../store');
const C = require('./constantes');
const { sanea, aTexto, cuentaPalabras } = require('./sanear');

const titulo = (t) => cleanStr(t, C.MAX_TITULO).replace(/\s+/g, ' ').trim();

/** Cuerpo → HTML saneado. Un HTML demasiado grande se rechaza (no se recorta en silencio). */
function cuerpo(html) {
  const s = String(html === undefined || html === null ? '' : html);
  if (s.length > C.MAX_HTML * 1.3) throw new HttpError(400, `El documento es demasiado grande (${s.length.toLocaleString('es-ES')} caracteres, máximo ${C.MAX_HTML.toLocaleString('es-ES')}). Divídelo en dos documentos.`);
  const limpio = sanea(s, C.MAX_HTML);
  if (limpio.length >= C.MAX_HTML) throw new HttpError(400, 'El documento es demasiado grande. Divídelo en dos documentos.');
  return limpio;
}

/** Datos que se guardan junto al HTML y evitan recalcularlos al listar */
function derivados(html) {
  const texto = aTexto(html);
  return { palabras: cuentaPalabras(texto), caracteres: texto.length, extracto: texto.replace(/\s+/g, ' ').slice(0, 160),
    cols: /class="dc-cols"/.test(html), tablas: /<table[\s>]/.test(html), enlaces: /<a href=/.test(html), titulos: /<h[1-3][\s>]/.test(html), listas: /<(ul|ol)[\s>]/.test(html) };
}

module.exports = { titulo, cuerpo, derivados };
