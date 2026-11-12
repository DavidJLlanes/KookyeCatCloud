'use strict';
// Documentos · descarga de un documento como HTML (con su estilo), Markdown o texto plano.
const { aTexto } = require('./sanear');
const { convierte } = require('../importar/html-md');

const CSS = `body{font-family:Georgia,serif;line-height:1.6;max-width:760px;margin:2rem auto;padding:0 1rem;color:#111}h1,h2,h3{line-height:1.25}
.dc-cols{display:grid;grid-template-columns:repeat(var(--n,2),1fr);gap:1.5rem}.dc-cols[data-n="3"]{--n:3}.dc-cols[data-n="4"]{--n:4}
.dc-tareas{list-style:none;padding-left:0}.dc-tareas li::before{content:"☐ "}.dc-tareas li.dc-hecha::before{content:"☑ "}
table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.3rem .6rem}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:1rem;color:#444}
@media (max-width:600px){.dc-cols{grid-template-columns:1fr}}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function aHtml(doc) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>${CSS}</style></head><body><h1>${esc(doc.title)}</h1>${doc.html}</body></html>`;
}
function aMarkdown(doc) {
  let md = convierte(`<h1>${esc(doc.title)}</h1>` + doc.html.replace(/<div class="dc-cols"[^>]*>|<div class="dc-col">|<\/div>/g, ''), {});
  return String(md).trim() + '\n';
}
const aTextoPlano = (doc) => `${doc.title}\n\n${aTexto(doc.html)}\n`;

module.exports = { aHtml, aMarkdown, aTextoPlano };
