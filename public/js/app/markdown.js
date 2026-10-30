'use strict';
/* Markdown. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Markdown
   Intérprete propio que devuelve nodos del DOM, nunca cadenas de HTML:
   así el contenido de un archivo no puede convertirse en código ejecutable.
--------------------------------------------------------------- */
function urlSegura(u) {
  return /^(https?:|mailto:)/i.test(String(u).trim()) ? u : '#';
}

function mdEnLinea(padre, texto) {
  const re = /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|`([^`]+)`|~~([\s\S]+?)~~|\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let ultimo = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) padre.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
    if (m[1]) { const b = el('strong'); mdEnLinea(b, m[2]); padre.appendChild(b); }
    else if (m[3]) { const i = el('em'); mdEnLinea(i, m[4]); padre.appendChild(i); }
    else if (m[5] !== undefined) padre.appendChild(el('code', null, m[5]));
    else if (m[6]) { const s = el('s'); mdEnLinea(s, m[6]); padre.appendChild(s); }
    else if (m[8]) {
      const a = el('a', null, m[7] || m[8]);
      a.href = urlSegura(m[8]); a.target = '_blank'; a.rel = 'noopener noreferrer';
      padre.appendChild(a);
    } else if (m[9]) {
      const a = el('a', null, m[9]);
      a.href = urlSegura(m[9]); a.target = '_blank'; a.rel = 'noopener noreferrer';
      padre.appendChild(a);
    }
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) padre.appendChild(document.createTextNode(texto.slice(ultimo)));
  return padre;
}

function renderMarkdown(texto) {
  const raiz = el('div', 'md');
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  const esLista = (l) => /^\s*([-*+]|\d+[.)])\s+/.test(l);

  while (i < lineas.length) {
    const l = lineas[i];

    if (/^\s*```/.test(l)) {                       // bloque de código
      const buf = [];
      i++;
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) buf.push(lineas[i++]);
      i++;
      const pre = el('pre', 'md-code');
      pre.appendChild(el('code', null, buf.join('\n')));
      raiz.appendChild(pre);
      continue;
    }
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { raiz.appendChild(el('hr')); i++; continue; }

    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      raiz.appendChild(mdEnLinea(el('h' + h[1].length), h[2]));
      i++;
      continue;
    }

    if (/^\s*>/.test(l)) {                          // cita
      const buf = [];
      while (i < lineas.length && /^\s*>/.test(lineas[i])) buf.push(lineas[i++].replace(/^\s*>\s?/, ''));
      const bq = el('blockquote');
      bq.appendChild(mdEnLinea(el('p'), buf.join(' ')));
      raiz.appendChild(bq);
      continue;
    }

    // Tabla: cabecera + fila de guiones
    if (/\|/.test(l) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lineas[i + 1] || '')) {
      const celdas = (fila) => fila.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      const tabla = el('table', 'md-table');
      const thead = el('thead');
      const trh = el('tr');
      celdas(l).forEach(c => trh.appendChild(mdEnLinea(el('th'), c)));
      thead.appendChild(trh);
      tabla.appendChild(thead);
      i += 2;
      const tbody = el('tbody');
      while (i < lineas.length && /\|/.test(lineas[i]) && !/^\s*$/.test(lineas[i])) {
        const tr = el('tr');
        celdas(lineas[i++]).forEach(c => tr.appendChild(mdEnLinea(el('td'), c)));
        tbody.appendChild(tr);
      }
      tabla.appendChild(tbody);
      raiz.appendChild(tabla);
      continue;
    }

    if (esLista(l)) {                               // listas, con un nivel de anidado
      const ordenada = /^\s*\d+[.)]\s/.test(l);
      const lista = el(ordenada ? 'ol' : 'ul', 'md-list');
      let actual = null;
      while (i < lineas.length && esLista(lineas[i])) {
        const linea = lineas[i];
        const sangria = (linea.match(/^\s*/) || [''])[0].length;
        const contenido = linea.replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        if (sangria >= 2 && actual) {
          let sub = actual.querySelector('ul, ol');
          if (!sub) { sub = el(/^\s*\d+[.)]\s/.test(linea) ? 'ol' : 'ul'); actual.appendChild(sub); }
          sub.appendChild(mdEnLinea(el('li'), contenido));
        } else {
          actual = mdEnLinea(el('li'), contenido);
          lista.appendChild(actual);
        }
        i++;
      }
      raiz.appendChild(lista);
      continue;
    }

    const parrafo = [];                             // párrafo hasta la línea en blanco
    while (i < lineas.length && !/^\s*$/.test(lineas[i]) && !esLista(lineas[i]) &&
           !/^\s*(#{1,6}\s|>|```)/.test(lineas[i])) {
      parrafo.push(lineas[i++]);
    }
    raiz.appendChild(mdEnLinea(el('p'), parrafo.join(' ')));
  }
  return raiz;
}

// CSV con comillas: "Garcia, Ana" es una sola celda
function parseCsv(texto, sep) {
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else if (c !== '\r') celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter(f => f.length > 1 || f[0] !== '');
}

function renderCsv(texto, nombre) {
  const filas = parseCsv(texto, /\.tsv$/i.test(nombre) ? '\t' : ',');
  const caja = el('div', 'csv-wrap');
  if (!filas.length) { caja.appendChild(el('p', null, 'Archivo vacío')); return caja; }
  const tabla = el('table', 'md-table');
  const thead = el('thead');
  const trh = el('tr');
  filas[0].forEach(c => trh.appendChild(el('th', null, c)));
  thead.appendChild(trh);
  tabla.appendChild(thead);
  const tbody = el('tbody');
  const MAX = 500;
  for (const f of filas.slice(1, MAX + 1)) {
    const tr = el('tr');
    f.forEach(c => tr.appendChild(el('td', null, c)));
    tbody.appendChild(tr);
  }
  tabla.appendChild(tbody);
  caja.appendChild(tabla);
  if (filas.length - 1 > MAX) {
    caja.appendChild(el('p', 'doc-aviso', `Mostrando ${MAX} de ${filas.length - 1} filas. Descarga el archivo para verlo entero.`));
  }
  return caja;
}

// Todo lo que viene del servidor se inserta como texto, nunca como HTML:
// un archivo llamado "<img onerror=...>" debe verse como texto, no ejecutarse.
// Las carpetas que otros te comparten viven bajo "@compartido" y su nombre lleva "~<id>"; aquí se muestran limpias
function nombreVisible(nombre) {
  if (nombre === '@compartido') return 'Compartido conmigo';
  return String(nombre).replace(/~[a-f0-9]{8}$/, '');
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + name);
  svg.appendChild(use);
  return svg;
}
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

let toastTimer = null;
function showToast(msg) {
  const host = $('toast-host');
  host.textContent = '';
  host.appendChild(el('div', 'toast', msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.textContent = ''; }, 3000);
}

async function errorOf(res, fallback) {
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch { return fallback; }
}
// Id de esta pestaña: el servidor lo usa para no avisarle de los cambios que ella misma hace
const CID = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^\w-]/g, '').slice(0, 36);
async function api(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set('X-KCC-Client', CID);
  const res = await fetch(url, { credentials: 'include', ...opts, headers });
  if (res.status === 401) { showLogin(); throw new Error('No autenticado'); }
  return res;
}
async function post(url, body) {
  return api(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const qs = (p) => encodeURIComponent(p);
const joinPath = (dir, name) => (dir ? dir + '/' : '') + name;
const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
