'use strict';
const path = require('path');
const crypto = require('crypto');
const { kccDir, readJson, updateJson } = require('../nucleo/store');
const TIPOS = new Set(['dibujos', 'pizarra']);
const COLORS = new Set(['crema','amarillo','rosa','menta','azul','lavanda']);
const EMPTY = () => ({ items: [] });
function createAlmacen(userRoot) {
  const archivo = (user, tipo) => {
    if (!TIPOS.has(tipo)) throw new Error('Tipo inválido');
    return path.join(kccDir(userRoot(user)), 'creativos-' + tipo + '.json');
  };
  const lista = async (user, tipo) => (await readJson(archivo(user, tipo), EMPTY)).items || [];
  async function guardar(user, tipo, input, id) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Datos inválidos');
    const titulo = String(input.titulo || 'Sin título').trim().slice(0,120);
    const contenido = input.contenido;
    if (tipo === 'dibujos') {
      if (!Array.isArray(contenido) || contenido.length > 3000) throw new Error('Dibujo demasiado grande');
      for (const trazo of contenido) {
        if (!trazo || !/^#[0-9a-fA-F]{6}$/.test(trazo.color) || !Number.isFinite(trazo.grosor) || trazo.grosor < 1 || trazo.grosor > 48 || !Array.isArray(trazo.puntos) || trazo.puntos.length > 12000) throw new Error('Trazo inválido');
        for (const p of trazo.puntos) if (!Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Coordenadas inválidas');
      }
    } else if (tipo === 'pizarra') {
      if (typeof contenido !== 'string' || contenido.length > 100000) throw new Error('Nota demasiado extensa');
      if (!COLORS.has(input.color)) throw new Error('Color inválido');
    } else throw new Error('Tipo inválido');
    const now = new Date().toISOString();
    let saved;
    await updateJson(archivo(user, tipo), EMPTY, data => {
      data.items ||= [];
      let item = id && data.items.find(x => x.id === id);
      if (id && !item) { const e = new Error('No existe'); e.status = 404; throw e; }
      if (!item) {
        if (data.items.length >= 1000) throw new Error('Límite de 1000 elementos');
        item = { id: crypto.randomUUID(), creado: now };
        data.items.push(item);
      }
      Object.assign(item, { titulo, contenido, actualizado: now });
      if (tipo === 'pizarra') Object.assign(item, { color: input.color, x: Math.max(0,Math.min(100,Number(input.x)||0)), y: Math.max(0,Math.min(100,Number(input.y)||0)) });
      saved = item;
    });
    return saved;
  }
  async function borrar(user, tipo, id) {
    await updateJson(archivo(user, tipo), EMPTY, data => {
      const i = (data.items || []).findIndex(x => x.id === id);
      if (i < 0) { const e = new Error('No existe'); e.status = 404; throw e; }
      data.items.splice(i, 1);
    });
  }
  const resumen = async user => {
    const [d, p] = await Promise.all([lista(user, 'dibujos'), lista(user, 'pizarra')]);
    return { cr_dibujos: d.length, cr_trazos: d.reduce((n,x)=>n+(Array.isArray(x.contenido)?x.contenido.length:0),0), cr_postits: p.length, cr_colores: new Set(p.map(x=>x.color)).size };
  };
  return { lista, guardar, borrar, resumen };
}
module.exports = createAlmacen;
