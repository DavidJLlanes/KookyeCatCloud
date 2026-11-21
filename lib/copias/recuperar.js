'use strict';
// Recuperación aditiva: nunca sustituye un archivo ni un registro que ya exista.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { FICHEROS_APP } = require('./archivo');

function tar(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(err.trim() || `tar terminó con código ${code}`)));
  });
}

function clave(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return JSON.stringify(item);
  for (const campo of ['id', 'username', 'token', 'key']) {
    if (typeof item[campo] === 'string' || typeof item[campo] === 'number') return `${campo}:${item[campo]}`;
  }
  return JSON.stringify(item);
}

function fusiona(actual, anterior) {
  if (Array.isArray(actual) && Array.isArray(anterior)) {
    const vistos = new Set(actual.map(clave));
    const nuevos = anterior.filter(item => {
      const k = clave(item);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    return { valor: nuevos.length ? [...actual, ...nuevos] : actual, nuevos: nuevos.length };
  }
  if (actual && anterior && typeof actual === 'object' && typeof anterior === 'object' && !Array.isArray(actual) && !Array.isArray(anterior)) {
    let valor = actual, nuevos = 0;
    for (const [k, v] of Object.entries(anterior)) {
      if (!Object.hasOwn(actual, k)) {
        if (valor === actual) valor = { ...actual };
        valor[k] = v;
        nuevos++;
      } else {
        const r = fusiona(actual[k], v);
        if (r.nuevos) {
          if (valor === actual) valor = { ...actual };
          valor[k] = r.valor;
          nuevos += r.nuevos;
        }
      }
    }
    return { valor, nuevos };
  }
  return { valor: actual, nuevos: 0 };
}

async function compruebaArchivo(archivo) {
  const [nombres, detalles] = await Promise.all([tar(['-tzf', archivo]), tar(['-tvzf', archivo])]);
  const entradas = nombres.split('\n').filter(Boolean);
  const tipos = detalles.split('\n').filter(Boolean);
  if (entradas.length !== tipos.length || !entradas.some(n => n.startsWith('datos/'))) throw new Error('La copia no tiene una estructura válida');
  for (let i = 0; i < entradas.length; i++) {
    const n = entradas[i].replace(/\/$/, '');
    if (!/^(datos|app)(\/|$)/.test(n) || n.split('/').some(s => !s || s === '.' || s === '..' || s.includes('\\')) || !['-', 'd'].includes(tipos[i][0])) {
      throw new Error('La copia contiene una ruta o tipo de archivo no admitido');
    }
    if (n.startsWith('app/') && !FICHEROS_APP.includes(n.slice(4)) && n !== 'app') throw new Error('La copia contiene un archivo de configuración no admitido');
  }
}

async function escribeJsonSiCambia(destino, actual, anterior) {
  const { valor, nuevos } = fusiona(actual, anterior);
  if (!nuevos) return 0;
  const temporal = `${destino}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(temporal, JSON.stringify(valor), { mode: 0o600 });
    await fsp.copyFile(destino, `${destino}.bak`);
    await fsp.rename(temporal, destino);
  } finally { await fsp.rm(temporal, { force: true }).catch(() => {}); }
  return nuevos;
}

async function fusionaArbol(origen, destino, resumen) {
  const entradas = await fsp.readdir(origen, { withFileTypes: true });
  await fsp.mkdir(destino, { recursive: true, mode: 0o700 });
  for (const entrada of entradas) {
    const src = path.join(origen, entrada.name), dst = path.join(destino, entrada.name);
    const actual = await fsp.lstat(dst).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (entrada.isDirectory()) {
      if (actual && !actual.isDirectory()) { resumen.omitidos++; continue; }
      await fusionaArbol(src, dst, resumen);
    } else if (entrada.isFile()) {
      if (!actual) {
        try { await fsp.copyFile(src, dst, fs.constants.COPYFILE_EXCL); await fsp.chmod(dst, 0o600); resumen.archivos++; }
        catch (e) { if (e.code === 'EEXIST') resumen.omitidos++; else throw e; }
      } else if (actual.isFile() && entrada.name.endsWith('.json') && !entrada.name.endsWith('.bak.json')) {
        // Un JSON agregado puede contener registros ausentes aunque el archivo ya exista.
        const [presente, copia] = await Promise.all([fsp.readFile(dst, 'utf8'), fsp.readFile(src, 'utf8')]);
        try { resumen.registros += await escribeJsonSiCambia(dst, JSON.parse(presente), JSON.parse(copia)); }
        catch (e) { if (e instanceof SyntaxError) resumen.omitidos++; else throw e; }
      } else resumen.omitidos++;
    } else throw new Error('La copia contiene enlaces o archivos especiales');
  }
}

async function recuperar({ archivo, dataRoot, appDir, copiasDir }) {
  await compruebaArchivo(archivo);
  const trabajo = path.join(copiasDir, `.recuperar-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const resumen = { archivos: 0, registros: 0, omitidos: 0 };
  try {
    await fsp.mkdir(trabajo, { mode: 0o700 });
    await tar(['-xzf', archivo, '-C', trabajo, '--no-same-owner', '--no-same-permissions']);
    const datos = path.join(trabajo, 'datos');
    const app = path.join(trabajo, 'app');
    if (!(await fsp.stat(datos)).isDirectory()) throw new Error('La copia no contiene datos');
    await fusionaArbol(datos, dataRoot, resumen);
    if (fs.existsSync(app)) await fusionaArbol(app, appDir, resumen);
    return resumen;
  } finally { await fsp.rm(trabajo, { recursive: true, force: true }).catch(() => {}); }
}

module.exports = { recuperar, fusiona };
