'use strict';
// Bases · validación de los valores de las celdas según el tipo de su columna.
const store = require('../nucleo/store');
const { HttpError, cleanStr } = store;
const { LIM, RE_DIA, RE_ID } = require('./constantes');

const dia = (v) => (RE_DIA.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : '');
const urlOk = (v) => { const s = cleanStr(v, 500).trim(); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; };
const correoOk = (v) => { const s = cleanStr(v, 200).trim(); return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(s) ? s : ''; };
const telefonoOk = (v) => { const s = cleanStr(v, 40).trim(); return /^\+?[\d\s().-]{5,25}$/.test(s) && (s.match(/\d/g) || []).length >= 5 ? s : ''; };
// Ruta dentro de Archivos del usuario: relativa, sin «..» ni caracteres de control
const rutaOk = (v) => {
  const s = cleanStr(v, 500).trim().replace(/\\/g, '/').replace(/^\/+/, '');
  return s && !s.split('/').some(p => p === '..' || p === '.') && !/[\u0000-\u001f]/.test(s) ? s : '';
};

// Los tipos que se calculan (fórmula, resumen) no guardan valor; la relación guarda los ids de las filas enlazadas
const esCalculada = (c) => c.tipo === 'formula' || c.tipo === 'rollup';
const vacioDe = (col) => (col.tipo === 'checkbox' ? false : (col.tipo === 'multiselect' || col.tipo === 'relation') ? [] : col.tipo === 'number' ? null : '');
const tieneValor = (col, v) => (col.tipo === 'checkbox' ? v === true : Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined);

// Lo que no cabe o no es válido se RECHAZA con aviso (antes se recortaba o se vaciaba sin decir nada y se perdía al
// guardar). Con `recortar` (importaciones y limpieza de datos ya guardados) se adapta como antes.
function valorCelda(col, v, recortar) {
  const vacio = v === '' || v === null || v === undefined;
  const no = (msg) => { throw new HttpError(400, `«${col.nombre}»: ${msg}`); };
  // Texto con formato propio: vacío es válido; si no vacío y no cumple, se avisa (o se descarta al importar)
  const formato = (fn, max, msg) => { const u = fn(v); if (!u && !vacio && String(v).trim() && !recortar) no(String(v).length > max ? `es demasiado largo (máximo ${max})` : msg); return u; };
  switch (col.tipo) {
    case 'text': return store.textoLargo(v, 2000, `«${col.nombre}»`, recortar);
    case 'number': {
      if (vacio) return null;
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return recortar ? null : no('no es un número');
      if (Math.abs(n) > 1e12) return recortar ? Math.max(-1e12, Math.min(1e12, n)) : no('el número es demasiado grande');
      return n;
    }
    case 'date': { const d = dia(v); if (!d && !vacio && !recortar) no('la fecha no es válida (AAAA-MM-DD)'); return d; }
    case 'checkbox': return v === true || v === 'true' || v === 1;
    case 'url': return formato(urlOk, 500, 'el enlace debe empezar por http:// o https://');
    case 'email': return formato(correoOk, 200, 'el correo no es válido');
    case 'phone': return formato(telefonoOk, 40, 'el teléfono no es válido');
    case 'file': return formato(rutaOk, 500, 'la ruta del archivo no es válida');
    case 'select': return (col.opciones || []).some(o => o.id === v) ? v : '';
    case 'multiselect': { const ok = new Set((col.opciones || []).map(o => o.id)); return [...new Set((Array.isArray(v) ? v : []).filter(x => ok.has(x)))].slice(0, LIM.OPC); }
    case 'relation': {
      const ids = [...new Set((Array.isArray(v) ? v : []).map(String).filter(x => RE_ID.test(x)))];
      if (ids.length > LIM.RELACION && !recortar) no(`máximo ${LIM.RELACION} enlaces por fila`);
      return ids.slice(0, LIM.RELACION);
    }
    default: return undefined;   // fórmula y resumen no se guardan
  }
}
function limpiaCeldas(cols, c, prev = {}, recortar) {
  const out = { ...prev };
  for (const col of cols) {
    if (esCalculada(col)) { delete out[col.id]; continue; }
    if (c && Object.prototype.hasOwnProperty.call(c, col.id)) out[col.id] = valorCelda(col, c[col.id], recortar);
  }
  for (const k of Object.keys(out)) if (!cols.some(x => x.id === k)) delete out[k];
  return out;
}

module.exports = { dia, urlOk, valorCelda, limpiaCeldas, vacioDe, tieneValor, esCalculada };
