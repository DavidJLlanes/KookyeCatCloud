'use strict';
// Vigila las expresiones regulares (ReDoS, auditorías 16 y 17): analiza TODAS las literales del servidor y del cliente con `recheck`
// y falla si alguna puede volver atrás de forma cuadrática o exponencial (una entrada larga bloquearía el servidor o el navegador).
// Una excepción justificada (entrada acotada por longitud antes de llegar a la regex) va en EXCEPCIONES con el motivo.
// Uso: node tests/regex.js [archivo.js …]   (sin argumentos: todo el código)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const espree = require('espree');
const { checkSync } = require('recheck');

const RAIZ = path.join(__dirname, '..');
// [archivo, trozo del patrón, motivo]. Solo coste cuadrático (nunca exponencial) y con la entrada acotada o de confianza.
const EXCEPCIONES = [
  ['lib/bases/valores.js', '@[^\\s@<>]+\\.', 'el valor se corta a 200 caracteres antes (cleanStr)'],
  ['lib/importar/csv.js', '^[^@\\s]+@[^@\\s]+\\.', 'se descartan celdas de más de 254 caracteres antes de probarla'],
  ['public/js/app/markdown.js', '(\\*\\*|__)([\\s\\S]+?)\\1', 'markdown en línea del propio texto del usuario, un párrafo cada vez; en el peor caso se atasca su pestaña, no el servidor'],
  ['public/js/app/markdown.js', 'prompts\\/[^/?]+\\/comfy', 'se prueba contra la ruta de una petición (unos pocos cientos de caracteres)'],
  ['public/js/docexport.js', '```[^\\n]*\\n', 'exportación del propio texto del usuario, en su navegador'],
  ['public/js/docexport.js', '(^|[^*\\w])\\*(?!\\s)(.+?)', 'por línea (el punto no cruza saltos) y en su navegador'],
  ['public/js/game.js', '<symbol id="gi-', 'lee el sprite de iconos que lleva la propia app, no datos del usuario'],
  ['public/js/notes/ricos-incrustado.js', 'youtube', 'una única dirección escrita por el usuario en su bloque'],
  ['public/js/notes/ricos-incrustado.js', 'openstreetmap', 'una única dirección escrita por el usuario en su bloque'],
  ['server.js', '[kmgKMG]?[bB]?)', 'línea de configuración del .env, escrita por quien administra el servidor'],
];
const esExcepcion = (archivo, patron) => EXCEPCIONES.some(([a, t]) => a === archivo && patron.includes(t));

const archivos = [];
const anda = (d) => {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, n.name);
    if (n.isDirectory()) { if (!/node_modules|vendor|\.kcc|\.git$/.test(p)) anda(p); } else if (p.endsWith('.js')) archivos.push(p);
  }
};
const pedidos = process.argv.slice(2).map((a) => path.resolve(a));
if (pedidos.length) archivos.push(...pedidos);
else { for (const d of ['lib', 'public/js']) anda(path.join(RAIZ, d)); archivos.push(path.join(RAIZ, 'server.js')); }

// El análisis tarda casi un minuto la primera vez: se guarda el resultado por expresión (tests/.regex-cache.json, fuera de git)
const CACHE = path.join(__dirname, '.regex-cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* sin caché todavía */ }
let cacheCambio = false;
function analiza(pattern, flags) {
  const k = crypto.createHash('sha1').update(`${flags}/${pattern}`).digest('hex');
  if (!(k in cache)) {
    const r = checkSync(pattern, flags, { timeout: 3000 });
    cache[k] = { vulnerable: r.status === 'vulnerable', detalle: r.status === 'vulnerable' ? `${r.complexity.type}${r.complexity.summary ? ' ' + r.complexity.summary : ''}` : '' };
    cacheCambio = true;
  }
  return cache[k];
}

const vulnerables = [];
let total = 0;
const visita = (nodo, f) => {
  if (!nodo || typeof nodo.type !== 'string') return;
  if (nodo.type === 'Literal' && nodo.regex) {
    total++;
    const { pattern, flags } = nodo.regex;
    const r = analiza(pattern, flags.replace(/[^gimsuy]/g, ''));
    if (r.vulnerable && !esExcepcion(path.relative(RAIZ, f), pattern)) {
      vulnerables.push(`${path.relative(RAIZ, f)}:${nodo.loc.start.line}  /${pattern.slice(0, 100)}/${flags}  →  ${r.detalle}`);
    }
  }
  for (const k of Object.keys(nodo)) {
    if (k === 'parent') continue;
    const v = nodo[k];
    if (Array.isArray(v)) v.forEach((x) => visita(x, f)); else if (v && typeof v.type === 'string') visita(v, f);
  }
};
for (const f of archivos) {
  let ast;
  try { ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script', loc: true }); }
  catch (e) { try { ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true }); } catch { continue; } }
  visita(ast, f);
}
if (cacheCambio) { try { fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch { /* la caché es opcional */ } }
if (vulnerables.length) {
  console.error(`regex: ${vulnerables.length} expresión(es) vulnerable(s) a ReDoS de ${total} analizadas:\n  ` + vulnerables.join('\n  '));
  console.error('Reescríbelas sin retroceso (ver docs/auditoria-errores.md, auditorías 16 y 17) o añade una excepción justificada en tests/regex.js.');
  process.exit(1);
}
console.log(`regex: ${total} expresiones analizadas, ninguna vulnerable a ReDoS`);
