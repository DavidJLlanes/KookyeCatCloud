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

const valorVacio = (fallback) => (typeof fallback === 'function' ? fallback() : fallback);

// Lee un JSON. Solo «no existe» equivale a «vacío»: un archivo que existe pero no se puede leer o parsear NO se toma por
// vacío, porque el siguiente guardado lo habría sobrescrito y se habrían perdido los datos. Si está dañado se prueba la
// copia anterior (.bak) y, si tampoco sirve, se aparta como «.dañado-<fecha>» (queda para recuperarlo a mano) y se sigue vacío.
async function readJson(file, fallback) {
  let txt;
  try { txt = await fsp.readFile(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return valorVacio(fallback); throw e; }
  try { return JSON.parse(txt); } catch { /* dañado */ }
  try {
    const d = JSON.parse(await fsp.readFile(`${file}.bak`, 'utf8'));
    console.warn(`[store] ${file} estaba dañado: repuesto desde la copia anterior`);
    await fsp.rename(file, `${file}.dañado-${Date.now()}`).catch(() => {});
    await fsp.copyFile(`${file}.bak`, file).catch(() => {});
    return d;
  } catch { /* sin copia válida */ }
  console.error(`[store] ${file} está dañado y no hay copia válida: se aparta como .dañado y se sigue vacío`);
  await fsp.rename(file, `${file}.dañado-${Date.now()}`).catch(() => {});
  return valorVacio(fallback);
}

// Escritura atómica con nombre temporal propio (varias a la vez ya no se pisan el mismo .tmp) y copia del anterior
async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(tmp, JSON.stringify(data));
    await fsp.copyFile(file, `${file}.bak`).catch(() => {});
    await fsp.rename(tmp, file);
  } catch (e) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
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
