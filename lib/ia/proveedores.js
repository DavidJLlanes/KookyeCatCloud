'use strict';
// IA · catálogo de proveedores. `tipo` decide el idioma de la API: 'openai' (chat/completions, lo habla casi todo el mundo),
// 'anthropic' (messages) y 'google' (generateContent). `fijo` = servidor conocido (no hace falta vigilar la dirección);
// `editable` = la dirección la escribe el usuario (se valida contra SSRF). Los nombres de modelo NO se fijan aquí:
// se piden al propio proveedor (cambian cada pocos meses) y el usuario puede escribir otro a mano.
const PROVEEDORES = [
  { id: 'openrouter', nombre: 'OpenRouter', tipo: 'openai', base: 'https://openrouter.ai/api/v1', fijo: true, gratis: true, claveUrl: 'https://openrouter.ai/keys',
    nota: 'Una clave, cientos de modelos. Hay modelos gratuitos (acaban en «:free»), con límite de peticiones al día.', cabeceras: { 'HTTP-Referer': 'https://github.com/DavidJLlanes/KookyeCatCloud', 'X-Title': 'KookyeCatCloud' } },
  { id: 'opencode', nombre: 'OpenCode Zen', tipo: 'openai', base: 'https://opencode.ai/inference/openai/v1', modelosUrl: 'https://opencode.ai/inference/v1/models', fijo: true, gratis: true, claveUrl: 'https://opencode.ai/auth',
    nota: 'Modelos de OpenCode, algunos gratuitos (terminan en «-free»). Según su documentación, los gratuitos pueden estar limitados a la herramienta OpenCode: si falla, prueba uno de pago.' },
  { id: 'openai', nombre: 'OpenAI', tipo: 'openai', base: 'https://api.openai.com/v1', fijo: true, claveUrl: 'https://platform.openai.com/api-keys', tokensMax: 'max_completion_tokens' },
  { id: 'anthropic', nombre: 'Anthropic (Claude)', tipo: 'anthropic', base: 'https://api.anthropic.com/v1', fijo: true, claveUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', nombre: 'Google (Gemini)', tipo: 'google', base: 'https://generativelanguage.googleapis.com/v1beta', fijo: true, gratis: true, claveUrl: 'https://aistudio.google.com/apikey',
    nota: 'Google AI Studio ofrece un nivel gratuito con límites.' },
  { id: 'groq', nombre: 'Groq', tipo: 'openai', base: 'https://api.groq.com/openai/v1', fijo: true, gratis: true, claveUrl: 'https://console.groq.com/keys', nota: 'Muy rápido; tiene nivel gratuito con límites.' },
  { id: 'mistral', nombre: 'Mistral', tipo: 'openai', base: 'https://api.mistral.ai/v1', fijo: true, claveUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'deepseek', nombre: 'DeepSeek', tipo: 'openai', base: 'https://api.deepseek.com/v1', fijo: true, claveUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'xai', nombre: 'xAI (Grok)', tipo: 'openai', base: 'https://api.x.ai/v1', fijo: true, claveUrl: 'https://console.x.ai' },
  { id: 'ollama', nombre: 'Ollama (en tu servidor)', tipo: 'openai', base: 'http://127.0.0.1:11434/v1', editable: true, local: true, sinClave: true,
    nota: 'Modelo propio en tu máquina: tus datos no salen. Requiere KCC_IA_PERMITE_LOCAL=1 en el servidor.' },
  { id: 'personalizado', nombre: 'Compatible con OpenAI', tipo: 'openai', base: '', editable: true,
    nota: 'Cualquier servicio con la API de OpenAI (LM Studio, vLLM, Together, Fireworks…): escribe su dirección base.' },
];
const POR_ID = Object.assign(Object.create(null), Object.fromEntries(PROVEEDORES.map(p => [p.id, p])));   // sin prototipo: «__proto__» o «constructor» no son proveedores
module.exports = { PROVEEDORES, POR_ID };
