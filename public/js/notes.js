'use strict';
/* ---------------------------------------------------------------
   Notas estilo Notion: editor de bloques (títulos, listas, tareas, citas, código, avisos,
   separadores), menú "/" para insertar, barra flotante de formato, arrastrar bloques,
   enlaces a prompts y notas, y propiedades de la nota (icono, color, etiquetas, fecha).

   El contenido se sigue guardando como Markdown en el mismo .md de siempre, así que las
   notas antiguas se abren tal cual y siguen siendo texto recuperable a mano. El editor
   escribe el Markdown en el <textarea id="note-body"> (oculto), y el autoguardado de app.js
   lo recoge sin cambios.
--------------------------------------------------------------- */
(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
          const k = /^kcc:(prompt|note)\/([a-f0-9]{16})$/.exec(href);
          if (k) out += `<a class="nb-ref" data-kcc="${k[1]}:${k[2]}" contenteditable="false">${inlineHtml(m[1])}</a>`;
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
        if (n.dataset.kcc) { const [k, id] = n.dataset.kcc.split(':'); out += `[${inner}](kcc:${k}/${id})`; }
        else if (n.getAttribute('href')) out += `[${inner}](${n.getAttribute('href')})`;
        else out += inner;
      } else if (t === 'DIV' || t === 'P') out += (out && !out.endsWith('<br>') ? '<br>' : '') + inner;
      else out += inner;
    });
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
      if (/^&nbsp;\s*$/.test(ln)) { push('p', ''); i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>)/.test(lines[i]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])) buf.push(lines[i++]);
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
  const NB = window.NB = {};
  let host = null, store = null, hist = [], histPos = -1, histTimer = null, pushTimer = null, aplicando = false;
  let slash = null, bar = null, slashBlock = null;

  const isList = (t) => t === 'ul' || t === 'ol' || t === 'todo';

  function makeBlock(b) {
    const w = document.createElement('div');
    w.className = 'nb-block'; w.dataset.t = b.t; w.dataset.i = b.i || 0;
    if (b.kind) w.dataset.k = b.kind;
    if (b.done) w.classList.add('is-done');
    if (b.lang !== undefined) w.dataset.lang = b.lang;
    const grip = document.createElement('span'); grip.className = 'nb-grip'; grip.draggable = true; grip.title = 'Arrastra para mover';
    grip.appendChild(icon('i-grip'));
    const add = document.createElement('span'); add.className = 'nb-plus'; add.title = 'Añadir bloque debajo'; add.appendChild(icon('i-plus'));
    const mk = document.createElement('div'); mk.className = 'nb-mk'; mk.contentEditable = 'false';
    const c = document.createElement('div'); c.className = 'nb-c';
    c.contentEditable = (b.t === 'code' && plano) ? 'plaintext-only' : 'true';
    c.spellcheck = b.t !== 'code';
    if (b.t === 'code') c.textContent = b.text; else if (b.t !== 'divider') c.innerHTML = inlineHtml(b.text || '');
    if (b.t === 'divider') { c.contentEditable = 'false'; c.appendChild(document.createElement('hr')); }
    w.append(grip, add, mk, c);
    decorate(w);
    return w;
  }

  // Marcador visual del bloque (viñeta, número, casilla, icono del aviso) y placeholder
  function decorate(w) {
    const t = w.dataset.t, mk = w.querySelector('.nb-mk'), c = w.querySelector('.nb-c');
    mk.textContent = '';
    if (t === 'ul') mk.textContent = ['•', '◦', '▪', '·'][+w.dataset.i % 4];
    else if (t === 'todo') {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nb-chk' + (w.classList.contains('is-done') ? ' on' : '');
      b.appendChild(icon('i-check'));
      b.addEventListener('click', (e) => { e.preventDefault(); w.classList.toggle('is-done'); b.classList.toggle('on'); change(true); });
      mk.appendChild(b);
    } else if (t === 'callout') { const k = CALLOUTS[w.dataset.k || 'NOTE']; mk.textContent = k[0]; w.style.setProperty('--c', k[2]); }
    c.dataset.ph = { p: 'Escribe “/” para ver los comandos', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', ul: 'Elemento de lista', ol: 'Elemento de lista', todo: 'Tarea', quote: 'Cita', callout: 'Escribe un aviso', code: 'Código' }[t] || '';
  }

  function renumber() {
    const counters = [0, 0, 0, 0];
    let prev = null;
    host.querySelectorAll('.nb-block').forEach(w => {
      const t = w.dataset.t, lvl = +w.dataset.i;
      if (t !== 'ol') { if (!(isList(t) && prev && isList(prev))) counters.fill(0); else if (t !== 'ol') { for (let k = lvl; k < 4; k++) counters[k] = 0; } prev = t; return; }
      for (let k = lvl + 1; k < 4; k++) counters[k] = 0;
      counters[lvl]++;
      w.querySelector('.nb-mk').textContent = counters[lvl] + '.';
      prev = t;
    });
  }

  function readBlock(w) {
    const t = w.dataset.t, c = w.querySelector('.nb-c');
    const b = { t, i: +w.dataset.i || 0 };
    if (t === 'divider') return b;
    if (t === 'code') { b.text = c.textContent.replace(/\u200b/g, ''); b.lang = w.dataset.lang || ''; return b; }
    b.text = inlineMd(c).replace(/^(<br>)+|(<br>)+$/g, '');
    if (t === 'todo') b.done = w.classList.contains('is-done');
    if (t === 'callout') b.kind = w.dataset.k || 'NOTE';
    return b;
  }

  function serialize() {
    const blocks = [...host.querySelectorAll('.nb-block')].map(readBlock);
    let out = '', ol = [0, 0, 0, 0], prev = null;
    blocks.forEach((b, k) => {
      let n = 0;
      if (b.t === 'ol') { for (let j = b.i + 1; j < 4; j++) ol[j] = 0; ol[b.i]++; n = ol[b.i]; } else if (!isList(b.t)) ol = [0, 0, 0, 0];
      const md = blockMd(b, n);
      if (k) out += (isList(b.t) && b.t === prev) ? '\n' : '\n\n';
      out += md; prev = b.t;
    });
    return out.replace(/\n+$/, '');
  }

  // Empuja el Markdown al textarea oculto: de ahí lo recoge el autoguardado de app.js
  function syncStore() {
    if (aplicando || !store) return;
    store.value = serialize();
    store.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function change(structural) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncStore, structural ? 0 : 140);
    clearTimeout(histTimer);
    histTimer = setTimeout(snapshot, structural ? 80 : 700);
    renumber();
  }
  function snapshot() {
    const md = serialize();
    if (hist[histPos] === md) return;
    hist = hist.slice(0, histPos + 1); hist.push(md); if (hist.length > 80) hist.shift(); histPos = hist.length - 1;
  }
  function undoRedo(dir) {
    clearTimeout(histTimer); snapshot();
    const np = histPos + dir;
    if (np < 0 || np >= hist.length) return;
    histPos = np; render(parseMd(hist[histPos]), true); syncStore();
  }

  function render(blocks, keepFocusEnd) {
    aplicando = true;
    host.textContent = '';
    blocks.forEach(b => host.appendChild(makeBlock(b)));
    renumber();
    aplicando = false;
    if (keepFocusEnd) { const l = host.querySelector('.nb-block:last-child .nb-c'); if (l) l.focus(); }
  }

  /* ---------- API pública ---------- */
  NB.load = function (md) {
    if (!host) return;
    clearTimeout(pushTimer); clearTimeout(histTimer);
    render(parseMd(md));
    hist = [serialize()]; histPos = 0;
    closeSlash(); hideBar();
  };
  NB.flush = function () { clearTimeout(pushTimer); if (host && store && !$('editor-cuerpo').hidden) syncStore(); };
  NB.clear = function () { if (host) host.textContent = ''; };

  /* ---------- Utilidades de selección ---------- */
  const blockOf = (n) => { while (n && n !== host) { if (n.nodeType === 1 && n.classList.contains('nb-block')) return n; n = n.parentNode; } return null; };
  const contentOf = (w) => w.querySelector('.nb-c');
  function caretOffset(c) {
    const sel = getSelection(); if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0).cloneRange(); const pre = r.cloneRange(); pre.selectNodeContents(c); pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }
  function atStart(c) { const s = getSelection(); return s.isCollapsed && caretOffset(c) === 0; }
  function atEnd(c) { const s = getSelection(); return s.isCollapsed && caretOffset(c) >= c.textContent.length; }
  function focusBlock(w, end) {
    const c = contentOf(w); if (!c) return; c.focus();
    const r = document.createRange(); r.selectNodeContents(c); r.collapse(!end);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function splitAtCaret(c) {
    const s = getSelection(); const r = s.getRangeAt(0).cloneRange();
    r.setEnd(c, c.childNodes.length);
    const frag = r.extractContents();
    const tmp = document.createElement('div'); tmp.appendChild(frag);
    return inlineMd(tmp);
  }
  function setType(w, t, extra = {}) {
    const wasCode = w.dataset.t === 'code';
    w.dataset.t = t;
    delete w.dataset.k; if (t !== 'todo') w.classList.remove('is-done');
    if (extra.kind) w.dataset.k = extra.kind;
    const c = contentOf(w);
    if (t === 'code' && !wasCode) { c.textContent = c.textContent; c.contentEditable = plano ? 'plaintext-only' : 'true'; c.spellcheck = false; w.dataset.lang = ''; }
    else if (t !== 'code' && wasCode) { c.contentEditable = 'true'; c.spellcheck = true; }
    if (t === 'divider') { c.textContent = ''; c.appendChild(document.createElement('hr')); c.contentEditable = 'false'; }
    else if (c.contentEditable === 'false') c.contentEditable = 'true';
    if (!isList(t)) w.dataset.i = 0;
    decorate(w); renumber();
  }
  function insertAfter(w, b) { const n = makeBlock(b); w.after(n); return n; }

  /* ---------- Eventos del editor ---------- */
  function onKeydown(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c); if (!w) return;
    const t = w.dataset.t;

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); return; }
      if (k === 'y') { e.preventDefault(); undoRedo(1); return; }
      if (k === 'b' || k === 'i') { e.preventDefault(); document.execCommand(k === 'b' ? 'bold' : 'italic'); change(); return; }
      if (k === 'k') { e.preventDefault(); linkSelection(); return; }
      if (k === 'e') { e.preventDefault(); toggleTag('code'); return; }
      if (k === 'd' && e.shiftKey) { e.preventDefault(); const cp = makeBlock(readBlock(w)); w.after(cp); change(true); return; }
    }

    if (slash && handleSlashKey(e)) return;

    if (e.key === 'Enter' && !e.isComposing) {
      if (t === 'code') {
        if (e.shiftKey || e.ctrlKey) { e.preventDefault(); const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true); }
        return;   // Enter normal: salto de línea dentro del código
      }
      if (e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); change(); return; }
      e.preventDefault();
      if (t === 'divider') { const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true); return; }
      const vacio = !c.textContent.replace(/\u200b/g, '').trim() && !c.querySelector('a');
      if (vacio && t !== 'p') {
        if (isList(t) && +w.dataset.i > 0) { w.dataset.i = +w.dataset.i - 1; decorate(w); renumber(); change(true); return; }
        setType(w, 'p'); focusBlock(w); change(true); return;
      }
      const resto = atEnd(c) ? '' : splitAtCaret(c);
      // Las listas continúan; citas, avisos y títulos abren un párrafo nuevo (Shift+Enter = salto dentro del bloque)
      const n = insertAfter(w, { t: isList(t) ? t : 'p', text: resto, i: +w.dataset.i });
      focusBlock(n); change(true); return;
    }

    if (e.key === 'Backspace' && atStart(c) && !e.isComposing) {
      if (t !== 'p') {
        if (isList(t) && +w.dataset.i > 0) { w.dataset.i = +w.dataset.i - 1; decorate(w); renumber(); change(true); e.preventDefault(); return; }
        e.preventDefault(); setType(w, 'p'); focusBlock(w); change(true); return;
      }
      const prev = w.previousElementSibling;
      if (!prev) return;
      e.preventDefault();
      if (prev.dataset.t === 'divider') { prev.remove(); focusBlock(w); change(true); return; }
      const pc = contentOf(prev);
      const len = pc.textContent.length;
      if (prev.dataset.t === 'code') { pc.textContent += c.textContent; } else pc.innerHTML += c.innerHTML;
      w.remove(); focusBlock(prev, true);
      // Coloca el cursor donde acababa el bloque anterior
      const r = document.createRange(); const walker = document.createTreeWalker(pc, NodeFilter.SHOW_TEXT); let rest = len, nd;
      while ((nd = walker.nextNode())) { if (nd.length >= rest) { r.setStart(nd, rest); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } rest -= nd.length; }
      change(true); return;
    }
    if (e.key === 'Delete' && atEnd(c) && !e.isComposing) {
      const nx = w.nextElementSibling;
      if (nx && !['divider', 'code'].includes(nx.dataset.t) && t !== 'code') { e.preventDefault(); c.innerHTML += contentOf(nx).innerHTML; nx.remove(); change(true); }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (t === 'code') { document.execCommand('insertText', false, '  '); return; }
      if (isList(t)) {
        const lvl = +w.dataset.i + (e.shiftKey ? -1 : 1);
        if (lvl >= 0 && lvl <= 3) { w.dataset.i = lvl; decorate(w); renumber(); change(true); }
      }
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const prev = w.previousElementSibling; if (!prev) return;
      const r = getSelection().getRangeAt(0).getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (r.height && r.top - cr.top < 8) { e.preventDefault(); focusBlock(prev, true); }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      const nx = w.nextElementSibling; if (!nx) return;
      const r = getSelection().getRangeAt(0).getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (r.height && cr.bottom - r.bottom < 8) { e.preventDefault(); focusBlock(nx); }
    }
    if (e.key === 'Escape') { hideBar(); }
  }

  const SHORT = [
    [/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'], [/^[-*+]\s$/, 'ul'], [/^1[.)]\s$/, 'ol'],
    [/^\[\]\s$|^\[ \]\s$/, 'todo'], [/^>\s$/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider'],
  ];
  function onInput(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c); if (!w) return;
    const txt = c.textContent.replace(/\u00a0/g, ' ');
    // Atajos de Markdown al principio de un bloque de texto
    if (w.dataset.t === 'p' && !(e.inputType || '').startsWith('delete')) {
      for (const [re, t] of SHORT) {
        if (re.test(txt)) {
          if (t === 'divider') { setType(w, 'divider'); const n = w.nextElementSibling && w.nextElementSibling.dataset.t === 'p' && !w.nextElementSibling.textContent ? w.nextElementSibling : insertAfter(w, { t: 'p', text: '' }); focusBlock(n); }
          else { c.textContent = ''; setType(w, t); focusBlock(w); }
          change(true); return;
        }
      }
    }
    // Menú "/"
    const m = /(?:^|\s)\/([\wáéíóúñ ]{0,20})$/i.exec(txt.slice(0, caretOffset(c)));
    if (m && w.dataset.t !== 'code') openSlash(w, m[1]); else closeSlash();
    change();
  }

  function onPaste(e) {
    const c = e.target.closest && e.target.closest('.nb-c'); if (!c) return;
    const w = blockOf(c);
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (w.dataset.t === 'code' || (!/\n/.test(text) && !/^(#{1,3} |[-*] |\d+\. |> |```)/.test(text))) {
      // Texto simple: se inserta tal cual, sin formato externo
      document.execCommand('insertText', false, text); return;
    }
    const blocks = parseMd(text);
    const vacio = !c.textContent.trim();
    let ref = w;
    blocks.forEach((b, k) => { if (k === 0 && vacio) { const n = makeBlock(b); w.replaceWith(n); ref = n; } else { ref = (ref.after(makeBlock(b)), ref.nextElementSibling); } });
    focusBlock(ref, true); change(true);
  }

  function onClick(e) {
    const ref = e.target.closest && e.target.closest('a.nb-ref');
    if (ref) { e.preventDefault(); const [k, id] = ref.dataset.kcc.split(':'); K.open(k, id); return; }
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) { window.open(a.href, '_blank', 'noopener'); return; }
    const plus = e.target.closest && e.target.closest('.nb-plus');
    if (plus) {
      const w = blockOf(plus);
      const n = insertAfter(w, { t: 'p', text: '' }); focusBlock(n); change(true);
      c_open_slash(n);
      return;
    }
    // Clic en el hueco bajo el último bloque: añade/foca un párrafo
    if (e.target === host) {
      const last = host.lastElementChild;
      if (last && (last.dataset.t !== 'p' || last.textContent.trim())) { const n = insertAfter(last, { t: 'p', text: '' }); focusBlock(n); change(true); }
      else if (last) focusBlock(last, true);
    }
  }
  function c_open_slash(w) { openSlash(w, ''); }

  /* ---------- Menú "/" ---------- */
  const SLASH = [
    ['p', 'Texto', 'Párrafo normal', 'Aa'], ['h1', 'Título 1', 'Encabezado grande', 'H1'], ['h2', 'Título 2', 'Encabezado mediano', 'H2'],
    ['h3', 'Título 3', 'Encabezado pequeño', 'H3'], ['ul', 'Lista con viñetas', 'Lista simple', '•'], ['ol', 'Lista numerada', 'Con números', '1.'],
    ['todo', 'Lista de tareas', 'Con casillas', '☑'], ['quote', 'Cita', 'Destacar un texto', '❝'], ['code', 'Código', 'Bloque de código', '</>'],
    ['callout:NOTE', 'Aviso: nota', 'Caja azul', '💡'], ['callout:TIP', 'Aviso: consejo', 'Caja verde', '✅'],
    ['callout:WARNING', 'Aviso: atención', 'Caja ámbar', '⚠️'], ['callout:IMPORTANT', 'Aviso: importante', 'Caja roja', '🔥'],
    ['divider', 'Separador', 'Línea horizontal', '—'],
    ['@prompt', 'Enlazar un prompt', 'Busca en tu biblioteca de prompts', '✨'], ['@note', 'Enlazar una nota', 'Enlace a otra nota', '📝'],
    ['@date', 'Fecha de hoy', 'Inserta la fecha', '📅'], ['@event', 'Crear evento', 'Añade un evento al calendario', '🗓️'],
  ];
  function openSlash(w, q) {
    slashBlock = w;
    const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const items = SLASH.filter(s => !q || norm(s[1]).includes(norm(q)) || norm(s[2]).includes(norm(q)) || s[0].toLowerCase().includes(q.toLowerCase()));
    if (!items.length) { closeSlash(); return; }
    if (!slash) {
      slash = document.createElement('div'); slash.className = 'k-pop nb-slash'; slash.style.width = '280px';
      document.body.appendChild(slash);
    }
    slash.dataset.q = q; slash._items = items; slash._hot = Math.min(slash._hot || 0, items.length - 1);
    slash.textContent = '';
    items.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item' + (i === slash._hot ? ' is-hot' : '');
      const ic = document.createElement('span'); ic.className = 'nb-sl-ic'; ic.textContent = s[3];
      const tx = document.createElement('span'); tx.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      const a = document.createElement('b'); a.textContent = s[1]; a.style.fontWeight = '600';
      const d = document.createElement('small'); d.textContent = s[2]; d.style.cssText = 'color:var(--faint);font-size:11.5px';
      tx.append(a, d); b.append(ic, tx);
      b.addEventListener('mousedown', (ev) => { ev.preventDefault(); applySlash(s[0]); });
      slash.appendChild(b);
    });
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : contentOf(w).getBoundingClientRect();
    const rect = r.height ? r : contentOf(w).getBoundingClientRect();
    let y = rect.bottom + 6; if (y + 320 > innerHeight) y = Math.max(8, rect.top - Math.min(320, slash.offsetHeight) - 6);
    slash.style.left = Math.min(rect.left, innerWidth - 300) + 'px'; slash.style.top = y + 'px';
    slash.querySelector('.is-hot') && slash.querySelector('.is-hot').scrollIntoView({ block: 'nearest' });
  }
  function closeSlash() { if (slash) { slash.remove(); slash = null; } slashBlock = null; }
  function handleSlashKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const n = slash._items.length;
      slash._hot = (slash._hot + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; openSlash(slashBlock, slash.dataset.q); return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySlash(slash._items[slash._hot][0]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
    return false;
  }
  function stripSlash(w) {
    const c = contentOf(w); const sel = getSelection(); if (!sel.rangeCount) return;
    const off = caretOffset(c); const txt = c.textContent; const i = txt.slice(0, off).lastIndexOf('/');
    if (i < 0) return;
    // Borra desde la barra hasta el cursor, sobre los nodos de texto
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let pos = 0, nd; const r = document.createRange(); let ini = false;
    while ((nd = walker.nextNode())) {
      if (!ini && pos + nd.length > i) { r.setStart(nd, i - pos); ini = true; }
      if (ini && pos + nd.length >= off) { r.setEnd(nd, off - pos); break; }
      pos += nd.length;
    }
    if (ini) { r.deleteContents(); }
    if (/\s$/.test(c.textContent) === false && c.textContent.endsWith('\u00a0')) c.textContent = c.textContent.replace(/\u00a0$/, '');
  }
  async function applySlash(code) {
    const w = slashBlock; closeSlash(); if (!w) return;
    stripSlash(w);
    const c = contentOf(w);
    if (code.startsWith('@')) {
      if (code === '@date') { document.execCommand('insertText', false, new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); change(); return; }
      if (code === '@event') { K.calendar.newEvent({ date: new Date() }); return; }
      pickLink(w, code === '@prompt' ? 'prompt' : 'note'); return;
    }
    if (code.startsWith('callout:')) { setType(w, 'callout', { kind: code.split(':')[1] }); }
    else setType(w, code);
    if (code === 'divider') { const n = w.nextElementSibling && w.nextElementSibling.dataset.t === 'p' ? w.nextElementSibling : insertAfter(w, { t: 'p', text: '' }); focusBlock(n); }
    else focusBlock(w, true);
    change(true);
  }

  // Buscar un prompt o una nota y dejar un enlace dentro del texto
  async function pickLink(w, tipo) {
    const sel = getSelection(); const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const box = el('div'); const inp = el('input'); inp.placeholder = tipo === 'prompt' ? 'Buscar un prompt…' : 'Buscar una nota…'; box.appendChild(inp);
    const list = el('div'); list.style.marginTop = '8px'; box.appendChild(list);
    const m = K.modal({ title: tipo === 'prompt' ? 'Enlazar un prompt' : 'Enlazar una nota', content: box, actions: [{ label: 'Cancelar' }] });
    const poner = (id, title) => {
      m.close();
      setTimeout(() => {
        contentOf(w).focus();
        if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); }
        const a = `<a class="nb-ref" data-kcc="${tipo}:${id}" contenteditable="false">${esc(title)}</a>&nbsp;`;
        document.execCommand('insertHTML', false, a); change(true);
      }, 30);
    };
    const busca = async () => {
      const q = inp.value.trim();
      list.textContent = '';
      try {
        let res = [];
        if (tipo === 'prompt') { const r = await K.get('/api/prompts?' + K.qs({ q, limit: 12, sort: 'updated' })); res = r.items.map(p => [p.id, p.title, p.model || '']); }
        else res = NT.items.filter(i => i.type === 'note' && i.id !== NT.abierta && (!q || i.title.toLowerCase().includes(q.toLowerCase()))).slice(0, 12).map(i => [i.id, i.title, '']);
        if (!res.length) list.appendChild(el('p', 'k-faint', 'Sin resultados'));
        res.forEach(([id, title, sub]) => { const b = el('button', 'btn'); b.type = 'button'; b.style.cssText = 'width:100%;justify-content:flex-start;margin-bottom:6px'; b.append(icon(tipo === 'prompt' ? 'i-sparkle' : 'i-note'), el('span', null, title)); if (sub) b.appendChild(el('span', 'k-faint', ' · ' + sub)); b.addEventListener('click', () => poner(id, title)); list.appendChild(b); });
      } catch (er) { K.fail(er); }
    };
    inp.addEventListener('input', K.debounce(busca, 200)); busca(); setTimeout(() => inp.focus(), 30);
  }

  /* ---------- Barra flotante de formato ---------- */
  function showBar() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !host.contains(sel.anchorNode)) { hideBar(); return; }
    const w = blockOf(sel.anchorNode); if (!w || w.dataset.t === 'code') { hideBar(); return; }
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'k-pop nb-bar'; bar.style.padding = '4px';
      const defs = [['B', 'Negrita (Ctrl+B)', () => { document.execCommand('bold'); }], ['I', 'Cursiva (Ctrl+I)', () => { document.execCommand('italic'); }],
        ['S', 'Tachado', () => { document.execCommand('strikeThrough'); }], ['</>', 'Código (Ctrl+E)', () => toggleTag('code')],
        ['▮', 'Resaltar', () => toggleTag('mark')], ['🔗', 'Enlace (Ctrl+K)', () => linkSelection()]];
      defs.forEach(([l, t, f]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'nb-bar-btn'; b.title = t; b.textContent = l;
        if (l === 'B') b.style.fontWeight = '800'; if (l === 'I') b.style.fontStyle = 'italic'; if (l === 'S') b.style.textDecoration = 'line-through';
        b.addEventListener('mousedown', (e) => { e.preventDefault(); f(); change(); setTimeout(showBar, 0); });
        bar.appendChild(b);
      });
      document.body.appendChild(bar);
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    bar.style.left = Math.max(8, Math.min(r.left + r.width / 2 - bar.offsetWidth / 2, innerWidth - bar.offsetWidth - 8)) + 'px';
    bar.style.top = Math.max(8, r.top - bar.offsetHeight - 8) + 'px';
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function toggleTag(tag) {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    let n = r.commonAncestorContainer; if (n.nodeType === 3) n = n.parentNode;
    const ya = n.closest && n.closest(tag);
    if (ya && host.contains(ya)) { const t = document.createTextNode(ya.textContent); ya.replaceWith(t); return; }
    const el2 = document.createElement(tag); try { r.surroundContents(el2); } catch { el2.appendChild(r.extractContents()); r.insertNode(el2); }
    sel.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(el2); sel.addRange(nr);
  }
  async function linkSelection() {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const saved = sel.getRangeAt(0).cloneRange();
    const url = await K.ask('Enlace', { placeholder: 'https://…', ok: 'Poner enlace', sub: 'Déjalo vacío para quitar el enlace' });
    if (url === null) return;
    const s = getSelection(); s.removeAllRanges(); s.addRange(saved);
    if (!url) document.execCommand('unlink'); else if (/^(https?:|mailto:)/i.test(url)) document.execCommand('createLink', false, url); else if (/^[\w.-]+\.\w{2,}/.test(url)) document.execCommand('createLink', false, 'https://' + url); else K.toast('Enlace no válido');
    change();
  }

  /* ---------- Arrastrar bloques ---------- */
  let arrastrado = null;
  function onDragStart(e) {
    const g = e.target.closest && e.target.closest('.nb-grip'); if (!g) return;
    arrastrado = blockOf(g); arrastrado.classList.add('nb-dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'nb');
    try { e.dataTransfer.setDragImage(arrastrado, 20, 14); } catch {}
  }
  function onDragOver(e) {
    if (!arrastrado) return; e.preventDefault();
    host.querySelectorAll('.nb-over').forEach(x => x.classList.remove('nb-over', 'nb-over-b'));
    const w = blockOf(e.target); if (!w || w === arrastrado) return;
    const r = w.getBoundingClientRect(); w.classList.add(e.clientY > r.top + r.height / 2 ? 'nb-over-b' : 'nb-over');
  }
  function onDrop(e) {
    if (!arrastrado) return; e.preventDefault();
    const w = blockOf(e.target);
    if (w && w !== arrastrado) { const r = w.getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) w.after(arrastrado); else w.before(arrastrado); change(true); }
    onDragEnd();
  }
  function onDragEnd() { if (arrastrado) arrastrado.classList.remove('nb-dragging'); arrastrado = null; host.querySelectorAll('.nb-over,.nb-over-b').forEach(x => x.classList.remove('nb-over', 'nb-over-b')); }

  /* ---------- Montaje ---------- */
  function mount() {
    const old = $('note-body'); if (!old || $('nb')) return;
    store = old; store.hidden = true;
    host = document.createElement('div'); host.id = 'nb'; host.className = 'nb'; host.setAttribute('role', 'textbox'); host.setAttribute('aria-multiline', 'true');
    old.after(host);
    host.addEventListener('keydown', onKeydown);
    host.addEventListener('input', onInput);
    host.addEventListener('paste', onPaste);
    host.addEventListener('click', onClick);
    host.addEventListener('dragstart', onDragStart);
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('drop', onDrop);
    host.addEventListener('dragend', onDragEnd);
    host.addEventListener('blur', () => setTimeout(() => { if (!host.contains(document.activeElement) && !(slash && slash.contains(document.activeElement))) closeSlash(); }, 120), true);
    document.addEventListener('selectionchange', () => { if (host && host.contains(getSelection().anchorNode)) showBar(); else hideBar(); });
    // Antes de que app.js envíe el guardado de emergencia, el textarea debe tener lo último
    window.addEventListener('pagehide', NB.flush, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) NB.flush(); }, true);
    window.addEventListener('beforeunload', NB.flush, true);
  }

  /* ============ Propiedades de la nota (icono, color, etiquetas, fecha, fijada) ============ */
  let props = null;
  const itemActual = () => NT.items.find(i => i.id === NT.abierta);

  async function guardaProps(campos) {
    const id = NT.abierta; if (!id) return;
    try {
      await K.put('/api/notes/' + id, campos);
      await loadNotes(true);
      K.bus.emit('notes');
      if (campos.calendar !== undefined) K.bus.emit('calendar');
      pintaProps();
    } catch (e) { K.fail(e); }
  }

  function pintaProps() {
    if (!props) return;
    const it = itemActual(); props.textContent = '';
    if (!it) return;
    const colorear = it.color || '';
    $('editor-cuerpo').style.setProperty('--note-c', colorear || 'transparent');
    $('editor-cuerpo').classList.toggle('has-color', !!colorear);
    const ic = el('button', 'btn ghost sm'); ic.type = 'button'; ic.title = 'Cambiar icono';
    if (it.icon) { ic.textContent = it.icon; ic.style.fontSize = '18px'; } else { ic.appendChild(icon('i-sparkle')); ic.append(' Icono'); }
    ic.addEventListener('click', () => K.emojiPicker(ic, (e) => guardaProps({ icon: e })));
    const co = el('button', 'btn ghost sm'); co.type = 'button'; co.title = 'Color';
    if (colorear) { const d = el('span', 'k-dot'); d.style.setProperty('--c', colorear); co.appendChild(d); co.append(' Color'); } else { co.appendChild(icon('i-palette')); co.append(' Color'); }
    co.addEventListener('click', () => { const cp = K.colorPicker({ value: colorear, allowNone: true, onChange: (c) => { guardaProps({ color: c }); } }); const w = el('div'); w.style.padding = '6px'; w.appendChild(cp); K.pop(co, w, { width: 240 }); });
    const pin = el('button', 'btn ghost sm' + (it.pinned ? ' is-on' : '')); pin.type = 'button'; pin.append(icon(it.pinned ? 'i-pin-fill' : 'i-pin'), document.createTextNode(it.pinned ? ' Fijada' : ' Fijar'));
    pin.addEventListener('click', () => guardaProps({ pinned: !it.pinned }));
    const cal = el('button', 'btn ghost sm' + (it.cal ? ' is-on' : '')); cal.type = 'button';
    cal.append(icon('i-calendar'), document.createTextNode(it.cal ? ` ${K.d.short(K.d.parse(it.cal.date))}${it.cal.time ? ' ' + it.cal.time : ''}` : ' Fecha'));
    cal.title = it.cal ? 'Cambiar o quitar la fecha del calendario' : 'Añadir al calendario';
    cal.addEventListener('click', () => {
      const f = K.calField({ value: it.cal ? { date: it.cal.date, time: it.cal.time, calendarId: 'notas' } : null, defaultCalendar: 'notas', label: 'Mostrar en el calendario' });
      K.modal({ title: 'Fecha de la nota', sub: it.title, content: f, actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, onClick: async () => { await guardaProps({ calendar: f.get() }); } }] });
    });
    props.append(ic, co, pin, cal);
    if (it.cal) { const go = el('button', 'btn ghost sm'); go.type = 'button'; go.appendChild(icon('i-external')); go.title = 'Ver en el calendario'; go.addEventListener('click', () => { switchTab('calendar'); K.calendar.goto(K.d.parse(it.cal.date), 'month'); }); props.appendChild(go); }
    K.loadLabels().then(() => {
      const lp = K.labelPicker({ selected: it.labels || [], onChange: K.debounce((ids) => { if (NT.abierta === it.id) guardaProps({ labels: ids }); }, 400) });
      lp.style.cssText = 'flex:1;min-width:200px;min-height:36px;padding:3px 7px';
      props.appendChild(lp);
    }).catch(() => {});
  }

  function montaProps() {
    if (props || !$('editor-cuerpo')) return;
    props = el('div', 'note-props');
    $('editor-cuerpo').querySelector('.editor-barra').after(props);
  }

  /* ============ Enganches con app.js ============ */
  function enganchar() {
    mount(); montaProps();
    // abrirNota y cerrarNota son globales de app.js: se envuelven para cargar/limpiar el editor
    const abrir0 = window.abrirNota;
    window.abrirNota = async function (id) {
      NB.flush();
      await abrir0(id);
      if (NT.abierta === id) { NB.load(store.value); pintaProps(); }
    };
    const cerrar0 = window.cerrarNota;
    window.cerrarNota = function () { NB.flush(); NB.clear(); cerrar0(); };
  }

  K.openers.note = async (id) => {
    switchTab('notes');
    await loadNotes(true);
    // Se abren las carpetas padre para que la nota quede visible en el árbol
    let it = NT.items.find(i => i.id === id);
    while (it && it.parent) { NT.abiertas.add(it.parent); it = NT.items.find(i => i.id === it.parent); }
    guardarAbiertas(); renderNotes();
    abrirNota(id);
  };
  K.bus.on('labels', () => { if (itemActual()) pintaProps(); });
  K.bus.on('calendar', () => { if ($('view-notes') && !$('view-notes').hidden) loadNotes(true).then(pintaProps); });

  // app.js ya está cargado (este script va detrás): se engancha de inmediato
  enganchar();
})();
