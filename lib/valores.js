'use strict';
// Valores reutilizables: los campos de texto que se repiten entre elementos (modelo y herramienta de un prompt,
// plataforma o desarrollador de un juego, empresa de un contacto…) se guardan en un catálogo por usuario para
// volver a elegirlos y no duplicar variantes ("Claude Sonnet 5.5" / "claude sonet 5,5"). Es un servicio
// compartido, como las etiquetas: cada módulo registra sus campos y llama a `aplica` al guardar.
//
//   registra({ campo:'prompts.model', modulo:'prompts', prop:'model', etiqueta:'Modelo', semilla:[…],
//              uso: async (user) => ({ valor: n }),            // cuántos elementos usan cada valor
//              renombra: async (user, mapea) => cambiados,      // mapea(v) → valor nuevo o undefined
//              migra: async (user) => ['valor antiguo', …] })   // opcional: lista que el módulo guardaba antes por su cuenta
//   aplica(user, 'prompts', obj)   // canoniza en sitio los campos de `obj` y guarda los nuevos en el catálogo
//
// Datos: <usuario>/.kcc/valores.json = { campos: { 'prompts.model': ['Claude Sonnet 5.5', …] }, ignorados: {…} }.
// La normalización (clave, limpia, parecido) vive en public/js/valores-clave.js y se comparte con el navegador.
const path = require('path');
const { kccDir, readJson, updateJson, HttpError, cleanStr } = require('./store');
const V = require('../public/js/valores-clave.js');

const MAX_POR_CAMPO = 500;

function createValores({ express, userRoot, sendError, registrarActividad, alCambiar }) {
  const router = express.Router();
  const defs = new Map();          // campo → definición
  const archivo = (user) => path.join(kccDir(userRoot(user)), 'valores.json');
  const vacio = () => ({ campos: {}, ignorados: {} });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no debe romper nada */ } };

  function registra(def) {
    if (!def || !def.campo || !def.modulo || !def.prop) throw new Error('Campo de valores mal definido');
    defs.set(def.campo, { multiple: false, semilla: [], max: 60, uso: async () => ({}), renombra: async () => 0, ...def });
  }
  const defDe = (campo) => {
    const d = defs.get(String(campo));
    if (!d) throw new HttpError(404, 'Campo desconocido');
    return d;
  };

  // Dado el catálogo guardado y las semillas, devuelve el valor canónico y si hay que añadirlo
  function resuelve(def, guardados, valor) {
    const v = V.limpia(cleanStr(valor, def.max + 20)).slice(0, def.max).trim();
    const k = V.clave(v);
    if (!k) return { valor: '', anadir: null };
    const ya = guardados.find(x => V.clave(x) === k);
    if (ya) return { valor: ya, anadir: null };
    const semilla = def.semilla.find(x => V.clave(x) === k);
    return { valor: semilla || v, anadir: semilla || v };
  }

  // Canoniza un valor suelto y lo guarda si es nuevo
  async function canoniza(user, campo, valor) {
    const def = defDe(campo);
    await migra(user, [campo]);
    const valorFinal = await updateJson(archivo(user), vacio, (d) => {
      const lista = (d.campos[campo] = Array.isArray(d.campos[campo]) ? d.campos[campo] : []);
      const r = resuelve(def, lista, valor);
      if (r.anadir && lista.length < MAX_POR_CAMPO) lista.push(r.anadir);
      return r.valor;
    });
    cambio(user);
    return valorFinal;
  }

  // Valores que un módulo guardaba antes por su cuenta (p. ej. la lista manual de modelos de Prompts) pasan al
  // catálogo una sola vez por usuario y campo; `migrados` lo recuerda. Las variantes repetidas no se unen solas:
  // salen en la pantalla de revisión.
  const hechos = new Set();
  async function migra(user, campos) {
    const pend = [...defs.values()].filter(d => d.migra && (!campos || campos.includes(d.campo)) && !hechos.has(user + '|' + d.campo));
    if (!pend.length) return;
    const data = await readJson(archivo(user), vacio);
    const falta = pend.filter(d => !(data.migrados || []).includes(d.campo));
    for (const d of pend) hechos.add(user + '|' + d.campo);
    if (!falta.length) return;
    const viejos = {};
    for (const d of falta) viejos[d.campo] = await d.migra(user).catch(() => []);
    await updateJson(archivo(user), vacio, (x) => {
      x.campos = x.campos || {}; x.migrados = Array.isArray(x.migrados) ? x.migrados : [];
      for (const d of falta) {
        const lista = (x.campos[d.campo] = Array.isArray(x.campos[d.campo]) ? x.campos[d.campo] : []);
        for (const v of viejos[d.campo]) {
          const t = V.limpia(cleanStr(v, d.max + 20)).slice(0, d.max).trim();
          if (t && !lista.some(y => V.clave(y) === V.clave(t)) && lista.length < MAX_POR_CAMPO) lista.push(t);
        }
        x.migrados.push(d.campo);
      }
    });
  }

  // Calcula, sin tocar nada, cómo quedarían los campos de `obj` y qué valores nuevos habría que guardar
  function resolver(mias, obj, data) {
    const salida = {}, anadir = {};
    for (const d of mias) {
      const guardados = Array.isArray(data.campos && data.campos[d.campo]) ? data.campos[d.campo] : [];
      const trabajo = [...guardados];                         // incluye lo que se vaya añadiendo en esta misma llamada
      const una = (x) => {
        const r = resuelve(d, trabajo, x);
        if (r.anadir && trabajo.length < MAX_POR_CAMPO) { trabajo.push(r.anadir); (anadir[d.campo] = anadir[d.campo] || []).push(r.anadir); }
        return r.valor;
      };
      if (d.multiple) {
        const vistos = new Set(); const sal = [];
        for (const x of (Array.isArray(obj[d.prop]) ? obj[d.prop] : [])) {
          const v = una(x); const k = V.clave(v);
          if (v && !vistos.has(k)) { vistos.add(k); sal.push(v); }
        }
        salida[d.prop] = sal;
      } else salida[d.prop] = una(obj[d.prop]);
    }
    return { salida, anadir };
  }

  // Canoniza en sitio los campos registrados de un módulo en `obj` (cadena o lista) y guarda los nuevos.
  // Primero solo lee: si no hay nada nuevo no se escribe el archivo (importar cientos de juegos no lo reescribe cientos de veces).
  async function aplica(user, modulo, obj) {
    const mias = [...defs.values()].filter(d => d.modulo === modulo && obj && obj[d.prop] !== undefined);
    if (!mias.length) return obj;
    await migra(user, mias.map(d => d.campo));
    let r = resolver(mias, obj, await readJson(archivo(user), vacio));
    if (Object.keys(r.anadir).length) {
      await updateJson(archivo(user), vacio, (data) => {
        data.campos = data.campos || {};
        r = resolver(mias, obj, data);                        // otra vez con el catálogo fresco, ya dentro de la cola
        for (const [campo, vals] of Object.entries(r.anadir)) {
          const lista = (data.campos[campo] = Array.isArray(data.campos[campo]) ? data.campos[campo] : []);
          vals.forEach(v => { if (!lista.includes(v)) lista.push(v); });
        }
      });
      cambio(user);
    }
    Object.assign(obj, r.salida);
    return obj;
  }

  // Lista completa de un campo: guardados + semillas + lo que hay en uso, con su recuento
  async function listaDe(user, def, data) {
    const uso = await def.uso(user).catch(() => ({}));
    const guardados = Array.isArray(data.campos && data.campos[def.campo]) ? data.campos[def.campo] : [];
    const mapa = new Map();
    const pon = (v, extra) => { const x = String(v || '').trim(); if (!x) return; mapa.set(x, { v: x, n: uso[x] || 0, guardado: false, semilla: false, ...(mapa.get(x) || {}), ...extra }); };
    def.semilla.forEach(v => pon(v, { semilla: true }));
    guardados.forEach(v => pon(v, { guardado: true }));
    Object.keys(uso).forEach(v => pon(v, {}));
    for (const e of mapa.values()) e.n = uso[e.v] || 0;
    return [...mapa.values()].sort((a, b) => (b.n - a.n) || a.v.localeCompare(b.v, 'es'));
  }
  const ficha = (def, valores) => ({ campo: def.campo, modulo: def.modulo, etiqueta: def.etiqueta, multiple: !!def.multiple, valores });

  // Grupos de valores que probablemente son el mismo: misma clave o parecidos (erratas), salvo los ignorados
  function gruposDe(def, valores, ignorados) {
    const ign = new Set(ignorados || []);
    const claves = [...new Set(valores.map(e => V.clave(e.v)).filter(Boolean))];
    const padre = new Map(claves.map(k => [k, k]));
    const raiz = (k) => { while (padre.get(k) !== k) { padre.set(k, padre.get(padre.get(k))); k = padre.get(k); } return k; };
    for (let i = 0; i < claves.length; i++) {
      for (let j = i + 1; j < claves.length; j++) {
        const par = [claves[i], claves[j]].sort().join('|');
        if (!ign.has(par) && V.sonParecidos(claves[i], claves[j])) padre.set(raiz(claves[i]), raiz(claves[j]));
      }
    }
    const comp = new Map();
    for (const e of valores) { const k = V.clave(e.v); if (!k) continue; const r = raiz(k); (comp.get(r) || comp.set(r, []).get(r)).push(e); }
    const grupos = [];
    for (const miembros of comp.values()) {
      if (miembros.length < 2) continue;
      // El sugerido: el más usado; a igualdad, el de las semillas, el que lleva mayúsculas, el más largo (las erratas suelen comer letras)
      const puntos = (e) => [e.n, Number(!!e.semilla), Number(/[A-ZÁÉÍÓÚÑ]/.test(e.v)), e.v.length, Number(!!e.guardado)];
      const orden = [...miembros].sort((a, b) => { const pa = puntos(a), pb = puntos(b); for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]; return a.v.localeCompare(b.v, 'es'); });
      const distintas = new Set(miembros.map(m => V.clave(m.v)));
      grupos.push({ campo: def.campo, etiqueta: def.etiqueta, tipo: distintas.size === 1 ? 'igual' : 'parecido', sugerido: orden[0].v, valores: orden });
    }
    return grupos;
  }

  // ---------- API ----------
  router.get('/', async (req, res) => {
    try {
      await migra(req.user);
      const data = await readJson(archivo(req.user), vacio);
      const campos = [];
      for (const def of defs.values()) campos.push(ficha(def, await listaDe(req.user, def, data)));
      res.json({ campos });
    } catch (err) { sendError(res, err); }
  });

  // Antes de /:campo para que "duplicados" no se tome por un campo
  router.get('/duplicados', async (req, res) => {
    try {
      await migra(req.user);
      const data = await readJson(archivo(req.user), vacio);
      const grupos = [];
      for (const def of defs.values()) grupos.push(...gruposDe(def, await listaDe(req.user, def, data), (data.ignorados || {})[def.campo]));
      res.json({ grupos });
    } catch (err) { sendError(res, err); }
  });

  router.post('/ignorar', express.json(), async (req, res) => {
    try {
      const def = defDe(req.body && req.body.campo);
      const claves = [...new Set((Array.isArray(req.body.valores) ? req.body.valores : []).map(v => V.clave(v)).filter(Boolean))].sort();
      if (claves.length < 2) throw new HttpError(400, 'Faltan valores');
      await updateJson(archivo(req.user), vacio, (d) => {
        d.ignorados = d.ignorados || {};
        const lista = (d.ignorados[def.campo] = Array.isArray(d.ignorados[def.campo]) ? d.ignorados[def.campo] : []);
        for (let i = 0; i < claves.length; i++) for (let j = i + 1; j < claves.length; j++) { const p = `${claves[i]}|${claves[j]}`; if (!lista.includes(p)) lista.push(p); }
      });
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.get('/:campo', async (req, res) => {
    try {
      const def = defDe(req.params.campo);
      await migra(req.user, [def.campo]);
      const data = await readJson(archivo(req.user), vacio);
      res.json(ficha(def, await listaDe(req.user, def, data)));
    } catch (err) { sendError(res, err); }
  });

  router.post('/:campo', express.json(), async (req, res) => {
    try {
      const valor = await canoniza(req.user, req.params.campo, req.body && req.body.valor);
      if (!valor) throw new HttpError(400, 'Escribe un valor');
      res.json({ ok: true, valor });
    } catch (err) { sendError(res, err); }
  });

  // Unifica varios valores en uno (también sirve para renombrar): cambia todos los elementos que los usan
  router.post('/:campo/fusionar', express.json(), async (req, res) => {
    try {
      const def = defDe(req.params.campo);
      const de = new Set((Array.isArray(req.body && req.body.de) ? req.body.de : []).map(x => String(x)));
      const a = V.limpia(cleanStr(req.body && req.body.a, def.max + 20)).slice(0, def.max).trim();
      if (!a) throw new HttpError(400, 'Escribe el valor final');
      if (!de.size) throw new HttpError(400, 'No hay nada que unificar');
      const cambiados = await def.renombra(req.user, (v) => (de.has(v) && v !== a ? a : undefined));
      await updateJson(archivo(req.user), vacio, (d) => {
        d.campos = d.campos || {};
        const lista = (d.campos[def.campo] = Array.isArray(d.campos[def.campo]) ? d.campos[def.campo] : []);
        d.campos[def.campo] = lista.filter(x => !de.has(x) || x === a);
        if (!d.campos[def.campo].includes(a)) d.campos[def.campo].push(a);
        d.unidos = (Number(d.unidos) || 0) + Math.max(0, de.size - (de.has(a) ? 0 : 1));   // variantes que desaparecen (para los logros)
      });
      cambio(req.user);
      if (registrarActividad) registrarActividad(req, 'valores_unificados', { campo: def.campo, a, n: de.size });
      res.json({ ok: true, valor: a, cambiados });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/:campo', async (req, res) => {
    try {
      const def = defDe(req.params.campo);
      const v = String(req.query.v || '');
      const uso = await def.uso(req.user).catch(() => ({}));
      if (uso[v]) throw new HttpError(409, `«${v}» está en uso en ${uso[v]} elemento${uso[v] === 1 ? '' : 's'}: cámbialo antes o únelo con otro valor`);
      await updateJson(archivo(req.user), vacio, (d) => {
        d.campos = d.campos || {};
        d.campos[def.campo] = (Array.isArray(d.campos[def.campo]) ? d.campos[def.campo] : []).filter(x => x !== v);
      });
      cambio(req.user);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // Contadores para los logros (ver CLAUDE.md): valores guardados, variantes unidas y campos con vocabulario propio
  async function resumen(user) {
    const d = await readJson(archivo(user), vacio);
    const listas = Object.values(d.campos || {}).filter(Array.isArray);
    return { val_total: listas.reduce((n, l) => n + l.length, 0), val_unidos: Number(d.unidos) || 0, val_campos: listas.filter(l => l.length >= 3).length };
  }

  return { router, core: { registra, canoniza, aplica, resumen, clave: V.clave, limpia: V.limpia } };
}

module.exports = createValores;
