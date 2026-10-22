'use strict';
// Almacén JSON por usuario para los módulos nuevos (calendario, prompts, etiquetas).
// Todo vive en <raíz del usuario>/.kcc/, oculto para el explorador de archivos.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const colas = new Map(); // archivo -> cola de promesas: serializa lecturas-modificaciones-escrituras

function kccDir(root, ...sub) {
  const dir = path.join(root, '.kcc', ...sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : fallback; }
}

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data));
  await fsp.rename(tmp, file);
}

// Lee, deja que fn modifique y guarda, de uno en uno por archivo.
// Si fn devuelve { __abort: true } no se escribe nada.
function updateJson(file, fallback, fn) {
  const previa = colas.get(file) || Promise.resolve();
  const siguiente = previa.catch(() => {}).then(async () => {
    const data = await readJson(file, fallback);
    const out = await fn(data);
    if (!(out && out.__abort)) await writeJson(file, data);
    return out;
  });
  colas.set(file, siguiente);
  siguiente.finally(() => { if (colas.get(file) === siguiente) colas.delete(file); }).catch(() => {});
  return siguiente;
}

const newId = () => crypto.randomBytes(8).toString('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const HEX = /^#[0-9a-f]{6}$/i;
const cleanColor = (c, def = '') => (HEX.test(String(c || '')) ? String(c).toLowerCase() : def);
const cleanStr = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max);
const cleanIds = (arr, max = 50) =>
  [...new Set((Array.isArray(arr) ? arr : []).map(x => String(x).slice(0, 40)).filter(Boolean))].slice(0, max);

module.exports = { kccDir, readJson, writeJson, updateJson, newId, HttpError, cleanColor, cleanStr, cleanIds };
