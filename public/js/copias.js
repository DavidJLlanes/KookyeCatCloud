'use strict';
/* Copia de seguridad en Administración: estado, crear ahora, descargar y últimos intentos. Ver lib/copias.js.
   Se carga al abrir Administración (js/app/sesion.js) y mientras hay una copia en marcha se consulta cada 3 s. */
(function () {
  const caja = document.getElementById('copias-card');
  if (!caja || !window.K) return;
  const $c = (id) => document.getElementById(id);
  let espera = null;

  const tam = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
  const fecha = (f) => new Date(f).toLocaleString('es', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
  const duracion = (ms) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`);

  async function cargar() {
    clearTimeout(espera);
    try { pinta(await K.get('/api/admin/copias')); }
    catch (e) { K.fail(e); }
  }

  function pinta(d) {
    const al = $c('copias-alerta');
    al.hidden = !d.alerta;
    al.textContent = d.alerta || '';
    al.className = 'copias-alerta' + (d.ultima && d.ultima.resultado === 'error' ? ' error' : '');

    const est = $c('copias-estado');
    est.textContent = '';
    const linea = (t) => est.appendChild(el('p', 'copias-linea', t));
    if (d.enCurso) linea(`Copia en marcha desde las ${fecha(d.enCurso.desde)} (${d.enCurso.origen === 'manual' ? 'a mano' : 'programada'})…`);
    if (d.ultimaOk) linea(`Última copia correcta: ${fecha(d.ultimaOk.fecha)} · ${tam(d.ultimaOk.tamano)} · tardó ${duracion(d.ultimaOk.duracionMs)}`);
    else linea('Todavía no hay ninguna copia correcta.');
    linea(`Se hace cada día a las ${d.programacion.horas.slice(0, 1)} (hora de Madrid). Si falla, reintenta a las ${d.programacion.horas.slice(1).join(' y a las ')}.`);

    $c('copias-crear').disabled = !!d.enCurso;
    const bajar = $c('copias-bajar');
    bajar.hidden = !d.archivo;
    bajar.href = `${BASE}/api/admin/copias/descarga`;

    const h = $c('copias-historial');
    h.textContent = '';
    d.historial.forEach((r) => {
      const quien = r.origen === 'manual' ? `a mano${r.usuario ? ' (' + r.usuario + ')' : ''}` : 'programada';
      const txt = r.resultado === 'ok' ? `correcta · ${tam(r.tamano)}` : `fallida: ${r.error}`;
      h.appendChild(el('li', r.resultado === 'ok' ? 'ok' : 'error', `${fecha(r.fecha)} · ${quien} · ${txt}`));
    });
    if (d.enCurso) espera = setTimeout(cargar, 3000);
  }

  async function crear() {
    try {
      await K.post('/api/admin/copias', {});
      K.toast('Copia en marcha: puede tardar unos minutos');
      await cargar();
    } catch (e) { K.fail(e); }
  }

  $c('copias-crear').addEventListener('click', crear);
  K.copias = { cargar, crear };
})();
