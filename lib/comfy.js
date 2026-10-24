'use strict';
// Lee metadatos de generación incrustados en imágenes y los convierte en campos de un prompt.
// Los workflows se recorren como datos: nunca se ejecutan.
const zlib = require('zlib');

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_JSON = 8 * 1024 * 1024;     // un workflow enorme no debe bloquear el servidor
const MAX_CHUNK = 16 * 1024 * 1024;

const latin1 = (b) => b.toString('latin1');
const utf8 = (b) => b.toString('utf8');
const texto = (b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return latin1(b); } };

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
            out[clave] = texto(d.subarray(z + 1));
          } else if (tipo === 'zTXt') {
            out[clave] = texto(zlib.inflateSync(d.subarray(z + 2), { maxOutputLength: MAX_JSON }));
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
    // Custom switch nodes expose both the selector and the selected value as links.
    // Following the selector first returns its boolean (often 1) instead of the
    // Steps/CFG value carried by input_1.
    if (/Switch/i.test(n.class_type)) {
      for (const k of Object.keys(n.inputs)) {
        if (/^(input|value)_?\d*$/i.test(k) && n.inputs[k] !== undefined) {
          const r = esEnlace(n.inputs[k]) ? valor(n.inputs[k], new Set(vistos)) : n.inputs[k];
          if (r !== undefined) return r;
        }
      }
    }
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
    if (propios.length && /CLIPTextEncode|TextEncode|PositivePrompt|NegativePrompt/i.test(n.class_type)) {
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
  // Custom Comfy nodes (for example AcademiaSD_PositivePrompt) carry the text
  // directly in their `text` input instead of a CLIPTextEncode node.
  if (!positivo) {
    const candidatos = Object.values(nodos).filter(n => /PositivePrompt/i.test(n.class_type))
      .map(n => valor(n.inputs.text)).filter(t => typeof t === 'string' && t.trim());
    positivo = (candidatos.sort((a, b) => b.length - a.length)[0] || '').trim();
  }
  if (!negativo) {
    const candidato = Object.values(nodos).find(n => /NegativePrompt/i.test(n.class_type) && typeof n.inputs.text === 'string' && n.inputs.text.trim());
    if (candidato) negativo = candidato.inputs.text.trim();
    if (!negativo) {
      const custom = Object.values(nodos).find(n => typeof n.inputs.negative_prompt === 'string' && n.inputs.negative_prompt.trim());
      if (custom) negativo = custom.inputs.negative_prompt.trim();
    }
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

/* ---------- ComfyUI (workflow visual guardado junto a la imagen) ---------- */
function desdeWorkflowComfy(workflow) {
  if (!workflow || !Array.isArray(workflow.nodes)) return null;
  const nodos = {};
  for (const n of workflow.nodes) {
    if (!n || n.id === undefined) continue;
    nodos[String(n.id)] = { class_type: n.type || n.title || '', inputs: {} };
    const valores = Array.isArray(n.widgets_values) ? [...n.widgets_values] : [];
    const entradas = Array.isArray(n.inputs) ? n.inputs : [];
    const asociadas = entradas.filter(x => x && x.widget).map(x => x.name);
    // ComfyUI añade controles de UI como "randomize" entre widgets que no forman parte del grafo.
    const utiles = valores.filter(v => !(typeof v === 'string' && /^(randomize|increment|decrement|fixed)$/i.test(v.trim())));
    asociadas.forEach((name, i) => { if (i < utiles.length) nodos[String(n.id)].inputs[name] = utiles[i]; });
    // Los nodos de texto antiguos no siempre incluyen metadata de widget en la entrada.
    if (/TextEncode|CLIPText/i.test(nodos[String(n.id)].class_type) && !('text' in nodos[String(n.id)].inputs)) {
      const t = valores.find(v => typeof v === 'string'); if (t !== undefined) nodos[String(n.id)].inputs.text = t;
    }
  }
  const links = Array.isArray(workflow.links) ? workflow.links : Object.values(workflow.links || {});
  for (const link of links) {
    const origen = Array.isArray(link) ? link[1] : (link.origin_id ?? link.originId ?? link.from);
    const slot = Array.isArray(link) ? link[2] : (link.origin_slot ?? link.originSlot ?? link.fromSlot ?? 0);
    const destino = Array.isArray(link) ? link[3] : (link.target_id ?? link.targetId ?? link.to);
    const targetSlot = Array.isArray(link) ? link[4] : (link.target_slot ?? link.targetSlot ?? link.toSlot);
    const n = workflow.nodes.find(x => String(x.id) === String(destino));
    const nombre = n && Array.isArray(n.inputs) && n.inputs[targetSlot] && n.inputs[targetSlot].name;
    if (nombre && nodos[String(destino)] && nodos[String(origen)]) nodos[String(destino)].inputs[nombre] = [String(origen), Number(slot) || 0];
  }
  return desdeComfy(nodos);
}

const claveNormalizada = s => String(s).toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
function desdeObjeto(obj, nivel = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  // API-format ComfyUI graphs are node maps, not flat metadata dictionaries.
  // Recursing through them can mistake node IDs/inputs for prompt fields.
  if (Object.values(obj).some(v => v && typeof v === 'object' && typeof v.class_type === 'string' && v.inputs && typeof v.inputs === 'object')) return null;
  const fuentes = [obj, ...Object.values(obj), obj.metadata, obj.meta, obj.generation, obj.parameters, obj.params, obj.invokeai_metadata].filter(x => x && typeof x === 'object' && !Array.isArray(x));
  const valor = (...nombres) => {
    const buscadas = new Set(nombres.map(claveNormalizada));
    for (const fuente of fuentes) for (const [k, v] of Object.entries(fuente)) if (buscadas.has(claveNormalizada(k)) && v != null && v !== '') return v;
  };
  const textoCampo = v => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  const rawBody = textoCampo(valor('prompt', 'positive_prompt', 'positivePrompt', 'positive', 'prompt_text', 'description', 'text'));
  let body = rawBody;
  if (nivel < 2 && rawBody.startsWith('{') && rawBody.length <= MAX_JSON) {
    try { const nested = desdeObjeto(JSON.parse(rawBody), nivel + 1); if (nested) body = nested.body || body; } catch { /* texto de prompt literal */ }
  }
  const negative = textoCampo(valor('negative_prompt', 'negativePrompt', 'negative', 'uc', 'unconditional_prompt'));
  const modelRaw = valor('model', 'model_name', 'base_model', 'base_model_name', 'checkpoint', 'ckpt_name', 'unet_name');
  const model = textoCampo(typeof modelRaw === 'object' && modelRaw ? modelRaw.name || modelRaw.model_name : modelRaw);
  const tool = textoCampo(valor('tool', 'software', 'generator', 'application', 'app', 'creator_tool'));
  const rawParams = valor('params', 'parameters', 'generation_parameters', 'generation') || {};
  const p = {};
  if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    const excluidas = new Set(['prompt', 'positive_prompt', 'positive', 'negative_prompt', 'negative', 'model', 'model_name', 'seed', 'noise_seed', 'steps', 'num_inference_steps', 'cfg', 'cfg_scale', 'guidance_scale', 'sampler', 'sampler_name', 'scheduler', 'schedule_type', 'denoise', 'denoising_strength', 'width', 'height', 'image_width', 'image_height', 'resolution', 'size', 'loras', 'lora'].map(claveNormalizada));
    for (const [k, v] of Object.entries(rawParams)) {
      if (v == null || excluidas.has(claveNormalizada(k))) continue;
      if (['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => ['string', 'number', 'boolean'].includes(typeof x)))) p[k.trim()] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  const pon = (label, keys) => { const v = valor(...keys); if (v != null && v !== '') p[label] = typeof v === 'object' ? JSON.stringify(v) : String(v); };
  pon('Seed', ['seed', 'noise_seed']); pon('Steps', ['steps', 'num_inference_steps']);
  pon('CFG', ['cfg', 'cfg_scale', 'guidance_scale', 'guidance']);
  pon('Sampler', ['sampler', 'sampler_name']); pon('Scheduler', ['scheduler', 'schedule_type']);
  pon('Denoise', ['denoise', 'denoising_strength']); pon('LoRA', ['loras', 'lora']);
  const width = valor('width', 'image_width'), height = valor('height', 'image_height');
  const resolution = valor('resolution', 'size');
  if (width && height) p.Tamaño = `${width}x${height}`;
  else if (resolution) p.Tamaño = Array.isArray(resolution) ? resolution.join('x')
    : typeof resolution === 'object' ? `${resolution.width || resolution.w || ''}x${resolution.height || resolution.h || ''}`.replace(/^x|x$/g, '')
      : String(resolution);
  if (!body && !negative && !model && !Object.keys(p).length) return null;
  return { tool, body, negative, model, params: p };
}

function fusiona(a, b) {
  if (!a) return b;
  if (!b) return a;
  const params = { ...(b.params || {}) };
  for (const [k, v] of Object.entries(a.params || {})) if (v != null && String(v).trim() !== '') params[k] = v;
  return { tool: a.tool || b.tool || '', body: a.body || b.body || '', negative: a.negative || b.negative || '', model: a.model || b.model || '', params };
}

function desdeXmp(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return null;
  const decode = s => s.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  const names = ['prompt', 'positive_prompt', 'positivePrompt', 'negative_prompt', 'negativePrompt', 'model', 'model_name', 'base_model', 'base_model_name', 'seed', 'steps', 'cfg', 'cfg_scale', 'guidance_scale', 'sampler', 'sampler_name', 'scheduler', 'width', 'height', 'resolution', 'parameters', 'software', 'tool', 'description'];
  const out = {};
  const esc = names.join('|');
  const tagRe = new RegExp(`<([\\w.-]+:)?(${esc})\\b[^>]*>([\\s\\S]*?)<\\/[\\w.-]+:\\2\\s*>|<(${esc})\\b[^>]*>([\\s\\S]*?)<\\/\\4\\s*>`, 'gi');
  let m;
  while ((m = tagRe.exec(xml))) out[m[2] || m[4]] = decode(m[3] || m[5] || '');
  const attrRe = new RegExp(`(?:[\\w.-]+:)?(${esc})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi');
  while ((m = attrRe.exec(xml))) if (out[m[1]] === undefined) out[m[1]] = decode(m[2] || m[3] || '');
  return desdeObjeto(out);
}

function desdeTextoMetadata(raw, clave = '') {
  if (typeof raw !== 'string') return null;
  const s = raw.trim(); if (!s || s.length > MAX_JSON) return null;
  if (s.startsWith('{') || s.startsWith('[')) {
    try { const j = JSON.parse(s); return desdeComfy(j) || desdeWorkflowComfy(j.workflow || j) || desdeObjeto(j); } catch { /* prueba como texto */ }
  }
  const a1111 = desdeA1111(s);
  if (a1111 && (/(?:^|\n)\s*(?:Steps|Sampler|CFG\s*scale|Seed|Size|Model)\s*:/i.test(s) || /parameters|comment|usercomment/i.test(clave))) return a1111;
  if (/description|comment|usercomment|prompt/i.test(clave)) return { tool: '', body: s, negative: '', model: '', params: {} };
  return null;
}

/* ---------- Automatic1111 / Forge ("parameters": texto plano) ---------- */
function desdeA1111(txt) {
  if (typeof txt !== 'string' || !txt.trim()) return null;
  const t = txt.replace(/\r/g, '');
  const lineas = t.split('\n');
  const indiceAjustes = lineas.findIndex(l => /^\s*(?:Steps|Sampler|CFG\s*scale|Seed|Size|Model(?:\s+hash)?|Schedule\s+type)\s*:/i.test(l));
  const lineaAjustes = indiceAjustes >= 0 ? lineas.slice(indiceAjustes).join(', ') : '';
  let cuerpo = indiceAjustes >= 0 ? lineas.slice(0, indiceAjustes).join('\n') : t;
  let negativo = '';
  const m = cuerpo.match(/\nNegative prompt:\s*/);
  if (m) { negativo = cuerpo.slice(m.index + m[0].length).trim(); cuerpo = cuerpo.slice(0, m.index); }
    const ajustes = {}, ajustesOriginales = {};
  if (lineaAjustes) {
    // Separa por comas solo fuera de comillas: algunos valores de modelo incluyen comas.
    const partes = lineaAjustes.match(/(?:[^,\"]|"(?:[^"\\]|\\.)*")+/g) || [];
    for (const parte of partes) {
      const x = parte.match(/^\s*([^:]+):\s*(.*?)\s*$/);
      if (x) { const k = x[1].trim(); const v = x[2].replace(/^"|"$/g, '').trim(); ajustes[k.toLocaleLowerCase('en')] = v; ajustesOriginales[k] = v; }
    }
  }
  const p = {};
  const pon = (label, key) => { const v = ajustes[key.toLocaleLowerCase('en')]; if (v !== undefined && v !== '') p[label] = v; };
  pon('Seed', 'Seed'); pon('Steps', 'Steps'); pon('CFG', 'CFG scale');
  pon('Sampler', 'Sampler'); pon('Scheduler', 'Schedule type'); pon('Tamaño', 'Size');
  pon('Denoise', 'Denoising strength'); pon('Hires', 'Hires upscale');
  pon('LoRA hashes', 'Lora hashes');
  const yaMapeados = new Set(['steps', 'sampler', 'cfg scale', 'schedule type', 'size', 'denoising strength', 'hires upscale', 'lora hashes', 'model']);
  Object.entries(ajustesOriginales).forEach(([k, v]) => { if (v && !yaMapeados.has(k.toLocaleLowerCase('en'))) p[k] = v; });
  const loras = [...cuerpo.matchAll(/<lora:([^:>]+)(?::([\d.]+))?>/gi)].map(l => (l[2] ? `${l[1]} (${l[2]})` : l[1]));
  if (loras.length) p.LoRA = [...new Set(loras)].join(', ');
  const body = cuerpo.trim();
  if (!body && !negativo) return null;
  return { tool: 'Automatic1111', body, negative: negativo, model: ajustes.model || '', params: p };
}

function leePrompt(buf) {
  const t = textosPng(buf);
  if (!t) return { error: 'No es un PNG' };
  let resultado = null;
  const parsea = desdeTextoMetadata;
  const prioridad = ['prompt', 'workflow', 'invokeai_metadata', 'fooocus', 'parameters', 'comment', 'description', 'usercomment'];
  const claves = Object.keys(t).sort((a, b) => {
    const ai = prioridad.indexOf(a.toLocaleLowerCase('en')), bi = prioridad.indexOf(b.toLocaleLowerCase('en'));
    return (ai < 0 ? prioridad.length : ai) - (bi < 0 ? prioridad.length : bi);
  });
  for (const clave of claves) {
    const raw = t[clave];
    if (typeof raw !== 'string') continue;
    const r = clave.toLocaleLowerCase('en') === 'workflow'
      ? (() => { try { const j = JSON.parse(raw); return desdeWorkflowComfy(j) || desdeComfy(j) || desdeObjeto(j); } catch { return null; } })()
      : clave.toLocaleLowerCase('en') === 'prompt'
        ? (() => { try { const j = JSON.parse(raw); return desdeComfy(j) || desdeWorkflowComfy(j) || desdeObjeto(j); } catch { return parsea(raw, clave); } })()
        : parsea(raw, clave);
    resultado = fusiona(resultado, r);
  }
  return resultado;
}

async function leePromptCompleto(buf) {
  let resultado = leePrompt(buf);
  if (resultado && resultado.error) resultado = null;
  try {
    const exifr = require('exifr');
    const datos = await exifr.parse(buf, { tiff: true, xmp: true, iptc: true, userComment: true, silentErrors: true });
    const tieneSenalesIA = (obj, profundidad = 0) => !!obj && typeof obj === 'object' && Object.entries(obj).some(([k, v]) => /prompt|negative|seed|steps|sampler|cfg|guidance|parameters|loras/i.test(k) || (profundidad < 2 && v && typeof v === 'object' && tieneSenalesIA(v, profundidad + 1)));
    const senalesIA = tieneSenalesIA(datos);
    const softwareIA = datos && /comfy|automatic1111|stable.?diffusion|fooocus|invoke.?ai|forge|novel.?ai/i.test(String(datos.Software || datos.software || ''));
    const datosSeguros = datos ? { ...datos } : null;
    // EXIF Model suele ser el modelo de una cámara; solo se interpreta como modelo generativo con señales de generación.
    if (datosSeguros && !senalesIA && !softwareIA) { delete datosSeguros.Model; delete datosSeguros.model; }
    const textoKeys = ['UserComment', 'ImageDescription', 'XPComment', 'Description', 'Comment', 'Parameters', 'parameters'];
    const datosEstructurados = datosSeguros ? { ...datosSeguros } : null;
    if (datosEstructurados) textoKeys.forEach(k => { delete datosEstructurados[k]; });
    resultado = fusiona(resultado, desdeObjeto(datosEstructurados));
    for (const clave of textoKeys) {
      const v = datos && datos[clave];
      if (typeof v === 'string') resultado = fusiona(resultado, desdeTextoMetadata(v, clave));
    }
  } catch { /* formato sin EXIF/XMP compatible: conserva lo que se haya podido leer del PNG */ }
  try {
    const sharp = require('sharp');
    const image = await sharp(buf, { failOn: 'none', limitInputPixels: 64000000 }).metadata();
    if (image.exif) {
      const exifr = require('exifr');
      const exif = await exifr.parse(image.exif, { tiff: true, xmp: true, userComment: true, silentErrors: true }).catch(() => null);
      const ai = exif && Object.keys(exif).some(k => /prompt|negative|seed|steps|sampler|cfg|guidance|parameters|loras/i.test(k));
      const safe = exif ? { ...exif } : null;
      if (safe && !ai) { delete safe.Model; delete safe.model; }
      resultado = fusiona(resultado, desdeObjeto(safe));
    }
    resultado = fusiona(resultado, desdeXmp(image.xmpAsString || (image.xmp ? Buffer.from(image.xmp).toString('utf8') : '')));
  } catch { /* Sharp es opcional y algunos contenedores no exponen EXIF/XMP */ }
  return resultado;
}

module.exports = { leePrompt, leePromptCompleto, textosPng, desdeComfy, desdeWorkflowComfy, desdeA1111, desdeXmp, desdeTextoMetadata };
