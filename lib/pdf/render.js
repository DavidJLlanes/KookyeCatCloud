'use strict';
// Dibuja el PDF con pdfkit a partir de los bloques de lib/pdf/markdown.js. Fuentes DejaVu incluidas en el repositorio
// (cubren acentos, griego, cirílico y símbolos como ☐ ☑ • ); los caracteres que la fuente no tiene (emojis de color)
// se omiten en vez de salir como cuadrados. A4 vertical, u horizontal para tablas anchas; pie con «n / total».
const PDFDocument = require('pdfkit');
const path = require('path');
const { bloques, inline } = require('./markdown');

const F = (n) => path.join(__dirname, 'fuentes', n);
const CALLOUTS = { NOTE: ['Nota', '#3b82f6'], TIP: ['Consejo', '#22c55e'], WARNING: ['Aviso', '#f59e0b'], IMPORTANT: ['Importante', '#ef4444'] };
const COLOR = '#111111', GRIS = '#555555', LINEA = '#cccccc';

// resuelveImagen(ref) → Promise<Buffer|null>: lo aporta quien llama (acceso a los archivos del usuario)
async function renderiza({ md, titulo, ancho, resuelveImagen }) {
  const doc = new PDFDocument({
    size: 'A4', layout: ancho ? 'landscape' : 'portrait', margins: { top: 54, bottom: 58, left: 52, right: 52 }, bufferPages: true,
    info: { Title: titulo || 'Documento', Creator: 'KookyeCatCloud', Producer: 'KookyeCatCloud' },
  });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  const fin = new Promise((res, rej) => { doc.on('end', res); doc.on('error', rej); });
  doc.registerFont('S', F('DejaVuSans.ttf')); doc.registerFont('SB', F('DejaVuSans-Bold.ttf'));
  doc.registerFont('SI', F('DejaVuSans-Oblique.ttf')); doc.registerFont('SBI', F('DejaVuSans-BoldOblique.ttf'));
  doc.registerFont('M', F('DejaVuSansMono.ttf'));

  const L = () => doc.page.margins.left;
  const W = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const FONDO = () => doc.page.height - doc.page.margins.bottom;
  const hay = (h) => doc.y + h <= FONDO() + 0.01;
  const asegura = (h) => { if (!hay(h)) doc.addPage(); };
  const gap = (n) => { doc.y += n; };
  const paginas = () => doc.bufferedPageRange().count;

  // Quita lo que la fuente no tiene (emojis, selectores de variación, controles)
  const soporta = {};
  function filtra(txt, f) {
    if (!soporta[f]) {
      const ft = doc.font(f)._font.font;
      soporta[f] = (cp) => { try { return ft.hasGlyphForCodePoint(cp); } catch { return true; } };
    }
    const ok = soporta[f];
    let o = '';
    for (const ch of String(txt).replace(/\t/g, '    ')) {
      const cp = ch.codePointAt(0);
      if (cp === 10) { o += ch; continue; }
      if (cp < 32 || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
      if (ok(cp)) o += ch;
    }
    return o;
  }
  const fuenteDe = (r, base) => {
    const b = r.b || base.b, i = r.i || base.i;
    return r.code ? 'M' : b && i ? 'SBI' : b ? 'SB' : i ? 'SI' : 'S';
  };
  function altura(tr, w, size, base = {}) {
    const f = fuenteDe({}, base);
    const t = filtra(tr.map((r) => r.t).join(''), f);
    doc.font(f).fontSize(size);
    return t ? doc.heightOfString(t, { width: w, lineGap: 2 }) : size * 1.25;
  }

  // Dibuja tramos con formato desde (x, y); deja doc.y debajo del texto
  function texto(tramos, { x, y, ancho: w, size = 10.5, color = COLOR, base = {}, align = 'left' }) {
    const lista = tramos.map((r) => { const f = fuenteDe(r, base); return { ...r, f, t: filtra(r.t, f) }; }).filter((r) => r.t !== '');
    if (!lista.length) { doc.x = x; doc.y = y + size * 1.25; return; }
    lista.forEach((r, k) => {
      doc.font(r.f).fontSize(r.code ? size * 0.92 : size).fillColor(r.link ? '#4338ca' : r.code ? '#9f1239' : color);
      const o = { width: w, continued: k < lista.length - 1, lineGap: 2, align, link: r.link || undefined, underline: !!r.link, strike: !!r.s };
      if (k === 0) doc.text(r.t, x, y, o); else doc.text(r.t, o);
    });
    doc.x = x;
  }

  /* ---------- Bloques ---------- */
  function parrafo(b) {
    const tr = inline(b.text);
    asegura(Math.min(altura(tr, W(), 10.5), 40));
    texto(tr, { x: L(), y: doc.y, ancho: W() });
    gap(6);
  }
  function titulos(b) {
    const size = [0, 20, 16, 13.5, 12, 11, 10.5][b.n];
    gap(b.n === 1 ? 4 : 10);
    asegura(size * 2.6);
    texto(inline(b.text), { x: L(), y: doc.y, ancho: W(), size, base: { b: true } });
    if (b.n <= 2) {
      const y = doc.y + 1;
      doc.moveTo(L(), y).lineTo(L() + W(), y).lineWidth(0.6).strokeColor(LINEA).stroke();
      doc.y = y + 4;
    }
    gap(4);
  }
  function elemento(b) {
    const sangria = 16 + b.nivel * 16, w = W() - sangria;
    const tr = inline(b.text);
    asegura(Math.min(altura(tr, w, 10.5), 30));
    const y = doc.y;
    const marca = b.caja !== null ? (b.caja ? '☑' : '☐') : b.ord ? `${b.num}.` : ['•', '◦', '▪', '·'][b.nivel % 4];
    doc.font('S').fontSize(10.5).fillColor(GRIS).text(filtra(marca, 'S'), L() + b.nivel * 16, y, { width: 14, align: 'right', lineBreak: false });
    texto(tr, { x: L() + sangria, y, ancho: w, color: b.caja ? '#777777' : COLOR });
    gap(2);
  }
  function cita(b) {
    const w = W() - 18, tr = inline(b.text);
    asegura(Math.min(altura(tr, w, 10.5, { i: true }) + 8, 60));
    const y = doc.y, antes = paginas();
    texto(tr, { x: L() + 14, y: y + 3, ancho: w, color: '#444444', base: { i: true } });
    if (paginas() === antes) doc.rect(L(), y, 3, doc.y - y + 3).fill('#6366f1');
    doc.y += 8;
  }
  function aviso(b) {
    const [nombre, color] = CALLOUTS[b.kind], w = W() - 26, tr = inline(b.text);
    const h = Math.min(altura(tr, w, 10.5) + 26, FONDO() - doc.page.margins.top);
    asegura(h + 6);
    const y = doc.y;
    doc.save(); doc.fillColor(color, 0.08).rect(L(), y, W(), h).fill(); doc.restore();
    doc.rect(L(), y, 3, h).fill(color);
    doc.font('SB').fontSize(9).fillColor(color).text(nombre.toUpperCase(), L() + 14, y + 6, { width: w, lineBreak: false });
    texto(tr, { x: L() + 14, y: y + 20, ancho: w });
    doc.y = y + h + 6;
  }
  function codigo(b) {
    const w = W() - 12;
    gap(2);
    for (const raw of b.lines.length ? b.lines : ['']) {
      const t = filtra(raw, 'M') || ' ';
      doc.font('M').fontSize(9);
      const h = doc.heightOfString(t, { width: w, lineGap: 1.5 });
      asegura(h + 2);
      const y = doc.y;
      doc.rect(L(), y, W(), h + 1.5).fill('#f4f4f6');
      doc.font('M').fontSize(9).fillColor('#1f2937').text(t, L() + 6, y + 0.5, { width: w, lineGap: 1.5 });
      doc.y = y + h + 1.5;
    }
    gap(8);
  }
  function separador() { asegura(14); const y = doc.y + 4; doc.moveTo(L(), y).lineTo(L() + W(), y).lineWidth(0.6).strokeColor(LINEA).stroke(); doc.y = y + 10; }

  async function imagen(b) {
    let buf = null;
    try { buf = resuelveImagen ? await resuelveImagen(b.ref) : null; } catch { buf = null; }
    let img = null;
    if (buf) { try { img = doc.openImage(buf); } catch { img = null; } }
    if (!img) { parrafo({ text: `*(imagen no disponible${b.alt ? ': ' + b.alt : ''})*` }); return; }
    const maxW = W(), maxH = FONDO() - doc.page.margins.top - 30;
    const esc = Math.min(1, maxW / img.width, maxH / img.height);
    const w = img.width * esc, h = img.height * esc;
    asegura(h + (b.alt ? 20 : 4));
    doc.image(buf, L() + (maxW - w) / 2, doc.y, { width: w });
    doc.y += h + 4;
    if (b.alt) texto(inline(b.alt), { x: L(), y: doc.y, ancho: W(), size: 8.5, color: GRIS, align: 'center' });
    gap(6);
  }

  function tabla(b) {
    const n = Math.max(1, b.cab.length), size = 9;
    const cab = Array.from({ length: n }, (_, k) => inline(b.cab[k] || '', { b: true }));
    const filas = b.filas.map((f) => Array.from({ length: n }, (_, k) => inline(f[k] || '')));
    const plano = (tr) => filtra(tr.map((r) => r.t).join(''), 'S');
    doc.font('S').fontSize(size);
    // Ancho natural de cada columna (su línea más larga, con tope) y reparto proporcional en el ancho de la página
    const nat = Array.from({ length: n }, (_, k) => {
      let m = 0;
      for (const tr of [cab[k], ...filas.map((f) => f[k])]) for (const l of plano(tr).split('\n')) m = Math.max(m, doc.widthOfString(l));
      return Math.min(m, 260) + 14;
    });
    const total = nat.reduce((a, c) => a + c, 0);
    let w = nat.map((x) => (x * W()) / total);
    const MIN = 38; let falta = 0, libres = 0;
    w = w.map((x) => { if (x < MIN) { falta += MIN - x; return MIN; } libres += x; return x; });
    if (falta && libres) w = w.map((x) => (x > MIN ? x - falta * (x / libres) : x));

    const fila = (celdas, cabecera) => {
      const base = cabecera ? { b: true } : {};
      const h = Math.max(...celdas.map((tr, k) => altura(tr, w[k] - 10, size, base))) + 8;
      if (!hay(h)) { doc.addPage(); if (!cabecera) fila(cab, true); }
      const y = doc.y; let x = L();
      celdas.forEach((tr, k) => {
        if (cabecera) doc.rect(x, y, w[k], h).fill('#f0f0f4');
        doc.rect(x, y, w[k], h).lineWidth(0.5).strokeColor('#bbbbbb').stroke();
        texto(tr, { x: x + 5, y: y + 4, ancho: w[k] - 10, size, base });
        x += w[k];
      });
      doc.y = y + h;
    };
    gap(2);
    fila(cab, true);
    for (const f of filas) fila(f, false);
    gap(10);
  }

  /* ---------- Recorrido ---------- */
  for (const b of bloques(md)) {
    if (b.t === 'pb') { if (doc.y > doc.page.margins.top + 1) doc.addPage(); continue; }
    if (b.t === 'h') titulos(b);
    else if (b.t === 'p') parrafo(b);
    else if (b.t === 'li') elemento(b);
    else if (b.t === 'quote') cita(b);
    else if (b.t === 'callout') aviso(b);
    else if (b.t === 'code') codigo(b);
    else if (b.t === 'hr') separador();
    else if (b.t === 'table') tabla(b);
    else if (b.t === 'img') await imagen(b);
  }

  // Pie: título a la izquierda y «n / total» a la derecha, escrito dentro del margen inferior
  const total = paginas();
  for (let p = 0; p < total; p++) {
    doc.switchToPage(p);
    const mb = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('S').fontSize(8).fillColor('#888888');
    if (titulo) doc.text(filtra(titulo, 'S').slice(0, 90), L(), doc.page.height - 34, { width: W() * 0.75, align: 'left', lineBreak: false, ellipsis: true });
    doc.text(`${p + 1} / ${total}`, L(), doc.page.height - 34, { width: W(), align: 'right', lineBreak: false });
    doc.page.margins.bottom = mb;
  }
  doc.end();
  await fin;
  return { buffer: Buffer.concat(trozos), paginas: total };
}

module.exports = { renderiza };
