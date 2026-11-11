'use strict';
/* copiar: parte de la biblioteca de prompts (ver prompts/estado.js). Comparte el espacio K._prompts. */
(function () {
  const C = (K._prompts = K._prompts || {});
  const PRO = (...a) => C.PRO(...a);

  /* ---------- Copiar (con variables) ----------
     Sintaxis de las variables dentro del texto:
       {{nombre}}                      campo de texto
       {{nombre=valor}}                con valor por defecto
       {{tono=formal|cercano|técnico}} lista desplegable (la primera opción es la predeterminada)
       {{detalle:largo}}               texto de varias líneas   (también :numero y :fecha)   */
  const RE_VAR = /\{\{([^{}\n]{1,120})\}\}/g;
  function leeVar(dentro) {
    const i = dentro.indexOf('=');
    const cab = (i < 0 ? dentro : dentro.slice(0, i)).trim();
    const resto = i < 0 ? '' : dentro.slice(i + 1).trim();
    const j = cab.indexOf(':');
    const nombre = (j < 0 ? cab : cab.slice(0, j)).trim();
    let tipo = j < 0 ? '' : cab.slice(j + 1).trim().toLowerCase();
    if (!['largo', 'numero', 'fecha'].includes(tipo)) tipo = '';
    const opciones = resto.includes('|') ? resto.split('|').map(x => x.trim()).filter(Boolean) : [];
    return { nombre, tipo, def: opciones.length ? opciones[0] : resto, opciones };
  }
  // Variables distintas de uno o varios textos, en orden de aparición. Si una variable sale
  // varias veces, manda la primera definición (salvo que la primera no traiga opciones).
  function parseVars(...textos) {
    const mapa = new Map();
    for (const t of textos) {
      for (const m of String(t || '').matchAll(RE_VAR)) {
        const v = leeVar(m[1]);
        if (!v.nombre || v.nombre.startsWith('@')) continue;   // {{@fragmento}} no es una variable
        const prev = mapa.get(v.nombre);
        if (!prev) mapa.set(v.nombre, v);
        else {
          if (!prev.opciones.length && v.opciones.length) { prev.opciones = v.opciones; prev.def = prev.def || v.def; }
          if (!prev.def && v.def) prev.def = v.def;
          if (!prev.tipo && v.tipo) prev.tipo = v.tipo;
        }
      }
    }
    return [...mapa.values()];
  }
  const varsDe = (txt) => parseVars(txt).map(v => v.nombre);
  const rellena = (texto, valores) => String(texto || '').replace(RE_VAR, (m, dentro) => {
    const v = leeVar(dentro);
    return valores[v.nombre] !== undefined && valores[v.nombre] !== '' ? valores[v.nombre] : m;
  });

  async function copyPrompt(id, full) {
    try {
      const orig = full || await K.get('/api/prompts/' + id);
      // Los fragmentos {{@nombre}} se sustituyen por su texto antes de pedir las variables
      const pro = PRO();
      const ex = pro ? (t) => pro.expande(t) : async (t) => t;
      const p = { ...orig, body: await ex(orig.body), negative: await ex(orig.negative), system: await ex(orig.system) };
      const vars = parseVars(p.body, p.negative, p.system);
      if (vars.length) { fillVars(p, vars); return; }
      await finishCopy(p, p.body);
    } catch (e) { K.fail(e); }
  }
  async function finishCopy(p, texto, msg) {
    const ok = await K.copy(texto);
    K.toast(ok ? (msg || 'Prompt copiado') : 'No se pudo copiar');
    try { await K.post(`/api/prompts/${p.id}/use`); } catch {}
  }

  // Formulario para rellenar las variables antes de copiar. Recuerda los últimos valores usados.
  function fillVars(p, vars) {
    const clave = 'kcc-pv-' + p.id;
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(clave) || '{}'); } catch {}
    const w = el('div', 'var-form'); const ins = {};
    const valores = () => {
      const o = {};
      vars.forEach(v => { o[v.nombre] = ins[v.nombre].value; });
      return o;
    };
    const caja = (titulo) => {
      const b = el('div'); const t = el('div', 'k-faint', titulo); t.style.cssText = 'font-size:11px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.08em';
      const pre = el('pre'); pre.style.cssText = 'white-space:pre-wrap;margin:0;padding:12px;border-radius:12px;background:rgba(4,7,15,.6);border:1px solid var(--line);font:inherit;font-size:13.5px;max-height:180px;overflow:auto;word-break:break-word';
      b.append(t, pre); return [b, pre];
    };
    const [bSys, outSys] = caja('Mensaje de sistema');
    const [bBody, outBody] = caja('Resultado');
    const [bNeg, outNeg] = caja('Prompt negativo');
    const pinta = () => {
      const v = valores();
      bSys.hidden = !p.system; outSys.textContent = rellena(p.system, v);
      outBody.textContent = rellena(p.body, v);
      bNeg.hidden = !p.negative; outNeg.textContent = rellena(p.negative, v);
      // Se marcan los huecos todavía sin rellenar
      vars.forEach(x => ins[x.nombre].classList.toggle('vacio', ins[x.nombre].value === ''));
    };
    vars.forEach(v => {
      const l = el('label', 'field tight');
      const rot = el('span', null, v.nombre);
      if (v.opciones.length) rot.append(el('small', 'k-faint', '  · lista'));
      l.appendChild(rot);
      let c;
      if (v.opciones.length) {
        c = el('select');
        v.opciones.forEach(o => { const op = el('option', null, o); op.value = o; c.appendChild(op); });
        // Una opción guardada que ya no existe en la lista se añade para no perderla
        const g = guardado[v.nombre];
        if (g && !v.opciones.includes(g)) { const op = el('option', null, g); op.value = g; c.appendChild(op); }
        c.value = g || v.def;
      } else if (v.tipo === 'largo') {
        c = el('textarea'); c.rows = 3; c.value = guardado[v.nombre] !== undefined ? guardado[v.nombre] : v.def; c.placeholder = v.def ? '' : `Valor de ${v.nombre}`;
      } else {
        c = el('input'); c.value = guardado[v.nombre] !== undefined ? guardado[v.nombre] : v.def;
        if (v.tipo === 'numero') c.type = 'number'; else if (v.tipo === 'fecha') c.type = 'date';
        c.placeholder = v.def ? '' : `Valor de ${v.nombre}`;
      }
      ins[v.nombre] = c;
      c.addEventListener('input', pinta); c.addEventListener('change', pinta);
      l.appendChild(c); w.appendChild(l);
    });
    w.append(bSys, bBody, bNeg);
    pinta();
    const recuerda = () => { try { localStorage.setItem(clave, JSON.stringify(valores())); } catch {} };
    const acciones = [
      { label: 'Restablecer', close: false, onClick: () => { vars.forEach(v => { ins[v.nombre].value = v.def; }); try { localStorage.removeItem(clave); } catch {} pinta(); return false; } },
    ];
    if (p.system) acciones.push({ label: 'Copiar sistema', onClick: async () => { recuerda(); await finishCopy(p, rellena(p.system, valores()), 'Mensaje de sistema copiado'); } });
    if (p.negative) acciones.push({ label: 'Copiar negativo', onClick: async () => { recuerda(); await finishCopy(p, rellena(p.negative, valores()), 'Negativo copiado'); } });
    acciones.push({ label: 'Copiar prompt', primary: true, onClick: async () => { recuerda(); await finishCopy(p, rellena(p.body, valores())); } });
    K.modal({ title: 'Rellenar variables', sub: p.title, cls: 'wide', content: w, actions: acciones });
    const primero = ins[vars[0].nombre]; setTimeout(() => { primero.focus(); if (primero.select) primero.select(); }, 40);
  }


  Object.assign(C, { RE_VAR, leeVar, parseVars, varsDe, rellena, copyPrompt, finishCopy, fillVars });
})();
