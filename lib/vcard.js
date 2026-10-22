'use strict';
// vCard 3.0 (RFC 2426): exportar e importar contactos.
// Lee lo que producen Google Contacts, iCloud, Android y Outlook: líneas plegadas, grupos
// (item1.TEL + item1.X-ABLabel), parámetros TYPE de varias formas y QUOTED-PRINTABLE.

const nombreVisible = (c) =>
  [c.first, c.middle, c.last].filter(Boolean).join(' ').trim() || c.company ||
  ((c.emails || [])[0] || {}).value || ((c.phones || [])[0] || {}).value || 'Sin nombre';

/* ---------------------------- Exportar ---------------------------- */

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
// Teléfonos, correos y enlaces no escapan , ni ; (así los escriben Apple y Google)
const escLiso = (s) => String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');

// Plegado a 75 octetos sin partir un carácter multibyte
function fold(linea) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of linea) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const TIPO_POR_ETIQUETA = { 'móvil': 'CELL', movil: 'CELL', celular: 'CELL', trabajo: 'WORK', casa: 'HOME', fax: 'FAX', principal: 'PREF' };
const tipoDe = (label) => TIPO_POR_ETIQUETA[String(label || '').trim().toLowerCase()] || '';

function toVCard(c, nombresEtiquetas = []) {
  const L = [];
  const add = (l) => L.push(fold(l));
  add('BEGIN:VCARD');
  add('VERSION:3.0');
  add('PRODID:-//KookyeCatCloud//Contactos//ES');
  if (c.id) add('UID:' + escLiso(c.id));
  add(`N:${esc(c.last)};${esc(c.first)};${esc(c.middle)};;`);
  add('FN:' + esc(nombreVisible(c)));
  if (c.nickname) add('NICKNAME:' + esc(c.nickname));
  if (c.company || c.department) add(`ORG:${esc(c.company)}${c.department ? ';' + esc(c.department) : ''}`);
  if (c.title) add('TITLE:' + esc(c.title));
  for (const p of c.phones || []) { const t = tipoDe(p.label); add(`TEL${t ? ';TYPE=' + t : ''}:${escLiso(p.value)}`); }
  for (const e of c.emails || []) { const t = tipoDe(e.label); add(`EMAIL;TYPE=INTERNET${t && t !== 'PREF' ? ',' + t : ''}:${escLiso(e.value)}`); }
  for (const a of c.addresses || []) {
    const t = tipoDe(a.label);
    add(`ADR${t && t !== 'PREF' ? ';TYPE=' + t : ''}:;;${esc(a.street)};${esc(a.city)};${esc(a.region)};${esc(a.zip)};${esc(a.country)}`);
  }
  for (const w of c.websites || []) add('URL:' + escLiso(w.value));
  let bday = false, n = 0;
  for (const d of c.dates || []) {
    if (!bday && /^cumplea/i.test(d.label)) { add('BDAY:' + d.date); bday = true; continue; }
    n++;
    add(`item${n}.X-ABDATE:${d.date}`);
    add(`item${n}.X-ABLabel:${esc(d.label)}`);
  }
  if (c.notes) add('NOTE:' + esc(c.notes));
  if (nombresEtiquetas.length) add('CATEGORIES:' + nombresEtiquetas.map(esc).join(','));
  if (c.updatedAt) add('REV:' + new Date(c.updatedAt).toISOString().replace(/[-:]|\.\d{3}/g, ''));
  add('END:VCARD');
  return L.join('\r\n') + '\r\n';
}

/* ---------------------------- Importar ---------------------------- */

function desescapa(s) { return String(s).replace(/\\([nN,;\\])/g, (_, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch)); }

// Parte por un separador ignorando los que van precedidos de barra invertida
function partir(s, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) { cur += ch + s[++i]; continue; }
    if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function decodificaQP(s) {
  const bytes = s.replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(bytes, 'latin1').toString('utf8');
}

function desplegar(texto) {
  const crudo = String(texto).replace(/\r\n?/g, '\n').split('\n');
  const lineas = [];
  for (const l of crudo) {
    if (/^[ \t]/.test(l) && lineas.length) lineas[lineas.length - 1] += l.slice(1);
    else lineas.push(l);
  }
  // QUOTED-PRINTABLE parte los valores largos con "=" al final de la línea
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    let l = lineas[i];
    const esQP = () => /QUOTED-PRINTABLE/i.test(l.slice(0, Math.max(0, l.indexOf(':'))));
    while (esQP() && l.endsWith('=') && i + 1 < lineas.length) l = l.slice(0, -1) + lineas[++i];
    out.push(l);
  }
  return out;
}

function parteLinea(l) {
  let entreComillas = false, idx = -1;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') entreComillas = !entreComillas;
    else if (ch === ':' && !entreComillas) { idx = i; break; }
  }
  if (idx < 0) return null;
  const cabecera = l.slice(0, idx);
  let valor = l.slice(idx + 1);
  // los ; dentro de comillas no separan parámetros
  const partes = [];
  let cur = '', q = false;
  for (const ch of cabecera) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) { partes.push(cur); cur = ''; } else cur += ch;
  }
  partes.push(cur);
  let nombre = partes[0];
  let grupo = '';
  const punto = nombre.indexOf('.');
  if (punto >= 0) { grupo = nombre.slice(0, punto); nombre = nombre.slice(punto + 1); }
  const tipos = [];
  let qp = false;
  for (const p of partes.slice(1)) {
    const eq = p.indexOf('=');
    const k = (eq < 0 ? 'TYPE' : p.slice(0, eq)).toUpperCase();
    const v = (eq < 0 ? p : p.slice(eq + 1)).replace(/"/g, '');
    if (k === 'TYPE') tipos.push(...v.split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
    else if (k === 'ENCODING' && /QUOTED-PRINTABLE/i.test(v)) qp = true;
  }
  if (qp) valor = decodificaQP(valor);
  return { grupo, nombre: nombre.toUpperCase(), tipos, valor };
}

// Etiquetas de Apple: _$!<Mobile>!$_ -> Móvil
const APPLE = { mobile: 'Móvil', home: 'Casa', work: 'Trabajo', main: 'Principal', other: 'Otro', anniversary: 'Aniversario', fax: 'Fax' };
function limpiaEtiqueta(raw) {
  const m = /^_\$!<(.+)>!\$_$/.exec(String(raw || '').trim());
  const t = (m ? m[1] : String(raw || '')).trim();
  return APPLE[t.toLowerCase()] || t;
}
function etiquetaTel(tipos) {
  if (tipos.includes('CELL')) return 'Móvil';
  if (tipos.includes('FAX') || tipos.includes('FAX-WORK') || tipos.includes('FAX-HOME')) return 'Fax';
  if (tipos.includes('WORK')) return 'Trabajo';
  if (tipos.includes('HOME')) return 'Casa';
  if (tipos.includes('MAIN')) return 'Principal';
  return 'Otro';
}
function etiquetaGeneral(tipos) {
  if (tipos.includes('WORK')) return 'Trabajo';
  if (tipos.includes('HOME')) return 'Casa';
  return 'Otro';
}

// BDAY y similares: 1990-03-15, 19900315, --03-15, --0315 (y el 1604 con el que Apple marca "sin año")
function normalizaFecha(v) {
  const s = String(v || '').trim().split('T')[0];
  let y = '', mo = '', d = '';
  let m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  if (m) { y = m[1]; mo = m[2]; d = m[3]; if (y === '1604') y = ''; }
  else if ((m = /^--(\d{2})-?(\d{2})$/.exec(s))) { mo = m[1]; d = m[2]; }
  else return '';
  const mes = Number(mo), dia = Number(d);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return y ? `${y}-${mo}-${d}` : `--${mo}-${d}`;
}

function parseVCards(texto, max = 10000) {
  const lineas = desplegar(texto);
  const out = [];
  let cur = null;
  for (const l of lineas) {
    if (/^BEGIN:VCARD\s*$/i.test(l)) { cur = []; continue; }
    if (/^END:VCARD\s*$/i.test(l)) {
      if (cur) { const c = construye(cur); if (c) out.push(c); }
      cur = null;
      if (out.length >= max) break;
      continue;
    }
    if (cur && l.trim()) { const p = parteLinea(l); if (p) cur.push(p); }
  }
  return out;
}

function construye(props) {
  const c = { first: '', middle: '', last: '', nickname: '', company: '', department: '', title: '', phones: [], emails: [], addresses: [], websites: [], dates: [], notes: '', categories: [] };
  const etiquetaGrupo = {};
  for (const p of props) if (p.nombre === 'X-ABLABEL' && p.grupo) etiquetaGrupo[p.grupo] = limpiaEtiqueta(desescapa(p.valor));
  let fn = '';
  for (const p of props) {
    const texto = () => desescapa(p.valor).trim();
    const partes = () => partir(p.valor, ';').map(desescapa).map(s => s.trim());
    switch (p.nombre) {
      case 'N': { const [last, first, middle] = partes(); c.last = last || ''; c.first = first || ''; c.middle = middle || ''; break; }
      case 'FN': fn = texto(); break;
      case 'NICKNAME': c.nickname = texto(); break;
      case 'ORG': { const [co, dep] = partes(); c.company = co || ''; c.department = dep || ''; break; }
      case 'TITLE': c.title = texto(); break;
      case 'TEL': { const v = texto().replace(/^tel:/i, ''); if (v) c.phones.push({ label: etiquetaGrupo[p.grupo] || etiquetaTel(p.tipos), value: v }); break; }
      case 'EMAIL': { const v = texto().replace(/^mailto:/i, ''); if (v) c.emails.push({ label: etiquetaGrupo[p.grupo] || (etiquetaGeneral(p.tipos) === 'Casa' ? 'Personal' : etiquetaGeneral(p.tipos)), value: v }); break; }
      case 'ADR': {
        const [po, ext, street, city, region, zip, country] = partes();
        const a = { label: etiquetaGrupo[p.grupo] || etiquetaGeneral(p.tipos), street: [po, ext, street].filter(Boolean).join(' '), city: city || '', region: region || '', zip: zip || '', country: country || '' };
        if (a.street || a.city || a.region || a.zip || a.country) c.addresses.push(a);
        break;
      }
      case 'URL': { const v = texto(); if (v) c.websites.push({ label: etiquetaGrupo[p.grupo] || 'Personal', value: v }); break; }
      case 'BDAY': { const d = normalizaFecha(p.valor); if (d) c.dates.push({ label: 'Cumpleaños', date: d }); break; }
      case 'ANNIVERSARY': { const d = normalizaFecha(p.valor); if (d) c.dates.push({ label: 'Aniversario', date: d }); break; }
      case 'X-ABDATE': { const d = normalizaFecha(p.valor); if (d) c.dates.push({ label: etiquetaGrupo[p.grupo] || 'Otra', date: d }); break; }
      case 'NOTE': c.notes = texto(); break;
      case 'CATEGORIES': c.categories.push(...partir(p.valor, ',').map(desescapa).map(s => s.trim()).filter(Boolean)); break;
      default: break;
    }
  }
  // Sin N: se reparte el FN. Si el FN es justo el nombre de la empresa, es una ficha de empresa.
  if (!c.first && !c.last && !c.middle && fn) {
    if (c.company && fn.toLowerCase() === c.company.toLowerCase()) { /* ficha de empresa: basta con company */ }
    else {
      const w = fn.split(/\s+/);
      c.first = w.shift() || '';
      c.last = w.join(' ');
    }
  }
  return c;
}

module.exports = { toVCard, parseVCards, nombreVisible, normalizaFecha };
