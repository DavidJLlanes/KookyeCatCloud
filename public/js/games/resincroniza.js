'use strict';
/* games/resincroniza.js: vuelve a mirar en RAWG la fecha de salida de un juego (o de todos) y propone los cambios, con la opción de
   mover también su evento del calendario. No cambia nada sin que lo aceptes. Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { S } = C;

  const fecha = (d) => (d ? C.fechaTxt(d) : 'sin fecha');

  async function resincroniza(ids) {
    K.toast(ids && ids.length === 1 ? 'Consultando RAWG…' : 'Consultando RAWG… puede tardar un poco');
    let r;
    try { r = await K.post('/api/games/resync/revisa', ids ? { ids } : {}); } catch (e) { K.fail(e); return; }
    const aviso = [];
    if (r.sinRawg && !ids) aviso.push(`${r.sinRawg} sin vincular con RAWG`);
    if (r.errores) aviso.push(`${r.errores} no se pudieron consultar${r.parcial ? ' (RAWG ha limitado las peticiones: repite más tarde)' : ''}`);
    if (!r.cambios.length) { K.toast(r.revisados ? 'Las fechas de salida siguen igual' + (aviso.length ? ' · ' + aviso.join(' · ') : '') : 'No hay juegos vinculados con RAWG'); return; }
    muestra(r, aviso);
  }

  function muestra(r, aviso) {
    const w = el('div', 'gms-form gms-resync');
    const marcas = [];
    for (const c of r.cambios) {
      const fila = el('div', 'gms-rs-fila');
      const t = el('div'); t.append(el('strong', null, c.title), el('small', 'k-muted', `${fecha(c.antes)} → ${fecha(c.despues)}`));
      const aplicar = el('label', 'k-switch'); const a = el('input'); a.type = 'checkbox'; a.checked = true;
      aplicar.append(a, el('span', 'track'), el('span', null, 'Cambiar la fecha'));
      fila.append(t, aplicar);
      let cal = null;
      if (c.calendario && c.calendario.date) {
        const l = el('label', 'k-switch gms-rs-cal'); cal = el('input'); cal.type = 'checkbox'; cal.checked = true;
        l.append(cal, el('span', 'track'), el('span', null, `Mover también su evento del calendario (${fecha(c.calendario.date)}${c.calendario.time ? ' ' + c.calendario.time : ''}) y su aviso`));
        fila.appendChild(l);
        a.addEventListener('change', () => { cal.disabled = !a.checked; });
      }
      w.appendChild(fila); marcas.push({ c, a, cal });
    }
    if (aviso.length) w.appendChild(el('p', 'k-faint', aviso.join(' · ')));
    w.appendChild(el('p', 'k-faint gms-attr', 'Datos de RAWG.io'));
    K.modal({
      title: r.cambios.length === 1 ? 'Ha cambiado la fecha de salida' : `Han cambiado ${r.cambios.length} fechas de salida`, content: w,
      actions: [{ label: 'Ahora no' }, {
        label: 'Aplicar', primary: true,
        onClick: async () => {
          const cambios = marcas.filter(x => x.a.checked).map(x => ({ id: x.c.id, released: x.c.despues, calendario: !!(x.cal && x.cal.checked) }));
          if (!cambios.length) return true;
          try {
            const res = await K.post('/api/games/resync/aplica', { cambios });
            await C.load(); C.logros();
            K.bus.emit('calendar');
            K.toast(`${res.aplicados} fecha${res.aplicados === 1 ? '' : 's'} actualizada${res.aplicados === 1 ? '' : 's'}` + (res.movidos ? ` · ${res.movidos} en el calendario` : ''));
          } catch (e) { K.fail(e); return false; }
          return true;
        },
      }],
    });
  }

  Object.assign(C, { resincroniza });
})();
