'use strict';
/* Valores reutilizables en el cliente (ver lib/valores.js y valores-clave.js).

   K.campoValor({ campo, value, multiple, placeholder, onChange })   campo de formulario con sugerencias
       → { el, get(), set(v), input }. Al escribir muestra los valores ya usados; si el texto equivale a uno
         existente (otras mayúsculas, acentos, «5,5» ↔ «5.5»…) avisa de que se guardará con la grafía existente,
         y si se parece a uno por una errata sugiere corregirlo («¿Quisiste decir…?»). Los valores nuevos se
         guardan solos al guardar el elemento: no hay botón de «añadir a opciones».
   K.chipValor(campo, valor)             chip que, al pulsarlo, filtra ese módulo por ese valor
   K.filtros[modulo] = (prop, valor) => …  cada módulo registra cómo aplica el filtro; K.filtrar() lo invoca
   K.valores.campo(c) / .opciones(c) / .cambio()   lista de valores de un campo, con caché */
(function () {
  if (!window.K || !window.KccValores) return;
  const V = window.KccValores;
  const cache = {};

  /* ---------- Datos ---------- */
  async function campo(c, forzar) {
    if (!forzar && cache[c]) return cache[c];
    cache[c] = K.get('/api/valores/' + encodeURIComponent(c)).catch((e) => { delete cache[c]; throw e; });
    return cache[c];
  }
  // Valores de un campo sin variantes repetidas: una entrada por clave, con la grafía más usada
  function opciones(ficha) {
    const por = new Map();
    for (const e of (ficha && ficha.valores) || []) {
      const k = V.clave(e.v); if (!k) continue;
      const a = por.get(k);
      if (!a) por.set(k, { v: e.v, n: e.n, g: !!e.guardado });
      else { const mejor = (e.n > a.n) || (e.n === a.n && e.guardado && !a.g); a.n += e.n; if (mejor) { a.v = e.v; a.g = !!e.guardado; } }
    }
    return [...por.values()].sort((a, b) => (b.n - a.n) || a.v.localeCompare(b.v, 'es'));
  }
  const cambio = () => { for (const k of Object.keys(cache)) delete cache[k]; K.bus.emit('valores'); };
  K.valores = { campo, opciones, cambio, clave: V.clave, limpia: V.limpia };

  /* ---------- Filtrar desde cualquier sitio ---------- */
  K.filtros = {};
  K.filtrar = function (c, valor) {
    const mod = String(c).split('.')[0];
    const f = K.filtros[mod];
    if (!f) { K.toast('No se puede filtrar por este campo'); return; }
    if (K.cierraModales) K.cierraModales();
    if (K._popClose) K._popClose();
    f(String(c).slice(mod.length + 1), valor);
  };

  K.chipValor = function (c, valor, { cls = '' } = {}) {
    const b = el('button', 'k-vchip ' + cls, valor);
    b.type = 'button'; b.title = `Ver solo «${valor}»`;
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); K.filtrar(c, valor); });
    b.addEventListener('keydown', (e) => e.stopPropagation());
    return b;
  };

  /* ---------- Campo con sugerencias ---------- */
  K.campoValor = function ({ campo: c, value = '', multiple = false, placeholder = '', onChange } = {}) {
    const caja = el('div', 'k-vf');
    const chips = multiple ? el('div', 'k-chips k-vf-chips') : null;
    const input = el('input'); input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = V.MAX;
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('enterkeyhint', multiple ? 'done' : 'next');
    if (placeholder) input.placeholder = placeholder;
    const lista = el('div', 'k-vf-lista'); lista.hidden = true;
    const aviso = el('div', 'k-vf-aviso'); aviso.hidden = true;
    let ops = [], sel = [], activo = -1;

    const canon = (t) => { const k = V.clave(t); const ex = k && ops.find(o => V.clave(o.v) === k); return ex ? ex.v : V.limpia(t); };
    const avisa = () => onChange && onChange(api.get());

    function pintaChips() {
      if (!chips) return;
      chips.textContent = '';
      sel.forEach((v, i) => {
        const ch = el('span', 'k-chip'); ch.append(v);
        const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar ' + v);
        x.addEventListener('click', () => { sel.splice(i, 1); pintaChips(); pinta(); avisa(); });
        ch.appendChild(x); chips.appendChild(ch);
      });
      chips.hidden = !sel.length;
    }
    function coincidencias() {
      const k = V.clave(input.value);
      const libres = ops.filter(o => !sel.some(s => V.clave(s) === V.clave(o.v)));
      if (!k) return libres.slice(0, 8);
      const ini = libres.filter(o => V.clave(o.v).startsWith(k)), resto = libres.filter(o => !V.clave(o.v).startsWith(k) && V.clave(o.v).includes(k));
      return [...ini, ...resto].slice(0, 8);
    }
    function pinta() {
      const t = V.limpia(input.value), k = V.clave(t);
      // Lista de sugerencias (solo con el campo enfocado)
      const cs = document.activeElement === input ? coincidencias().filter(o => V.clave(o.v) !== k || o.v !== t) : [];
      lista.textContent = ''; activo = Math.min(activo, cs.length - 1);
      cs.forEach((o, i) => {
        const b = el('button', 'k-vf-op' + (i === activo ? ' on' : '')); b.type = 'button';
        b.append(el('span', null, o.v)); if (o.n) b.append(el('small', null, '×' + o.n));
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); elige(o.v); });
        lista.appendChild(b);
      });
      lista.hidden = !cs.length;
      // Aviso: grafía existente, errata probable o valor nuevo
      aviso.textContent = ''; aviso.className = 'k-vf-aviso'; aviso.hidden = true;
      if (!k) return;
      const ex = ops.find(o => V.clave(o.v) === k);
      if (ex) { if (ex.v !== t) { aviso.textContent = `Se guardará como «${ex.v}», que ya existe`; aviso.hidden = false; } return; }
      const par = V.parecido(t, ops.map(o => o.v));
      if (par) {
        aviso.classList.add('aviso-par'); aviso.append(`¿Quisiste decir «${par}»? `);
        const u = el('button', 'btn tiny ghost', 'Usar'); u.type = 'button';
        u.addEventListener('pointerdown', (e) => { e.preventDefault(); elige(par); });
        aviso.appendChild(u); aviso.hidden = false; return;
      }
      aviso.classList.add('aviso-nuevo'); aviso.textContent = 'Valor nuevo: se guardará para volver a usarlo'; aviso.hidden = false;
    }
    function elige(v) {
      if (multiple) { anade(v); } else { input.value = v; pinta(); avisa(); }
    }
    function anade(texto) {
      const v = canon(texto); if (!v) return;
      if (!sel.some(s => V.clave(s) === V.clave(v))) sel.push(v);
      input.value = ''; pintaChips(); pinta(); avisa();
    }

    input.addEventListener('input', () => { activo = -1; pinta(); if (!multiple) avisa(); });
    input.addEventListener('focus', pinta);
    input.addEventListener('blur', () => {
      // Se muestra ya con la grafía existente («claude sonnet 5,5» → «Claude Sonnet 5.5»)
      if (!multiple) { const t = V.limpia(input.value); if (t) { const v = canon(t); if (v !== input.value) input.value = v; } }
      else if (input.value.trim()) anade(input.value);
      lista.hidden = true;
      pinta();
    });
    input.addEventListener('keydown', (e) => {
      const n = lista.children.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); activo = (activo + 1) % n; pinta(); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); activo = (activo - 1 + n) % n; pinta(); }
      else if (e.key === 'Enter' || (multiple && e.key === ',')) {
        if (activo >= 0 && lista.children[activo]) { e.preventDefault(); elige(lista.children[activo].firstChild.textContent); }
        else if (multiple && input.value.trim()) { e.preventDefault(); anade(input.value); }
      } else if (e.key === 'Backspace' && multiple && !input.value && sel.length) { sel.pop(); pintaChips(); pinta(); avisa(); }
      else if (e.key === 'Escape' && !lista.hidden) { e.stopPropagation(); lista.hidden = true; }
    });

    const api = {
      el: caja, input,
      get() { return multiple ? [...sel, ...(input.value.trim() ? [canon(input.value)] : [])].filter((v, i, a) => v && a.findIndex(w => V.clave(w) === V.clave(v)) === i) : canon(input.value); },
      set(v) { if (multiple) { sel = (Array.isArray(v) ? v : []).map(V.limpia).filter(Boolean); pintaChips(); } else input.value = v || ''; pinta(); },
    };
    if (chips) caja.appendChild(chips);
    caja.append(input, lista, aviso);
    api.set(value); if (multiple) pintaChips();
    campo(c).then((f) => { ops = opciones(f); const act = document.activeElement === input; if (act) pinta(); else if (!multiple) { const t = V.limpia(input.value); if (t) { const v = canon(t); if (v !== input.value) input.value = v; } } }).catch(() => {});
    return api;
  };
})();
