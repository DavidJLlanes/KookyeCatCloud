'use strict';
// vinculos: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const store = require('../store');
const { readJson, writeJson, newId, HttpError, cleanStr } = store;
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { MAX_PROYECTOS, MAX_VINCULOS, normRuta, recuenta } = require('./constantes');

function monta(ctx) {
  const { cambio, dirP, fichero, leer, lista, mutar, ponArchivo, validId } = ctx;

  /* ---------- Vínculo con Prompts (lo orquesta lib/vinculos.js) ---------- */
  async function vinculaPrompt(user, id, promptId, on) {
    const p = await mutar(user, id, (x) => {
      const set = new Set(Array.isArray(x.prompts) ? x.prompts : []);
      if (on) {
        if (!set.has(promptId) && set.size >= MAX_VINCULOS) throw new HttpError(400, `Un proyecto admite como máximo ${MAX_VINCULOS} prompts vinculados`);
        set.add(promptId);
      } else set.delete(promptId);
      x.prompts = [...set];
    });
    cambio(user); return p;
  }
  // Nombre de cada proyecto que siga existiendo
  async function nombres(user, ids) {
    const out = [];
    for (const id of ids || []) { if (!validId(id)) continue; const p = await readJson(fichero(user, id), null); if (p && p.archivos) out.push({ id: p.id, nombre: p.nombre, descripcion: p.descripcion || '' }); }
    return out;
  }
  const promptsDe = async (user, id) => { const p = await leer(user, id); return Array.isArray(p.prompts) ? p.prompts : []; };
  // Crea un proyecto con los archivos de texto dados ({ ruta: contenido })
  async function crea(user, { nombre, descripcion, archivos, prompts }) {
    if ((await lista(user)).length >= MAX_PROYECTOS) throw new HttpError(400, 'Has llegado al máximo de proyectos');
    const p = { id: newId(), nombre: cleanStr(nombre, 120).trim() || 'Proyecto nuevo', descripcion: cleanStr(descripcion, 300).trim(), etiquetas: [], favorito: false, createdAt: Date.now(), updatedAt: Date.now(),
      archivos: {}, carpetas: [], versiones: [], siguienteV: 1, objetos: {}, prompts: Array.isArray(prompts) ? prompts.slice(0, MAX_VINCULOS) : [] };
    await fsp.mkdir(path.join(dirP(user, p.id), 'objetos'), { recursive: true });
    for (const [r, c] of Object.entries(archivos || {})) await ponArchivo(user, p, normRuta(r), Buffer.from(String(c), 'utf8'));
    recuenta(p);
    await writeJson(fichero(user, p.id), p);
    cambio(user);
    return { id: p.id, nombre: p.nombre };
  }


  return { vinculaPrompt, nombres, promptsDe, crea };
}

module.exports = monta;
