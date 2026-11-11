'use strict';
/* games/tarjetas.js: parte del módulo (se carga con el resto de games/ en index.html). Comparte el espacio K._games. */
(function () {
  const C = (K._games = K._games || {});
  const { NOMBRE } = C;
  const nf = (...a) => C.nf(...a);
  const portada = (...a) => C.portada(...a);
  const resumenStats = (...a) => C.resumenStats(...a);

  /* ---------- Tarjetas para compartir ---------- */
  const cargaImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function texto(x, t, px, y, ancho, lineas, alto) {
    const pal = String(t).split(/\s+/); const ls = []; let cur = '';
    for (const p of pal) { const prueba = cur ? cur + ' ' + p : p; if (x.measureText(prueba).width > ancho && cur) { ls.push(cur); cur = p; } else cur = prueba; }
    if (cur) ls.push(cur);
    ls.slice(0, lineas).forEach((l, i) => { let s = l; if (i === lineas - 1 && ls.length > lineas) s = l.replace(/.{0,2}$/, '…'); x.fillText(s, px, y + i * alto); });
    return Math.min(ls.length, lineas) * alto;
  }
  async function lienzo() {
    const G = K.game; if (!G.state) await G.load();
    const { rr, FUENTE } = G.dibujo; const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const rango = G.state.rango || { color: '#22d3ee', nombre: '' };
    const f = x.createLinearGradient(0, 0, W, H); f.addColorStop(0, '#0a0f24'); f.addColorStop(1, '#060814'); x.fillStyle = f; x.fillRect(0, 0, W, H);
    const b = x.createRadialGradient(W / 2, 420, 20, W / 2, 420, 760); b.addColorStop(0, rango.color + '40'); b.addColorStop(1, 'transparent'); x.fillStyle = b; x.fillRect(0, 0, W, H);
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.12)'; rr(x, 24, 24, W - 48, H - 48, 42); x.stroke();
    x.textAlign = 'center'; x.fillStyle = '#9fb0d6'; x.font = `600 32px ${FUENTE}`; x.fillText('KOOKYECATCLOUD · JUEGOS', W / 2, 100);
    return { cv, x, G, rr, FUENTE, W, H, rango, usuario: (state.user && state.user.username) || '' };
  }
  function pildora(x, rr, FUENTE, t, cx, cy, color) {
    x.font = `600 30px ${FUENTE}`; const w = x.measureText(t).width + 44;
    x.fillStyle = color + '33'; rr(x, cx - w / 2, cy - 30, w, 60, 30); x.fill(); x.fillStyle = color; x.textAlign = 'center'; x.fillText(t, cx, cy + 11); return w;
  }
  async function tarjetaJuego(g) {
    try {
      const { cv, x, G, rr, FUENTE, W, H, rango, usuario } = await lienzo();
      const img = g.cover ? await cargaImg(portada(g)) : null;
      const cw = 520, ch = 690, cx0 = (W - cw) / 2, cy0 = 150;
      x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 50; x.shadowOffsetY = 20; x.fillStyle = '#111936'; rr(x, cx0, cy0, cw, ch, 28); x.fill(); x.restore();
      x.save(); rr(x, cx0, cy0, cw, ch, 28); x.clip();
      if (img) { const r = Math.max(cw / img.width, ch / img.height); const dw = img.width * r, dh = img.height * r; x.drawImage(img, cx0 + (cw - dw) / 2, cy0 + (ch - dh) / 2, dw, dh); }
      else { const gr = x.createLinearGradient(cx0, cy0, cx0 + cw, cy0 + ch); gr.addColorStop(0, rango.color + '88'); gr.addColorStop(1, '#1b2350'); x.fillStyle = gr; x.fillRect(cx0, cy0, cw, ch); x.fillStyle = 'rgba(255,255,255,.85)'; x.font = `800 260px ${FUENTE}`; x.textAlign = 'center'; x.fillText(Array.from(g.title)[0]?.toLocaleUpperCase('es') || '?', W / 2, cy0 + ch / 2 + 90); }
      x.restore();
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `800 56px ${FUENTE}`;
      let y = cy0 + ch + 80; y += texto(x, g.title, W / 2, y, W - 160, 2, 62);
      const meta = [(g.platforms || []).slice(0, 3).join(' · '), (g.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join('  |  ');
      x.fillStyle = '#9fb0d6'; x.font = `500 30px ${FUENTE}`; if (meta) { x.fillText(meta.length > 60 ? meta.slice(0, 58) + '…' : meta, W / 2, y); y += 56; } else y += 10;
      // Datos clave
      const bloques = [];
      if (g.rating != null) bloques.push([`★ ${nf(g.rating)}`, 'MI NOTA', '#facc15']);
      if (g.hours) bloques.push([`${nf(g.hours)} h`, 'JUGADAS', '#22d3ee']);
      bloques.push([NOMBRE[g.status].toUpperCase(), 'ESTADO', '#a855f7']);
      if (g.percent) bloques.push([`${g.percent}%`, 'COMPLETADO', '#22c55e']);
      const n = Math.min(4, bloques.length), bw = 230, sep = 20, tot = n * bw + (n - 1) * sep; let bx = (W - tot) / 2;
      bloques.slice(0, n).forEach(([v, e, c]) => {
        x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, bx, y, bw, 120, 22); x.fill();
        x.fillStyle = c; x.font = `800 ${v.length > 8 ? 30 : 42}px ${FUENTE}`; x.textAlign = 'center'; x.fillText(v, bx + bw / 2, y + 60);
        x.fillStyle = '#9fb0d6'; x.font = `600 20px ${FUENTE}`; x.fillText(e, bx + bw / 2, y + 96); bx += bw + sep;
      });
      y += 175;
      if (g.review) { x.fillStyle = '#dbe4ff'; x.font = `italic 500 30px ${FUENTE}`; texto(x, `«${g.review.replace(/\s+/g, ' ')}»`, W / 2, y, W - 200, 3, 42); }
      x.fillStyle = '#6f7fa8'; x.font = `500 28px ${FUENTE}`; x.textAlign = 'center'; x.fillText(`${usuario} · Nivel ${G.state.nivel} · ${rango.nombre}`, W / 2, H - 70);
      await G.muestraTarjeta(cv, `juego-${g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'juego'}.png`, 'Tarjeta del juego');
    } catch (e) { K.fail(e); }
  }
  async function tarjetaPerfil() {
    try {
      const { cv, x, G, rr, FUENTE, W, H, rango, usuario } = await lienzo();
      const s = resumenStats(); const tr = await G.trazados(); const { num } = G.dibujo;
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `800 64px ${FUENTE}`; x.fillText(usuario || 'Jugador', W / 2, 190);
      x.fillStyle = rango.color; x.font = `600 34px ${FUENTE}`; x.fillText(`Nivel ${G.state.nivel} · ${rango.nombre}`, W / 2, 240);
      const kp = [[String(s.total), 'JUEGOS', '#22d3ee'], [String(s.jugados), 'JUGADOS', '#22c55e'], [num ? num(Math.round(s.horas)) : String(Math.round(s.horas)), 'HORAS', '#facc15'], [s.media != null ? nf(s.media) : '–', 'NOTA MEDIA', '#a855f7']];
      kp.forEach(([v, e, c], i) => {
        const bw = 235, sep = 20, bx = (W - (4 * bw + 3 * sep)) / 2 + i * (bw + sep), by = 290;
        x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, bx, by, bw, 150, 24); x.fill();
        x.fillStyle = c; x.font = `800 56px ${FUENTE}`; x.textAlign = 'center'; x.fillText(v, bx + bw / 2, by + 78);
        x.fillStyle = '#9fb0d6'; x.font = `600 22px ${FUENTE}`; x.fillText(e, bx + bw / 2, by + 120);
      });
      // Géneros favoritos
      x.textAlign = 'left'; x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('GÉNEROS CON MÁS HORAS', 90, 520);
      const gens = s.generos.slice(0, 4), max = Math.max(1, ...gens.map(g => g[1]));
      gens.forEach(([n, v], i) => {
        const by = 560 + i * 62; x.fillStyle = 'rgba(255,255,255,.07)'; rr(x, 90, by, 900, 44, 22); x.fill();
        x.fillStyle = ['#22d3ee', '#a855f7', '#facc15', '#22c55e'][i]; rr(x, 90, by, Math.max(44, 900 * v / max), 44, 22); x.fill();
        x.fillStyle = '#06101f'; x.font = `700 24px ${FUENTE}`; x.fillText(n.slice(0, 26), 110, by + 31);
        x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(nf(v) + ' h', 975, by + 31); x.textAlign = 'left';
      });
      if (!gens.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Aún sin horas por género', 90, 600); }
      // Carátulas mejor valoradas
      x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('MIS MEJOR VALORADOS', 90, 860);
      const imgs = await Promise.all(s.top.slice(0, 5).map(g => g.cover ? cargaImg(portada(g)) : null));
      s.top.slice(0, 5).forEach((g, i) => {
        const cw = 180, ch = 240, gap = 0, bx = 90 + i * (cw + 22), by = 890;
        x.save(); rr(x, bx, by, cw, ch, 18); x.clip(); x.fillStyle = '#1b2350'; x.fillRect(bx, by, cw, ch);
        const im = imgs[i];
        if (im) { const r = Math.max(cw / im.width, ch / im.height); x.drawImage(im, bx + (cw - im.width * r) / 2, by + (ch - im.height * r) / 2, im.width * r, im.height * r); }
        else { x.fillStyle = '#fff'; x.font = `800 80px ${FUENTE}`; x.textAlign = 'center'; x.fillText(Array.from(g.title)[0]?.toLocaleUpperCase('es') || '?', bx + cw / 2, by + 140); x.textAlign = 'left'; }
        x.restore();
        x.fillStyle = 'rgba(0,0,0,.72)'; rr(x, bx + 8, by + 8, 84, 40, 20); x.fill(); x.fillStyle = '#facc15'; x.font = `800 24px ${FUENTE}`; x.textAlign = 'center'; x.fillText('★ ' + nf(g.rating), bx + 50, by + 36); x.textAlign = 'left';
        void gap;
      });
      if (!s.top.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Valora tus juegos para verlos aquí', 90, 960); }
      // Logros de juegos
      const L = G.state.logros || {};
      const logr = [...(L.familias || []).filter(l => l.grupo === 'Juegos' && l.tramos > 0).map(l => ({ icono: l.icono, tramo: l.tramos, g: 'Juegos' })),
        ...(L.especiales || []).filter(l => ['retro', 'plataformas', 'sesion'].includes(l.id) && l.cuando).map(l => ({ icono: l.icono, tramo: 5, g: 'Especiales' }))].slice(0, 6);
      x.fillStyle = '#9fb0d6'; x.font = `700 28px ${FUENTE}`; x.fillText('LOGROS DE JUEGOS', 90, 1170);
      logr.forEach((l, i) => { G.dibujo.medalla(x, tr, l.icono, 130 + i * 160, 1235, 100, G.dibujo.TRAMO_COLOR[Math.max(0, Math.min(4, l.tramo - 1))], l.g); });
      if (!logr.length) { x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('Añade juegos para desbloquear logros', 90, 1225); }
      x.textAlign = 'center'; x.fillStyle = '#6f7fa8'; x.font = `500 26px ${FUENTE}`; x.fillText('KookyeCatCloud', W / 2, H - 50);
      await G.muestraTarjeta(cv, 'mi-perfil-gamer.png', 'Mi perfil de jugador');
    } catch (e) { K.fail(e); }
  }


  Object.assign(C, { cargaImg, texto, lienzo, pildora, tarjetaJuego, tarjetaPerfil });
})();
