'use strict';
/* Tarjeta «Sonidos» de Cuenta: interruptor general, volumen, paquete y qué cosas suenan. Se guarda en este dispositivo. */
(function () {
  const caja = document.getElementById('sonidos-ctl');
  if (!caja || !window.K || !K.sonidos || !K.sonidos.ajustes) return;
  const S = K.sonidos;
  const GRUPOS = [['ui', 'Interfaz', 'Botones principales, pestañas, casillas y ventanas', 'toque'], ['avisos', 'Avisos', 'Mensajes, errores y confirmaciones', 'aviso'], ['logros', 'Logros', 'Insignias y subidas de nivel', 'logro']];

  const interruptor = (texto, activo, alCambiar) => {
    const l = el('label', 'k-switch'), i = el('input'); i.type = 'checkbox'; i.checked = activo;
    l.append(i, el('span', 'track'), el('span', null, texto));
    i.addEventListener('change', () => alCambiar(i.checked));
    return l;
  };

  function pinta() {
    const a = S.ajustes();
    caja.textContent = '';
    caja.appendChild(interruptor('Sonidos de la aplicación', a.on, (v) => { S.cambia({ on: v }); if (v) S.prueba('ok'); pinta(); }));
    const cuerpo = el('div', 'sn-cuerpo'); cuerpo.hidden = !a.on; caja.appendChild(cuerpo);

    const vol = el('div', 'sn-vol');
    const rng = el('input'); rng.type = 'range'; rng.min = '0'; rng.max = '100'; rng.step = '5'; rng.value = String(Math.round(a.vol * 100)); rng.setAttribute('aria-label', 'Volumen de los sonidos');
    const pct = el('output', 'k-faint', `${rng.value} %`);
    rng.addEventListener('input', () => { pct.textContent = `${rng.value} %`; S.cambia({ vol: rng.value / 100 }); });
    rng.addEventListener('change', () => S.prueba('aviso'));
    vol.append(el('span', null, 'Volumen'), rng, pct); cuerpo.appendChild(vol);

    cuerpo.appendChild(el('h4', 'ap-h', 'Estilo'));
    const rejilla = el('div', 'sn-paquetes');
    Object.entries(S.PAQUETES).forEach(([id, p]) => {
      const b = el('button', 'sn-paquete' + (a.paquete === id ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(a.paquete === id));
      b.append(el('b', null, p.nombre), el('small', 'k-faint', p.desc));
      b.addEventListener('click', () => { S.cambia({ paquete: id }); pinta(); S.prueba('ok'); });
      rejilla.appendChild(b);
    });
    cuerpo.appendChild(rejilla);

    cuerpo.appendChild(el('h4', 'ap-h', 'Qué suena'));
    GRUPOS.forEach(([id, nombre, ayuda, ejemplo]) => {
      const f = el('div', 'sn-fila');
      const t = el('div', 'sn-texto'); t.append(el('b', null, nombre), el('small', 'k-faint', ayuda));
      const prueba = el('button', 'icon-btn'); prueba.type = 'button'; prueba.title = `Oír «${nombre}»`; prueba.setAttribute('aria-label', `Oír el sonido de ${nombre}`); prueba.appendChild(icon('i-play'));
      prueba.addEventListener('click', () => S.prueba(ejemplo));
      f.append(interruptor('', a.grupos[id], (v) => S.cambia({ grupos: { [id]: v } })), t, prueba); cuerpo.appendChild(f);
    });
  }
  pinta();
})();
