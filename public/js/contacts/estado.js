'use strict';
/* contacts/estado.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});

  const ETQ = {
    phones: ['Móvil', 'Trabajo', 'Casa', 'Principal', 'Fax', 'Otro'],
    emails: ['Personal', 'Trabajo', 'Otro'],
    addresses: ['Casa', 'Trabajo', 'Otro'],
    websites: ['Personal', 'Trabajo', 'Otro'],
    dates: ['Cumpleaños', 'Aniversario', 'Otra'],
  };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const S = { sel: new Set(), selMode: false, built: false, items: [], loaded: false, q: '', label: '', fav: false, val: null, sort: 'first', max: 10000 };
  const R = {};
  try { S.sort = localStorage.getItem('kcc-ct-sort') || 'first'; } catch { /* sin almacenamiento */ }

  /* ---------- Utilidades ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const digitos = (s) => String(s || '').replace(/\D/g, '');
  const nombre = (c) => [c.first, c.middle, c.last].filter(Boolean).join(' ').trim() || c.company
    || (c.emails[0] || {}).value || (c.phones[0] || {}).value || 'Sin nombre';
  const claveOrden = (c) => norm(S.sort === 'last' ? [c.last || c.first || c.company, c.first, c.middle].filter(Boolean).join(' ') : nombre(c));
  const letraDe = (c) => { const ch = claveOrden(c).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; };
  const NOMVAL = { company: 'Empresa', department: 'Departamento', title: 'Cargo', city: 'Ciudad', region: 'Provincia', country: 'País' };
  const principal = (c) => [c.company, c.title].filter(Boolean).join(' · ');

  function iniciales(c) {
    const a = (c.first || '').trim(), b = (c.last || '').trim();
    if (a && b) return (a[0] + b[0]).toUpperCase();
    const n = nombre(c).replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const w = n.split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : (w[0] || '').charAt(1))).toUpperCase();
  }
  function colorDe(c) {
    let h = 0; const s = c.id || nombre(c);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return `hsl(${h} 58% 46%)`;
  }
  function avatar(c, tam) {
    const a = el('div', 'ct-av');
    a.style.setProperty('--c', colorDe(c));
    if (c.photo) {
      const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.draggable = false;
      im.src = `${BASE}/api/contacts/${c.id}/photo?v=${c.photo}`;
      im.addEventListener('error', () => { im.remove(); a.textContent = iniciales(c); });
      a.appendChild(im);
    } else a.textContent = iniciales(c);
    if (tam) a.style.setProperty('--s', tam + 'px');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  // 1990-03-15 -> "15 de marzo de 1990"; --03-15 -> "15 de marzo"
  function fmtFecha(f) {
    const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(f || '');
    if (!m) return f || '';
    return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}${m[1] ? ' de ' + m[1] : ''}`;
  }
  // Solo http(s): una web guardada como "javascript:…" no debe poder ejecutarse al pulsarla
  function urlSegura(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    const u = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
    return /^https?:\/\//i.test(u) ? u : '';
  }
  const telHref = (v) => 'tel:' + String(v).replace(/[^\d+*#,;]/g, '');
  const direccionTexto = (a) => [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(', ');


  Object.assign(C, { ETQ, MESES, S, R, norm, digitos, nombre, claveOrden, letraDe, NOMVAL, principal, iniciales, colorDe, avatar, fmtFecha, urlSegura, telHref, direccionTexto });
})();
