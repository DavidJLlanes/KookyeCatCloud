'use strict';
// Importar · Evernote (.enex). Es un XML grande con una <note> por nota: título, contenido ENML (un HTML con <en-media> para los
// adjuntos y <en-todo> para las tareas), fechas, etiquetas y los adjuntos en base64. Se recorre con búsquedas de texto, sin
// construir un árbol del archivo entero (puede pesar decenas de MB), y cada nota pasa por el conversor de HTML.
const crypto = require('crypto');
const { convierte, decodifica } = require('./html-md');
const { bloques } = require('../html-tokens');

const aMs = (s) => { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(String(s || '').trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; };
const etiqueta = (bloque, t) => { const i = bloque.indexOf('<' + t); if (i < 0) return ''; const a = bloque.indexOf('>', i); const f = bloque.indexOf('</' + t + '>', a); return a < 0 || f < 0 ? '' : bloque.slice(a + 1, f); };
const sinCdata = (s) => { const t = String(s).trim(); return t.startsWith('<![CDATA[') && t.endsWith(']]>') ? t.slice(9, -3) : decodifica(s); };
const EXT = Object.assign(Object.create(null), { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-m4a': '.m4a', 'audio/mp4': '.m4a', 'video/mp4': '.mp4', 'text/plain': '.txt' });

/** { notas: [{ titulo, md, creado, modificado, etiquetas }], avisos } — `adjunto(nombre, buffer, esImagen)` guarda el archivo y devuelve su referencia. */
function lee(buffer, { adjunto, maxNotas = 5000 }) {
  const xml = buffer.toString('utf8');
  if (!/<en-export/i.test(xml.slice(0, 2000)) && !/<note>/i.test(xml.slice(0, 5000))) return { notas: [], avisos: ['El archivo no parece una exportación de Evernote (.enex)'] };
  const notas = [], avisos = []; let desde = 0, cifradas = 0, sinAdjunto = 0;
  while (notas.length < maxNotas) {
    const a = xml.indexOf('<note>', desde); if (a < 0) break;
    const b = xml.indexOf('</note>', a); if (b < 0) break;
    desde = b + 7;
    const nota = xml.slice(a, b);
    // Adjuntos: se guardan por su hash MD5, que es como los cita el texto
    const recursos = new Map(); let r = 0;
    while ((r = nota.indexOf('<resource>', r)) >= 0) {
      const fin = nota.indexOf('</resource>', r); if (fin < 0) break;
      const rs = nota.slice(r, fin); r = fin + 11;
      const datos = etiqueta(rs, 'data').replace(/\s+/g, ''); if (!datos) continue;
      let buf; try { buf = Buffer.from(datos, 'base64'); } catch { continue; }
      const mime = sinCdata(etiqueta(rs, 'mime')).trim().toLowerCase();
      let nombre = sinCdata(etiqueta(rs, 'file-name')).trim() || ('adjunto' + (EXT[mime] || ''));
      if (!/\.[a-z0-9]{2,5}$/i.test(nombre) && EXT[mime]) nombre += EXT[mime];
      recursos.set(crypto.createHash('md5').update(buf).digest('hex'), { nombre, buf, mime });
    }
    const enml = sinCdata(etiqueta(nota, 'content'));
    if (/<en-crypt/i.test(enml)) cifradas++;
    const html = bloques(enml, 'en-crypt', () => '<p><i>[texto cifrado de Evernote: no se puede importar]</i></p>');
    const md = convierte(html, {
      media: (hash, tipo, alt) => {
        const rc = recursos.get(String(hash || '').toLowerCase());
        if (!rc) { sinAdjunto++; return `*(adjunto no incluido${alt ? ': ' + alt : ''})*`; }
        const esImg = /^image\//.test(rc.mime || tipo || '');
        const ref = adjunto(rc.nombre, rc.buf, esImg);
        return ref ? (esImg ? `![${alt || ''}](${ref})` : `[${rc.nombre.replace(/[[\]]/g, '')}](${ref})`) : '';
      },
      resuelveImagen: () => null,
    }).replace(/^\[( |x)\]\s+/gm, '- [$1] ').replace(/^(- \[[ x]\] .*)\n\n(?=- \[[ x]\] )/gm, '$1\n');
    const tags = []; let t = 0;
    while ((t = nota.indexOf('<tag>', t)) >= 0) { const f = nota.indexOf('</tag>', t); if (f < 0) break; tags.push(sinCdata(nota.slice(t + 5, f)).trim()); t = f + 6; }
    const url = sinCdata(etiqueta(nota, 'source-url')).trim();
    const pie = [url && /^https?:\/\//i.test(url) ? `Origen: ${url}` : '', tags.length ? 'Etiquetas: ' + tags.filter(Boolean).map(x => '#' + x.replace(/\s+/g, '_')).join(' ') : ''].filter(Boolean).join('\n\n');
    notas.push({ titulo: sinCdata(etiqueta(nota, 'title')).trim() || 'Nota sin título', md: [md, pie].filter(Boolean).join('\n\n'), creado: aMs(etiqueta(nota, 'created')), modificado: aMs(etiqueta(nota, 'updated')), etiquetas: tags });
  }
  if (cifradas) avisos.push(`${cifradas} nota(s) tenían texto cifrado: se ha dejado un aviso en su lugar`);
  if (sinAdjunto) avisos.push(`${sinAdjunto} adjunto(s) citados en el texto no venían en el archivo`);
  return { notas, avisos };
}

module.exports = { lee };
