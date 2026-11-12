'use strict';
// Topes y listas base del módulo de prompts.
const { cleanStr } = require('../nucleo/store');

const MAX_IMAGENES = 10;
const IMG_MAX = 1600;        // lado mayor de la imagen guardada
const THUMB_MAX = 480;       // lado mayor de la miniatura
// Las subidas se procesan en memoria: 10 imágenes de 15 MB son 150 MB como máximo por petición
const IMG_MAX_BYTES = 15 * 1024 * 1024;
const IMG_MAX_PIXELS = 64e6;     // tope contra imágenes "bomba" (poco peso, gigantescas al descomprimir)
const MAX_PROMPTS = 100000;
const MAX_VINCULOS = 20;
const BODY_MAX = 100000;

const TIPOS = ['imagen', 'texto', 'codigo', 'video', 'audio', 'agente', 'fragmento', 'otro'];
const TIPOS_BASE = [
  ['imagen', 'Imagen', 'i-image'], ['texto', 'Texto', 'i-doc'], ['codigo', 'Código', 'i-bars'],
  ['video', 'Vídeo', 'i-play'], ['audio', 'Audio', 'i-music'], ['agente', 'Agente', 'i-sparkle'],
  ['fragmento', 'Fragmento', 'i-tag'], ['otro', 'Otro', 'i-stack'],
].map(([id, name, icon]) => ({ id, name, icon }));
const ICONOS_TIPO = new Set(['i-image', 'i-doc', 'i-bars', 'i-play', 'i-music', 'i-sparkle', 'i-tag', 'i-stack',
  'i-folder', 'i-note', 'i-server', 'i-monitor', 'i-globe', 'i-mail', 'i-calendar', 'i-palette', 'i-activity',
  'i-cloud', 'i-key', 'i-link', 'i-shield', 'i-user', 'i-users', 'i-zip', 'i-check', 'i-star', 'i-pin', 'i-cart']);
const normalizaTipos = (definiciones) => TIPOS_BASE.map(base => {
  const guardado = Array.isArray(definiciones) ? definiciones.find(x => x && x.id === base.id) : null;
  const nombre = guardado && typeof guardado.name === 'string' ? cleanStr(guardado.name, 60).trim() : '';
  const nombreValido = nombre && !/^(?:false|true|null|undefined)$/i.test(nombre) ? nombre : base.name;
  return { ...base, name: nombreValido,
    icon: ICONOS_TIPO.has(guardado && guardado.icon) ? guardado.icon : base.icon };
});
const MAX_SALIDAS = 30;
const MAX_CADENA = 20;
const MAX_VISTAS = 40;
const ESTADOS = ['borrador', 'probando', 'final', 'archivado'];
const MODELOS_BASE = ['ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'DALL·E', 'Stable Diffusion', 'FLUX',
  'Sora', 'Veo', 'Runway', 'Kling', 'Suno', 'Llama', 'Mistral', 'DeepSeek', 'Grok', 'Copilot', 'Otro'];
const HERRAMIENTAS_BASE = ['ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'ComfyUI', 'Automatic1111', 'Leonardo', 'Ideogram',
  'Runway', 'Sora', 'Suno', 'Cursor', 'Copilot', 'API', 'Otra'];
const CATEGORIAS_BASE = [
  ['Retratos', '🧑‍🎨', '#ec4899'], ['Paisajes', '🏞️', '#22c55e'], ['Arte y estilos', '🎨', '#8b5cf6'],
  ['Diseño y logos', '✏️', '#3b82f6'], ['Programación', '💻', '#06b6d4'], ['Escritura', '📝', '#f59e0b'],
  ['Marketing', '📣', '#ef4444'], ['Productividad', '⚡', '#14b8a6'],
];

module.exports = {
  MAX_IMAGENES, IMG_MAX, THUMB_MAX, IMG_MAX_BYTES, IMG_MAX_PIXELS, MAX_PROMPTS, MAX_VINCULOS, BODY_MAX, TIPOS, TIPOS_BASE, ICONOS_TIPO, normalizaTipos, MAX_SALIDAS, MAX_CADENA, MAX_VISTAS, ESTADOS, MODELOS_BASE, HERRAMIENTAS_BASE, CATEGORIAS_BASE,
};
