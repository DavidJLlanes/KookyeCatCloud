'use strict';
/* Marcadores web · datos y utilidades compartidas (todo cuelga de K.marcadores). */
(function () {
  if (!window.K) return;
  const M = K.marcadores = { S: { marcadores: [], carpetas: [], cargado: false, q: '', carpeta: 'todas', vista: 'tarjetas', orden: 'nombre' } };
  const S = M.S;
  try { const v = localStorage.getItem('kcc-marcadores-vista'); if (v === 'lista' || v === 'tarjetas') S.vista = v; } catch { /* sin almacenamiento */ }
  M.guardaVista = (v) => { S.vista = v; try { localStorage.setItem('kcc-marcadores-vista', v); } catch { /* da igual */ } };

  M.anfitrion = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  M.carpetaDe = (m) => S.carpetas.find(c => c.id === m.carpeta) || null;
  M.logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);

  M.carga = async function () {
    const d = await K.get('/api/marcadores');
    S.marcadores = d.marcadores || []; S.carpetas = (d.carpetas || []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (S.carpeta !== 'todas' && S.carpeta !== '' && !S.carpetas.some(c => c.id === S.carpeta)) S.carpeta = 'todas';
    S.cargado = true;
    return S;
  };

  // Icono: la imagen de la web o, si no hay, la inicial sobre el color del marcador
  M.icono = function (m, cls = '') {
    const n = el('span', 'mk-ico ' + cls); n.textContent = (m.nombre || M.anfitrion(m.url) || '?').trim().charAt(0).toUpperCase();
    if (m.color) n.style.setProperty('--c', m.color);
    if (m.icono) {
      const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.src = `${BASE}/api/marcadores/${m.id}/icono?v=${m.icono.v || 0}`;
      img.addEventListener('load', () => { n.textContent = ''; n.classList.add('con-img'); n.appendChild(img); });
    }
    return n;
  };

  // Busca el icono de un marcador (y lo refresca en pantalla). Sin icono y sin intento reciente → se prueba una vez.
  const enCurso = new Set();
  M.buscaIcono = async function (id, avisa) {
    if (enCurso.has(id)) return; enCurso.add(id);
    try {
      const r = await K.post(`/api/marcadores/${id}/icono`);
      const i = S.marcadores.findIndex(x => x.id === id); if (i >= 0) S.marcadores[i] = r.marcador;
      if (avisa) K.toast(r.encontrado ? 'Icono actualizado' : 'Esa web no tiene un icono que se pueda usar');
      return r.encontrado;
    } catch (e) { if (avisa) K.fail(e); } finally { enCurso.delete(id); }
  };
  M.autoIconos = async function () {
    const semana = Date.now() - 7 * 86400000;
    const pend = S.marcadores.filter(m => !m.icono && (!m.iconoIntento || m.iconoIntento < semana) && !enCurso.has(m.id)).slice(0, 12);
    let nuevos = 0;
    for (let i = 0; i < pend.length; i += 3) nuevos += (await Promise.all(pend.slice(i, i + 3).map(m => M.buscaIcono(m.id)))).filter(Boolean).length;
    if (nuevos && document.getElementById('view-marcadores') && !document.getElementById('view-marcadores').hidden) K.marcadores.pinta();
  };

  M.abre = function (m) {
    window.open(m.url, '_blank', 'noopener,noreferrer');
    K.post(`/api/marcadores/${m.id}/visita`).then(() => { m.visitas = (m.visitas || 0) + 1; M.logros(); }).catch(() => {});
  };
})();
