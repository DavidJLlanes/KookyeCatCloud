'use strict';
/* notes/parser.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});

  const SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
  function celdas(linea) {
    let t = linea.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
    const out = []; let cur = '';
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '\\' && t[i + 1] === '|') { cur += '\\|'; i++; }
      else if (t[i] === '|') { out.push(cur.trim()); cur = ''; }
      else cur += t[i];
    }
    out.push(cur.trim());
    return out;
  }

  function parseMd(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    const push = (t, text, extra) => blocks.push({ t, text, i: 0, ...extra });
    while (i < lines.length) {
      const ln = lines[i];
      if (!ln.trim()) { i++; continue; }
      let m;
      if ((m = /^```(\S*)\s*$/.exec(ln))) {
        const buf = []; i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++; push('code', buf.join('\n'), { lang: m[1] || '' }); continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln) && !/^\s*[-*]\s+\S/.test(ln)) { push('divider', ''); i++; continue; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) { push('h' + m[1].length, m[2]); i++; continue; }
      if ((m = /^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/.exec(ln))) { push('todo', m[3], { i: Math.min(3, Math.floor(m[1].length / 2)), done: m[2] !== ' ' }); i++; continue; }
      if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(ln))) { push('ul', m[2], { i: Math.min(3, Math.floor(m[1].length / 2)) }); i++; continue; }
      if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(ln))) { push('ol', m[2], { i: Math.min(3, Math.floor(m[1].length / 2)) }); i++; continue; }
      if (/^>\s?/.test(ln)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        const c = /^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*(.*)$/.exec(buf[0]);
        if (c) { buf[0] = c[2]; push('callout', buf.join('<br>'), { kind: c[1] }); } else push('quote', buf.join('<br>'));
        continue;
      }
      if (/^\s*\|/.test(ln) && SEP.test(lines[i + 1] || '')) {
        const rows = [celdas(ln)]; i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(celdas(lines[i++]));
        const ancho = Math.max(...rows.map(r => r.length));
        rows.forEach(r => { while (r.length < ancho) r.push(''); });
        push('table', '', { rows }); continue;
      }
      if ((m = /^!\[([^\]]*)\]\((kcc:file\/[^)\s]+)\)\s*$/.exec(ln))) { push('image', m[1], { src: m[2] }); i++; continue; }
      if (/^&nbsp;\s*$/.test(ln)) { push('p', ''); i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>)/.test(lines[i]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
        && !/^!\[[^\]]*\]\(kcc:file\//.test(lines[i]) && !(/^\s*\|/.test(lines[i]) && SEP.test(lines[i + 1] || ''))) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      push('p', buf.join('<br>').replace(/^\\(?=[#>\-*+\d`])/, ''));
    }
    if (!blocks.length) push('p', '');
    return blocks;
  }

  function blockMd(b, n) {
    const ind = '  '.repeat(b.i || 0);
    if (b.t === 'divider') return '---';
    if (b.t === 'code') return '```' + (b.lang || '') + '\n' + b.text + '\n```';
    if (b.t === 'table') {
      const rows = b.rows && b.rows.length ? b.rows : [['']];
      const ancho = Math.max(...rows.map(r => r.length));
      const fila = (r) => '| ' + Array.from({ length: ancho }, (_, k) => (r[k] || ' ')).join(' | ') + ' |';
      return [fila(rows[0]), '| ' + Array(ancho).fill('---').join(' | ') + ' |', ...rows.slice(1).map(fila)].join('\n');
    }
    if (b.t === 'image') return `![${String(b.text || '').replace(/\\?[\[\]]/g, '')}](${b.src})`;
    let tx = b.text;
    if (b.t === 'p') {
      if (!tx) return '&nbsp;';
      // Los saltos suaves van como saltos de línea normales: el .md sigue siendo legible a mano
      return tx.split('<br>').map(l => l.replace(/^(?=[#>\-*+]\s|\d+[.)]\s|```|(?:[-*_]\s*){3,}$|&nbsp;$)/, '\\')).join('\n');
    }
    if (b.t === 'h1') return '# ' + tx;
    if (b.t === 'h2') return '## ' + tx;
    if (b.t === 'h3') return '### ' + tx;
    if (b.t === 'ul') return `${ind}- ${tx}`;
    if (b.t === 'ol') return `${ind}${n || 1}. ${tx}`;
    if (b.t === 'todo') return `${ind}- [${b.done ? 'x' : ' '}] ${tx}`;
    if (b.t === 'quote') return tx.split('<br>').map(l => '> ' + l).join('\n');
    if (b.t === 'callout') { const [first, ...rest] = tx.split('<br>'); return [`> [!${b.kind || 'NOTE'}] ${first}`, ...rest.map(l => '> ' + l)].join('\n'); }
    return tx;
  }

  /* ============ Editor ============ */

  Object.assign(C, { SEP, celdas, parseMd, blockMd });
})();
