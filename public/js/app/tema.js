'use strict';
/* Apariencia (tema y acento) y tipos de archivo. Parte de la aplicación principal (antes public/app.js); se carga en orden desde index.html y comparte el ámbito global. */
/* ---------------------------------------------------------------
   Apariencia: tema (superficies y texto) + color de acento.
   Ambos se guardan en este dispositivo. El tema lo fija data-theme en <html>
   (CSS: :root[data-theme=…]); el acento escribe --b1…--b3 y sus derivados.
--------------------------------------------------------------- */
const TEMAS = [
  { id: 'grafito', name: 'Grafito', desc: 'Neutro y sobrio', sw: ['#0b0d12', '#191d27', '#e9ecf3'] },
  { id: 'oscuro', name: 'Océano', desc: 'Oscuro con tono azulado', sw: ['#070b16', '#16203a', '#eaf0ff'] },
  { id: 'claro', name: 'Claro', desc: 'Fondo claro para el día', sw: ['#f2f4f9', '#ffffff', '#0f172a'] },
  { id: 'auto', name: 'Automático', desc: 'Sigue el modo del sistema', sw: null },
];
// b1 = acento principal; b2 y b3 completan el degradado y las manchas del fondo
const ACENTOS = [
  { id: 'azul', name: 'Azul', b1: '#4f7cff', b2: '#a855f7', b3: '#22d3ee' },
  { id: 'esmeralda', name: 'Esmeralda', b1: '#10b981', b2: '#22d3ee', b3: '#84cc16' },
  { id: 'violeta', name: 'Violeta', b1: '#8b5cf6', b2: '#d946ef', b3: '#6366f1' },
  { id: 'ambar', name: 'Ámbar', b1: '#f59e0b', b2: '#f97316', b3: '#facc15' },
  { id: 'coral', name: 'Coral', b1: '#f43f5e', b2: '#a855f7', b3: '#fb7185' },
  { id: 'grafito', name: 'Grafito', b1: '#64748b', b2: '#94a3b8', b3: '#475569' },
];
// Migración de la antigua «tonalidad» (fc-tint) a tema + acento
const MIGRA_TINT = { oceano: ['oscuro', 'azul'], esmeralda: ['grafito', 'esmeralda'], atardecer: ['grafito', 'ambar'], violeta: ['grafito', 'violeta'], carmesi: ['grafito', 'coral'], grafito: ['grafito', 'grafito'] };

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const alpha = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
// Mezcla lineal: p = proporción de b (0…1); el resto es a
const mezcla = (a, b, p) => { const A = rgbOf(a), B = rgbOf(b); return `rgb(${A.map((c, i) => Math.round(c * (1 - p) + B[i] * p)).join(',')})`; };

const leeLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardaLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const esClaroSistema = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
function temaElegido() {
  const v = leeLS('kcc-theme');
  if (v) return v;
  const old = leeLS('fc-tint');
  return old && MIGRA_TINT[old] ? MIGRA_TINT[old][0] : 'grafito';
}
function acentoElegido() {
  const v = leeLS('kcc-accent');
  if (v) return v;
  const old = leeLS('fc-tint');
  return old && MIGRA_TINT[old] ? MIGRA_TINT[old][1] : 'azul';
}
// Tema efectivo: «auto» se resuelve con el modo del sistema
const temaEfectivo = (id) => (id === 'auto' ? (esClaroSistema() ? 'claro' : 'grafito') : (TEMAS.some(t => t.id === id) ? id : 'grafito'));

function applyAccent(id, persist) {
  const a = ACENTOS.find(x => x.id === id) || ACENTOS[0];
  const claro = document.documentElement.dataset.theme === 'claro';
  const root = document.documentElement.style;
  root.setProperty('--b1', a.b1);
  root.setProperty('--b2', a.b2);
  root.setProperty('--b3', a.b3);
  // Fondo: un velo muy suave del acento sobre el tono base del tema
  root.setProperty('--aurora-base', claro ? mezcla('#eef3ff', a.b1, .07) : mezcla('#0b0d12', a.b1, .1));
  root.setProperty('--brand-soft', alpha(a.b1, claro ? .12 : .16));
  // Texto de acento: más oscuro en el claro, más claro en los oscuros (contraste AA)
  root.setProperty('--accent-text', claro ? mezcla('#0f172a', a.b1, .72) : mezcla('#ffffff', a.b1, .55));
  root.setProperty('--accent-line', alpha(a.b1, .4));
  root.setProperty('--accent-strong', alpha(a.b1, .72));
  root.setProperty('--glow', `0 6px 24px -6px ${alpha(a.b1, .6)}`);
  if (persist) guardaLS('kcc-accent', a.id);
  document.querySelectorAll('.acento').forEach(b => { const on = b.dataset.acento === a.id; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}

function applyTheme(id, persist) {
  const eff = temaEfectivo(id);
  document.documentElement.dataset.theme = eff;
  if (persist) guardaLS('kcc-theme', id);
  applyAccent(acentoElegido(), false);   // el acento se recalcula para el tema nuevo
  document.querySelectorAll('.tema').forEach(b => { const on = b.dataset.tema === id; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}

// Con «Automático», el tema sigue al sistema en directo
if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (temaElegido() === 'auto') applyTheme('auto', false); });

function renderApariencia() {
  const tBox = $('theme-grid'), aBox = $('accent-grid');
  if (!tBox || !aBox || tBox.childElementCount) return;   // se pinta una sola vez
  for (const t of TEMAS) {
    const btn = el('button', 'tema');
    btn.type = 'button'; btn.dataset.tema = t.id;
    const prev = el('div', 'tema-prev');
    if (t.sw) {
      prev.style.background = t.sw[0];
      const panel = el('i', 'tp-panel'); panel.style.background = t.sw[1];
      const linea = el('i', 'tp-linea'); linea.style.background = t.sw[2];
      const linea2 = el('i', 'tp-linea corta'); linea2.style.background = t.sw[2];
      prev.append(panel, linea, linea2);
    } else {
      prev.style.background = `linear-gradient(90deg, ${TEMAS[0].sw[0]} 50%, ${TEMAS[2].sw[0]} 50%)`;
    }
    const info = el('span', 'tema-info');
    info.append(el('b', null, t.name), el('small', null, t.desc));
    btn.append(prev, info);
    btn.addEventListener('click', () => { applyTheme(t.id, true); showToast(`Tema ${t.name}`); });
    tBox.appendChild(btn);
  }
  for (const a of ACENTOS) {
    const btn = el('button', 'acento');
    btn.type = 'button'; btn.dataset.acento = a.id; btn.title = a.name; btn.setAttribute('aria-label', `Acento ${a.name}`);
    btn.style.setProperty('--c1', a.b1); btn.style.setProperty('--c2', a.b2);
    btn.appendChild(icon('i-check'));
    btn.addEventListener('click', () => { applyAccent(a.id, true); showToast(`Acento ${a.name}`); });
    aBox.appendChild(btn);
  }
  applyTheme(temaElegido(), false);   // marca los activos
}

/* ---------------------------------------------------------------
   Tipos de archivo
--------------------------------------------------------------- */
const CATS = [
  { cat: 'image', re: /\.(jpe?g|png|gif|webp|bmp|avif|heic|svg)$/i, cls: 't-image' },
  { cat: 'video', re: /\.(mp4|mov|avi|mkv|webm|m4v|mpe?g)$/i,       cls: 't-video' },
  { cat: 'audio', re: /\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i,         cls: 't-audio' },
  { cat: 'doc',   re: /\.(pdf|docx?|txt|rtf|odt|md|pages)$/i,       cls: 't-doc' },
  { cat: 'doc',   re: /\.(xlsx?|csv|ods|pptx?|odp)$/i,              cls: 't-sheet' },
  { cat: 'other', re: /\.(zip|rar|7z|tar|gz|bz2|iso)$/i,            cls: 't-zip' },
];
function catOf(name) {
  const f = CATS.find(c => c.re.test(name));
  return f ? f.cat : 'other';
}
function clsOf(name) {
  const f = CATS.find(c => c.re.test(name));
  return f ? f.cls : 't-other';
}
function fileBadge(name, isDir) {
  if (isDir) {
    const box = el('div', 'badge-file t-folder');
    box.appendChild(icon('i-folder'));
    return box;
  }
  const ext = (name.split('.').pop() || '').toLowerCase();
  const label = ext && ext.length <= 4 && ext !== name.toLowerCase() ? ext : '•';
  return el('div', 'badge-file ' + clsOf(name), label);
}
