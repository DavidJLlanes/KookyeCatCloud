'use strict';
// Página pública de solo lectura de uno o varios prompts: /p/<id>
const BASE = (document.querySelector('meta[name="kcc-base"]') || {}).content || '';
const $ = (id) => document.getElementById(id);
const id = location.pathname.split('/').filter(Boolean).pop() || '';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const TIPOS = { imagen: 'Imagen', texto: 'Texto', codigo: 'Código', video: 'Vídeo', audio: 'Audio', agente: 'Agente', fragmento: 'Fragmento', otro: 'Otro' };

async function copia(texto, boton) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const t = el('textarea'); t.value = texto; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch { /* sin portapapeles */ } t.remove();
  }
  const antes = boton.textContent; boton.textContent = '¡Copiado!'; setTimeout(() => { boton.textContent = antes; }, 1400);
}
function bloque(titulo, texto) {
  const b = el('div', 'blk'); const h = el('header'); h.appendChild(el('span', null, titulo));
  const c = el('button', null, 'Copiar'); c.type = 'button'; c.addEventListener('click', () => copia(texto, c)); h.appendChild(c);
  const pre = el('pre', null, texto); b.append(h, pre); return b;
}
(async () => {
  try {
    const r = await fetch(`${BASE}/api/public/prompts/${encodeURIComponent(id)}`);
    const d = await r.json();
    $('cargando').hidden = true;
    if (!r.ok) { $('error').textContent = d.error || 'No se pudo abrir el enlace'; $('error').hidden = false; return; }
    document.title = `${d.label} — Prompts compartidos`;
    $('titulo').textContent = d.label;
    $('sub').textContent = `${d.prompts.length} prompt${d.prompts.length === 1 ? '' : 's'}${d.expiresAt ? ' · caduca el ' + new Date(d.expiresAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}`;
    for (const p of d.prompts) {
      const c = el('article', 'card');
      c.appendChild(el('h2', null, p.title));
      c.appendChild(el('p', 'meta', [TIPOS[p.kind] || p.kind, p.model, p.tool].filter(Boolean).join(' · ')));
      if (p.system) c.appendChild(bloque('Mensaje de sistema', p.system));
      if (p.body) c.appendChild(bloque(p.system ? 'Mensaje de usuario' : 'Prompt', p.body));
      if (p.negative) c.appendChild(bloque('Prompt negativo', p.negative));
      const ps = Object.entries(p.params || {});
      if (ps.length) { const b = el('div', 'blk'); const h = el('header'); h.appendChild(el('span', null, 'Parámetros')); const dl = el('dl'); ps.forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v))); b.append(h, dl); c.appendChild(b); }
      if (p.notes) c.appendChild(bloque('Notas', p.notes));
      $('lista').appendChild(c);
    }
    $('contenido').hidden = false;
  } catch { $('cargando').hidden = true; $('error').textContent = 'Error de conexión'; $('error').hidden = false; }
})();
