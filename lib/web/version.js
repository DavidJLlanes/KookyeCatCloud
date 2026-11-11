'use strict';
// Identificador de la versión instalada. Cambia solo al actualizar el código, y con él el nombre de la
// caché del service worker: así los navegadores detectan la actualización sin tocar ningún número a mano.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', '..');

const APP_VERSION = require('../../package.json').version;
const ARRANQUE = Date.now();
// Firma inmutable por proceso: el despliegue reinicia Node para activar el nuevo commit.
// Prioridad: BUILD_ID del despliegue, HEAD de Git (lectura única), versión del paquete.
function buildId() {
  return BUILD_ID;
}
function readGitHead() {
  try {
    const dot = path.join(RAIZ, '.git');
    const gitDir = fs.statSync(dot).isDirectory() ? dot : path.resolve(RAIZ, fs.readFileSync(dot, 'utf8').trim().replace(/^gitdir:\s*/, ''));
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[a-f0-9]{40}$/i.test(head)) return head;
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      try { return fs.readFileSync(path.join(gitDir, ref), 'utf8').trim(); } catch {}
      const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
      const line = packed.split('\n').find(l => l.endsWith(' ' + ref));
      if (line) return line.split(' ')[0];
    }
  } catch {}
  return '';
}
const BUILD_ID = String(process.env.KCC_BUILD_ID || process.env.BUILD_ID || readGitHead() || APP_VERSION).trim().slice(0, 40);

module.exports = { APP_VERSION, ARRANQUE, buildId };
