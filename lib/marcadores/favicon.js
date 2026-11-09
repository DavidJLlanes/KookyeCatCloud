'use strict';
// Busca el icono (favicon) de una web: lee su HTML, prueba los iconos declarados y, si no hay, /favicon.ico.
// Solo se aceptan imágenes reconocidas por su cabecera real (nunca SVG: puede llevar scripts). Con sharp se guarda un WebP
// de 64 × 64; sin sharp (o con un .ico que no se pueda convertir) se guarda el archivo tal cual.
const { descarga, ErrorRed } = require('./red');

const LADO = 64;
const MAX_ICONO = 256 * 1024;

function tipoPorCabecera(b) {
  if (b.length < 8) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  return null;
}

// Un .ico es un contenedor: si su imagen más grande es un PNG, se saca para poder convertirla
function pngDeIco(b) {
  const n = b.readUInt16LE(4); let mejor = null;
  for (let i = 0; i < Math.min(n, 16); i++) {
    const o = 6 + i * 16; if (o + 16 > b.length) break;
    const ancho = b[o] || 256, tam = b.readUInt32LE(o + 8), pos = b.readUInt32LE(o + 12);
    if (pos + tam <= b.length && tipoPorCabecera(b.subarray(pos, pos + 8)) === 'png' && (!mejor || ancho > mejor.ancho)) mejor = { ancho, pos, tam };
  }
  return mejor ? b.subarray(mejor.pos, mejor.pos + mejor.tam) : null;
}

function candidatos(html, base) {
  const lista = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0], rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(t), href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(t);
    if (!rel || !href || !/icon/i.test(rel[1]) || /mask-icon/i.test(rel[1])) continue;
    const tam = /\bsizes\s*=\s*["']?(\d+)x\d+/i.exec(t);
    let url; try { url = new URL(href[1].trim(), base).toString(); } catch { continue; }
    lista.push({ url, puntos: (/apple-touch/i.test(rel[1]) ? 1000 : 0) + (tam ? Math.min(Number(tam[1]), 256) : 16) });
  }
  lista.sort((a, b) => b.puntos - a.puntos);
  let raiz; try { raiz = new URL('/favicon.ico', base).toString(); } catch { raiz = null; }
  const vistos = new Set(); const out = [];
  for (const c of [...lista.map(x => x.url), raiz]) if (c && !vistos.has(c)) { vistos.add(c); out.push(c); }
  return out.slice(0, 4);
}

async function normaliza(sharp, cuerpo) {
  let tipo = tipoPorCabecera(cuerpo); if (!tipo) return null;
  let datos = cuerpo;
  if (tipo === 'ico') { const png = pngDeIco(cuerpo); if (png) { datos = png; tipo = 'png'; } }
  if (sharp && tipo !== 'ico') {
    try { return { datos: await sharp(datos, { limitInputPixels: 16e6, failOn: 'none' }).resize(LADO, LADO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer(), ext: 'webp' }; } catch { return null; }
  }
  return { datos, ext: tipo };
}

// Devuelve { datos, ext } o null si la web no tiene icono utilizable. Los errores de red se propagan (ErrorRed).
async function buscaIcono(sharp, paginaUrl, { permiteLocal = false } = {}) {
  let html = '', base = paginaUrl;
  try {
    const p = await descarga(paginaUrl, { max: 400 * 1024, accept: 'text/html,*/*;q=0.5', permiteLocal });
    base = p.url;
    if (p.status < 400 && /html|xml|^$/i.test(String(p.headers['content-type'] || ''))) html = p.cuerpo.toString('utf8');
  } catch (e) { if (e instanceof ErrorRed && /no permitida|no es válida|solo se admiten/i.test(e.message)) throw e; /* la página falla: aún se prueba /favicon.ico */ }
  for (const url of candidatos(html, base)) {
    try {
      const r = await descarga(url, { max: MAX_ICONO, timeout: 5000, accept: 'image/*,*/*;q=0.5', permiteLocal });
      if (r.status >= 400 || r.truncado || !r.cuerpo.length) continue;
      const ok = await normaliza(sharp, r.cuerpo); if (ok) return ok;
    } catch { /* se prueba el siguiente */ }
  }
  return null;
}

module.exports = { buscaIcono, tipoPorCabecera };
