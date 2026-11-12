'use strict';
// IA · un adaptador por idioma de API: pedir una respuesta y listar los modelos disponibles.
const { llama, ErrorRed } = require('./http');

const trozo = (s, n = 200) => String(s || '').replace(/\s+/g, ' ').slice(0, n);

function falloDe(status, texto, nombre) {
  let msg = ''; try { const j = JSON.parse(texto); msg = (j.error && (j.error.message || j.error)) || j.message || ''; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch { msg = texto; }
  if (status === 401 || status === 403) return `${nombre}: la clave no es válida o no tiene permiso (${status}). ${trozo(msg, 120)}`.trim();
  if (status === 404) return `${nombre}: no existe ese modelo o esa dirección (404). ${trozo(msg, 120)}`.trim();
  if (status === 429) return `${nombre}: has llegado al límite de uso o de peticiones (429). Espera un rato o prueba otro modelo.`;
  if (status >= 500) return `${nombre}: el servicio no responde bien ahora (${status}). Inténtalo más tarde.`;
  return `${nombre}: ${trozo(msg, 240) || 'error ' + status}`;
}
function json(r, nombre) {
  if (r.status < 200 || r.status >= 300) throw new ErrorRed(falloDe(r.status, r.texto, nombre));
  try { return JSON.parse(r.texto); } catch { throw new ErrorRed(`${nombre}: respuesta no válida`); }
}

const opciones = (p, cfg) => ({ fijo: !!p.fijo, permiteLocal: process.env.KCC_IA_PERMITE_LOCAL === '1', timeout: cfg.timeout });
const MAX_MODELOS = 16 * 1024 * 1024;

/** Pide una respuesta. `cfg`: { base, modelo, clave, maxTokens }. Devuelve { texto, uso }. */
async function responde(p, cfg, { sistema, usuario }) {
  const base = String(cfg.base || p.base).replace(/(?<!\/)\/+$/, '');
  const o = opciones(p, cfg);
  if (p.tipo === 'anthropic') {
    const r = json(await llama(`${base}/messages`, { ...o, cabeceras: { 'x-api-key': cfg.clave, 'anthropic-version': '2023-06-01' },
      cuerpo: { model: cfg.modelo, max_tokens: cfg.maxTokens, system: sistema, messages: [{ role: 'user', content: usuario }] } }), p.nombre);
    return { texto: (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim(), uso: r.usage || null };
  }
  if (p.tipo === 'google') {
    const r = json(await llama(`${base}/models/${encodeURIComponent(cfg.modelo)}:generateContent`, { ...o, cabeceras: { 'x-goog-api-key': cfg.clave },
      cuerpo: { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: usuario }] }], generationConfig: { maxOutputTokens: cfg.maxTokens } } }), p.nombre);
    const c = r.candidates && r.candidates[0];
    return { texto: ((c && c.content && c.content.parts) || []).map(x => x.text || '').join('').trim(), uso: r.usageMetadata || null };
  }
  const cab = { ...(p.cabeceras || {}), ...(cfg.clave ? { Authorization: `Bearer ${cfg.clave}` } : {}) };
  const r = json(await llama(`${base}/chat/completions`, { ...o, cabeceras: cab,
    cuerpo: { model: cfg.modelo, [p.tokensMax || 'max_tokens']: cfg.maxTokens, messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }] } }), p.nombre);
  const m = r.choices && r.choices[0] && r.choices[0].message;
  const t = m && (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(x => x.text || '').join('') : '');
  // Los modelos que «razonan» pueden gastar todos los tokens pensando y no dejar texto: se avisa en vez de callar
  const razon = m && (m.reasoning || m.reasoning_content) ? String(m.reasoning || m.reasoning_content) : '';
  return { texto: String(t || '').trim(), razonado: !!razon, uso: r.usage || null };
}

/** Lista los modelos del proveedor: [{ id, nombre, gratis, contexto }] */
async function modelos(p, cfg) {
  const base = String(cfg.base || p.base).replace(/(?<!\/)\/+$/, '');
  const o = { ...opciones(p, cfg), metodo: 'GET', timeout: 30000, max: MAX_MODELOS };
  if (p.tipo === 'anthropic') {
    const r = json(await llama(`${base}/models?limit=100`, { ...o, cabeceras: { 'x-api-key': cfg.clave, 'anthropic-version': '2023-06-01' } }), p.nombre);
    return (r.data || []).map(m => ({ id: m.id, nombre: m.display_name || m.id, gratis: false, contexto: 0 }));
  }
  if (p.tipo === 'google') {
    const r = json(await llama(`${base}/models?pageSize=200`, { ...o, cabeceras: { 'x-goog-api-key': cfg.clave } }), p.nombre);
    return (r.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => ({ id: String(m.name).replace(/^models\//, ''), nombre: m.displayName || m.name, gratis: false, contexto: m.inputTokenLimit || 0 }));
  }
  const cab = { ...(p.cabeceras || {}), ...(cfg.clave ? { Authorization: `Bearer ${cfg.clave}` } : {}) };
  const r = json(await llama(p.modelosUrl || `${base}/models`, { ...o, cabeceras: cab }), p.nombre);
  const lista = Array.isArray(r) ? r : (r.data || r.models || []);
  return lista.filter(m => m && m.id).map(m => {
    const pr = m.pricing || {};
    const gratis = /:free$|-free$/.test(m.id) || (pr.prompt !== undefined && Number(pr.prompt) === 0 && Number(pr.completion) === 0);
    return { id: m.id, nombre: m.name || m.id, gratis, contexto: m.context_length || 0 };
  });
}

/** Comprobación rápida de la clave, sin gastar tokens ni bajar listas enormes. Devuelve true/false (false = no hay forma barata de saberlo). */
async function compruebaClave(p, cfg) {
  const base = String(cfg.base || p.base).replace(/(?<!\/)\/+$/, '');
  const o = { ...opciones(p, cfg), metodo: 'GET', timeout: 15000 };
  if (p.id === 'openrouter') { json(await llama(`${base}/key`, { ...o, cabeceras: { Authorization: `Bearer ${cfg.clave}` } }), p.nombre); return true; }
  if (p.tipo === 'anthropic') { json(await llama(`${base}/models?limit=1`, { ...o, cabeceras: { 'x-api-key': cfg.clave, 'anthropic-version': '2023-06-01' } }), p.nombre); return true; }
  if (p.tipo === 'google') { json(await llama(`${base}/models?pageSize=1`, { ...o, cabeceras: { 'x-goog-api-key': cfg.clave } }), p.nombre); return true; }
  return false;
}

module.exports = { responde, modelos, compruebaClave };
