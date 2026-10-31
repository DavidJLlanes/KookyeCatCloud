'use strict';
// Copia de seguridad: empaquetado, medida y comprobación del archivo. Sin estado: lo usa lib/copias.js.
// Se copia DATA_DIR entero (datos de todos los usuarios) y, aparte, los ficheros de la app que guardan
// configuración y secretos y no están dentro de DATA_DIR. Las miniaturas no se copian: están en THUMBS_DIR y se regeneran.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const NOMBRE = 'kookyecatcloud-datos.tar.gz';
const FICHEROS_APP = ['.env', 'users.json', '.jwt-secret', 'passkeys.json', 'shares.json', 'ical-tokens.json'];

// Ejecuta un comando y devuelve su salida. `ok` son los códigos de salida aceptados.
function ejecuta(cmd, args, { ok = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (ok.includes(code) ? resolve(out) : reject(new Error((err.trim() || `${cmd} terminó con código ${code}`).slice(0, 300)))));
  });
}

// Prioridad baja de CPU y de disco: los usuarios no notan la copia
function prioridad() {
  return fs.existsSync('/usr/bin/ionice') ? ['ionice', '-c3', 'nice', '-n', '19'] : ['nice', '-n', '19'];
}

// Bytes que ocupan los datos (para comprobar el espacio antes de empezar)
async function tamanoDe(dir) {
  const out = await ejecuta('du', ['-sb', dir]);
  return Number(out.split(/\s+/)[0]) || 0;
}

async function espacioLibre(dir) {
  const s = await fsp.statfs(dir);
  return Number(s.bavail) * Number(s.bsize);
}

// Carpeta temporal con enlaces simbólicos a lo que hay que copiar: tar lo empaqueta sin duplicar nada en disco.
async function preparaStaging({ dataRoot, appDir, staging }) {
  await fsp.mkdir(path.join(staging, 'app'), { recursive: true });
  await fsp.symlink(dataRoot, path.join(staging, 'datos'));
  const app = [];
  for (const f of FICHEROS_APP) {
    const origen = path.join(appDir, f);
    if (fs.existsSync(origen)) { await fsp.symlink(origen, path.join(staging, 'app', f)); app.push(f); }
  }
  return { app };
}

// Empaqueta con tar siguiendo los enlaces (-h). Código 1 = «el archivo cambió mientras se leía»: es normal con la app
// en uso y la verificación posterior comprueba que el resultado sea válido.
async function empaqueta({ staging, destino, app }) {
  const [cmd, ...pre] = prioridad();
  const args = ['-czhf', destino, '-C', staging, 'datos'];
  if (app.length) args.push('app');
  await ejecuta(cmd, [...pre, 'tar', ...args], { ok: [0, 1] });
}

// Comprueba que el archivo se lee entero, que tiene la carpeta de datos y que todos los JSON se pueden parsear
async function verifica({ archivo, trabajo }) {
  const listado = (await ejecuta('tar', ['-tzf', archivo])).split('\n').filter(Boolean);
  if (!listado.some(l => l.startsWith('datos/'))) throw new Error('La copia no contiene la carpeta de datos');
  const archivos = listado.filter(l => !l.endsWith('/')).length;
  let json = 0, jsonMalos = 0;
  if (listado.some(l => l.endsWith('.json'))) {
    await fsp.mkdir(trabajo, { recursive: true, mode: 0o700 });
    await ejecuta('tar', ['-xzf', archivo, '-C', trabajo, '--wildcards', '*.json']);
    for (const f of await listaJson(trabajo)) {
      json++;
      try { JSON.parse(await fsp.readFile(f, 'utf8')); } catch { jsonMalos++; }
    }
  }
  return { archivos, json, jsonMalos };
}

async function listaJson(dir) {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listaJson(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

module.exports = { NOMBRE, FICHEROS_APP, tamanoDe, espacioLibre, preparaStaging, empaqueta, verifica };
