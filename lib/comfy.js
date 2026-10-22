'use strict';
// Lee los metadatos que ComfyUI y Automatic1111 guardan dentro de los PNG que generan y los convierte
// en los campos de un prompt (texto, negativo, modelo, semilla, pasos…). Solo se lee: no se ejecuta nada
// del workflow, es JSON que se recorre con cuidado.
const zlib = require('zlib');

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_JSON = 8 * 1024 * 1024;     // un workflow enorme no debe bloquear el servidor
const MAX_CHUNK = 16 * 1024 * 1024;

const latin1 = (b) => b.toString('latin1');
const utf8 = (b) => b.toString('utf8');

// Devuelve { clave: texto } con los trozos tEXt, zTXt e iTXt del PNG (null si no es un PNG)
function textosPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || !buf.subarray(0, 8).equals(FIRMA)) return null;
  const out = {};
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const tipo = latin1(buf.subarray(pos + 4, pos + 8));
    const ini = pos + 8;
    const fin = ini + len;
    if (len > MAX_CHUNK || fin + 4 > buf.length) break;
    if (tipo === 'IEND') break;
    if (tipo === 'tEXt' || tipo === 'zTXt' || tipo === 'iTXt') {
      const d = buf.subarray(ini, fin);
      const z = d.indexOf(0);
      if (z > 0 && z <= 80) {
        const clave = latin1(d.subarray(0, z));
        try {
          if (tipo === 'tEXt') {
            out[clave] = latin1(d.subarray(z + 1));
          } else if (tipo === 'zTXt') {
            out[clave] = latin1(zlib.inflateSync(d.subarray(z + 2), { maxOutputLength: MAX_JSON }));
          } else {
            const comprimido = d[z + 1] === 1;
            // clave\0 flag método idioma\0 clave-traducida\0 texto
            const a = d.indexOf(0, z + 3);
            const b = a < 0 ? -1 : d.indexOf(0, a + 1);
            if (b >= 0) {
              const cuerpo = d.subarray(b + 1);
              out[clave] = utf8(comprimido ? zlib.inflateSync(cuerpo, { maxOutputLength: MAX_JSON }) : cuerpo);
            }
          }
        } catch { /* trozo corrupto: se ignora */ }
      }
    }
    pos = fin + 4;   // + CRC
  }
  return out;
}

const esEnlace = (v) => Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && typeof v[1] === 'number';
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : undefined));

/* ---------- ComfyUI (formato API: { "3": { class_type, inputs } }) ---------- */
function desdeComfy(grafo) {
  if (!grafo || typeof grafo !== 'object') return null;
  const nodos = {};
  for (const [id, n] of Object.entries(grafo)) {
    if (n && typeof n === 'object' && typeof n.class_type === 'string' && n.inputs && typeof n.inputs === 'object') nodos[id] = n;
  }
  if (!Object.keys(nodos).length) return null;

  const nodo = (v) => (esEnlace(v) ? nodos[String(v[0])] : undefined);
  // Un valor puede ser literal o venir de otro nodo (un Primitive, un "String", un Reroute…)
  function valor(v, vistos = new Set()) {
    if (!esEnlace(v)) return v;
    const id = String(v[0]);
    if (vistos.has(id)) return undefined;
    vistos.add(id);
    const n = nodos[id];
    if (!n) return undefined;
    for (const k of ['value', 'string', 'text', 'int', 'float', 'seed', 'noise_seed', 'steps', 'cfg']) {
      if (n.inputs[k] !== undefined && !esEnlace(n.inputs[k])) return n.inputs[k];
    }
    for (const k of Object.keys(n.inputs)) {
      if (esEnlace(n.inputs[k])) { const r = valor(n.inputs[k], vistos); if (r !== undefined) return r; }
    }
    return undefined;
  }

  const CAMPOS_TEXTO = ['text', 'text_g', 'text_l', 'clip_l', 't5xxl', 'prompt'];
  // Recorre el acondicionamiento hacia atrás hasta encontrar los nodos que codifican texto
  function textos(v, vistos = new Set(), prof = 0) {
    const id = esEnlace(v) ? String(v[0]) : null;
    if (!id || vistos.has(id) || prof > 12) return [];
    vistos.add(id);
    const n = nodos[id];
    if (!n) return [];
    const propios = [];
    for (const k of CAMPOS_TEXTO) {
      if (n.inputs[k] === undefined) continue;
      const t = valor(n.inputs[k]);
      if (typeof t === 'string' && t.trim()) propios.push(t.trim());
    }
    if (propios.length && /CLIPTextEncode|TextEncode/i.test(n.class_type)) {
      // Variantes con dos textos iguales (SDXL, Flux): no se repiten
      return [...new Set(propios)];
    }
    const hijos = [];
    for (const [k, x] of Object.entries(n.inputs)) {
      if (esEnlace(x) && /conditioning|positive|negative|cond/i.test(k)) hijos.push(...textos(x, vistos, prof + 1));
    }
    return hijos;
  }

  // Nodo que decide la generación: KSampler, KSamplerAdvanced, SamplerCustom, SamplerCustomAdvanced…
  const muestreadores = Object.entries(nodos).filter(([, n]) => /KSampler|SamplerCustom/i.test(n.class_type));
  let positivo = '', negativo = '';
  const p = {};
  let ref = null;      // nodo desde el que se busca el modelo

  const conSemilla = muestreadores.find(([, n]) => n.inputs.positive !== undefined || n.inputs.guider !== undefined) || muestreadores[0];
  if (conSemilla) {
    const [, s] = conSemilla;
    ref = s;
    const i = s.inputs;
    let pos = i.positive, neg = i.negative, cfg = i.cfg, sampler = i.sampler_name, scheduler = i.scheduler, steps = i.steps, den = i.denoise;
    let semilla = i.seed !== undefined ? i.seed : i.noise_seed;

    if (i.guider !== undefined) {              // SamplerCustomAdvanced: la información está repartida
      const g = nodo(i.guider);
      if (g) {
        pos = g.inputs.positive !== undefined ? g.inputs.positive : g.inputs.conditioning;
        neg = g.inputs.negative;
        if (g.inputs.cfg !== undefined) cfg = g.inputs.cfg;
        if (g.inputs.model !== undefined) ref = g;
        const gc = nodo(g.inputs.conditioning);
        if (gc && gc.inputs.guidance !== undefined && cfg === undefined) cfg = gc.inputs.guidance;
      }
      const r = nodo(i.noise); if (r && r.inputs.noise_seed !== undefined) semilla = r.inputs.noise_seed;
      const sg = nodo(i.sigmas);
      if (sg) { steps = sg.inputs.steps; scheduler = sg.inputs.scheduler; den = sg.inputs.denoise; }
      const ks = nodo(i.sampler); if (ks && ks.inputs.sampler_name !== undefined) sampler = ks.inputs.sampler_name;
    }
    positivo = textos(pos).join('\n\n');
    negativo = textos(neg).join('\n\n');
    semilla = valor(semilla); steps = valor(steps); cfg = valor(cfg); sampler = valor(sampler); scheduler = valor(scheduler); den = valor(den);
    if (num(semilla) !== undefined) p.Seed = String(num(semilla));
    if (num(steps) !== undefined) p.Steps = String(num(steps));
    if (num(cfg) !== undefined) p.CFG = String(num(cfg));
    if (typeof sampler === 'string') p.Sampler = sampler;
    if (typeof scheduler === 'string') p.Scheduler = scheduler;
    if (num(den) !== undefined && num(den) !== 1) p.Denoise = String(num(den));
  }
  // Sin muestreador reconocible: el texto más largo de los codificadores
  if (!positivo) {
    const todos = Object.values(nodos).filter(n => /CLIPTextEncode/i.test(n.class_type))
      .map(n => CAMPOS_TEXTO.map(k => valor(n.inputs[k])).find(t => typeof t === 'string' && t.trim()))
      .filter(Boolean).sort((a, b) => b.length - a.length);
    positivo = (todos[0] || '').trim();
  }

  // Tamaño
  const lat = Object.values(nodos).find(n => /Empty.*Latent|SD3LatentImage|EmptyHunyuan/i.test(n.class_type) && n.inputs.width !== undefined);
  if (lat) { const w = num(valor(lat.inputs.width)), h = num(valor(lat.inputs.height)); if (w && h) p.Tamaño = `${w}x${h}`; }

  // Modelo: el del muestreador si se puede seguir; si no, el primer cargador que haya
  const CARGADORES = ['ckpt_name', 'unet_name', 'model_name', 'diffusion_model'];
  const cargador = (n) => CARGADORES.map(k => n.inputs[k]).find(x => typeof x === 'string');
  let modelo = '';
  const sigue = (v, vistos = new Set(), prof = 0) => {
    const n = nodo(v);
    if (!n || vistos.has(n) || prof > 20) return '';
    vistos.add(n);
    const c = cargador(n);
    if (c && /Loader|Checkpoint/i.test(n.class_type)) return c;
    return n.inputs.model !== undefined ? sigue(n.inputs.model, vistos, prof + 1) : '';
  };
  if (ref && ref.inputs.model !== undefined) modelo = sigue(ref.inputs.model);
  if (!modelo) {
    const c = Object.values(nodos).find(n => /Checkpoint|UNETLoader|UnetLoader|DiffusionModel/i.test(n.class_type) && cargador(n));
    if (c) modelo = cargador(c);
  }
  const loras = [];
  for (const n of Object.values(nodos)) {
    if (!/Lora/i.test(n.class_type)) continue;
    for (const [k, v] of Object.entries(n.inputs)) {
      if (/^lora_name(_\d+)?$/.test(k) && typeof v === 'string' && v && v !== 'None') {
        const fuerza = num(n.inputs[k.replace('lora_name', 'strength_model')] ?? n.inputs.strength_model ?? n.inputs.strength);
        loras.push(fuerza !== undefined ? `${v.replace(/\.safetensors$/i, '')} (${fuerza})` : v.replace(/\.safetensors$/i, ''));
      }
    }
  }
  if (loras.length) p.LoRA = [...new Set(loras)].join(', ');

  if (!positivo && !negativo && !modelo) return null;
  return { tool: 'ComfyUI', body: positivo, negative: negativo, model: modelo.replace(/\.(safetensors|ckpt|pt|gguf)$/i, ''), params: p };
}

/* ---------- Automatic1111 / Forge ("parameters": texto plano) ---------- */
function desdeA1111(txt) {
  if (typeof txt !== 'string' || !txt.trim()) return null;
  const t = txt.replace(/\r/g, '');
  const iAjustes = t.search(/\n(?:Steps|Sampler|CFG scale|Seed|Size|Model)\s*:[^\n]*$/);
  const lineaAjustes = (t.split('\n').reverse().find(l => /^Steps:\s*\d+/.test(l.trim()))) || '';
  let cuerpo = lineaAjustes ? t.slice(0, t.lastIndexOf(lineaAjustes)) : (iAjustes > 0 ? t.slice(0, iAjustes) : t);
  let negativo = '';
  const m = cuerpo.match(/\nNegative prompt:\s*/);
  if (m) { negativo = cuerpo.slice(m.index + m[0].length).trim(); cuerpo = cuerpo.slice(0, m.index); }
  const ajustes = {};
  if (lineaAjustes) {
    // "Steps: 20, Sampler: Euler a, ..., Lora hashes: "a: 1b, c: 2d", Version: v1" — las comillas pueden llevar comas
    const re = /\s*([A-Za-z][A-Za-z0-9 _/.-]*?):\s*("(?:[^"\\]|\\.)*"|[^,]*)(?:,|$)/g;
    let x;
    while ((x = re.exec(lineaAjustes)) !== null) ajustes[x[1].trim()] = x[2].trim().replace(/^"|"$/g, '');
  }
  const p = {};
  const pon = (k, v) => { if (v !== undefined && v !== '') p[k] = v; };
  pon('Seed', ajustes.Seed); pon('Steps', ajustes.Steps); pon('CFG', ajustes['CFG scale']);
  pon('Sampler', ajustes.Sampler); pon('Scheduler', ajustes['Schedule type']); pon('Tamaño', ajustes.Size);
  pon('Denoise', ajustes['Denoising strength']); pon('Hires', ajustes['Hires upscale']);
  const loras = [...cuerpo.matchAll(/<lora:([^:>]+)(?::([\d.]+))?>/gi)].map(l => (l[2] ? `${l[1]} (${l[2]})` : l[1]));
  if (loras.length) p.LoRA = [...new Set(loras)].join(', ');
  const body = cuerpo.trim();
  if (!body && !negativo) return null;
  return { tool: 'Automatic1111', body, negative: negativo, model: ajustes.Model || '', params: p };
}

/* Punto de entrada: Buffer de un PNG -> campos de prompt, o null si no lleva metadatos conocidos */
function leePrompt(buf) {
  const t = textosPng(buf);
  if (!t) return { error: 'No es un PNG' };
  if (t.prompt && t.prompt.length <= MAX_JSON) {
    try {
      const r = desdeComfy(JSON.parse(t.prompt));
      if (r) return r;
    } catch { /* no era JSON */ }
  }
  if (t.parameters) {
    const r = desdeA1111(t.parameters);
    if (r) return r;
  }
  return null;
}

module.exports = { leePrompt, textosPng, desdeComfy, desdeA1111 };
