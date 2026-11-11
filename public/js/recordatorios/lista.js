'use strict';
/* Recordatorios · pantalla principal: avisos del dispositivo, pendientes agrupados por cuándo y hechos. */
(function () {
  if (!window.K || !K.recordatorios) return;
  const R = K.recordatorios, S = R.S;
  const root = document.getElementById('view-recordatorios');
  const btn = (texto, ic, fn, cls = 'btn') => { const b = el('button', cls); b.type = 'button'; if (ic) b.appendChild(icon(ic)); if (texto) b.appendChild(el('span', null, texto)); b.addEventListener('click', fn); return b; };
  const porMomento = (a, b) => (R.momento(a) || 0) - (R.momento(b) || 0) || a.titulo.localeCompare(b.titulo, 'es');

  // Grupos de pendientes: vencidos, hoy, mañana, resto por día y sin fecha
  function grupos() {
    const g = [['Vencidos', 'vencido', []], ['Hoy', 'hoy', []], ['Mañana', 'proximo', []], ['Más adelante', 'proximo', []], ['Sin fecha', 'sinfecha', []]];
    for (const r of R.pendientes().sort(porMomento)) {
      const e = R.estado(r);
      if (e === 'vencido') g[0][2].push(r); else if (e === 'hoy') g[1][2].push(r); else if (e === 'sinfecha') g[4][2].push(r);
      else (R.dia(r.fecha) === 'Mañana' ? g[2] : g[3])[2].push(r);
    }
    return g.filter(x => x[2].length);
  }

  // Aviso de este dispositivo: activar, o explicar por qué no se puede
  async function franjaAvisos(caja) {
    const e = await R.estadoAvisos();
    if (e.estado === 'activos' || e.estado === 'error') return;
    const t = {
      desactivados: ['Este dispositivo no recibe avisos', 'Actívalos para que el navegador te avise a la hora de cada recordatorio, aunque la app esté cerrada.'],
      bloqueado: ['Los avisos están bloqueados en el navegador', 'Permite las notificaciones de este sitio en los ajustes del navegador (el candado junto a la dirección) y vuelve aquí.'],
      'sin-soporte': ['Este navegador no admite avisos', e.motivo || 'Los recordatorios se muestran dentro de la app mientras está abierta.'],
    }[e.estado];
    const f = el('div', 'rc-franja'); const x = el('div'); x.append(el('b', null, t[0]), el('small', 'k-muted', t[1])); f.appendChild(x);
    if (e.estado === 'desactivados') f.appendChild(btn('Activar avisos', 'i-bell', () => { R.activaAvisos().then(() => R.pinta()).catch(K.fail); }, 'btn primary sm'));
    caja.appendChild(f);
  }

  R.pinta = function () {
    if (!root || !S.cargado) return;
    root.textContent = '';
    const page = el('section', 'rc-page'); root.appendChild(page);
    const cab = el('header', 'rc-head'); const t = el('div');
    t.append(el('h1', null, 'Recordatorios'), el('p', 'k-muted', 'Lo que no quieres olvidar, con aviso en el navegador'));
    cab.append(t, btn('Nuevo recordatorio', 'i-plus', () => R.editor(null), 'btn primary')); page.appendChild(cab);
    const aviso = el('div', 'rc-avisos'); page.appendChild(aviso); franjaAvisos(aviso).catch(() => {});

    const pend = R.pendientes(), hechos = S.items.filter(r => r.hecho).sort((a, b) => (b.hechoEn || 0) - (a.hechoEn || 0));
    const seg = el('div', 'seg rc-seg');
    [['pendientes', `Pendientes · ${pend.length}`], ['hechos', `Hechos · ${hechos.length}`]].forEach(([k, n]) => {
      const b = el('button', S.filtro === k ? 'is-active' : '', n); b.type = 'button'; b.addEventListener('click', () => { S.filtro = k; R.pinta(); }); seg.appendChild(b);
    });
    page.appendChild(seg);

    if (!S.items.length) {
      const v = el('div', 'rc-vacio'); v.append(el('h2', null, 'Aún no tienes recordatorios'), el('p', 'k-muted', 'Crea uno aquí, o desde una nota, un contacto, un archivo o un prompt con el botón «Recordar».'), btn('Crear el primero', 'i-plus', () => R.editor(null), 'btn primary'));
      page.appendChild(v); return;
    }
    if (S.filtro === 'hechos') {
      const c = el('div', 'rc-grupo');
      if (!hechos.length) c.appendChild(el('p', 'k-muted rc-nada', 'Todavía no has completado ninguno.')); else hechos.forEach(r => c.appendChild(R.fila(r)));
      page.appendChild(c); return;
    }
    const gs = grupos();
    if (!gs.length) { page.appendChild(el('p', 'k-muted rc-nada', 'Todo al día: no tienes nada pendiente. 🎉')); return; }
    for (const [nombre, estado, lista] of gs) {
      const c = el('section', 'rc-grupo ' + estado);
      c.appendChild(el('h3', null, `${nombre} · ${lista.length}`));
      lista.forEach(r => c.appendChild(R.fila(r)));
      page.appendChild(c);
    }
  };
})();
