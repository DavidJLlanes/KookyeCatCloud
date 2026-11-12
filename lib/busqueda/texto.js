'use strict';
// Búsqueda · utilidades de texto: normalización sin acentos (conserva la longitud, para poder resaltar sobre el original),
// separación en palabras con una raíz ligera en español, aplanado de objetos JSON y fragmentos con las coincidencias marcadas.

// Quita acentos y pasa a minúsculas sin cambiar la longitud del texto (cada carácter se sustituye por otro de 1 unidad)
const plano = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/[À-ɏ]/g, (c) => (c === 'ñ' || c === 'Ñ' ? 'n' : c.normalize('NFD')[0]))
  .toLowerCase();

const VACIAS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'u', 'e', 'a', 'en', 'por', 'para', 'con', 'sin',
  'que', 'se', 'su', 'sus', 'es', 'lo', 'mi', 'me', 'te', 'tu', 'the', 'of', 'and', 'to', 'in', 'is', 'on', 'for']);

// Raíz ligera: plurales y algunos sufijos frecuentes. No es un lematizador: solo acerca «servidores» a «servidor».
function raiz(p) {
  if (p.length > 6 && p.endsWith('mente')) p = p.slice(0, -5);
  if (p.length > 5 && p.endsWith('ciones')) return p.slice(0, -6) + 'cion';
  if (p.length > 5 && p.endsWith('es') && !/[aeiou]es$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s') && !p.endsWith('ss')) return p.slice(0, -1);
  return p;
}

// Palabras de un texto (ya sin acentos), con raíz y sin palabras vacías
function palabras(texto, { vacias = true } = {}) {
  const out = [];
  for (const m of plano(texto).matchAll(/[a-z0-9]+/g)) {
    const p = m[0];
    if (p.length < 2 && !/\d/.test(p)) continue;
    if (vacias && VACIAS.has(p)) continue;
    out.push(raiz(p));
  }
  return out;
}

const OMITIR = new Set(['id', 'ids', 'icon', 'icono', 'color', 'createdAt', 'updatedAt', 'editBy', 'history', 'historial', 'versions', 'versiones', 'hist',
  'password', 'passwordHash', 'hash', 'clave', 'token', 'sha', 'sha256', 'mime', 'size', 'tamano', 'orden', 'order', 'cal', 'img', 'imagenes', 'foto', 'photo']);

// Todas las cadenas «de contenido» de un objeto (sin ids, colores, hashes ni historiales), separadas por saltos de línea
function aplana(valor, { max = 20000, prof = 0, numeros = false } = {}) {
  const partes = []; let total = 0;
  (function ir(v, p) {
    if (total >= max || p > 6 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || /^(#[0-9a-f]{3,8}|[a-f0-9]{16,})$/i.test(s)) return;
      partes.push(s); total += s.length;
    } else if (typeof v === 'number') { if (numeros) { partes.push(String(v)); total += 4; } }
    else if (Array.isArray(v)) for (const x of v) ir(x, p + 1);
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!OMITIR.has(k)) ir(x, p + 1); }
  })(valor, prof);
  return partes.join('\n').slice(0, max);
}

// Fragmento del texto alrededor de la primera coincidencia, con los trozos a resaltar: { texto, marcas: [[desde, hasta], …] }
function fragmento(texto, terminos, ancho = 180) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return { texto: '', marcas: [] };
  const p = plano(t);
  const hallados = [];
  for (const term of terminos) {
    if (!term) continue;
    let i = p.indexOf(term);
    let n = 0;
    while (i !== -1 && n < 20) {
      if (i === 0 || !/[a-z0-9]/.test(p[i - 1])) {             // solo al principio de una palabra, y se marca la palabra entera
        let fin = i + term.length; while (fin < p.length && /[a-z0-9]/.test(p[fin])) fin++;
        hallados.push([i, fin]); n++;
      }
      i = p.indexOf(term, i + term.length);
    }
  }
  if (!hallados.length) return { texto: t.slice(0, ancho) + (t.length > ancho ? '…' : ''), marcas: [] };
  hallados.sort((a, b) => a[0] - b[0]);
  const desde = Math.max(0, hallados[0][0] - Math.floor(ancho / 3));
  const hasta = Math.min(t.length, desde + ancho);
  const marcas = [];
  for (const [a, b] of hallados) {
    if (a < desde || a >= hasta) continue;
    const m = [a - desde + (desde > 0 ? 1 : 0), Math.min(b, hasta) - desde + (desde > 0 ? 1 : 0)];
    const ult = marcas[marcas.length - 1];
    if (ult && m[0] <= ult[1]) ult[1] = Math.max(ult[1], m[1]); else marcas.push(m);
  }
  return { texto: (desde > 0 ? '…' : '') + t.slice(desde, hasta) + (hasta < t.length ? '…' : ''), marcas };
}

// ¿Distancia de edición ≤ 1? (para tolerar erratas)
function cercana(a, b) {
  if (a === b) return true;
  const d = a.length - b.length;
  if (d > 1 || d < -1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

module.exports = { plano, palabras, raiz, aplana, fragmento, cercana };
