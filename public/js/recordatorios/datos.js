'use strict';
/* Recordatorios · datos y utilidades compartidas (todo cuelga de K.recordatorios). */
(function () {
  if (!window.K) return;
  const R = K.recordatorios = { S: { items: [], cargado: false, filtro: 'pendientes' } };
  const S = R.S;

  // A qué se pueden atar: [nombre, icono]. «abrir» usa K.openers de cada sección.
  R.TIPOS = { note: ['Nota', 'i-note'], contact: ['Contacto', 'i-contact'], file: ['Archivo', 'i-folder'], prompt: ['Prompt', 'i-sparkle'], marcador: ['Marcador', 'i-bookmark'] };
  R.ANTES = [[0, 'A la hora'], [10, '10 minutos antes'], [60, '1 hora antes'], [1440, '1 día antes'], [-1, 'Sin aviso']];
  R.HORA_DIA = '09:00';          // hora a la que avisan los de todo el día (se cambia en Cuenta → Avisos)

  R.momento = (r) => (r.fecha ? K.d.parse(`${r.fecha}T${r.hora || '00:00'}`) : null);
  // Cuándo suena el aviso de un recordatorio (null: nunca)
  R.momentoAviso = (r) => (r.fecha && r.antes >= 0 ? new Date(K.d.parse(`${r.fecha}T${r.hora || R.HORA_DIA}`).getTime() - r.antes * 60000) : null);
  R.estado = (r) => {
    if (r.hecho) return 'hecho';
    if (!r.fecha) return 'sinfecha';
    const ahora = new Date(), hoy = K.d.ymd(ahora);
    if (r.hora ? R.momento(r) < ahora : r.fecha < hoy) return 'vencido';
    return r.fecha === hoy ? 'hoy' : 'proximo';
  };
  R.dia = (fecha) => {
    const d = K.d.parse(fecha), n = K.d.diffDays(K.d.day(new Date()), d);
    if (n === 0) return 'Hoy'; if (n === 1) return 'Mañana'; if (n === -1) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  R.cuando = (r) => (r.fecha ? `${R.dia(r.fecha)}${r.hora ? ', ' + r.hora : ''}` : 'Sin fecha');
  R.pendientes = () => S.items.filter(r => !r.hecho);

  R.logros = K.debounce(() => { if (K.game && K.game.load) K.game.load(); }, 500);
  R.carga = async function () {
    const d = await K.get('/api/recordatorios');
    S.items = d.recordatorios || []; S.cargado = true;
    R.badge();
    return S;
  };
  // Tras cambiar algo: se vuelve a pedir la lista y se avisa a las vistas que dependen de ella (el calendario si el recordatorio sale allí)
  R.cambio = async function (conCalendario) {
    await R.carga(); if (R.pinta) R.pinta(); R.logros();
    if (conCalendario) K.bus.emit('calendar');
  };

  R.abreVinculo = (v) => { if (v) K.open(v.tipo, v.ref); };
})();
