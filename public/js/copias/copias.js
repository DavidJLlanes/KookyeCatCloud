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
    if (d.restauracion?.estado === 'en_curso') linea(`Recuperando los datos que faltan desde la copia del ${d.restauracion.fecha}…`);
    if (d.restauracion?.estado === 'ok') linea(`Recuperación del ${d.restauracion.fecha}: ${d.restauracion.archivos} archivos y ${d.restauracion.registros} registros añadidos. Los datos existentes se conservaron.`);
    if (d.restauracion?.estado === 'error') linea(`No se completó la recuperación del ${d.restauracion.fecha}: ${d.restauracion.error}`);
    if (d.ultimaOk) linea(`Última copia correcta: ${fecha(d.ultimaOk.fecha)} · ${tam(d.ultimaOk.tamano)} · tardó ${duracion(d.ultimaOk.duracionMs)}`);
    else linea('Todavía no hay ninguna copia correcta.');
    linea(`Se hace cada día a las ${d.programacion.horas.slice(0, 1)} (hora de Madrid). Si falla, reintenta a las ${d.programacion.horas.slice(1).join(' y a las ')}.`);

    $c('copias-crear').disabled = !!d.enCurso || d.restauracion?.estado === 'en_curso';
    const bajar = $c('copias-bajar');
    bajar.hidden = !d.archivo;
    bajar.href = `${BASE}/api/admin/copias/descarga`;
    bajar.onclick = (e) => { e.preventDefault(); K.guardarUrl('/api/admin/copias/descarga', { nombre: d.copias[0].nombre }); };

    const disponibles = $c('copias-disponibles');
    disponibles.textContent = '';
    if (!d.copias.length) disponibles.appendChild(el('p', 'copias-vacia', 'Todavía no hay copias disponibles.'));
    for (const copia of d.copias) {
      const fila = el('div', 'copias-dia');
      fila.appendChild(el('span', null, `${copia.fecha} · ${tam(copia.tamano)}`));
      const acciones = el('div', 'copias-dia-acciones');
      const descargar = el('button', 'btn sm', 'Descargar'); descargar.type = 'button';
      descargar.setAttribute('aria-label', `Descargar copia del ${copia.fecha}`);
      descargar.addEventListener('click', () => K.guardarUrl(`/api/admin/copias/descarga?fecha=${encodeURIComponent(copia.fecha)}`, { nombre: copia.nombre }));
      acciones.appendChild(descargar);
      const recuperar = el('button', 'btn sm', 'Recuperar'); recuperar.type = 'button';
      recuperar.disabled = !!d.enCurso || d.restauracion?.estado === 'en_curso';
      recuperar.setAttribute('aria-label', `Recuperar datos ausentes de la copia del ${copia.fecha}`);
      recuperar.addEventListener('click', async () => {
        if (!await K.confirm(`Se añadirán los archivos y registros que falten de la copia del ${copia.fecha}. Los que ya existen conservarán su versión actual y no se borrará ningún dato.`, { ok: 'Recuperar' })) return;
        try { await K.post('/api/admin/copias/recuperar', { fecha: copia.fecha }); K.toast('Recuperación iniciada'); await cargar(); }
        catch (e) { K.fail(e); }
      });
      acciones.appendChild(recuperar);
      fila.appendChild(acciones);
      disponibles.appendChild(fila);
    }

    const h = $c('copias-historial');
    h.textContent = '';
    d.historial.forEach((r) => {
      const quien = r.origen === 'manual' ? `a mano${r.usuario ? ' (' + r.usuario + ')' : ''}` : 'programada';
      const txt = r.resultado === 'ok' ? `correcta · ${tam(r.tamano)}` : `fallida: ${r.error}`;
      h.appendChild(el('li', r.resultado === 'ok' ? 'ok' : 'error', `${fecha(r.fecha)} · ${quien} · ${txt}`));
    });
    if (d.enCurso || d.restauracion?.estado === 'en_curso') espera = setTimeout(cargar, 3000);
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
