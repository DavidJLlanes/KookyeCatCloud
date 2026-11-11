'use strict';
/* notes/ricos-boton.js: botón de plantilla dentro de una nota («Nueva reunión»).
     ::boton nota:<plantilla> Etiqueta           crea una nota nueva desde una plantilla de nota
     ::boton fila:<base>:<plantilla> Etiqueta    crea una fila nueva en una base con una plantilla de fila y la abre        */
(function () {
  const C = (K._notes = K._notes || {});
  const nodo = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
  const RE = /^::boton\s+((?:nota:[\w-]{1,40})|(?:fila:[a-f0-9]{8,32}:[a-f0-9]{8,32}))(?:\s+(.*))?$/;

  async function ejecuta(destino) {
    try {
      if (destino.startsWith('nota:')) { await K.notes.creaDesdeId(destino.slice(5)); return; }
      const [, base, plantilla] = destino.split(':');
      const d = await K.post(`/api/bases/${base}/plantillas/${plantilla}/usar`, {});
      if (typeof switchTab === 'function') switchTab('bases');
      await K.bases.abre(base);
      const fila = K.bases.S.base && K.bases.S.base.rows.find(r => r.id === d.row.id);
      if (fila) K.bases.editaFila(fila);
      if (K.game && K.game.load) K.game.load();
    } catch (e) { K.fail(e); }
  }

  // Elegir qué hace el botón y cómo se llama: alElegir(destino, etiqueta)
  function elige(alElegir, alCancelar, previo) {
    let elegido = false;
    const caja = nodo('div', 'nb-bt-form');
    const tipo = document.createElement('select'); [['nota', 'Crear una nota desde una plantilla'], ['fila', 'Crear una fila en una base (con su plantilla)']].forEach(([v, n]) => tipo.appendChild(new Option(n, v)));
    const base = document.createElement('select'), plant = document.createElement('select'), etiqueta = document.createElement('input');
    etiqueta.maxLength = 60; etiqueta.placeholder = 'Texto del botón (p. ej. Nueva reunión)';
    const campo = (t, n) => { const l = nodo('label', 'rc-campo'); l.append(nodo('span', null, t), n); return l; };
    const lBase = campo('Base', base);
    caja.append(campo('El botón…', tipo), lBase, campo('Plantilla', plant), campo('Texto', etiqueta), nodo('small', 'k-faint', 'Las plantillas de fila se crean en la base, con el botón «Plantillas».'));
    const rellena = (items) => { plant.textContent = ''; items.forEach(([v, n]) => plant.appendChild(new Option(n, v))); if (!items.length) plant.appendChild(new Option('Sin plantillas', '')); };
    const nombreSug = () => { const o = plant.selectedOptions[0]; return o && o.value ? 'Nueva ' + o.textContent.replace(/^\S+\s/, '').toLowerCase() : ''; };
    let tocada = !!(previo && previo.etiqueta);
    etiqueta.addEventListener('input', () => { tocada = true; });
    const sug = () => { if (!tocada) etiqueta.value = nombreSug(); };
    async function cargaPlantillas() {
      lBase.hidden = tipo.value !== 'fila';
      if (tipo.value === 'nota') { const l = await K.notes.listaPlantillas(); rellena(l.map(t => [t.id, `${t.icon || '📝'} ${t.name}`])); }
      else if (base.value) { try { const b = await K.get('/api/bases/' + base.value); rellena((b.plantillas || []).map(p => [p.id, `${p.icono} ${p.nombre}`])); } catch { rellena([]); } }
      else rellena([]);
      sug();
    }
    tipo.addEventListener('change', cargaPlantillas); base.addEventListener('change', cargaPlantillas); plant.addEventListener('change', sug);
    const m = K.modal({ title: 'Botón de plantilla', content: caja, actions: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, onClick: () => {
      if (!plant.value) { K.toast('Elige una plantilla'); return false; }
      elegido = true; alElegir(tipo.value === 'nota' ? 'nota:' + plant.value : `fila:${base.value}:${plant.value}`, etiqueta.value.trim() || nombreSug() || 'Nuevo');
    } }], onClose: () => { if (!elegido && alCancelar) alCancelar(); } });
    K.get('/api/bases').then(async (r) => {
      r.bases.forEach(b => base.appendChild(new Option(`${b.icono || ''} ${b.nombre}`.trim(), b.id)));
      if (previo && previo.destino) {
        const p = previo.destino.split(':'); tipo.value = p[0]; if (p[0] === 'fila') base.value = p[1];
        await cargaPlantillas(); plant.value = p[0] === 'fila' ? p[2] : p[1]; etiqueta.value = previo.etiqueta || '';
      } else await cargaPlantillas();
    }).catch(K.fail);
    return m;
  }

  C.registraRico('boton', {
    slash: ['Botón de plantilla', 'Un botón que crea una nota o una fila (p. ej. «Nueva reunión»)', '＋'],
    parse(lines, i) { const m = RE.exec(lines[i]); return m ? { b: { t: 'boton', destino: m[1], text: (m[2] || '').trim() }, next: i + 1 } : null; },
    md: (b) => `::boton ${b.destino || 'nota:vacia'} ${String(b.text || 'Nuevo').replace(/<br>/g, ' ')}`,
    pinta(w, c, b) {
      w.dataset.destino = b.destino || ''; w.dataset.etiqueta = b.text || '';
      const fila = nodo('div', 'nb-bt'), btn = nodo('button', 'btn primary nb-bt-btn', '＋ ' + (b.text || 'Nuevo')); btn.type = 'button';
      btn.addEventListener('click', (e) => { e.preventDefault(); ejecuta(w.dataset.destino); });
      const ed = nodo('button', 'icon-btn tiny nb-bt-ed', '✎'); ed.type = 'button'; ed.title = 'Cambiar el botón'; ed.setAttribute('aria-label', 'Cambiar el botón');
      ed.addEventListener('click', (e) => { e.preventDefault(); elige((d, t) => { w.dataset.destino = d; w.dataset.etiqueta = t; btn.textContent = '＋ ' + t; C.change(true); }, null, { destino: w.dataset.destino, etiqueta: w.dataset.etiqueta }); });
      fila.append(btn, ed); c.appendChild(fila);
    },
    lee: (w, b) => ({ ...b, destino: w.dataset.destino || b.destino, text: w.dataset.etiqueta || b.text }),
    alCrear(w) {
      const quita = () => { if (!w.isConnected) return; w.remove(); if (!C.EST.host.querySelector('.nb-block')) C.EST.host.appendChild(C.makeBlock({ t: 'p', text: '' })); C.change(true); };
      elige((d, t) => { w.dataset.destino = d; w.dataset.etiqueta = t; w.querySelector('.nb-bt-btn').textContent = '＋ ' + t; C.change(true); }, quita);
    },
  });
})();
