'use strict';
/* Motor de sonidos: ajustes (se guardan en este dispositivo), contexto de audio y síntesis. Todo pasa por reproduce(evento). */
(function () {
  if (!window.K || !K.sonidos) return;
  const CLAVE = 'kcc-sonidos';
  const AMPLITUD = 0.12;          // techo del volumen: incluso con el control al máximo suena bajito
  const POR_DEFECTO = { on: true, vol: 0.4, paquete: 'suave', grupos: { ui: true, avisos: true, logros: true } };
  const S = K.sonidos;

  let ajustes = JSON.parse(JSON.stringify(POR_DEFECTO));
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g && typeof g === 'object') {
      ajustes = { on: g.on !== false, vol: Math.max(0, Math.min(1, Number(g.vol ?? 0.4))), paquete: S.PAQUETES[g.paquete] ? g.paquete : 'suave', grupos: { ...POR_DEFECTO.grupos, ...(g.grupos || {}) } };
    }
  } catch { /* sin almacenamiento o datos viejos: valores por defecto */ }
  const guarda = () => { try { localStorage.setItem(CLAVE, JSON.stringify(ajustes)); } catch { /* da igual */ } };

  let ac = null, maestro = null;
  const ultimo = {};
  function contexto() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      try { ac = new C(); maestro = ac.createGain(); maestro.connect(ac.destination); } catch { ac = null; return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  // Una nota: onda con ataque corto y caída exponencial (sin clics). Con `campana` suma un armónico que se apaga antes.
  function nota(t0, n, paquete) {
    const inicio = t0 + (n.at || 0), fin = inicio + n.d;
    const pico = (n.g || 0.5) * ajustes.vol * AMPLITUD;
    if (pico <= 0.0001) return;
    const voz = (frec, glide, onda, g, dur) => {
      const o = ac.createOscillator(), v = ac.createGain();
      o.type = onda; o.frequency.setValueAtTime(frec, inicio);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, inicio + dur);
      v.gain.setValueAtTime(0.0001, inicio);
      v.gain.exponentialRampToValueAtTime(g, inicio + 0.008);
      v.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
      o.connect(v); v.connect(maestro); o.start(inicio); o.stop(inicio + dur + 0.03);
    };
    voz(n.f, n.glide, n.onda || paquete.onda, pico, n.d);
    if (paquete.campana) voz(n.f * 2.76, n.glide ? n.glide * 2.76 : 0, 'sine', pico * 0.35, n.d * 0.5);
  }

  S.reproduce = function (evento) {
    try {
      if (!ajustes.on || ajustes.vol <= 0) return;
      const grupo = S.GRUPO[evento]; if (!grupo || !ajustes.grupos[grupo]) return;
      const ahora = performance.now();
      if (ahora - (ultimo[evento] || 0) < 70 || ahora - (ultimo.__todos || 0) < 25) return;     // sin ráfagas
      ultimo[evento] = ultimo.__todos = ahora;
      const p = S.PAQUETES[ajustes.paquete], notas = p && p.eventos[evento];
      if (!notas || !contexto()) return;
      const t0 = ac.currentTime + 0.005;
      notas.forEach(n => nota(t0, n, p));
    } catch { /* un sonido nunca debe romper la app */ }
  };
  // Para la pantalla de ajustes: suena aunque el grupo esté apagado
  S.prueba = function (evento) {
    const g = S.GRUPO[evento], antes = ajustes.grupos[g], on = ajustes.on;
    ajustes.on = true; ajustes.grupos[g] = true; ultimo[evento] = 0; ultimo.__todos = 0;
    S.reproduce(evento); ajustes.on = on; ajustes.grupos[g] = antes;
  };
  S.ajustes = () => JSON.parse(JSON.stringify(ajustes));
  S.cambia = function (cambios) {
    if ('on' in cambios) ajustes.on = !!cambios.on;
    if ('vol' in cambios) ajustes.vol = Math.max(0, Math.min(1, Number(cambios.vol) || 0));
    if ('paquete' in cambios && S.PAQUETES[cambios.paquete]) ajustes.paquete = cambios.paquete;
    if (cambios.grupos) Object.assign(ajustes.grupos, cambios.grupos);
    guarda();
  };
  // iOS y Chrome solo dejan sonar tras un gesto: el primer toque o tecla despierta el audio
  const despierta = () => { contexto(); };
  document.addEventListener('pointerdown', despierta, { once: true, capture: true });
  document.addEventListener('keydown', despierta, { once: true, capture: true });
})();
