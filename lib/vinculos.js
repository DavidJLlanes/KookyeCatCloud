'use strict';

// Vínculos entre secciones. No guarda datos propios: cada lado conserva los ids del otro y este módulo
// mantiene los dos a la vez, así que el vínculo siempre se puede seguir en ambos sentidos.
//   Prompts → Código:  prompt.codigo    (ids de proyecto, en <raíz>/.kcc/prompts/items/<id>.json)
//   Código → Prompts:  proyecto.prompts (ids de prompt,   en <raíz>/.kcc/codigo/<id>/proyecto.json)
// Solo se vinculan prompts de tipo «código». Si un lado se borra, el id sobrante se ignora y se limpia
// la próxima vez que se consulta.
const { HttpError } = require('./store');

const RE_ID = /^[a-f0-9]{16}$/;

function createVinculos({ express, prompts, codigo, sendError, registrarActividad }) {
  const router = express.Router();
  const json = express.json({ limit: '20kb' });
  const id = (v) => { const s = String(v || ''); if (!RE_ID.test(s)) throw new HttpError(400, 'Identificador no válido'); return s; };
  const quiet = async (fn) => { try { await fn(); } catch (e) { if (!(e instanceof HttpError) || e.status !== 404) throw e; } };

  async function proyectoExiste(user, proyectoId) {
    const [p] = await codigo.nombres(user, [proyectoId]);
    if (!p) throw new HttpError(404, 'El proyecto de código ya no existe');
    return p;
  }
  async function promptDeCodigo(user, promptId) {
    const p = await prompts.obtener(user, promptId);
    if (!p || p.deletedAt) throw new HttpError(404, 'El prompt ya no existe');
    if (p.kind !== 'codigo') throw new HttpError(400, 'Solo se pueden vincular prompts de tipo código');
    return p;
  }
  // Los dos lados se escriben juntos; si el segundo falla se deshace el primero
  async function une(user, promptId, proyectoId, on) {
    await prompts.vinculaCodigo(user, promptId, proyectoId, on);
    try { await codigo.vinculaPrompt(user, proyectoId, promptId, on); }
    catch (e) { await prompts.vinculaCodigo(user, promptId, proyectoId, !on).catch(() => {}); throw e; }
  }

  /* ---------- Consultas ---------- */
  // Proyectos de un prompt (quita de paso los que ya no existen)
  router.get('/codigo/prompt/:id', async (req, res) => {
    try {
      const pid = id(req.params.id);
      const p = await prompts.obtener(req.user, pid);
      if (!p) throw new HttpError(404, 'Prompt no encontrado');
      const ids = Array.isArray(p.codigo) ? p.codigo : [];
      const vivos = await codigo.nombres(req.user, ids);
      for (const x of ids) if (!vivos.some(v => v.id === x)) await prompts.vinculaCodigo(req.user, pid, x, false).catch(() => {});
      res.json({ proyectos: vivos });
    } catch (e) { sendError(res, e); }
  });

  // Prompts de un proyecto
  router.get('/codigo/proyecto/:id', async (req, res) => {
    try {
      const proyectoId = id(req.params.id);
      const [pr] = await codigo.nombres(req.user, [proyectoId]);
      if (!pr) throw new HttpError(404, 'No existe');
      // La lista de ids vive en el JSON del proyecto: se lee con el detalle interno
      const ids = await codigo.promptsDe(req.user, proyectoId);
      const vivos = await prompts.titulos(req.user, ids);
      for (const x of ids) if (!vivos.some(v => v.id === x)) await codigo.vinculaPrompt(req.user, proyectoId, x, false).catch(() => {});
      res.json({ prompts: vivos });
    } catch (e) { sendError(res, e); }
  });

  // Prompts de tipo código disponibles para vincular
  router.get('/codigo/prompts', async (req, res) => {
    try { res.json({ items: await prompts.deCodigo(req.user) }); } catch (e) { sendError(res, e); }
  });

  /* ---------- Vincular y quitar ---------- */
  router.post('/codigo', json, async (req, res) => {
    try {
      const promptId = id(req.body && req.body.promptId), proyectoId = id(req.body && req.body.proyectoId);
      await promptDeCodigo(req.user, promptId); await proyectoExiste(req.user, proyectoId);
      await une(req.user, promptId, proyectoId, true);
      registrarActividad(req, 'vinculo_codigo', { accion: 'vincular', prompt: promptId, proyecto: proyectoId });
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  router.post('/codigo/quitar', json, async (req, res) => {
    try {
      const promptId = id(req.body && req.body.promptId), proyectoId = id(req.body && req.body.proyectoId);
      // Cada lado se limpia por separado: si uno ya no existe, el otro se limpia igualmente
      await quiet(() => prompts.vinculaCodigo(req.user, promptId, proyectoId, false));
      await quiet(() => codigo.vinculaPrompt(req.user, proyectoId, promptId, false));
      registrarActividad(req, 'vinculo_codigo', { accion: 'quitar', prompt: promptId, proyecto: proyectoId });
      res.json({ ok: true });
    } catch (e) { sendError(res, e); }
  });

  /* ---------- Crear el otro extremo ---------- */
  // Desde un prompt: nuevo proyecto con el prompt guardado en «prompt.md», ya vinculado
  router.post('/codigo/crear-proyecto', json, async (req, res) => {
    try {
      const promptId = id(req.body && req.body.promptId);
      const p = await promptDeCodigo(req.user, promptId);
      const partes = [`# ${p.title}`];
      if (p.system) partes.push('## Mensaje de sistema\n\n' + p.system);
      partes.push((p.system ? '## Prompt\n\n' : '') + (p.body || ''));
      const proyecto = await codigo.crea(req.user, {
        nombre: p.title, descripcion: `Resultado del prompt «${p.title}»`.slice(0, 300),
        archivos: { 'prompt.md': partes.filter(Boolean).join('\n\n') + '\n' }, prompts: [promptId],
      });
      try { await prompts.vinculaCodigo(req.user, promptId, proyecto.id, true); }
      catch (e) { await codigo.borra(req.user, proyecto.id).catch(() => {}); throw e; }
      registrarActividad(req, 'vinculo_codigo', { accion: 'crear_proyecto', prompt: promptId, proyecto: proyecto.id });
      res.json({ ok: true, proyecto });
    } catch (e) { sendError(res, e); }
  });

  // Desde un proyecto: nuevo prompt de tipo código, ya vinculado
  router.post('/codigo/crear-prompt', json, async (req, res) => {
    try {
      const proyectoId = id(req.body && req.body.proyectoId);
      const pr = await proyectoExiste(req.user, proyectoId);
      const nuevo = await prompts.creaDeCodigo(req.user, { title: `Prompt: ${pr.nombre}`, body: pr.descripcion || '', notes: `Resultado guardado en el proyecto de Código «${pr.nombre}».` });
      try { await codigo.vinculaPrompt(req.user, proyectoId, nuevo.id, true); await prompts.vinculaCodigo(req.user, nuevo.id, proyectoId, true); }
      catch (e) { await prompts.descarta(req.user, nuevo.id).catch(() => {}); throw e; }
      registrarActividad(req, 'vinculo_codigo', { accion: 'crear_prompt', prompt: nuevo.id, proyecto: proyectoId });
      res.json({ ok: true, prompt: { id: nuevo.id, title: nuevo.title } });
    } catch (e) { sendError(res, e); }
  });

  return router;
}

module.exports = createVinculos;
