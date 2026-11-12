'use strict';
/* Enviar entre secciones (Archivos ⇄ Código): copiar o mover, previsualización, deshacer durante 1 minuto e historial.
   Se abre desde el menú de Archivos («Enviar a…») y desde Código (proyecto o archivo). */
(function () {
  if (!window.K) return;
  const fmtTam = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  let caja = null;
  const cajaAvisos = () => { if (!caja) { caja = document.createElement('div'); caja.className = 'tr-host'; document.body.appendChild(caja); } return caja; };

  // Aviso con cuenta atrás: se mantiene durante el minuto para deshacer
  function avisoDeshacer(r, alTerminar) {
    const box = el('div', 'tr-aviso'); box.setAttribute('role', 'status');
    const txt = el('span', 'tr-txt', `${r.modo === 'mover' ? 'Movido' : 'Copiado'} a «${r.destino}» · ${r.n} elemento${r.n === 1 ? '' : 's'} · ${fmtTam(r.tam)}`);
    const cuenta = el('span', 'tr-cuenta', '');
    const deshacer = el('button', 'tr-deshacer', 'Deshacer'); deshacer.type = 'button';
    box.append(txt, cuenta, deshacer); cajaAvisos().appendChild(box);
    let quedan = Math.max(0, Math.round((r.expira - Date.now()) / 1000));
    const pinta = () => { cuenta.textContent = quedan + ' s'; };
    pinta();
    const t = setInterval(() => { quedan--; pinta(); if (quedan <= 0) quita(); }, 1000);
    function quita() { clearInterval(t); box.remove(); }
    deshacer.addEventListener('click', async () => {
      deshacer.disabled = true;
      try { await K.post(`/api/transferir/${r.id}/deshacer`, {}); K.toast('Envío deshecho'); quita(); if (alTerminar) alTerminar({ deshecho: true }); }
      catch (e) { K.fail(e); quita(); }
    });
  }

  // Diálogo «Enviar a…»
  // origen: { tipo:'archivos', rutas:[…] } | { tipo:'codigo', id, rutas?, vid? } | { tipo:'portapapeles'|'notas'|'contactos', ids:[…], titulo? }
  // opts:   { carpeta (Archivos), alTerminar(r) }
  async function abre(origen, opts = {}) {
    const w = el('div', 'tr-form');
    let modo = 'copiar';
    const modos = el('div', 'tr-modos');
    const botonesModo = [];
    [['copiar', 'Copiar', 'El original se queda donde está'], ['mover', 'Mover', 'Lo quita del origen; puedes deshacerlo 1 minuto']].forEach(([k, n, s]) => {
      const b = el('button', 'tr-modo' + (k === modo ? ' on' : '')); b.type = 'button'; b.append(el('strong', null, n), el('small', 'k-muted', s));
      b.addEventListener('click', () => { modo = k; botonesModo.forEach(x => x.classList.toggle('on', x === b)); ver(); });
      botonesModo.push(b); modos.appendChild(b);
    });
    w.appendChild(modos);

    const dsel = el('select'); dsel.setAttribute('aria-label', 'Destino');
    const opciones = origen.tipo === 'codigo'
      ? [['archivos', 'Archivos · una carpeta']]
      : [['archivos', 'Archivos · una carpeta'], ['codigo-nuevo', 'Código · proyecto nuevo'], ['codigo-id', 'Código · proyecto existente']];
    opciones.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; dsel.appendChild(o); });
    w.appendChild(dsel);

    const campos = el('div', 'tr-campos'); w.appendChild(campos);
    const inCarpeta = el('input'); inCarpeta.placeholder = 'Carpeta destino (vacío = raíz)'; inCarpeta.value = opts.carpeta || ''; inCarpeta.setAttribute('aria-label', 'Carpeta destino');
    const defNombre = { portapapeles: 'Portapapeles', notas: 'Notas', contactos: 'Contactos' }[origen.tipo] || 'Proyecto desde Archivos';
    const inNombre = el('input'); inNombre.placeholder = 'Nombre del proyecto'; inNombre.maxLength = 120; inNombre.value = origen.tipo === 'archivos' ? (origen.rutas[0] || '').split('/').pop().replace(/\.[^.]+$/, '') : defNombre; inNombre.setAttribute('aria-label', 'Nombre del proyecto');
    const selProy = el('select'); selProy.setAttribute('aria-label', 'Proyecto');
    const inSub = el('input'); inSub.placeholder = 'Carpeta dentro del proyecto (opcional)'; inSub.setAttribute('aria-label', 'Carpeta dentro del proyecto');
    const pv = el('div', 'tr-previa k-muted', 'Calculando…'); w.appendChild(pv);

    let proyectos = [];
    if (origen.tipo !== 'codigo') {
      try { proyectos = (await K.get('/api/codigo')).items; } catch { proyectos = []; }
      proyectos.forEach(p => { const o = el('option', null, p.nombre); o.value = p.id; selProy.appendChild(o); });
      if (!proyectos.length) { const o = el('option', null, 'No tienes proyectos todavía'); o.value = ''; selProy.appendChild(o); }
    }
    const pintaCampos = () => {
      campos.textContent = '';
      if (dsel.value === 'archivos') campos.append(inCarpeta);
      else if (dsel.value === 'codigo-nuevo') campos.append(inNombre);
      else campos.append(selProy, inSub);
    };
    const cuerpo = () => {
      const o = origen.tipo === 'archivos' ? { tipo: 'archivos', rutas: origen.rutas }
        : origen.tipo === 'codigo' ? { tipo: 'codigo', id: origen.id, rutas: origen.rutas || undefined, vid: origen.vid || undefined }
        : { tipo: origen.tipo, ids: origen.ids };
      let d;
      if (dsel.value === 'archivos') d = { tipo: 'archivos', carpeta: inCarpeta.value.trim() };
      else if (dsel.value === 'codigo-nuevo') d = { tipo: 'codigo', nuevo: true, nombre: inNombre.value.trim() || defNombre };
      else d = { tipo: 'codigo', id: selProy.value, carpeta: inSub.value.trim() };
      return { origen: o, destino: d, modo };
    };
    let turno = 0;
    const ver = async () => {
      const mi = ++turno; pv.className = 'tr-previa k-muted'; pv.textContent = 'Calculando…';
      const b = cuerpo();
      if (b.destino.tipo === 'codigo' && !b.destino.nuevo && !b.destino.id) { pv.className = 'tr-previa cd-err'; pv.textContent = 'Crea primero un proyecto'; return; }
      try {
        const d = await K.post('/api/transferir/previa', b);
        if (mi !== turno) return;
        pv.className = 'tr-previa';
        pv.textContent = '';
        pv.append(el('strong', null, `${d.archivos} archivo${d.archivos === 1 ? '' : 's'} · ${fmtTam(d.tam)}`));
        d.avisos.forEach(a => pv.append(el('small', 'k-muted tr-aviso-txt', '· ' + a)));
      } catch (e) { if (mi === turno) { pv.className = 'tr-previa cd-err'; pv.textContent = e.message; } }
    };
    dsel.addEventListener('change', () => { pintaCampos(); ver(); });
    [inCarpeta, inNombre, inSub].forEach(i => i.addEventListener('input', K.debounce(ver, 300)));
    selProy.addEventListener('change', ver);
    if (opts.destino) dsel.value = opts.destino;
    pintaCampos();

    const titulo = origen.tipo === 'archivos' ? `Enviar ${origen.rutas.length > 1 ? origen.rutas.length + ' elementos' : '«' + origen.rutas[0].split('/').pop() + '»'}`
      : origen.tipo === 'codigo' ? 'Enviar a Archivos'
      : `Enviar ${origen.ids.length > 1 ? origen.ids.length + ' elementos' : '«' + (origen.titulo || origen.tipo) + '»'}`;
    const h = K.modal({ title: titulo, content: w, actions: [
      { label: 'Cancelar' },
      { label: 'Enviar', primary: true, onClick: async () => {
        try {
          const r = await K.post('/api/transferir', cuerpo());
          avisoDeshacer(r, opts.alTerminar); logros(); if (opts.alTerminar) opts.alTerminar(r);
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
    void h;
    ver();
  }

  // Historial de los últimos envíos; se puede deshacer lo que siga dentro del minuto
  async function historial(alTerminar) {
    const w = el('div', 'tr-hist');
    const lista = el('ul', 'tr-lista'); w.appendChild(lista);
    const pinta = async () => {
      lista.textContent = '';
      try {
        const d = await K.get('/api/transferir/historial');
        if (!d.ops.length) lista.appendChild(el('li', 'k-muted', 'Todavía no has enviado nada.'));
        d.ops.forEach(o => {
          const li = el('li', 'tr-item');
          const t = el('div', 'tr-item-t'); t.append(el('strong', null, `${o.modo === 'mover' ? 'Mover' : 'Copiar'} · ${o.origen} → ${o.destino}`), el('small', 'k-muted', `${new Date(o.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })} · ${o.n} elemento${o.n === 1 ? '' : 's'} · ${fmtTam(o.tam)}`));
          li.appendChild(t);
          if (o.deshacible) { const b = el('button', 'btn sm', 'Deshacer'); b.type = 'button'; b.addEventListener('click', async () => { try { await K.post(`/api/transferir/${o.id}/deshacer`, {}); K.toast('Envío deshecho'); if (alTerminar) alTerminar({ deshecho: true }); pinta(); } catch (e) { K.fail(e); } }); li.appendChild(b); }
          else li.appendChild(el('small', 'k-faint', o.deshecha ? 'Deshecho' : 'Ya no se puede deshacer'));
          lista.appendChild(li);
        });
      } catch (e) { lista.appendChild(el('li', 'cd-err', e.message)); }
    };
    K.modal({ title: 'Historial de envíos', sub: 'Se guardan los últimos 50. Solo se puede deshacer durante 1 minuto.', content: w, actions: [{ label: 'Cerrar' }] });
    pinta();
  }

  // Arrastrar archivos de Archivos a la pestaña «Código» → proyecto nuevo con esos archivos
  const TIPO_RUTAS = 'application/x-kcc-rutas';
  const llevaRutas = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(TIPO_RUTAS);
  function enganchaCodigo() {
    document.querySelectorAll('[data-view="codigo"]').forEach(n => {
      n.addEventListener('dragover', e => {
        if (!llevaRutas(e)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; n.classList.add('tr-soltar');
      });
      n.addEventListener('dragleave', () => n.classList.remove('tr-soltar'));
      n.addEventListener('drop', e => {
        n.classList.remove('tr-soltar');
        if (!llevaRutas(e)) return;
        e.preventDefault(); e.stopPropagation();
        let rutas = []; try { rutas = JSON.parse(e.dataTransfer.getData(TIPO_RUTAS)) || []; } catch { rutas = []; }
        if (!rutas.length) return;
        abre({ tipo: 'archivos', rutas }, { carpeta: state.path || '', destino: 'codigo-nuevo', alTerminar: () => refresh() });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchaCodigo); else enganchaCodigo();

  K.transferir = { abre, historial };
})();
