'use strict';
/* ---------------------------------------------------------------
   Kit de componentes compartidos por Calendario, Prompts, Notas y el buscador global.
   Se carga después de app.js y reutiliza sus utilidades globales (el, icon, api, showToast…).

   Sincronización entre módulos: todo lo que cambia datos que otros muestran avisa por K.bus
   ('labels', 'calendar', 'prompts', 'notes') y cada vista que depende de ello se refresca.
--------------------------------------------------------------- */
const K = window.K = {};

/* ---------- Bus de eventos ---------- */
const _bus = {};
K.bus = {
  on(ev, fn) { (_bus[ev] = _bus[ev] || []).push(fn); },
  emit(ev, data) { (_bus[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn(e); } }); },
};

/* ---------- Red ---------- */
K.http = async function (method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await api(BASE + url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
};
K.get = (u) => K.http('GET', u);
K.post = (u, b) => K.http('POST', u, b === undefined ? {} : b);
K.put = (u, b) => K.http('PUT', u, b);
K.del = (u) => K.http('DELETE', u);
K.toast = (m) => showToast(m);
K.fail = (e) => showToast(e && e.message ? e.message : String(e));
K.qs = (obj) => Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === true ? '1' : v)}`).join('&');

K.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

K.copy = async function (text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }
};

/* ---------- Fechas ("ingenuas": sin zona horaria, como las ve el usuario) ---------- */
const p2 = (n) => String(n).padStart(2, '0');
K.d = {
  pad: p2,
  ymd: (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
  hm: (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  parse(s) { // 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm' -> Date local
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : new Date(NaN);
  },
  add: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()),
  addMonths(d, n) { const r = new Date(d.getFullYear(), d.getMonth() + n, 1); r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r; },
  day: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  weekStart(d) { const r = K.d.day(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; },   // lunes
  same: (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(),
  diffDays: (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000),
  month: (d) => d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
  long: (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  short: (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }),
  dow: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  dowLong: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
};
K.ago = function (ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ---------- Modales ---------- */
const _pila = [];
K.modal = function ({ title, sub, cls = '', content, actions = [], onClose, dismiss = true, bare = false } = {}) {
  const overlay = el('div', 'overlay');
  const modal = el('div', 'modal ' + cls);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title && !bare) modal.appendChild(el('h3', null, title));
  if (sub && !bare) modal.appendChild(el('p', 'sub', sub));
  let cuerpo = null;
  if (content) {
    cuerpo = bare ? content : el('div', 'modal-body');
    if (!bare) cuerpo.appendChild(content);
    modal.appendChild(cuerpo);
  }
  const botones = {};
  if (actions.length) {
    const bar = el('div', 'modal-actions');
    for (const a of actions) {
      const b = el('button', 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), a.label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (a.onClick) {
          b.disabled = true;
          try { const r = await a.onClick(h); if (r === false) return; } finally { b.disabled = false; }
        }
        if (a.close !== false) h.close();
      });
      if (a.id) botones[a.id] = b;
      bar.appendChild(b);
    }
    modal.appendChild(bar);
  }
  overlay.appendChild(modal);
  let cerrado = false;
  const h = {
    el: modal, body: cuerpo, buttons: botones,
    close(valor) {
      if (cerrado) return; cerrado = true;
      overlay.remove();
      const i = _pila.indexOf(h); if (i >= 0) _pila.splice(i, 1);
      if (onClose) onClose(valor);
    },
  };
  if (dismiss) {
    let abajo = false;
    overlay.addEventListener('mousedown', (e) => { abajo = e.target === overlay; });
    overlay.addEventListener('click', (e) => { if (abajo && e.target === overlay) h.close(); });
  }
  h.dismiss = dismiss;
  _pila.push(h);
  document.body.appendChild(overlay);
  return h;
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (K._popClose) { K._popClose(); e.stopPropagation(); return; }
  const top = _pila[_pila.length - 1];
  if (top && top.dismiss) { top.close(); e.stopPropagation(); }
}, true);

K.confirm = (texto, { ok = 'Aceptar', danger = false, title = 'Confirmar' } = {}) => new Promise((res) => {
  let hecho = false;
  K.modal({ title, sub: texto, onClose: () => { if (!hecho) res(false); },
    actions: [{ label: 'Cancelar' }, { label: ok, primary: !danger, danger, onClick: () => { hecho = true; res(true); } }] });
});

K.ask = (title, { value = '', placeholder = '', ok = 'Guardar', sub = '' } = {}) => new Promise((res) => {
  const input = el('input'); input.value = value; input.placeholder = placeholder; input.maxLength = 200;
  let hecho = false;
  const m = K.modal({ title, sub, content: input, onClose: () => { if (!hecho) res(null); },
    actions: [{ label: 'Cancelar' }, { label: ok, primary: true, onClick: () => { hecho = true; res(input.value.trim()); } }] });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { hecho = true; res(input.value.trim()); m.close(); } });
  setTimeout(() => { input.focus(); input.select(); }, 30);
});

/* ---------- Popovers y menús ---------- */
K.pop = function (anchor, content, { align = 'start', width } = {}) {
  K._popClose && K._popClose();
  const box = el('div', 'k-pop');
  if (width) box.style.width = width + 'px';
  box.appendChild(content);
  document.body.appendChild(box);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const place = () => {
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x = align === 'end' ? r.right - bw : r.left;
    let y = r.bottom + 6;
    if (y + bh > innerHeight - 8) y = Math.max(8, r.top - bh - 6);
    x = Math.min(Math.max(8, x), innerWidth - bw - 8);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  };
  place();
  const cierra = () => {
    box.remove(); document.removeEventListener('mousedown', fuera, true); window.removeEventListener('resize', cierra);
    if (K._popClose === cierra) K._popClose = null;
  };
  const fuera = (e) => { if (!box.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) cierra(); };
  setTimeout(() => document.addEventListener('mousedown', fuera, true), 0);
  window.addEventListener('resize', cierra);
  K._popClose = cierra;
  return { close: cierra, el: box, place };
};

K.menu = function (anchor, items, opts) {
  const cont = el('div');
  let p;
  for (const it of items) {
    if (it === '-') { cont.appendChild(el('div', 'sep')); continue; }
    if (it.head) { cont.appendChild(el('div', 'head', it.head)); continue; }
    const b = el('button', 'item' + (it.danger ? ' danger' : ''));
    b.type = 'button';
    if (it.icon) b.appendChild(icon(it.icon));
    if (it.dot) { const d = el('span', 'k-dot'); d.style.setProperty('--c', it.dot); b.appendChild(d); }
    b.appendChild(el('span', null, it.label));
    if (it.checked) { const c = icon('i-check'); c.style.marginLeft = 'auto'; b.appendChild(c); }
    b.addEventListener('click', () => { p.close(); it.onClick && it.onClick(); });
    cont.appendChild(b);
  }
  p = K.pop(anchor, cont, opts);
  return p;
};

/* ---------- Colores ---------- */
K.PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'];

K.colorPicker = function ({ value = '', allowNone = false, onChange } = {}) {
  const wrap = el('div', 'k-swatches');
  let actual = value;
  const pinta = () => wrap.querySelectorAll('.k-sw').forEach(b => b.classList.toggle('is-on', b.dataset.c === (actual || '')));
  const add = (c) => {
    const b = el('button', 'k-sw' + (c ? '' : ' none'));
    b.type = 'button'; b.dataset.c = c; b.title = c || 'Sin color';
    if (c) b.style.setProperty('--c', c);
    b.addEventListener('click', () => { actual = c; pinta(); onChange && onChange(c); });
    wrap.appendChild(b);
  };
  if (allowNone) add('');
  K.PALETTE.forEach(add);
  pinta();
  wrap.get = () => actual;
  wrap.set = (v) => { actual = v || ''; pinta(); };
  return wrap;
};

const EMOJIS = ['📁', '📂', '📝', '📌', '⭐', '🔥', '💡', '🎯', '🚀', '🎨', '🖼️', '📷', '🎬', '🎵', '💻', '⚙️',
  '🧠', '📚', '📅', '⏰', '💼', '🏠', '❤️', '🌟', '🌈', '🌿', '🌍', '☕', '🍕', '🎮', '🧪', '🔒',
  '📣', '🛒', '💰', '✈️', '🧑‍🎨', '🏞️', '✏️', '⚡', '🤖', '👾', '🦄', '🐱', '🔮', '🎭', '📊', '🧩'];
K.emojiPicker = function (anchor, onPick, allowClear = true) {
  const g = el('div', 'k-emojis');
  for (const e of EMOJIS) {
    const b = el('button', null, e); b.type = 'button';
    b.addEventListener('click', () => { p.close(); onPick(e); });
    g.appendChild(b);
  }
  const cont = el('div'); cont.appendChild(g);
  if (allowClear) {
    cont.appendChild(el('div', 'sep'));
    const b = el('button', 'item', 'Quitar icono'); b.type = 'button';
    b.addEventListener('click', () => { p.close(); onPick(''); });
    cont.appendChild(b);
  }
  const p = K.pop(anchor, cont, { width: 300 });
};

/* ---------- Etiquetas (compartidas por todos los módulos) ---------- */
K.labels = { list: [], by: {}, palette: K.PALETTE, loaded: false };
K.loadLabels = async function (force) {
  if (K.labels.loaded && !force) return K.labels;
  const r = await K.get('/api/labels');
  K.labels.list = r.labels; K.labels.palette = r.palette || K.PALETTE;
  K.labels.by = Object.fromEntries(r.labels.map(l => [l.id, l]));
  K.labels.loaded = true;
  return K.labels;
};
K.labelChip = function (l, { onRemove, onClick } = {}) {
  if (typeof l === 'string') l = K.labels.by[l];
  if (!l) return null;
  const c = el('span', 'k-chip' + (onClick ? ' btnlike' : ''));
  c.style.setProperty('--c', l.color);
  c.appendChild(el('span', null, l.name));
  if (onClick) c.addEventListener('click', (e) => { e.stopPropagation(); onClick(l); });
  if (onRemove) {
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar');
    x.addEventListener('click', (e) => { e.stopPropagation(); onRemove(l); });
    c.appendChild(x);
  }
  return c;
};
K.labelChips = function (ids, opts) {
  const w = el('div', 'k-chips');
  (ids || []).forEach(id => { const c = K.labelChip(id, opts); if (c) w.appendChild(c); });
  return w;
};

// Selector múltiple con búsqueda y creación al vuelo (Enter crea la etiqueta)
K.labelPicker = function ({ selected = [], onChange } = {}) {
  let sel = [...selected];
  const box = el('div', 'k-labelpick');
  const input = el('input'); input.placeholder = 'Añadir etiqueta…'; input.maxLength = 40;
  const emit = () => { onChange && onChange([...sel]); };
  const pinta = () => {
    box.textContent = '';
    sel.forEach(id => { const c = K.labelChip(id, { onRemove: () => { sel = sel.filter(x => x !== id); pinta(); emit(); } }); if (c) box.appendChild(c); });
    box.appendChild(input);
  };
  const sugerencias = () => {
    const q = input.value.trim().toLowerCase();
    const cont = el('div');
    const libres = K.labels.list.filter(l => !sel.includes(l.id) && (!q || l.name.toLowerCase().includes(q))).slice(0, 12);
    libres.forEach(l => {
      const b = el('button', 'item'); b.type = 'button';
      const d = el('span', 'k-dot'); d.style.setProperty('--c', l.color); b.appendChild(d); b.appendChild(el('span', null, l.name));
      b.addEventListener('mousedown', (e) => { e.preventDefault(); sel.push(l.id); input.value = ''; pinta(); emit(); input.focus(); sugerencias(); });
      cont.appendChild(b);
    });
    const existe = K.labels.list.some(l => l.name.toLowerCase() === q);
    if (q && !existe) {
      const b = el('button', 'item'); b.type = 'button';
      b.appendChild(icon('i-plus')); b.appendChild(el('span', null, `Crear “${input.value.trim()}”`));
      b.addEventListener('mousedown', (e) => { e.preventDefault(); crea(); });
      cont.appendChild(b);
    }
    if (!cont.children.length) { cont.appendChild(el('div', 'head', 'Escribe para crear una etiqueta')); }
    if (K._labelPop) K._labelPop.close();
    K._labelPop = K.pop(box, cont, { width: Math.max(box.offsetWidth, 220) });
  };
  const crea = async () => {
    const name = input.value.trim(); if (!name) return;
    try {
      const r = await K.post('/api/labels', { name });
      await K.loadLabels(true);
      if (!sel.includes(r.label.id)) sel.push(r.label.id);
      input.value = ''; pinta(); emit(); K.bus.emit('labels');
      if (K._labelPop) K._labelPop.close();
    } catch (e) { K.fail(e); }
  };
  input.addEventListener('focus', sugerencias);
  input.addEventListener('input', sugerencias);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const q = input.value.trim().toLowerCase();
      const ya = K.labels.list.find(l => l.name.toLowerCase() === q);
      if (ya) { if (!sel.includes(ya.id)) sel.push(ya.id); input.value = ''; pinta(); emit(); } else crea(); }
    else if (e.key === 'Backspace' && !input.value && sel.length) { sel.pop(); pinta(); emit(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (K._labelPop) { K._labelPop.close(); K._labelPop = null; } }, 120));
  pinta();
  box.get = () => [...sel];
  box.set = (v) => { sel = [...v]; pinta(); };
  return box;
};

// Administrar etiquetas: renombrar, recolorear, borrar
K.manageLabels = async function () {
  await K.loadLabels(true);
  const cont = el('div');
  const pinta = () => {
    cont.textContent = '';
    if (!K.labels.list.length) cont.appendChild(el('p', 'k-faint', 'Aún no hay etiquetas. Se crean al escribirlas en cualquier nota, prompt o evento.'));
    K.labels.list.forEach(l => {
      const row = el('div', 'k-row'); row.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
      const dot = el('button', 'k-sw is-on'); dot.type = 'button'; dot.style.setProperty('--c', l.color); dot.title = 'Cambiar color';
      dot.addEventListener('click', () => {
        const cp = K.colorPicker({ value: l.color, onChange: async (c) => {
          try { await K.put('/api/labels/' + l.id, { color: c }); await K.loadLabels(true); K.bus.emit('labels'); pinta(); } catch (e) { K.fail(e); }
        } });
        const w = el('div'); w.style.padding = '6px'; w.appendChild(cp); K.pop(dot, w, { width: 230 });
      });
      const nm = el('input'); nm.value = l.name; nm.maxLength = 40; nm.style.cssText = 'padding:7px 10px;font-size:14px';
      nm.addEventListener('change', async () => {
        try { await K.put('/api/labels/' + l.id, { name: nm.value }); await K.loadLabels(true); K.bus.emit('labels'); } catch (e) { K.fail(e); }
      });
      const uses = el('span', 'k-faint', `${l.uses} uso${l.uses === 1 ? '' : 's'}`); uses.style.cssText = 'font-size:12px;white-space:nowrap';
      const del = el('button', 'btn ghost icon'); del.type = 'button'; del.appendChild(icon('i-trash')); del.title = 'Borrar etiqueta';
      del.addEventListener('click', async () => {
        if (!await K.confirm(`Se quitará “${l.name}” de todo lo que la use.`, { ok: 'Borrar', danger: true })) return;
        try { await K.del('/api/labels/' + l.id); await K.loadLabels(true); K.bus.emit('labels'); K.bus.emit('prompts'); K.bus.emit('notes'); K.bus.emit('calendar'); pinta(); } catch (e) { K.fail(e); }
      });
      row.append(dot, nm, uses, del);
      cont.appendChild(row);
    });
  };
  pinta();
  K.modal({ title: 'Etiquetas', sub: 'Compartidas por notas, prompts y calendario', content: cont, cls: 'wide', actions: [{ label: 'Cerrar', primary: true }] });
};

/* ---------- Calendarios (lista compartida) ---------- */
K.cals = { list: [], by: {}, loaded: false };
K.loadCalendars = async function (force) {
  if (K.cals.loaded && !force) return K.cals;
  const r = await K.get('/api/calendar');
  K.cals.list = r.calendars; K.cals.by = Object.fromEntries(r.calendars.map(c => [c.id, c])); K.cals.loaded = true;
  return K.cals;
};

// Campo "Añadir al calendario": interruptor + fecha + hora opcional + calendario.
// get() devuelve null (sin evento) o { date, time, calendarId }.
K.calField = function ({ value = null, defaultDate, defaultCalendar = 'personal', label = 'Añadir al calendario', hint } = {}) {
  const hoy = K.d.ymd(new Date());
  const root = el('div', 'k-calfield');
  const sw = el('label', 'k-switch');
  const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!(value && value.date);
  sw.append(chk, el('span', 'track'), el('span', null, label));
  root.appendChild(sw);
  if (hint) { const h = el('div', 'k-faint', hint); h.style.cssText = 'font-size:12px;margin:6px 0 0 48px'; root.appendChild(h); }
  const body = el('div', 'body'); body.hidden = !chk.checked;
  const fecha = el('input'); fecha.type = 'date'; fecha.value = (value && value.date) || defaultDate || hoy;
  const hora = el('input'); hora.type = 'time'; hora.value = (value && value.time) || '';
  const sel = el('select');
  const pintaCals = () => {
    sel.textContent = '';
    K.cals.list.filter(c => !c.virtual).forEach(c => { const o = el('option', null, c.name); o.value = c.id; sel.appendChild(o); });
    sel.value = (value && value.calendarId) || defaultCalendar;
    if (!sel.value) sel.value = 'personal';
  };
  pintaCals();
  K.loadCalendars().then(pintaCals).catch(() => {});
  const f = (t, n) => { const l = el('label'); l.append(el('span', null, t), n); return l; };
  body.append(f('Fecha', fecha), f('Hora (opcional)', hora), f('Calendario', sel));
  root.appendChild(body);
  chk.addEventListener('change', () => { body.hidden = !chk.checked; });
  root.get = () => (chk.checked && fecha.value ? { date: fecha.value, time: hora.value || '', calendarId: sel.value } : null);
  // null en el servidor significa "quitar el evento": útil al editar algo que ya tenía fecha
  root.set = (v) => { chk.checked = !!(v && v.date); body.hidden = !chk.checked; if (v) { fecha.value = v.date || fecha.value; hora.value = v.time || ''; } };
  return root;
};

/* ---------- Estrellas ---------- */
K.stars = function (valor, onChange, { readonly = false } = {}) {
  const w = el('span', 'k-stars' + (readonly ? ' ro' : ''));
  const pinta = (v) => { w.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('on', i < v); b.replaceChildren(icon(i < v ? 'i-star-fill' : 'i-star')); }); };
  for (let i = 1; i <= 5; i++) {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', i + ' de 5');
    if (!readonly) b.addEventListener('click', (e) => { e.stopPropagation(); valor = valor === i ? 0 : i; pinta(valor); onChange && onChange(valor); });
    w.appendChild(b);
  }
  pinta(valor);
  return w;
};

/* ---------- Enlaces entre módulos: abrir un elemento donde viva ---------- */
K.openers = {};
K.open = function (tipo, ref, extra) {
  const f = K.openers[tipo];
  if (f) f(ref, extra);
};
K.registerView = (name, view) => { window.KCC.views[name] = view; };
K.srcIcon = { prompt: 'i-sparkle', note: 'i-note', file: 'i-folder', contact: 'i-contact' };
K.srcName = { prompt: 'Prompt', note: 'Nota', file: 'Archivo', contact: 'Contacto' };

// Al iniciar sesión se precargan etiquetas y calendarios para que los selectores salgan al instante
K.preload = function () { K.loadLabels().catch(() => {}); K.loadCalendars().catch(() => {}); };
K.bus.on('labels', () => { K.loadLabels(true).catch(() => {}); });
K.bus.on('calendar', () => { K.loadCalendars(true).catch(() => {}); });
