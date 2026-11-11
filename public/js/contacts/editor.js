'use strict';
/* contacts/editor.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const { ETQ, MESES, S } = C;
  const colorDe = (...a) => C.colorDe(...a);
  const openDetail = (...a) => C.openDetail(...a);
  const render = (...a) => C.render(...a);
  const sustituye = (...a) => C.sustituye(...a);

  /* ---------- Editor ---------- */
  const campo = (txt, input) => { const l = el('label', 'field tight'); l.append(el('span', null, txt), input); return l; };
  // Campo con valores reutilizables (sugerencias y unificación de variantes): contenedor sin <label> porque lleva botones
  const campoV = (txt, api) => { const l = el('div', 'field tight'); l.append(el('span', null, txt), api.el); return l; };
  const valor = (prop, v, ph) => K.campoValor({ campo: 'contacts.' + prop, value: v || '', placeholder: ph || '' });
  const entrada = (valor, ph, tipo, max) => { const i = el('input'); i.type = tipo || 'text'; i.value = valor || ''; if (ph) i.placeholder = ph; i.maxLength = max || 160; i.autocomplete = 'off'; return i; };
  function selector(opciones, valor) {
    const s = el('select');
    const lista = opciones.includes(valor) || !valor ? opciones : [valor, ...opciones];
    lista.forEach((o) => { const op = el('option', null, o); op.value = o; s.appendChild(op); });
    s.value = valor || opciones[0];
    return s;
  }

  // Lista de filas que se pueden añadir y quitar (teléfonos, correos, direcciones…)
  function repetidor({ titulo, ic, anadir, items, nuevaFila }) {
    const sec = el('section', 'ct-rep');
    const h = el('h4'); h.append(icon(ic), el('span', null, titulo)); sec.appendChild(h);
    const cuerpo = el('div', 'ct-rep-rows'); sec.appendChild(cuerpo);
    const filas = [];
    const pon = (v, enfoca) => {
      const r = nuevaFila(v || {});
      filas.push(r); cuerpo.appendChild(r.el);
      r.quita.addEventListener('click', () => { filas.splice(filas.indexOf(r), 1); r.el.remove(); });
      if (enfoca) r.foco.focus();
    };
    (items.length ? items : [{}]).forEach(v => pon(v));
    const b = el('button', 'btn ghost sm ct-add'); b.type = 'button'; b.append(icon('i-plus'), el('span', null, anadir));
    b.addEventListener('click', () => pon({}, true)); sec.appendChild(b);
    return { el: sec, get: () => filas.map(r => r.get()).filter(Boolean) };
  }
  const botonQuitar = () => { const q = el('button', 'btn ghost icon ct-rm'); q.type = 'button'; q.title = 'Quitar'; q.setAttribute('aria-label', 'Quitar'); q.appendChild(icon('i-x')); return q; };

  function filaSimple(tipo, ph, inputType, max) {
    return (v) => {
      const r = el('div', 'ct-rep-row');
      const sel = selector(ETQ[tipo], v.label); const inp = entrada(v.value, ph, inputType, max);
      if (inputType === 'tel') inp.inputMode = 'tel'; if (inputType === 'email') inp.inputMode = 'email';
      const q = botonQuitar(); r.append(sel, inp, q);
      return { el: r, quita: q, foco: inp, get: () => (inp.value.trim() ? { label: sel.value, value: inp.value.trim() } : null) };
    };
  }
  function filaDireccion(v) {
    const r = el('div', 'ct-rep-row ct-adr');
    const sel = selector(ETQ.addresses, v.label);
    const calle = entrada(v.street, 'Calle y número', 'text', 160), cp = entrada(v.zip, 'Código postal', 'text', 20), ciudad = valor('city', v.city, 'Ciudad');
    const region = valor('region', v.region, 'Provincia / región'), pais = valor('country', v.country, 'País');
    const q = botonQuitar();
    const g = el('div', 'ct-adr-g'); g.append(calle, cp, ciudad.el, region.el, pais.el);
    const cab = el('div', 'ct-adr-h'); cab.append(sel, q);
    r.append(cab, g);
    return { el: r, quita: q, foco: calle, get: () => {
      const a = { label: sel.value, street: calle.value.trim(), zip: cp.value.trim(), city: ciudad.get(), region: region.get(), country: pais.get() };
      return a.street || a.zip || a.city || a.region || a.country ? a : null;
    } };
  }
  function filaFecha(v) {
    const r = el('div', 'ct-rep-row ct-date');
    const sel = selector(ETQ.dates, v.label);
    const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(v.date || '');
    const dia = entrada(m ? String(Number(m[3])) : '', 'Día', 'number', 2); dia.min = 1; dia.max = 31; dia.inputMode = 'numeric';
    const mes = el('select'); const o0 = el('option', null, 'Mes'); o0.value = ''; mes.appendChild(o0);
    MESES.forEach((n, i) => { const o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); mes.appendChild(o); });
    mes.value = m ? m[2] : '';
    const anio = entrada(m && m[1] ? m[1] : '', 'Año', 'number', 4); anio.min = 1; anio.max = 9999; anio.inputMode = 'numeric';
    const q = botonQuitar(); r.append(sel, dia, mes, anio, q);
    return { el: r, quita: q, foco: dia, get: () => {
      const d = Number(dia.value);
      if (!d || !mes.value) return null;
      const y = anio.value.trim();
      return { label: sel.value, date: `${/^\d{4}$/.test(y) ? y : '-'}-${mes.value}-${String(d).padStart(2, '0')}`.replace(/^--/, '--') };
    } };
  }

  async function openEditor(id, prefill) {
    await K.loadLabels().catch(() => {});
    const c = id ? S.items.find(x => x.id === id) : null;
    if (id && !c) return;
    const base = c || prefill || {};
    const f = el('div', 'ct-form');

    const nom = el('div', 'k-2');
    const first = entrada(base.first, '', 'text', 80), last = entrada(base.last, '', 'text', 80);
    const middle = entrada(base.middle, '', 'text', 80), nick = entrada(base.nickname, '', 'text', 80);
    nom.append(campo('Nombre', first), campo('Apellidos', last), campo('Segundo nombre', middle), campo('Apodo', nick));
    const trab = el('div', 'k-2');
    const company = valor('company', base.company), title = valor('title', base.title), dep = valor('department', base.department);
    trab.append(campoV('Empresa', company), campoV('Cargo', title), campoV('Departamento', dep));
    f.append(nom, trab);

    const tels = repetidor({ titulo: 'Teléfonos', ic: 'i-phone', anadir: 'Añadir teléfono', items: base.phones || [], nuevaFila: filaSimple('phones', 'Teléfono', 'tel', 40) });
    const mails = repetidor({ titulo: 'Correos', ic: 'i-mail', anadir: 'Añadir correo', items: base.emails || [], nuevaFila: filaSimple('emails', 'Correo electrónico', 'email', 160) });
    const dirs = repetidor({ titulo: 'Direcciones', ic: 'i-pin', anadir: 'Añadir dirección', items: base.addresses || [], nuevaFila: filaDireccion });
    const webs = repetidor({ titulo: 'Sitios web', ic: 'i-globe', anadir: 'Añadir web', items: base.websites || [], nuevaFila: filaSimple('websites', 'https://…', 'text', 300) });
    const fechas = repetidor({ titulo: 'Fechas', ic: 'i-cake', anadir: 'Añadir fecha', items: base.dates || [], nuevaFila: filaFecha });
    f.append(tels.el, mails.el, dirs.el, webs.el, fechas.el);

    // Foto: se reduce en el servidor a 300x300 (WebP); se sube al guardar
    const foto = { file: null, quitar: false };
    const fotoBox = el('div', 'ct-photo');
    const fotoIn = el('input'); fotoIn.type = 'file'; fotoIn.accept = 'image/*'; fotoIn.hidden = true;
    const pintaFoto = () => {
      fotoBox.textContent = '';
      const prev = el('div', 'ct-av'); prev.style.setProperty('--s', '72px'); prev.style.setProperty('--c', colorDe(c || { id: 'nuevo' }));
      if (foto.file) { const im = el('img'); im.alt = ''; im.src = foto.url; prev.appendChild(im); }
      else if (c && c.photo && !foto.quitar) { const im = el('img'); im.alt = ''; im.src = `${BASE}/api/contacts/${c.id}/photo?v=${c.photo}`; prev.appendChild(im); }
      else prev.appendChild(icon('i-contact'));
      const b1 = el('button', 'btn sm'); b1.type = 'button'; b1.append(icon('i-image'), el('span', null, (foto.file || (c && c.photo && !foto.quitar)) ? 'Cambiar foto' : 'Añadir foto'));
      b1.addEventListener('click', () => fotoIn.click());
      fotoBox.append(prev, b1);
      if (foto.file || (c && c.photo && !foto.quitar)) {
        const b2 = el('button', 'btn ghost sm'); b2.type = 'button'; b2.append(icon('i-trash'), el('span', null, 'Quitar'));
        b2.addEventListener('click', () => { if (foto.url) URL.revokeObjectURL(foto.url); foto.file = null; foto.url = ''; foto.quitar = true; pintaFoto(); });
        fotoBox.appendChild(b2);
      }
      fotoBox.appendChild(fotoIn);
    };
    fotoIn.addEventListener('change', () => {
      const fl = fotoIn.files && fotoIn.files[0]; fotoIn.value = '';
      if (!fl) return;
      if (!/^image\//.test(fl.type) && !/\.(heic|heif|avif|webp|jpe?g|png|gif)$/i.test(fl.name)) { K.toast('Elige una imagen'); return; }
      if (fl.size > 15 * 1024 * 1024) { K.toast('La imagen supera los 15 MB'); return; }
      if (foto.url) URL.revokeObjectURL(foto.url);
      foto.file = fl; foto.url = URL.createObjectURL(fl); foto.quitar = false; pintaFoto();
    });
    pintaFoto();
    f.insertBefore(fotoBox, f.firstChild);

    const notas = el('textarea'); notas.value = base.notes || ''; notas.rows = 3; notas.placeholder = 'Notas';
    f.appendChild(campo('Notas', notas));
    const picker = K.labelPicker({ selected: base.labels || [] });
    f.appendChild(campo('Etiquetas', picker));
    let favorito = !!base.favorite;
    const favB = el('button', 'btn sm ct-favbtn'); favB.type = 'button';
    const pintaFav = () => { favB.replaceChildren(icon(favorito ? 'i-star-fill' : 'i-star'), el('span', null, favorito ? 'Favorito' : 'Marcar como favorito')); favB.classList.toggle('on', favorito); };
    pintaFav(); favB.addEventListener('click', () => { favorito = !favorito; pintaFav(); });
    f.appendChild(favB);

    const m = K.modal({ title: c ? 'Editar contacto' : 'Nuevo contacto', cls: 'xl ct-modal', content: f, dismiss: false, actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', primary: true, onClick: async () => {
        const body = {
          first: first.value, middle: middle.value, last: last.value, nickname: nick.value,
          company: company.get(), title: title.get(), department: dep.get(),
          phones: tels.get(), emails: mails.get(), addresses: dirs.get(), websites: webs.get(), dates: fechas.get(),
          notes: notas.value, labels: picker.get(), favorite: favorito,
        };
        try {
          const r = c ? await K.put('/api/contacts/' + c.id, { ...body, base: c.updatedAt }) : await K.post('/api/contacts', body);
          let ct = r.contact; K.valores.cambio();
          try {
            if (foto.file) {
              const rs = await api(`${BASE}/api/contacts/${ct.id}/photo`, { method: 'PUT', headers: { 'Content-Type': foto.file.type || 'application/octet-stream' }, body: foto.file });
              const dj = await rs.json().catch(() => ({}));
              if (!rs.ok) throw new Error(dj.error || 'No se pudo guardar la foto');
              ct = dj.contact;
            } else if (foto.quitar && c && c.photo) {
              ct = (await K.del(`/api/contacts/${ct.id}/photo`)).contact || ct;
            }
          } catch (e) { K.fail(e); }
          if (foto.url) URL.revokeObjectURL(foto.url);
          r.contact = ct;
          sustituye(r.contact); render();
          K.toast(c ? 'Contacto actualizado' : 'Contacto creado');
          if (c) setTimeout(() => openDetail(r.contact.id), 30);
        } catch (e) { K.fail(e); return false; }
      } },
    ] });
    setTimeout(() => first.focus(), 40);
    return m;
  }


  Object.assign(C, { campo, campoV, valor, entrada, selector, repetidor, botonQuitar, filaSimple, filaDireccion, filaFecha, openEditor });
})();
