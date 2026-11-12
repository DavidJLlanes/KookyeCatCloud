'use strict';
// Importar · lector de CSV: codificación (UTF-8 o Windows-1252), separador (, ; tabulador |), comillas y saltos de línea dentro de
// una celda, y sugerencia del tipo de cada columna (número, fecha, casilla, selección, enlace, correo, teléfono o texto).
const MAX_FILAS = 20000, MAX_COLS = 200;

function decodifica(buf) {
  let b = buf; if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

function detectaSeparador(texto) {
  const muestra = texto.slice(0, 20000).split(/\r?\n/).slice(0, 8);
  let mejor = ',', mejorPuntos = -1;
  for (const sep of [',', ';', '\t', '|']) {
    const cuentas = muestra.filter(l => l.trim()).map(l => { let n = 0, dentro = false; for (const ch of l) { if (ch === '"') dentro = !dentro; else if (ch === sep && !dentro) n++; } return n; });
    if (!cuentas.length || !cuentas[0]) continue;
    const puntos = cuentas[0] * (cuentas.every(c => c === cuentas[0]) ? 3 : 1);
    if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = sep; }
  }
  return mejor;
}

function parsea(texto, sep) {
  const filas = []; let fila = [], cel = '', dentro = false, i = 0; const n = texto.length;
  while (i < n) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') { if (texto[i + 1] === '"') { cel += '"'; i += 2; continue; } dentro = false; i++; continue; }
      cel += ch; i++; continue;
    }
    if (ch === '"' && cel === '') { dentro = true; i++; continue; }
    if (ch === sep) { fila.push(cel); cel = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(cel); cel = ''; i++;
      if (fila.some(c => c !== '') || fila.length > 1) filas.push(fila);
      fila = []; if (filas.length > MAX_FILAS) break; continue;
    }
    cel += ch; i++;
  }
  if (cel !== '' || fila.length) { fila.push(cel); if (fila.some(c => c !== '')) filas.push(fila); }
  return filas;
}

// «1.234,56», «1,234.56», «12,5», «€ 3», «-7» → número, o null
function numero(s) {
  let t = String(s).trim().replace(/[\s€$£%]/g, '');
  if (!/^[-+]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const pt = t.lastIndexOf('.'), co = t.lastIndexOf(',');
  if (pt >= 0 && co >= 0) t = pt > co ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (co >= 0) t = /^[-+]?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : /^[-+]?[\d]*,\d+$/.test(t) ? t.replace(',', '.') : '';
  else if (pt >= 0) t = /^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(t) ? t.replace(/\./g, '') : /^[-+]?\d*\.\d+$/.test(t) ? t : '';
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t); return Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null;
}

// ISO, d/m/a, d-m-a, d.m.a, a/m/d → AAAA-MM-DD, o null. Con dos números ≤ 12 se entiende día/mes (formato español).
function fecha(s) {
  const t = String(s).trim(); let a, m, d, r;
  if ((r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t))) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/.exec(t))) { d = +r[1]; m = +r[2]; a = r[3].length === 2 ? 2000 + +r[3] : +r[3]; if (m > 12 && d <= 12) [d, m] = [m, d]; }
  else return null;
  if (a < 1000 || a > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d)); if (f.getUTCMonth() !== m - 1) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const SI = /^(s[ií]|true|verdadero|yes|x|1|✓|✔)$/i, NO = /^(no|false|falso|0|)$/i;
const casilla = (s) => (SI.test(String(s).trim()) ? true : NO.test(String(s).trim()) ? false : null);

// Tipo sugerido según los valores (ignora los vacíos). Con menos de 3 valores se queda en texto.
function sugiereTipo(valores) {
  const v = valores.map(x => String(x).trim()).filter(Boolean);
  if (v.length < 2) return 'text';
  const todos = (f) => v.every(x => f(x));
  if (todos(x => /^https?:\/\/\S+$/i.test(x))) return 'url';
  if (todos(x => x.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) return 'email';
  if (todos(x => /^[+()\d][\d\s().-]{6,}$/.test(x)) && !todos(x => numero(x) !== null && !/^[+(]/.test(x) && x.replace(/\D/g, '').length < 7)) return 'phone';
  if (todos(x => fecha(x) !== null)) return 'date';
  const bin = v.filter(x => /^(s[ií]|no|true|false|verdadero|falso|x)$/i.test(x)).length === v.length;
  if (bin) return 'checkbox';
  if (todos(x => numero(x) !== null)) return 'number';
  const unicos = new Set(v.map(x => x.toLowerCase()));
  if (unicos.size <= 12 && unicos.size <= v.length / 2 && v.every(x => x.length <= 40)) return 'select';
  return 'text';
}

/** Lee un CSV: { cabecera, filas, separador, total, truncado }. La primera fila es la cabecera. */
function lee(buf) {
  const texto = decodifica(buf);
  const sep = detectaSeparador(texto);
  const todas = parsea(texto, sep);
  if (todas.length < 1) return { cabecera: [], filas: [], separador: sep, total: 0, truncado: false };
  const ancho = Math.min(MAX_COLS, Math.max(...todas.slice(0, 50).map(f => f.length)));
  const cab = todas[0].slice(0, ancho).map((c, i) => String(c).trim() || `Columna ${i + 1}`);
  while (cab.length < ancho) cab.push(`Columna ${cab.length + 1}`);
  const filas = todas.slice(1).map(f => { const r = f.slice(0, ancho); while (r.length < ancho) r.push(''); return r; });
  return { cabecera: cab, filas, separador: sep, total: filas.length, truncado: todas.length > MAX_FILAS };
}

module.exports = { lee, numero, fecha, casilla, sugiereTipo, decodifica, MAX_FILAS };
