'use strict';
/* Exportar a .md, .txt y .pdf desde cualquier sección.
   Cada sección construye su documento en Markdown y K.doc lo entrega en el formato pedido:
     · .md  → el Markdown tal cual
     · .txt → el mismo texto sin marcas de Markdown
     · .pdf → HTML maquetado que se imprime desde un iframe oculto (el navegador ofrece «Guardar como PDF»)
   K.doc.items(() => ({ titulo, nombre, md, ancho })) devuelve las tres entradas listas para K.menu.
   `md` puede ser una función asíncrona; `ancho: true` imprime en horizontal (tablas anchas). */
(function () {
  if (!window.K) return;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MIME = { md: 'text/markdown', txt: 'text/plain', pdf: 'application/pdf' };

  // Escapa una celda de tabla Markdown
  const celda = (v) => String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  // Tabla Markdown a partir de cabeceras y filas
  function tabla(cab, filas) {
    if (!filas.length) return '';
    return ['| ' + cab.map(celda).join(' | ') + ' |', '| ' + cab.map(() => '---').join(' | ') + ' |',
      ...filas.map(f => '| ' + cab.map((_, i) => celda(f[i])).join(' | ') + ' |')].join('\n') + '\n';
  }
  const nombreSeguro = (s) => (String(s || 'documento').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)) || 'documento';

  /* ---------- Markdown → texto plano ---------- */
  function aTxt(md) {
    return String(md)
      .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, c) => c.replace(/\s+$/, '') + '\n')
      .replace(/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')          // línea separadora de tabla
      .replace(/^\|(.*)\|\s*$/gm, (_, f) => f.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')).join('  |  '))
      .replace(/^#{1,6}\s+(.*)$/gm, (_, t) => t)
      .replace(/^>\s?/gm, '')
      .replace(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/gm, (_, s, c) => s + (c === ' ' ? '[ ] ' : '[x] '))
      .replace(/^(\s*)[-*+]\s+/gm, '$1- ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => t === u ? t : `${t} (${u})`)
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '--------------------')
      .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  }

  /* ---------- Markdown → HTML ---------- */
  function inline(t) {
    const cod = [];
    t = esc(t).replace(/`([^`]+)`/g, (_, c) => { cod.push(c); return '\u0000' + (cod.length - 1) + '\u0000'; });
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
      .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + cod[+i] + '</code>');
  }
  const filaTabla = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());
  const esSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');

  function aHtml(md) {
    const L = String(md).replace(/\r/g, '').split('\n'), out = [];
    let i = 0, par = [];
    const cierraPar = () => { if (par.length) { out.push('<p>' + par.map(inline).join('<br>') + '</p>'); par = []; } };
    while (i < L.length) {
      const l = L[i];
      let m;
      if ((m = /^```/.exec(l))) {
        cierraPar(); const c = []; i++;
        while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]);
        i++; out.push('<pre>' + esc(c.join('\n')) + '</pre>'); continue;
      }
      if (/^\s*$/.test(l)) { cierraPar(); i++; continue; }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { cierraPar(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { cierraPar(); out.push('<hr>'); i++; continue; }
      if (/^\|/.test(l) && i + 1 < L.length && esSep(L[i + 1])) {
        cierraPar(); const cab = filaTabla(l); i += 2; const filas = [];
        while (i < L.length && /^\|/.test(L[i])) filas.push(filaTabla(L[i++]));
        out.push('<table><thead><tr>' + cab.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          filas.map(f => '<tr>' + cab.map((_, k) => `<td>${inline(f[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      if (/^>/.test(l)) {
        cierraPar(); const c = [];
        while (i < L.length && /^>/.test(L[i])) c.push(L[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + c.map(inline).join('<br>') + '</blockquote>'); continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        cierraPar(); const ord = /^\s*\d+\./.test(l); const it = [];
        while (i < L.length && /^\s*([-*+]|\d+\.)\s+/.test(L[i])) {
          const sangria = /^(\s*)/.exec(L[i])[1].length;
          let t = L[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''), caja = '';
          const c = /^\[( |x|X)\]\s+(.*)$/.exec(t);
          if (c) { caja = c[1] === ' ' ? '☐ ' : '☑ '; t = c[2]; }
          it.push(`<li style="margin-left:${Math.min(sangria, 12) * 6}pt">${caja}${inline(t)}</li>`); i++;
        }
        out.push((ord ? '<ol>' : '<ul>') + it.join('') + (ord ? '</ol>' : '</ul>')); continue;
      }
      par.push(l); i++;
    }
    cierraPar();
    return out.join('\n');
  }

  const CSS = `
    @page{margin:18mm 16mm}
    *{box-sizing:border-box}
    body{font:11pt/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0}
    h1{font-size:21pt;margin:0 0 6pt;letter-spacing:-.02em} h2{font-size:15pt;margin:16pt 0 5pt;border-bottom:1px solid #ddd;padding-bottom:2pt}
    h3{font-size:12.5pt;margin:12pt 0 4pt} h4,h5,h6{font-size:11pt;margin:10pt 0 3pt}
    p{margin:0 0 6pt} ul,ol{margin:0 0 8pt;padding-left:18pt} li{margin:1pt 0}
    blockquote{margin:6pt 0;padding:2pt 10pt;border-left:3pt solid #6366f1;color:#444}
    pre{background:#f4f4f6;border:1px solid #ddd;border-radius:6pt;padding:8pt 10pt;white-space:pre-wrap;word-break:break-word;font:9pt/1.45 Consolas,Menlo,monospace}
    code{font:.9em Consolas,Menlo,monospace;background:#f0f0f4;padding:0 3pt;border-radius:3pt}
    table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:9.5pt} th,td{border:1px solid #bbb;padding:3pt 6pt;text-align:left;vertical-align:top} th{background:#f0f0f4}
    tr{page-break-inside:avoid} thead{display:table-header-group}
    hr{border:0;border-top:1px solid #ccc;margin:10pt 0} a{color:#4338ca}`;

  /* ---------- Entrega ---------- */
  function descarga(nombre, texto, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: mime + ';charset=utf-8' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function imprime(titulo, md, opciones) {
    const o = opciones || {};
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}${o.ancho ? '@page{size:landscape}' : ''}</style></head><body>${aHtml(md)}</body></html>`;
    window.__ultimoHtmlImpresion = html;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    f.srcdoc = html;
    f.addEventListener('load', () => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch { K.toast('No se pudo abrir la impresión'); }
        setTimeout(() => f.remove(), 60000);
      }, 150);
    });
    document.body.appendChild(f);
  }

  // fmt: 'md' | 'txt' | 'pdf'; d: { titulo, nombre, md | () => md, ancho }
  async function exporta(fmt, d) {
    let md;
    try { md = typeof d.md === 'function' ? await d.md() : d.md; } catch (e) { K.fail(e); return; }
    if (!md || !String(md).trim()) { K.toast('No hay nada que exportar'); return; }
    const base = nombreSeguro(d.nombre || d.titulo);
    if (fmt === 'pdf') imprime(d.titulo || base, md, { ancho: d.ancho });
    else descarga(`${base}.${fmt}`, fmt === 'txt' ? aTxt(md) : String(md).replace(/\n{3,}/g, '\n\n').trim() + '\n', MIME[fmt]);
  }

  // Tres entradas de menú (las tres juntas); `get` puede devolver el descriptor o una promesa
  function items(get) {
    const run = (fmt) => async () => { const d = typeof get === 'function' ? await get() : get; if (d) exporta(fmt, d); };
    return [
      { label: 'Exportar como texto (.txt)', icon: 'i-download', onClick: run('txt') },
      { label: 'Exportar como Markdown (.md)', icon: 'i-download', onClick: run('md') },
      { label: 'Exportar como PDF', icon: 'i-download', onClick: run('pdf') },
    ];
  }

  K.doc = { aTxt, aHtml, tabla, celda, exporta, items, descarga, imprime, nombreSeguro };
})();
