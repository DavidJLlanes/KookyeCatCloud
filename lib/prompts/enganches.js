'use strict';
// Enganches con otros módulos y API interna (core) del módulo.
const store = require('../store');
const { newId, HttpError } = store;
const { MAX_PROMPTS, MAX_VINCULOS } = require('./constantes');

function montaEnganches(ctx) {
  const { borraDefinitivo, expande, guarda, indice, labels, leeMeta, ligero, limpia, mapaFragmentos, papeleraDias } = ctx;

  /* ---------- Enganches con otros módulos ---------- */
  labels.registrarContador(async (user) => {
    const uso = {};
    for (const p of (await indice(user)).values()) if (!p.deletedAt) p.labels.forEach(l => { uso[l] = (uso[l] || 0) + 1; });
    return uso;
  });
  labels.registrarLimpieza(async (user, labelId) => {
    for (const p of (await indice(user)).values()) {
      if (p.labels.includes(labelId)) { p.labels = p.labels.filter(l => l !== labelId); await guarda(user, p); }
    }
  });

  // Papelera automática: lo que lleva más de TRASH_TTL_DAYS borrado se elimina del todo
  const ttl = Number(process.env.TRASH_TTL_DAYS || 30) * 86400000;
  const core = {
    // --- Vínculo con Código (lo orquesta lib/vinculos.js) ---
    async vinculaCodigo(user, id, proyectoId, on) {
      const p = (await indice(user)).get(id);
      if (!p || p.deletedAt) throw new HttpError(404, 'Prompt no encontrado');
      const set = new Set(Array.isArray(p.codigo) ? p.codigo : []);
      if (on) {
        if (!set.has(proyectoId) && set.size >= MAX_VINCULOS) throw new HttpError(400, `Un prompt admite como máximo ${MAX_VINCULOS} proyectos vinculados`);
        set.add(proyectoId);
      } else set.delete(proyectoId);
      p.codigo = [...set];
      await guarda(user, p);
      return p;
    },
    // Prompts de tipo código (los únicos que se pueden vincular), para el selector de la ficha del proyecto
    async deCodigo(user) {
      const out = [];
      for (const p of (await indice(user)).values()) if (!p.deletedAt && p.kind === 'codigo') out.push({ id: p.id, title: p.title, status: p.status, updatedAt: p.updatedAt });
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    // Título de cada id que siga existiendo (los borrados o en la papelera se omiten)
    async titulos(user, ids) {
      const items = await indice(user);
      return (ids || []).map(id => items.get(id)).filter(p => p && !p.deletedAt).map(p => ({ id: p.id, title: p.title, status: p.status }));
    },
    async descarta(user, id) { const p = (await indice(user)).get(id); if (p) await borraDefinitivo(user, p); },
    async creaDeCodigo(user, { title, body, notes }) {
      const items = await indice(user);
      if (items.size >= MAX_PROMPTS) throw new HttpError(400, 'Has alcanzado el máximo de prompts');
      const p = limpia({ __recorta: true, title, body, notes, kind: 'codigo' }, null, await leeMeta(user));
      p.id = newId();
      p.createdAt = p.updatedAt = Date.now();
      await guarda(user, p);
      return p;
    },
    async buscar(user, q) {
      const out = [];
      for (const p of (await indice(user)).values()) {
        if (p.deletedAt) continue;
        if (`${p.title}\n${p.body}`.toLowerCase().includes(q)) out.push(ligero(p));
        if (out.length >= 20) break;
      }
      return out;
    },
    // El evento del calendario cambió de fecha (o se borró): la ficha guarda la fecha vigente
    async setCal(user, id, ev) {
      const p = (await indice(user)).get(id);
      if (!p) return;
      p.cal = ev ? { date: ev.start.slice(0, 10), time: ev.allDay ? '' : ev.start.slice(11, 16) } : null;
      await guarda(user, p);
    },
    async obtener(user, id) { return (await indice(user)).get(id) || null; },
    // Para la gamificación: cuántos prompts hay (sin la papelera ni los fragmentos auxiliares)
    async contar(user) { let n = 0; for (const p of (await indice(user)).values()) if (!p.deletedAt) n++; return n; },
    // Para el enlace público de solo lectura: los prompts pedidos, con los fragmentos ya sustituidos
    async paraCompartir(user, ids) {
      const items = await indice(user);
      const frags = await mapaFragmentos(user);
      return ids.map(id => items.get(String(id))).filter(p => p && !p.deletedAt).map(p => ({
        id: p.id, title: p.title, kind: p.kind, model: p.model, tool: p.tool,
        system: expande(p.system || '', frags), body: expande(p.body || '', frags), negative: expande(p.negative || '', frags),
        notes: p.notes || '', params: p.params || {},
      }));
    },
    async limpiaPapelera(user) {
      // Los días los elige cada usuario (0 = nunca); sin ese dato se usa el valor por defecto del servidor
      const dias = papeleraDias ? await papeleraDias(user) : ttl / 86400000;
      if (!dias) return;
      for (const p of [...(await indice(user)).values()]) if (p.deletedAt && Date.now() - p.deletedAt > dias * 86400000) await borraDefinitivo(user, p);
    },
  };

  return { ttl, core };
}

module.exports = { montaEnganches };
