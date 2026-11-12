'use strict';
// Importar · escribe las notas de un paquete: carpeta raíz «Importado de X · fecha», subcarpetas, cuerpos y adjuntos citados.
// Todo el índice se toca una sola vez y dentro de la cola de notas; si algo falla se borra lo escrito y el índice queda como estaba.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { NOTE_MAX_CHARS, NOTES_LIMIT, CARPETA_ADJUNTOS, ADJUNTO_OK } = require('./constantes');
const { HttpError } = require('../nucleo/store');

const id16 = () => crypto.randomBytes(8).toString('hex');
const limpiaNombre = (n) => String(n || 'adjunto').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'adjunto';

async function nombreLibre(dir, nombre) {
  const ext = path.extname(nombre), raiz = nombre.slice(0, nombre.length - ext.length);
  for (let i = 0; i < 1000; i++) {
    const n = i ? `${raiz} (${i})${ext}` : nombre;
    try { await fsp.access(path.join(dir, n)); } catch { return n; }
  }
  return `${raiz}-${id16()}${ext}`;
}

/** @returns {Promise<{notas, carpetas, adjuntos, recortadas, omitidas, raizId}>} */
async function ejecutaNotas({ user, paquete, destino, notes, extraeLinks, cuentaBloques, userRoot, nombreRaiz }) {
  const { readNotes, writeNotes, enCola, notaFile } = notes;
  const escritos = [];   // para deshacer
  return enCola(user, async () => {
    const data = await readNotes(user);
    const porId = new Map(data.items.map(i => [i.id, i]));
    if (destino && !(porId.get(destino) && porId.get(destino).type === 'folder')) throw new HttpError(400, 'La carpeta de destino no existe');
    const citados = paquete.adj.citados(paquete.notas.map(n => n.md));
    const rutas = new Set(); for (const n of paquete.notas) for (let i = 1; i <= n.ruta.length; i++) rutas.add(n.ruta.slice(0, i).join('\u0000'));
    const necesarias = paquete.notas.length + rutas.size + 1;
    if (data.items.length + necesarias > NOTES_LIMIT) throw new HttpError(400, `Se superaría el máximo de ${NOTES_LIMIT} elementos de notas (necesita ${necesarias}, quedan ${Math.max(0, NOTES_LIMIT - data.items.length)}). Importa un archivo más pequeño.`);

    const ahora = Date.now(), nuevos = [];
    const crea = (type, title, parent, extra = {}) => { const it = { id: id16(), type, title: String(title || (type === 'folder' ? 'Carpeta' : 'Sin título')).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sin título', parent, createdAt: ahora, updatedAt: ahora, ...extra }; nuevos.push(it); return it; };
    const raiz = crea('folder', nombreRaiz, destino || '');
    const carpetas = new Map([['', raiz.id]]);
    const carpetaDe = (ruta) => {
      let clave = '', padre = raiz.id;
      for (const parte of ruta) { clave += '\u0000' + parte; if (!carpetas.has(clave)) carpetas.set(clave, crea('folder', parte, padre).id); padre = carpetas.get(clave); }
      return padre;
    };

    // Adjuntos citados → «Adjuntos de notas» (nombre único; solo extensiones permitidas)
    const destinoAdj = path.join(userRoot(user), CARPETA_ADJUNTOS), refs = new Map(); let sinAdjuntar = 0;
    if (citados.size) await fsp.mkdir(destinoAdj, { recursive: true });
    for (const id of citados) {
      const a = paquete.adj.get(id); if (!a) continue;
      let nombre = limpiaNombre(a.nombre);
      if (!ADJUNTO_OK.test(nombre)) { sinAdjuntar++; continue; }
      nombre = await nombreLibre(destinoAdj, nombre);
      const f = path.join(destinoAdj, nombre);
      if (path.dirname(f) !== destinoAdj) { sinAdjuntar++; continue; }
      await fsp.writeFile(f, a.buf, { flag: 'wx' }); escritos.push(f);
      refs.set(id, 'kcc:file/' + encodeURIComponent(`${CARPETA_ADJUNTOS}/${nombre}`).replace(/\(/g, '%28').replace(/\)/g, '%29'));
    }

    let recortadas = 0;
    try {
      for (const n of paquete.notas) {
        let md = n.md.replace(/@adj\/\d+/g, (m) => refs.get(m) || '');
        md = md.replace(/!\[[^\][\n]*\]\(\)/g, '');                      // imagen cuyo adjunto no se pudo guardar
        if (md.length > NOTE_MAX_CHARS) { md = md.slice(0, NOTE_MAX_CHARS); recortadas++; }
        const it = crea('note', n.titulo, carpetaDe(n.ruta), {
          createdAt: Number.isFinite(n.creado) ? n.creado : ahora, updatedAt: Number.isFinite(n.modificado) ? n.modificado : ahora,
          links: extraeLinks(md), bl: cuentaBloques(md), chars: md.length, bodyAt: ahora, bodyBy: 'importar',
        });
        const f = notaFile(user, it.id);
        await fsp.writeFile(f, md, { flag: 'wx' }); escritos.push(f);
      }
      data.items.push(...nuevos);
      await writeNotes(user, data);
    } catch (e) {
      for (const f of escritos) await fsp.rm(f, { force: true }).catch(() => {});
      throw e;
    }
    return { notas: nuevos.filter(i => i.type === 'note').length, carpetas: nuevos.filter(i => i.type === 'folder').length, adjuntos: refs.size, sinAdjuntar, recortadas, raizId: raiz.id };
  });
}

module.exports = { ejecutaNotas };
