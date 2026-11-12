'use strict';
// Bases · cambio de tipo de una columna ya creada: convierte los valores guardados al tipo nuevo.
// Lo que no se puede convertir queda vacío y se cuenta para avisar (además, el servidor guarda una copia antes de aplicarlo).
const { RE_DIA, LIM } = require('./constantes');
const { valorCelda, vacioDe, tieneValor } = require('./valores');
const { aTexto } = require('./formulas');
const { newId } = require('../nucleo/store');

const nombreOpc = (c, id) => ((c.opciones || []).find(o => o.id === id) || {}).nombre || '';
const hallaOpc = (c, texto) => { const t = String(texto || '').trim().toLocaleLowerCase('es'); return t ? (c.opciones || []).find(o => o.nombre.toLocaleLowerCase('es') === t) : null; };
// «31/12/2026» o «2026-12-31» → «2026-12-31»
function aDia(s) {
  const t = String(s || '').trim();
  if (RE_DIA.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
// Valor de la celda como texto plano (sea cual sea su tipo anterior)
function comoTexto(c, v) {
  if (c.tipo === 'select') return nombreOpc(c, v);
  if (c.tipo === 'multiselect') return (v || []).map(i => nombreOpc(c, i)).filter(Boolean).join(', ');
  if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
  if (c.tipo === 'number') return v === null || v === undefined ? '' : aTexto(v);
  return String(v === null || v === undefined ? '' : v);
}

// Si la columna nueva es de selección y no trae opciones, se crean a partir de los valores distintos que ya había
function opcionesAuto(vieja, nueva, filas) {
  if (!(nueva.tipo === 'select' || nueva.tipo === 'multiselect') || (nueva.opciones || []).length) return;
  const nombres = new Set();
  for (const r of filas) {
    const t = vieja.tipo === 'multiselect' ? (r.c[vieja.id] || []).map(i => nombreOpc(vieja, i)) : [comoTexto(vieja, r.c[vieja.id])];
    for (const x of t) { const n = String(x).trim().slice(0, 40); if (n && nombres.size < LIM.OPC) nombres.add(n); }
  }
  const col = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
  nueva.opciones = [...nombres].map((nombre, i) => ({ id: newId(), nombre, color: col[i % col.length] }));
}

function convierteValor(vieja, nueva, v) {
  const txt = comoTexto(vieja, v);
  const intenta = (fn) => { try { return fn(); } catch { return vacioDe(nueva); } };
  switch (nueva.tipo) {
    case 'number': return intenta(() => (vieja.tipo === 'checkbox' ? (v ? 1 : 0) : valorCelda(nueva, txt.replace(/[^\d,.\-eE+]/g, ''), true)));
    case 'date': return aDia(txt);
    case 'checkbox': return vieja.tipo === 'number' ? Number(v) > 0 : /^(s[ií]|true|1|x|ok|hecho|verdadero)$/i.test(txt.trim());
    case 'select': {
      if (vieja.tipo === 'multiselect') { const ok = (v || []).find(i => (nueva.opciones || []).some(o => o.id === i)); if (ok) return ok; const o = hallaOpc(nueva, nombreOpc(vieja, (v || [])[0])); return o ? o.id : ''; }
      const o = hallaOpc(nueva, txt); return o ? o.id : '';
    }
    case 'multiselect': {
      if (vieja.tipo === 'select') { if ((nueva.opciones || []).some(o => o.id === v)) return [v]; const o = hallaOpc(nueva, nombreOpc(vieja, v)); return o ? [o.id] : []; }
      return [...new Set(txt.split(/[,;]/).map(x => hallaOpc(nueva, x)).filter(Boolean).map(o => o.id))];
    }
    case 'text': return txt.slice(0, 2000);
    default: return intenta(() => valorCelda(nueva, txt, false));     // url, correo, teléfono, archivo: si no cumple el formato, queda vacío
  }
}

// Aplica los cambios a todas las filas y devuelve los avisos («3 valores se vaciaron»)
function aplicaCambios(b, cambios) {
  const avisos = [];
  for (const { id, nombre, de, a } of cambios) {
    const nueva = b.columns.find(c => c.id === id); let perdidos = 0;
    opcionesAuto(de, nueva, b.rows);
    for (const r of b.rows) {
      const antes = r.c[id]; const ahora = convierteValor(de, nueva, antes);
      if (tieneValor(de, antes) && !tieneValor(nueva, ahora)) perdidos++;
      r.c[id] = ahora;
    }
    if (perdidos) avisos.push(`«${nombre}»: ${perdidos} valor${perdidos === 1 ? '' : 'es'} no se pudo convertir a ${a} y quedó vacío (hay copia de la base anterior durante 30 días)`);
  }
  return avisos;
}

module.exports = { aplicaCambios, convierteValor };
