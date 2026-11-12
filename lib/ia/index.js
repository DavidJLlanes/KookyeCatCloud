'use strict';
// IA opcional sobre la búsqueda: responder preguntas con los fragmentos que encuentra lib/busqueda, resumir una ficha y
// conectar el proveedor que quieras con tu propia clave (OpenAI, Anthropic, Google, OpenRouter, OpenCode Zen, Groq, Mistral,
// DeepSeek, xAI, Ollama o cualquier API compatible). Sin clave, esta parte no hace nada y la búsqueda sigue funcionando.
// Solo se envían al proveedor los fragmentos encontrados por la búsqueda (nunca todo el contenido, nunca la caja fuerte) y
// solo después de que el usuario lo haya aceptado. Código: config.js (ajustes), adaptadores.js (APIs), mensajes.js (textos).
const store = require('../store');
const { HttpError } = store;
const { PROVEEDORES, POR_ID } = require('./proveedores');
const { creaCifrado } = require('./clave');
const { creaConfig } = require('./config');
const { responde, modelos, compruebaClave } = require('./adaptadores');
const M = require('./mensajes');

const VENTANA_MS = 10 * 60000, MAX_LLAMADAS = 40, CACHE_MODELOS_MS = 10 * 60000, PLAZO_PRUEBA_MS = 30000;
const SIN_TEXTO = 'El modelo no devolvió texto. Si es un modelo que «razona», se quedó sin espacio pensando: prueba con otro modelo o con una pregunta más concreta.';

function createIA({ express, userRoot, sendError, registrarActividad, alCambiar, secreto, busqueda }) {
  const router = express.Router();
  const json = express.json({ limit: '32kb' });
  const cfg = creaConfig({ userRoot, cifrado: creaCifrado(secreto) });
  const cambio = (user) => { try { if (alCambiar) alCambiar(user); } catch { /* la gamificación no rompe la IA */ } };
  const log = (req, accion, detalle) => { if (registrarActividad) registrarActividad(req, 'ia', { accion, ...detalle }); };

  // Límite por usuario: una clave de pago no debe vaciarse por un bucle del cliente
  const usos = new Map();
  function limite(user) {
    const ahora = Date.now(), l = (usos.get(user) || []).filter(t => ahora - t < VENTANA_MS);
    if (l.length >= MAX_LLAMADAS) throw new HttpError(429, 'Demasiadas peticiones a la IA seguidas. Espera unos minutos.');
    l.push(ahora); usos.set(user, l);
  }

  // Proveedor a usar: el pedido o el activo, con clave y modelo ya comprobados
  async function elige(user, pedido, { exigeConsentimiento = true } = {}) {
    const c = await cfg.lee(user);
    const id = POR_ID[pedido] ? pedido : c.activo;
    const p = POR_ID[id];
    if (!p) throw new HttpError(400, 'Elige y configura un proveedor de IA en los ajustes');
    const e = cfg.efectiva(c, id);
    if (!p.sinClave && !e.clave) throw new HttpError(400, `Falta la clave de ${p.nombre}. Pégala en los ajustes de IA.`);
    if (!e.modelo) throw new HttpError(400, `Elige un modelo para ${p.nombre} en los ajustes de IA.`);
    if (!p.editable || !p.local) { if (exigeConsentimiento && !c.consentimiento) { const er = new HttpError(403, 'Antes de usar la IA acepta que se envíen fragmentos de tus datos al proveedor.'); er.codigo = 'consentimiento'; throw er; } }
    return { p, e, id };
  }
  const llama = (pe, sistema, usuario, maxTokens, timeout) => responde(pe.p, { ...pe.e, maxTokens, timeout }, { sistema, usuario });
  // Listas de modelos en memoria unos minutos: OpenRouter tarda en servir la suya y no depende de la clave
  const listas = new Map();
  const envia = (res, e) => sendError(res, e instanceof HttpError ? e : new HttpError(502, (e && e.message) || 'Error al hablar con la IA'));

  router.get('/config', async (req, res) => {
    try {
      const c = await cfg.lee(req.user);
      res.json({
        activo: c.activo, consentimiento: c.consentimiento, permiteLocal: process.env.KCC_IA_PERMITE_LOCAL === '1',
        proveedores: PROVEEDORES.map(p => { const e = cfg.efectiva(c, p.id); return { id: p.id, nombre: p.nombre, tipo: p.tipo, gratis: !!p.gratis, local: !!p.local, editable: !!p.editable, sinClave: !!p.sinClave, nota: p.nota || '', claveUrl: p.claveUrl || '',
          base: e.base, modelo: e.modelo, soloGratis: e.soloGratis, tieneClave: !!e.clave, pista: e.clave ? e.pista : '', listo: !!e.modelo && (p.sinClave || !!e.clave) }; }),
      });
    } catch (er) { sendError(res, er); }
  });

  router.put('/proveedores/:id', json, async (req, res) => {
    try {
      await cfg.guardaProveedor(req.user, req.params.id, req.body || {});
      log(req, 'proveedor', { id: req.params.id, clave: !!(req.body && req.body.clave) });
      res.json({ ok: true });
    } catch (er) { sendError(res, er); }
  });
  router.delete('/proveedores/:id/clave', async (req, res) => {
    try { await cfg.quitaClave(req.user, req.params.id); log(req, 'quitar_clave', { id: req.params.id }); res.json({ ok: true }); } catch (er) { sendError(res, er); }
  });
  router.put('/activo', json, async (req, res) => {
    try { await cfg.marcaActivo(req.user, String(req.body && req.body.id)); res.json({ ok: true }); } catch (er) { sendError(res, er); }
  });
  router.put('/consentimiento', json, async (req, res) => {
    try { await cfg.marcaConsentimiento(req.user, !!(req.body && req.body.ok)); log(req, 'consentimiento', { ok: !!(req.body && req.body.ok) }); res.json({ ok: true }); } catch (er) { sendError(res, er); }
  });

  router.post('/proveedores/:id/modelos', json, async (req, res) => {
    try {
      limite(req.user);
      const p = POR_ID[req.params.id];
      if (!p) throw new HttpError(404, 'Proveedor desconocido');
      const e = cfg.efectiva(await cfg.lee(req.user), p.id);
      if (!p.sinClave && !e.clave && p.id !== 'openrouter') throw new HttpError(400, `Guarda primero la clave de ${p.nombre}`);
      const k = `${p.id}|${e.base}|${p.id === 'openrouter' ? '' : e.pista}`, hit = listas.get(k);
      if (hit && Date.now() - hit.t < CACHE_MODELOS_MS && !(req.body && req.body.refrescar)) return res.json({ modelos: hit.lista, cache: true });
      const lista = await modelos(p, e);
      lista.sort((a, b) => (b.gratis - a.gratis) || a.id.localeCompare(b.id));
      const corta = lista.slice(0, 600);
      listas.set(k, { t: Date.now(), lista: corta });
      res.json({ modelos: corta });
    } catch (er) { envia(res, er); }
  });

  router.post('/probar', json, async (req, res) => {
    try {
      limite(req.user);
      const pe = await elige(req.user, req.body && req.body.proveedor, { exigeConsentimiento: false });
      const t0 = Date.now();
      if (pe.e.clave) await compruebaClave(pe.p, { ...pe.e, timeout: 15000 });   // rápido: si la clave falla, no esperamos al modelo
      const tClave = Date.now() - t0;
      let r;
      try { r = await llama(pe, 'Responde solo con la palabra: OK', 'Prueba de conexión', 64, PLAZO_PRUEBA_MS); }
      catch (er) {
        if (/tarda demasiado/.test(er.message || '')) throw new HttpError(504, `La clave es válida (${(tClave / 1000).toFixed(1)} s), pero el modelo «${pe.e.modelo}» no respondió en ${PLAZO_PRUEBA_MS / 1000} s. Los modelos gratuitos van lentos o saturados: prueba otro.`);
        throw er;
      }
      await cfg.suma(req.user, 'proveedor', pe.id).catch(() => {}); cambio(req.user);
      res.json({ ok: true, ms: Date.now() - t0, respuesta: r.texto.slice(0, 80) || '(sin texto: el modelo razona antes de contestar)' });
    } catch (er) { envia(res, er); }
  });

  router.post('/preguntar', json, async (req, res) => {
    try {
      limite(req.user);
      const pregunta = String((req.body && req.body.pregunta) || '').trim().slice(0, 600);
      if (pregunta.length < 3) throw new HttpError(400, 'Escribe una pregunta');
      const pe = await elige(req.user, req.body.proveedor);
      const m = req.body.m ? String(req.body.m).slice(0, 200) : null;
      const t0 = Date.now();
      let consulta = pregunta;
      if (req.body.ampliar) {   // opcional: la IA propone sinónimos para encontrar más (cuesta una llamada más, sin datos del usuario)
        try { consulta += ' ' + (await llama(pe, M.SISTEMA_PALABRAS, pregunta, 60)).texto.replace(/[^\p{L}\p{N}\s-]/gu, ' ').slice(0, 200); } catch { /* sigue con la pregunta sola */ }
      }
      const pasajes = await busqueda.contexto(req.user, consulta, { max: 8, m });
      const fuentes = pasajes.map((p, i) => ({ n: i + 1, fuente: p.fuente, id: p.id, sub: p.sub, titulo: p.titulo }));
      const recuento = await busqueda.recuentos(req.user).catch(() => []);
      if (!pasajes.length && !(recuento.length && /cu[aá]nt[oa]s?/i.test(pregunta))) return res.json({ respuesta: 'No he encontrado nada en tus datos relacionado con esa pregunta, así que no puedo responder con ellos.', fuentes: [], proveedor: pe.id, modelo: pe.e.modelo, ms: Date.now() - t0 });
      const r = await llama(pe, M.SISTEMA_PREGUNTA, M.usuarioPregunta(pregunta, pasajes, 14000, recuento), 1024);
      await Promise.all([cfg.suma(req.user, 'preguntas'), cfg.suma(req.user, 'proveedor', pe.id)]).catch(() => {}); cambio(req.user);
      log(req, 'preguntar', { proveedor: pe.id, fragmentos: pasajes.length });
      res.json({ respuesta: r.texto || SIN_TEXTO, fuentes, proveedor: pe.id, modelo: pe.e.modelo, ms: Date.now() - t0 });
    } catch (er) { envia(res, er); }
  });

  router.post('/resumir', json, async (req, res) => {
    try {
      limite(req.user);
      const b = req.body || {};
      const d = await busqueda.documento(req.user, String(b.fuente || ''), String(b.id || ''), b.sub ? String(b.sub) : null);
      if (!d || !d.texto || d.texto.trim().length < 40) throw new HttpError(404, 'No hay texto suficiente para resumir');
      const pe = await elige(req.user, b.proveedor);
      const t0 = Date.now();
      const r = await llama(pe, M.SISTEMA_RESUMEN, M.usuarioResumen(d.titulo, d.texto), 700);
      await Promise.all([cfg.suma(req.user, 'resumenes'), cfg.suma(req.user, 'proveedor', pe.id)]).catch(() => {}); cambio(req.user);
      log(req, 'resumir', { fuente: d.fuente, proveedor: pe.id });
      res.json({ resumen: r.texto || SIN_TEXTO, titulo: d.titulo, proveedor: pe.id, modelo: pe.e.modelo, ms: Date.now() - t0 });
    } catch (er) { envia(res, er); }
  });

  const core = {
    async resumen(user) {
      const s = await cfg.stats(user);
      return { ia_preguntas: s.preguntas || 0, ia_resumenes: s.resumenes || 0, ia_proveedores: (s.proveedores || []).length };
    },
  };
  return { router, core };
}

module.exports = createIA;
