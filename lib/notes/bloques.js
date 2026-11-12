'use strict';
// Cuenta los bloques ricos de una nota (para los logros). Se guarda en el índice de notas como `bl` al guardar el cuerpo.
const TIPOS = ['toggle', 'columns', 'toc', 'eq', 'mermaid', 'embed', 'base', 'sync', 'boton'];
// Contadores que no son un tipo de bloque (no cuentan para «Maestro de bloques»): lo que va dentro de las columnas y las bases con una vista elegida
const EXTRA = ['anidados', 'vistas'];
const RE_ANIDADO = /^(?:[-*+] \[[ xX]\]|[-*+]|\d+[.)])(?: |$)|^!\[[^\]]*\]\(kcc:file\//;

function cuentaBloques(md) {
  const n = Object.fromEntries([...TIPOS, ...EXTRA].map(t => [t, 0]));
  let fence = '', enCols = false;
  for (const l of String(md || '').split('\n')) {
    const f = /^```(\S*)\s*$/.exec(l);
    if (f) { if (fence) fence = ''; else { fence = f[1] || '-'; if (fence === 'mermaid') n.mermaid++; } continue; }
    if (fence) continue;
    if (enCols) { if (/^:::\s*$/.test(l)) enCols = false; else if (RE_ANIDADO.test(l)) n.anidados++; continue; }
    if (/^:::toggle(\s|$)/.test(l)) n.toggle++;
    else if (/^:::columns\s*$/.test(l)) { n.columns++; enCols = true; }
    else if (/^::toc\s*$/.test(l)) n.toc++;
    else if (/^\$\$\s*$/.test(l) || /^\$\$.+\$\$\s*$/.test(l)) n.eq += /^\$\$\s*$/.test(l) ? 0.5 : 1;   // la apertura y el cierre de un bloque son dos líneas
    else if (/^::embed\s+\S/.test(l)) n.embed++;
    else if (/^::base\s+[a-f0-9]{8,32}(\s+[a-f0-9]{16})?\s*$/.test(l)) { n.base++; if (/\s[a-f0-9]{16}\s*$/.test(l) && /^::base\s+\S+\s+\S+/.test(l)) n.vistas++; }
    else if (/^::boton\s+(nota:[\w-]{1,40}|fila:[a-f0-9]{8,32}:[a-f0-9]{8,32})(\s|$)/.test(l)) n.boton++;
    else if (/^::sync\s+[a-f0-9]{16}\s*$/.test(l)) n.sync++;
  }
  n.eq = Math.floor(n.eq);
  return n;
}

// Suma de los bloques de todas las notas (las que no se han guardado desde que existen estos bloques cuentan 0)
function resumenBloques(items) {
  const t = Object.fromEntries([...TIPOS, ...EXTRA].map(k => [k, 0]));
  for (const it of items || []) { if (it.type !== 'note' || it.deletedAt || it.trashed || !it.bl) continue; for (const k of [...TIPOS, ...EXTRA]) t[k] += Number(it.bl[k]) || 0; }
  return {
    nb_estructura: t.toggle + t.columns + t.toc, nb_ciencia: t.eq + t.mermaid, nb_incrusta: t.embed + t.base, nb_sync: t.sync, nb_botones: t.boton, nb_anidados: t.anidados, nb_vistas: t.vistas,
    nb_tipos: TIPOS.filter(k => t[k] > 0).length,
  };
}

module.exports = { cuentaBloques, resumenBloques, TIPOS };
