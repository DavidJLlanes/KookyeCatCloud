'use strict';
/* notes/inline.js: parte del módulo (se carga con el resto de notes/ en index.html). Comparte el espacio K._notes. */
(function () {
  const C = (K._notes = K._notes || {});

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); const EST = {};
  const CALLOUTS = {
    NOTE: ['💡', 'Nota', '#3b82f6'], TIP: ['✅', 'Consejo', '#22c55e'],
    WARNING: ['⚠️', 'Aviso', '#f59e0b'], IMPORTANT: ['🔥', 'Importante', '#ef4444'],
  };
  const TYPES = {
    p: 'Texto', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', ul: 'Lista con viñetas', ol: 'Lista numerada',
    todo: 'Lista de tareas', quote: 'Cita', code: 'Código', divider: 'Separador', callout: 'Aviso',
  };
  const plano = (() => { try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; } catch { return false; } })();

  /* ============ Markdown <-> bloques ============ */
  // Inline: Markdown -> HTML seguro
  function findClose(s, tok, from) {
    for (let i = from; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s.startsWith(tok, i)) return i;
    }
    return -1;
  }
  function inlineHtml(s) {
    let out = ''; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { out += esc(s[i + 1]); i += 2; continue; }
      if (s.startsWith('<br>', i)) { out += '<br>'; i += 4; continue; }
      if (s.startsWith('**', i)) { const j = findClose(s, '**', i + 2); if (j > i + 2) { out += '<b>' + inlineHtml(s.slice(i + 2, j)) + '</b>'; i = j + 2; continue; } }
      if (s.startsWith('~~', i)) { const j = findClose(s, '~~', i + 2); if (j > i + 2) { out += '<s>' + inlineHtml(s.slice(i + 2, j)) + '</s>'; i = j + 2; continue; } }
      if (s.startsWith('==', i)) { const j = findClose(s, '==', i + 2); if (j > i + 2) { out += '<mark>' + inlineHtml(s.slice(i + 2, j)) + '</mark>'; i = j + 2; continue; } }
      if (c === '`') { const j = s.indexOf('`', i + 1); if (j > i + 1) { out += '<code>' + esc(s.slice(i + 1, j)) + '</code>'; i = j + 1; continue; } }
      if (c === '*') { const j = findClose(s, '*', i + 1); if (j > i + 1) { out += '<i>' + inlineHtml(s.slice(i + 1, j)) + '</i>'; i = j + 1; continue; } }
      if (c === '[') {
        const m = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/.exec(s.slice(i));
        if (m) {
          const href = m[2];
          const k = /^kcc:(prompt|note|file)\/([^\s]+)$/.exec(href);
          if (k && (k[1] === 'file' || /^[a-f0-9]{16}$/.test(k[2]))) out += `<a class="nb-ref" data-kcc="${k[1]}:${esc(k[2])}" contenteditable="false">${inlineHtml(m[1])}</a>`;
          else if (/^(https?:|mailto:)/i.test(href)) out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inlineHtml(m[1])}</a>`;
          else out += esc(m[0]);
          i += m[0].length; continue;
        }
      }
      out += esc(c); i++;
    }
    return out;
  }
  // Inline: DOM -> Markdown
  function inlineMd(node) {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        out += n.nodeValue.replace(/\u200b/g, '').replace(/\\/g, '\\\\').replace(/([*`~\[\]])/g, '\\$1').replace(/==/g, '=\\=');
        return;
      }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { out += '<br>'; return; }
      const inner = inlineMd(n);
      if (!inner && t !== 'A') return;
      if (t === 'B' || t === 'STRONG') out += `**${inner}**`;
      else if (t === 'I' || t === 'EM') out += `*${inner}*`;
      else if (t === 'S' || t === 'STRIKE' || t === 'DEL') out += `~~${inner}~~`;
      else if (t === 'MARK') out += `==${inner}==`;
      else if (t === 'CODE') out += '`' + n.textContent.replace(/`/g, '') + '`';
      else if (t === 'A') {
        if (n.dataset.kcc) { const v = n.dataset.kcc; const q = v.indexOf(':'); out += `[${inner}](kcc:${v.slice(0, q)}/${v.slice(q + 1)})`; }
        else if (n.getAttribute('href')) out += `[${inner}](${n.getAttribute('href')})`;
        else out += inner;
      } else if (t === 'DIV' || t === 'P') out += (out && !out.endsWith('<br>') ? '<br>' : '') + inner;
      else out += inner;
    });
    return out;
  }

  // Tablas Markdown: | a | b |  con una segunda línea | --- | --- |

  Object.assign(C, { esc, EST, CALLOUTS, TYPES, plano, findClose, inlineHtml, inlineMd });
})();
