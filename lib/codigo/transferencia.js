'use strict';
// transferencia: sección del módulo (ver index.js). Recibe el contexto común y devuelve lo que declara.
const fs = require('fs');
const fsp = fs.promises;
const store = require('../store');
const { writeJson, newId, HttpError, cleanStr } = store;
const path = require('path');
const { BASURA, MAX_PROYECTOS, normRuta, recuenta } = require('./constantes');

function monta(ctx) {
  const { barre, cambio, dirP, fichero, leer, lista, manifiesto, mutar, objeto, objetoOk, ponArchivo, raiz, validId } = ctx;

  /* ---------- Para enviar entre secciones (lib/transferir.js) ---------- */
  async function exporta(user, id, vid, rutas) {
    const p = await leer(user, id); const m = manifiesto(p, String(vid || ''));
    const filtro = Array.isArray(rutas) && rutas.length ? rutas.map(r => normRuta(r)) : null;
    const sel = (r) => !filtro || filtro.some(f => r === f || r.startsWith(f + '/'));
    const archivos = [];
    for (const [r, a] of Object.entries(m.archivos)) if (sel(r)) { await objetoOk(user, p.id, a); archivos.push({ ruta: r, buf: await fsp.readFile(objeto(user, p.id, a[0])) }); }
    if (!archivos.length) throw new HttpError(404, 'No hay archivos que enviar');
    return { id: p.id, nombre: p.nombre, archivos, carpetas: m.carpetas };
  }
  // Añade archivos a un proyecto existente, o crea uno nuevo si no hay id
  async function importa(user, { id, nombre, carpeta, archivos }) {
    let creado = false;
    if (!id) {
      if ((await lista(user)).length >= MAX_PROYECTOS) throw new HttpError(400, 'Has llegado al máximo de proyectos');
      const p = { id: newId(), nombre: cleanStr(nombre, 120).trim() || 'Proyecto', descripcion: 'Enviado desde Archivos', etiquetas: [], favorito: false, createdAt: Date.now(), updatedAt: Date.now(), archivos: {}, carpetas: [], versiones: [], siguienteV: 1, objetos: {} };
      await fsp.mkdir(path.join(dirP(user, p.id), 'objetos'), { recursive: true });
      await writeJson(fichero(user, p.id), p);
      id = p.id; creado = true;
    }
    const anadidos = []; let nombreFinal = '';
    await mutar(user, id, async (x) => {
      nombreFinal = x.nombre;
      for (const a of archivos) {
        const ruta = normRuta((carpeta ? carpeta + '/' : '') + a.ruta);
        if (BASURA.test(ruta)) continue;
        await ponArchivo(user, x, ruta, a.buf); anadidos.push(ruta);
      }
      recuenta(x); await barre(user, x);
    });
    cambio(user);
    return { id, nombre: nombreFinal, creado, anadidos };
  }
  async function quitaRutas(user, id, rutas) {
    await mutar(user, id, async (x) => { for (const r of rutas) delete x.archivos[r]; recuenta(x); await barre(user, x); });
    cambio(user);
  }
  // Aparta un proyecto (sin borrarlo) para poder deshacer; devuelve el token
  async function aparta(user, id) {
    if (!validId(id)) throw new HttpError(404, 'No existe');
    const dir = path.join(raiz(user), '.borrados'); await fsp.mkdir(dir, { recursive: true });
    const token = newId();
    await fsp.rename(dirP(user, id), path.join(dir, token));
    cambio(user); return token;
  }
  async function restaura(user, token, id) {
    await fsp.rename(path.join(raiz(user), '.borrados', token), dirP(user, id));
    cambio(user);
  }
  async function borraAparcado(user, token) { await fsp.rm(path.join(raiz(user), '.borrados', token), { recursive: true, force: true }); }
  async function borra(user, id) { if (!validId(id)) return; await fsp.rm(dirP(user, id), { recursive: true, force: true }); cambio(user); }


  return { exporta, importa, quitaRutas, aparta, restaura, borraAparcado, borra };
}

module.exports = monta;
