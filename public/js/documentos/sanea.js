'use strict';
/* Documentos · saneado del HTML que se pega (Word, Google Docs, webs): se queda solo con lo que el editor entiende. El servidor
   vuelve a sanear al guardar, esto es para que lo pegado quede limpio y con el formato esperable. */
(function () {
  if (!window.K || !K.documentos) return;
  const D = K.documentos;
  const OK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'A', 'BR', 'HR', 'BLOCKQUOTE', 'PRE', 'CODE', 'SPAN', 'MARK', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  const TIRA = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'IMG', 'CANVAS', 'VIDEO', 'AUDIO']);
  const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.]+\)|[a-z]{3,20})$/i;

  function estilo(n) {
    const s = n.style, out = [];
    if (!s) return '';
    if (/^(left|center|right|justify)$/.test(s.textAlign)) out.push('text-align:' + s.textAlign);
    if (s.color && COLOR.test(s.color)) out.push('color:' + s.color);
    if (s.backgroundColor && COLOR.test(s.backgroundColor)) out.push('background-color:' + s.backgroundColor);
    const fs = /^(\d{1,3}(?:\.\d+)?)(px|pt)$/.exec(s.fontSize); if (fs && +fs[1] >= 6 && +fs[1] <= 120) out.push('font-size:' + s.fontSize);
    const f = D.FUENTES.find(x => (s.fontFamily || '').toLowerCase().includes(x.toLowerCase())); if (f) out.push(`font-family:'${f}'`);
    if (/^(bold|[6-9]00)$/.test(s.fontWeight)) out.push('font-weight:700');
    if (s.fontStyle === 'italic') out.push('font-style:italic');
    if (/underline|line-through/.test(s.textDecoration || s.textDecorationLine || '')) out.push('text-decoration:' + [/underline/.test(s.textDecoration) ? 'underline' : '', /line-through/.test(s.textDecoration) ? 'line-through' : ''].filter(Boolean).join(' '));
    return out.join(';');
  }

  function limpia(nodo, destino) {
    for (const n of [...nodo.childNodes]) {
      if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1 || TIRA.has(n.tagName)) continue;
      // Google Docs envuelve todo en <b style="font-weight:normal"> y Word en <o:p>: se desenvuelven
      if (n.tagName === 'B' && n.style.fontWeight === 'normal') { limpia(n, destino); continue; }
      if (!OK.has(n.tagName)) { limpia(n, destino); continue; }
      const c = document.createElement(n.tagName.toLowerCase());
      const st = estilo(n); if (st && !['UL', 'OL', 'TABLE', 'TR', 'BR', 'HR'].includes(n.tagName)) c.setAttribute('style', st);
      if (n.tagName === 'A') { const h = n.getAttribute('href') || ''; if (/^(https?:|mailto:|tel:)/i.test(h)) { c.setAttribute('href', h); c.target = '_blank'; c.rel = 'noopener noreferrer'; } }
      if (n.tagName === 'DIV' && /dc-cols|dc-col$/.test(n.className)) { c.className = n.className.includes('dc-cols') ? 'dc-cols' : 'dc-col'; if (n.dataset.n) c.dataset.n = n.dataset.n; }
      if ((n.tagName === 'UL') && n.classList.contains('dc-tareas')) c.className = 'dc-tareas';
      if (n.tagName === 'LI' && n.classList.contains('dc-hecha')) c.className = 'dc-hecha';
      limpia(n, c); destino.appendChild(c);
    }
  }
  D.saneaHtml = (html) => { const doc = new DOMParser().parseFromString(String(html), 'text/html'); const box = document.createElement('div'); limpia(doc.body, box); return box.innerHTML; };

  // Pegar: HTML saneado si lo hay; si no, texto plano con sus saltos de línea como párrafos
  D.alPegar = (e, cambio) => {
    const cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    const html = cd.getData('text/html');
    if (html) { document.execCommand('insertHTML', false, D.saneaHtml(html)); }
    else {
      const t = cd.getData('text/plain'); if (!t) return;
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      document.execCommand('insertHTML', false, t.split(/\r?\n/).map(l => esc(l)).join('<br>'));
    }
    cambio();
  };
})();
