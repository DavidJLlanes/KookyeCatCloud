'use strict';
/* Tarjeta «Avisos» de Cuenta: activar en este dispositivo, qué secciones avisan, a qué hora y cuándo no molestar. */
(function () {
  const caja = document.getElementById('push-ctl');
  if (!caja || !window.K || !K.push) return;
  const P = K.push;
  const DIAS = [[0, 'El mismo día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [7, '1 semana antes'], [14, '2 semanas antes'], [30, '1 mes antes']];

  const interruptor = (texto, activo, alCambiar, ayuda) => {
    const l = el('label', 'k-switch'), i = el('input'); i.type = 'checkbox'; i.checked = activo;
    const t = el('span', null, texto); l.append(i, el('span', 'track'), t);
    if (ayuda) l.appendChild(el('small', 'k-faint pu-ayuda', ayuda));
    i.addEventListener('change', () => alCambiar(i.checked, i));
    return l;
  };
  const hora = (valor, etiqueta, alCambiar) => {
    const w = el('label', 'pu-hora'), i = el('input'); i.type = 'time'; i.value = valor; i.required = true; i.setAttribute('aria-label', etiqueta);
    i.addEventListener('change', () => { if (i.value) alCambiar(i.value); });
    w.append(el('span', null, etiqueta), i); return w;
  };
  async function guarda(cambios, volver = true) {
    try { await P.guarda(cambios); if (K.game && K.game.load) K.game.load(); } catch (e) { K.fail(e); if (volver) pinta(); }
  }

  function seccion(titulo, ayuda, clave, cuerpo) {
    const a = P.cfg.ajustes[clave], c = el('div', 'pu-sec');
    c.appendChild(interruptor(titulo, a.on, (v) => { guarda({ [clave]: { on: v } }, true).then(pinta); }, ayuda));
    if (a.on) { const k = el('div', 'pu-opc'); cuerpo(k, a); c.appendChild(k); }
    return c;
  }

  function pinta() {
    caja.textContent = '';
    const sop = P.soporte(), cfg = P.cfg, a = cfg.ajustes;
    if (!sop.ok) { caja.appendChild(el('p', 'k-faint', sop.motivo)); return; }
    const activo = !!P.mio;
    caja.appendChild(interruptor('Avisos en este dispositivo', activo, async (v, i) => {
      i.disabled = true;
      try { if (v) { await P.activa(); K.toast('Avisos activados en este dispositivo'); } else { await P.desactiva(); K.toast('Avisos desactivados en este dispositivo'); } }
      catch (e) { K.fail(e); }
      pinta();
    }, 'Llegan aunque la app esté cerrada.'));
    if (!activo && !cfg.dispositivos.length) { caja.appendChild(el('p', 'k-faint', 'Actívalos para elegir qué quieres que te avise y a qué hora.')); return; }

    const cuerpo = el('div', 'pu-cuerpo'); caja.appendChild(cuerpo);
    cuerpo.appendChild(interruptor('Recibir avisos', a.on, (v) => guarda({ on: v }).then(pinta), 'Interruptor general: apagado, no suena nada en ningún dispositivo.'));
    if (!a.on) return;
    cuerpo.appendChild(interruptor('Mostrar el detalle en el aviso', a.detalles, (v) => guarda({ detalles: v }, false), 'Apagado, el aviso solo dice «Tienes un pago por vencer». Encendido, incluye el nombre y el importe (el texto pasa por los servidores de Google, Apple o Mozilla).'));

    cuerpo.appendChild(el('h4', 'ap-h', 'Qué avisa'));
    cuerpo.appendChild(seccion('Pagos', 'Antes del vencimiento (los días de «Avisar» de cada pago), el mismo día y si ha vencido.', 'pagos', (k, s) => {
      k.append(hora(s.hora, 'Hora del aviso', (v) => guarda({ pagos: { hora: v } }, false)),
        interruptor('Avisar el mismo día del vencimiento', s.mismoDia, (v) => guarda({ pagos: { mismoDia: v } }, false)),
        interruptor('Avisar si un pago ha vencido (hasta 7 días)', s.vencidos, (v) => guarda({ pagos: { vencidos: v } }, false)));
    }));
    cuerpo.appendChild(seccion('Calendario', 'Los recordatorios de cada evento o tarea («15 min antes», «1 día antes»…).', 'calendario', (k, s) => {
      k.appendChild(hora(s.hora, 'Hora para eventos de todo el día', (v) => guarda({ calendario: { hora: v } }, false)));
      k.appendChild(el('small', 'k-faint', 'Los eventos con hora avisan cuando marque su recordatorio. Añade recordatorios al editar el evento.'));
    }));
    cuerpo.appendChild(seccion('Recordatorios', 'Cada recordatorio avisa cuando le toca (a su hora, o con la antelación que elegiste al crearlo).', 'recordatorios', (k, s) => {
      k.appendChild(hora(s.hora, 'Hora para los de todo el día', (v) => guarda({ recordatorios: { hora: v } }, false)));
    }));
    cuerpo.appendChild(seccion('Contactos', 'Cumpleaños y otras fechas de tus contactos.', 'contactos', (k, s) => {
      k.appendChild(hora(s.hora, 'Hora del aviso', (v) => guarda({ contactos: { hora: v } }, false)));
      const g = el('div', 'pu-dias'); g.appendChild(el('span', null, 'Avisar'));
      DIAS.forEach(([n, texto]) => {
        const b = el('label', 'pu-dia'), i = el('input'); i.type = 'checkbox'; i.checked = s.dias.includes(n);
        i.addEventListener('change', () => {
          const sel = [...g.querySelectorAll('input:checked')].map((x) => Number(x.dataset.n));
          guarda({ contactos: { dias: sel } }, true);
        });
        i.dataset.n = String(n); b.append(i, el('span', null, texto)); g.appendChild(b);
      });
      k.appendChild(g);
    }));

    cuerpo.appendChild(el('h4', 'ap-h', 'No molestar'));
    const si = a.silencio, sil = el('div', 'pu-sec');
    sil.appendChild(interruptor('Horario de silencio', si.on, (v) => guarda({ silencio: { on: v } }).then(pinta), 'Lo que caiga en estas horas llega al terminar (los eventos del calendario, hasta 12 horas después).'));
    if (si.on) { const k = el('div', 'pu-opc pu-fila'); k.append(hora(si.desde, 'Desde', (v) => guarda({ silencio: { desde: v } }, false)), hora(si.hasta, 'Hasta', (v) => guarda({ silencio: { hasta: v } }, false))); sil.appendChild(k); }
    cuerpo.appendChild(sil);

    cuerpo.appendChild(el('h4', 'ap-h', 'Dispositivos'));
    const lista = el('div', 'pu-disp');
    cfg.dispositivos.forEach((d) => {
      const f = el('div', 'pu-d'), t = el('div', 'pu-dt'); t.append(el('b', null, d.nombre + (d.id === P.mio ? ' (este)' : '')), el('small', 'k-faint', 'Desde ' + new Date(d.creada).toLocaleDateString('es-ES')));
      const q = el('button', 'btn'); q.type = 'button'; q.textContent = 'Quitar';
      q.addEventListener('click', async () => {
        try { if (d.id === P.mio) await P.desactiva(); else { const r = await K.del('/api/push/dispositivos/' + d.id); cfg.dispositivos = r.dispositivos; } } catch (e) { K.fail(e); }
        pinta();
      });
      f.append(t, q); lista.appendChild(f);
    });
    cuerpo.appendChild(lista);
    const prueba = el('button', 'btn primary'); prueba.type = 'button'; prueba.textContent = 'Enviarme un aviso de prueba';
    prueba.addEventListener('click', async () => { prueba.disabled = true; try { await K.post('/api/push/prueba'); K.toast('Aviso enviado: debería llegar en unos segundos'); } catch (e) { K.fail(e); } prueba.disabled = false; });
    cuerpo.appendChild(prueba);
  }

  P.tarjeta = async function () {
    try { await P.carga(); await P.reconoce(); pinta(); } catch (e) { caja.textContent = ''; caja.appendChild(el('p', 'k-faint', 'No se pudieron cargar los avisos. ' + (e && e.message ? e.message : ''))); }
  };
})();
