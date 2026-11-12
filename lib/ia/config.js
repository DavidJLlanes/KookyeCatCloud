'use strict';
// IA · ajustes por usuario (<raíz>/.kcc/ia/config.json) y contadores (stats.json). Las claves van cifradas; al cliente nunca
// se le devuelve una clave, solo si existe y sus últimos 4 caracteres.
const path = require('path');
const { kccDir, readJson, updateJson, HttpError } = require('../store');
const { POR_ID } = require('./proveedores');

const VACIA = () => ({ activo: '', consentimiento: false, proveedores: {} });
const MODELO_OK = /^[\w.:/@+-]{1,120}$/;

function creaConfig({ userRoot, cifrado }) {
  const dir = (user) => kccDir(userRoot(user), 'ia');
  const cfgFile = (user) => path.join(dir(user), 'config.json');
  const statsFile = (user) => path.join(dir(user), 'stats.json');
  const norm = (c) => { c.proveedores = c.proveedores && typeof c.proveedores === 'object' ? c.proveedores : {}; return c; };

  const lee = async (user) => norm(await readJson(cfgFile(user), VACIA));
  const muta = (user, fn) => updateJson(cfgFile(user), VACIA, (c) => fn(norm(c)));

  // Ajustes de un proveedor, con la clave ya abierta (solo para usarla en una llamada; nunca sale hacia el cliente)
  const efectiva = (c, id) => {
    const p = POR_ID[id], g = c.proveedores[id] || {};
    return { clave: g.clave ? cifrado.abre(g.clave) : '', modelo: g.modelo || '', base: p.editable ? (g.base || p.base) : p.base, soloGratis: !!g.soloGratis, pista: g.pista || '' };
  };

  function guardaProveedor(user, id, b) {
    const p = POR_ID[id];
    if (!p) throw new HttpError(404, 'Proveedor desconocido');
    return muta(user, (c) => {
      const g = c.proveedores[id] = c.proveedores[id] || {};
      if (b.clave !== undefined) {
        const k = String(b.clave).trim();
        if (k) {
          if (k.length > 400 || /[\s\u0000-\u001f]/.test(k)) throw new HttpError(400, 'La clave no parece válida (sin espacios, máximo 400 caracteres)');
          g.clave = cifrado.cifra(k); g.pista = '…' + k.slice(-4);
        }
      }
      if (b.modelo !== undefined) {
        const m = String(b.modelo).trim();
        if (m && !MODELO_OK.test(m)) throw new HttpError(400, 'El nombre del modelo no es válido');
        g.modelo = m;
      }
      if (b.base !== undefined && p.editable) {
        const u = String(b.base).trim().replace(/(?<!\/)\/+$/, '');
        if (u) { let x; try { x = new URL(u); } catch { throw new HttpError(400, 'La dirección no es válida'); } if (!/^https?:$/.test(x.protocol) || x.username || x.password || u.length > 300) throw new HttpError(400, 'La dirección no es válida'); }
        g.base = u;
      }
      if (b.soloGratis !== undefined) g.soloGratis = !!b.soloGratis;
      if (!c.activo) c.activo = id;
    });
  }
  const quitaClave = (user, id) => { if (!POR_ID[id]) throw new HttpError(404, 'Proveedor desconocido'); return muta(user, (c) => { const g = c.proveedores[id]; if (g) { delete g.clave; delete g.pista; } }); };
  const marcaActivo = (user, id) => { if (!POR_ID[id]) throw new HttpError(404, 'Proveedor desconocido'); return muta(user, (c) => { c.activo = id; }); };
  const marcaConsentimiento = (user, ok) => muta(user, (c) => { c.consentimiento = !!ok; });

  const stats = async (user) => { try { return await readJson(statsFile(user), () => ({})); } catch { return {}; } };
  const suma = (user, campo, id) => updateJson(statsFile(user), () => ({}), (d) => {
    if (campo === 'proveedor') { d.proveedores = Array.isArray(d.proveedores) ? d.proveedores : []; if (id && !d.proveedores.includes(id)) d.proveedores.push(id); }
    else d[campo] = (d[campo] || 0) + 1;
  });

  return { lee, efectiva, guardaProveedor, quitaClave, marcaActivo, marcaConsentimiento, stats, suma };
}

module.exports = { creaConfig };
