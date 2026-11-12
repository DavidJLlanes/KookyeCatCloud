'use strict';
/* Buscar · ajustes de la IA: elegir proveedor, pegar la clave (se guarda cifrada en el servidor y nunca vuelve), elegir modelo
   (con los gratuitos de OpenRouter y OpenCode), probar la conexión y aceptar el envío de fragmentos. */
(function () {
  if (!window.K || !K.buscar) return;
  const B = K.buscar, S = B.S;

  B.ajustes = async (opts = {}) => {
    try { await B.cargaConfig(); } catch (e) { K.fail(e); return; }
    let sel = (S.config.activo && S.config.proveedores.find(p => p.id === S.config.activo)) ? S.config.activo : 'openrouter';
    const cont = el('div', 'bu-aj');
    let h = null;

    const refresca = async () => { await B.cargaConfig(); pinta(); B.pintaTodo(); };

    function consentimiento() {
      const c = el('label', 'bu-consent' + (opts.aviso && !S.config.consentimiento ? ' aviso' : ''));
      const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!S.config.consentimiento;
      chk.addEventListener('change', async () => { try { await K.put('/api/ia/consentimiento', { ok: chk.checked }); S.config.consentimiento = chk.checked; K.toast(chk.checked ? 'Envío aceptado' : 'Envío desactivado'); } catch (e) { K.fail(e); chk.checked = !chk.checked; } });
      const t = el('span'); t.append(el('b', null, 'Acepto que se envíen fragmentos de mis datos al proveedor que elija. '),
        document.createTextNode('Solo los fragmentos que encuentra la búsqueda para tu pregunta (nunca todo tu contenido ni la caja fuerte), y solo cuando preguntes o resumas. Con un modelo propio (Ollama) no sale nada.'));
      c.append(chk, t); return c;
    }

    function formulario(p) {
      const f = el('div', 'bu-aj-form');
      if (p.nota) f.appendChild(el('p', 'k-faint', p.nota));
      const campo = (txt, input, ayuda) => { const l = el('label', 'bu-campo'); l.appendChild(el('span', null, txt)); l.appendChild(input); if (ayuda) l.appendChild(el('small', 'k-faint', ayuda)); return l; };
      let clave = null, base = null;
      if (!p.sinClave) {
        clave = el('input'); clave.type = 'password'; clave.autocomplete = 'off'; clave.spellcheck = false; clave.maxLength = 400;
        clave.placeholder = p.tieneClave ? `Guardada (${p.pista}). Escribe otra para cambiarla` : 'Pega aquí tu clave de API';
        const ay = el('small', 'k-faint'); ay.appendChild(document.createTextNode('Se guarda cifrada en tu servidor y no vuelve a mostrarse. '));
        if (p.claveUrl) { const a = el('a', null, 'Conseguir una clave'); a.href = p.claveUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; ay.appendChild(a); }
        const l = el('label', 'bu-campo'); l.append(el('span', null, 'Clave de API'), clave, ay); f.appendChild(l);
      }
      if (p.editable) { base = el('input'); base.type = 'url'; base.value = p.base || ''; base.placeholder = 'https://…/v1'; f.appendChild(campo('Dirección base', base, p.local ? 'Debe estar permitido con KCC_IA_PERMITE_LOCAL=1 en el servidor.' : 'Termina normalmente en /v1.')); }
      const modelo = el('input'); modelo.value = p.modelo || ''; modelo.placeholder = 'Nombre del modelo'; modelo.setAttribute('list', 'bu-modelos'); modelo.autocomplete = 'off'; modelo.spellcheck = false;
      const lista = document.createElement('datalist'); lista.id = 'bu-modelos';
      f.append(campo('Modelo', modelo), lista);
      const fila = el('div', 'bu-aj-fila');
      const cargar = el('button', 'btn sm', 'Ver modelos disponibles'); cargar.type = 'button';
      let soloG = null, todos = [];
      const rellena = () => { lista.textContent = ''; todos.filter(m => !soloG || !soloG.checked || m.gratis).slice(0, 400).forEach(m => { const o = document.createElement('option'); o.value = m.id; o.label = m.gratis ? `${m.nombre} (gratis)` : m.nombre; lista.appendChild(o); }); };
      if (p.gratis) { const l = el('label', 'bu-opt'); soloG = el('input'); soloG.type = 'checkbox'; soloG.checked = !!p.soloGratis; soloG.addEventListener('change', rellena); l.append(soloG, el('span', null, 'Solo modelos gratuitos')); fila.appendChild(l); }
      cargar.addEventListener('click', async () => {
        cargar.disabled = true;
        try {
          if (clave && clave.value.trim()) await K.put('/api/ia/proveedores/' + p.id, { clave: clave.value.trim(), base: base ? base.value : undefined });
          todos = (await K.post(`/api/ia/proveedores/${p.id}/modelos`)).modelos; rellena();
          K.toast(`${todos.length} modelos (${todos.filter(m => m.gratis).length} gratuitos). Escribe en el campo para elegir uno.`);
          modelo.focus();
        } catch (e) { K.fail(e); }
        cargar.disabled = false;
      });
      fila.prepend(cargar); f.appendChild(fila);

      const acc = el('div', 'bu-aj-acc');
      const guarda = async () => {
        const cuerpo = { modelo: modelo.value.trim() };
        if (clave && clave.value.trim()) cuerpo.clave = clave.value.trim();
        if (base) cuerpo.base = base.value.trim();
        if (soloG) cuerpo.soloGratis = soloG.checked;
        await K.put('/api/ia/proveedores/' + p.id, cuerpo);
        await K.put('/api/ia/activo', { id: p.id });
      };
      const bGuardar = el('button', 'btn primary', 'Guardar y usar'); bGuardar.type = 'button';
      bGuardar.addEventListener('click', async () => { try { await guarda(); K.toast('Guardado'); await refresca(); } catch (e) { K.fail(e); } });
      const bProbar = el('button', 'btn', 'Probar conexión'); bProbar.type = 'button';
      bProbar.addEventListener('click', async () => {
        bProbar.disabled = true;
        try { await guarda(); const r = await K.post('/api/ia/probar', { proveedor: p.id }); K.toast(`Conexión correcta (${(r.ms / 1000).toFixed(1)} s)`); B.logros(); await refresca(); } catch (e) { K.fail(e); }
        bProbar.disabled = false;
      });
      acc.append(bGuardar, bProbar);
      if (p.tieneClave) {
        const q = el('button', 'btn danger', 'Quitar clave'); q.type = 'button';
        q.addEventListener('click', async () => { if (!await K.confirm(`Se borrará la clave de ${p.nombre} de tu servidor.`, { ok: 'Quitar', danger: true, title: 'Quitar clave' })) return; try { await K.del(`/api/ia/proveedores/${p.id}/clave`); K.toast('Clave quitada'); await refresca(); } catch (e) { K.fail(e); } });
        acc.appendChild(q);
      }
      f.appendChild(acc);
      return f;
    }

    function pinta() {
      cont.textContent = '';
      cont.appendChild(consentimiento());
      const lista = el('div', 'bu-prov');
      S.config.proveedores.forEach(p => {
        const b = el('button', 'bu-prov-i' + (p.id === sel ? ' on' : '')); b.type = 'button';
        b.append(el('b', null, p.nombre), el('small', p.listo ? 'ok' : 'k-faint', p.id === S.config.activo && p.listo ? 'En uso' : p.listo ? 'Lista' : p.gratis ? 'Con nivel gratis' : ''));
        b.addEventListener('click', () => { sel = p.id; pinta(); });
        lista.appendChild(b);
      });
      cont.appendChild(lista);
      cont.appendChild(formulario(S.config.proveedores.find(p => p.id === sel)));
    }
    pinta();
    h = K.modal({ title: 'Ajustes de IA', sub: 'Tu clave, tu proveedor. Sin clave, solo funciona la búsqueda.', content: cont, actions: [{ label: 'Cerrar', primary: true }] });
  };
})();
