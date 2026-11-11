'use strict';
/* contacts/datos.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const { S } = C;
  const claveOrden = (...a) => C.claveOrden(...a);
  const digitos = (...a) => C.digitos(...a);
  const direccionTexto = (...a) => C.direccionTexto(...a);
  const nombre = (...a) => C.nombre(...a);
  const norm = (...a) => C.norm(...a);
  const render = (...a) => C.render(...a);

  /* ---------- Datos ---------- */
  async function load() {
    try {
      const r = await K.get('/api/contacts');
      S.items = r.contacts; S.max = r.max || S.max; S.loaded = true;
    } catch (e) { K.fail(e); }
    render();
  }

  // Contacto en Markdown (para .md, .txt y .pdf)
  function contactoMd(c) {
    const cargo = [c.title, c.department, c.company].filter(Boolean).join(' · ');
    const L = [`## ${nombre(c)}`];
    if (c.nickname) L.push(`“${c.nickname}”`);
    if (cargo && cargo !== nombre(c)) L.push(cargo);
    const lin = (et, arr) => (arr || []).forEach(x => L.push(`- ${et}${x.label || x.type ? ' (' + (x.label || x.type) + ')' : ''}: ${x.value}`));
    L.push('');
    lin('Teléfono', c.phones); lin('Correo', c.emails); lin('Web', c.websites);
    (c.addresses || []).forEach(a => L.push(`- Dirección${a.label || a.type ? ' (' + (a.label || a.type) + ')' : ''}: ${direccionTexto(a)}`));
    if (c.birthday) L.push(`- Cumpleaños: ${c.birthday}`);
    if (c.notes) L.push('', c.notes);
    return L.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  const contactosMd = (lista, titulo) => `# ${titulo}\n\n` + lista.map(contactoMd).join('\n\n');
  function exportaDoc(lista, titulo) {
    return () => (lista().length ? { titulo, nombre: titulo.toLowerCase(), md: contactosMd(lista(), titulo) } : (K.toast('No hay contactos que exportar'), null));
  }

  function filtrados() {
    const q = norm(S.q), qd = digitos(S.q);
    let l = S.items;
    if (S.fav) l = l.filter(c => c.favorite);
    if (S.label) l = l.filter(c => (c.labels || []).includes(S.label));
    if (S.val) {
      const k = K.valores.clave(S.val.valor), p = S.val.prop;
      l = l.filter(c => (['city', 'region', 'country'].includes(p) ? (c.addresses || []).some(a => K.valores.clave(a[p]) === k) : K.valores.clave(c[p]) === k));
    }
    if (q) {
      l = l.filter((c) => {
        const hay = norm([nombre(c), c.nickname, c.company, c.title, c.department, c.notes,
          ...c.emails.map(e => e.value), ...c.websites.map(w => w.value), ...c.addresses.map(direccionTexto)].join(' '));
        return hay.includes(q) || (qd.length >= 3 && c.phones.some(p => digitos(p.value).includes(qd)));
      });
    }
    return l.slice().sort((a, b) => claveOrden(a).localeCompare(claveOrden(b), 'es'));
  }


  Object.assign(C, { load, contactoMd, contactosMd, exportaDoc, filtrados });
})();
