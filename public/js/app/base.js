'use strict';
/* Estado y utilidades globales. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
// Safari de iOS ignora user-scalable=no: el pellizco de página se corta con sus eventos de gesto
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
const BASE = (document.querySelector('meta[name="kcc-base"]') || {}).content || '';
// Punto de enganche para los módulos nuevos (calendario, prompts…): cada uno registra aquí
// su vista con open()/close() y switchTab() se la enseña o esconde. Ver js/kit.js.
window.KCC = window.KCC || { views: {} };

/* ---------------------------------------------------------------
   Estado
--------------------------------------------------------------- */
const ORDENES = [
  ['name-asc', 'Nombre A → Z'], ['name-desc', 'Nombre Z → A'],
  ['date-desc', 'Más recientes'], ['date-asc', 'Más antiguos'],
  ['size-desc', 'Más grandes'], ['size-asc', 'Más pequeños'],
];

const state = {
  path: '',
  user: null,
  items: [],           // contenido de la carpeta (o resultados de búsqueda)
  images: [],          // subconjunto visible que es imagen, para el visor
  view: localStorage.getItem('fc-view') === 'list' ? 'list' : 'grid',
  sort: localStorage.getItem('fc-sort') || 'name-asc',
  filter: 'all',
  tab: 'files',
  query: '',
  truncated: false,
  selected: null,      // elemento del menú contextual
  selectMode: false,
  selection: new Set(),// rutas relativas completas
  lbIndex: -1,
  lastIndex: -1,       // último elemento pulsado, para seleccionar rangos con Shift
  pickerPath: '',
  pickerMode: 'move',  // 'move' | 'link'
  moving: [],          // rutas pendientes de mover
  linkPath: '',        // carpeta destino del enlace de subida que se va a crear
  caps: null,          // qué sabe hacer el servidor: sharp, ffmpeg, LibreOffice
  compartiendo: null,  // elemento del que se está creando un enlace de descarga
  agrupar: localStorage.getItem('fc-agrupar') === '1',
  meta: {},            // fecha de captura y coordenadas por nombre de archivo
};

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------
   Utilidades
--------------------------------------------------------------- */
function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  const n = bytes / Math.pow(1024, i);
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
}
function fmtDate(d) {
  const date = new Date(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: sameYear ? undefined : 'numeric',
  });
}
// HEIC entra como imagen: el servidor lo convierte al vuelo para el navegador
function isImage(name) {
  return /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i.test(name);
}
function isVideo(name) {
  return /\.(mp4|m4v|webm|mov|mkv|ogv)$/i.test(name);
}
function isAudio(name) {
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(name);
}
const isMedia = (name) => isImage(name) || isVideo(name) || isAudio(name);
// Lo que tiene miniatura: imágenes siempre, vídeos solo si el servidor tiene ffmpeg
const hasThumb = (name) => isImage(name) || isVideo(name);

// --- Documentos ---
const RE_CODIGO = /\.(txt|log|json|xml|svg|yml|yaml|ini|conf|cfg|toml|env|js|mjs|cjs|ts|jsx|tsx|css|scss|less|html?|php|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|sh|bash|zsh|sql|ps1|bat|srt|vtt)$/i;
const isMarkdown = (n) => /\.(md|markdown)$/i.test(n);
const isCsv = (n) => /\.(csv|tsv)$/i.test(n);
const isPdf = (n) => /\.pdf$/i.test(n);
// Las hojas de cálculo se pintan como rejilla, no se convierten a PDF
const isSheet = (n) => /\.(xlsx|xlsm|xls|ods|numbers)$/i.test(n);
const isOffice = (n) => /\.(docx?|pptx?|odt|odp|rtf|pages|key)$/i.test(n) || isSheet(n);
const isTexto = (n) => RE_CODIGO.test(n) || isMarkdown(n) || isCsv(n) ||
  /^(makefile|dockerfile|readme|licen[cs]e)$/i.test(n);
const isDoc = (n) => isPdf(n) || isOffice(n) || isTexto(n);
// Todo lo que el visor sabe abrir
const isViewable = (name) => isMedia(name) || isDoc(name);
