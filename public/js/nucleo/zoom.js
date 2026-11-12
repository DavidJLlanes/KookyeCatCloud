/* ==========================================================================
   Zoom de imágenes (rueda, pellizco con dos dedos, doble toque y arrastre) y un
   visor sencillo para las fotos de la sección Prompts.

   - KZoom.attach(escenario, img, opciones) → { reset, zoomed, scale, destroy }
     Añade el zoom a una imagen que ya está dentro de un contenedor (lo usa el visor
     de la galería). Sin dependencias; usa eventos de puntero, que cubren ratón,
     táctil y lápiz con el mismo código.
   - KZoom.lightbox({ items, index, title }) → { close }
     Visor a pantalla completa con zoom, flechas, deslizar para cambiar de foto y Esc.
   ========================================================================== */
(function () {
  'use strict';

  const MIN = 1;
  const MAX = 8;
  const DOBLE = 2.5;       // aumento del doble toque / doble clic
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function attach(stage, img, opts) {
    opts = opts || {};
    let s = 1, x = 0, y = 0;                // escala y desplazamiento (px) desde el centro
    const punteros = new Map();             // id → {x, y}
    let pinch = null;                       // estado inicial del gesto de pellizco
    let arrastre = null;                    // estado inicial del arrastre con un dedo
    let ultimoToque = { t: 0, x: 0, y: 0 };
    let inicio = null;                      // para distinguir un toque de un arrastre
    let suprimido = 0;                      // instante del último arrastre, para filtrar su clic
    let vivo = true;

    img.classList.add('kz-img');
    img.draggable = false;
    const antes = stage.style.touchAction;
    stage.style.touchAction = 'none';       // el zoom gestiona los gestos, no el navegador

    const aplica = () => {
      img.style.transform = s === 1 && !x && !y ? '' : `translate(${x}px,${y}px) scale(${s})`;
      img.classList.toggle('is-zoomed', s > 1.001);
    };

    // Centro de la imagen sin transformar y tamaño base, calculados a partir de lo que se ve ahora
    const geometria = () => {
      const r = img.getBoundingClientRect();
      const e = stage.getBoundingClientRect();
      return {
        cx: r.left + r.width / 2 - x, cy: r.top + r.height / 2 - y,
        w: r.width / s, h: r.height / s,
        sx: e.left + e.width / 2, sy: e.top + e.height / 2, vw: e.width, vh: e.height,
      };
    };

    // Impide dejar la imagen fuera de la pantalla: con la imagen más pequeña que el hueco se centra
    const limita = (g) => {
      const W = g.w * s, H = g.h * s;
      const mx = Math.max(0, (W - g.vw) / 2), my = Math.max(0, (H - g.vh) / 2);
      const ox = g.sx - g.cx, oy = g.sy - g.cy;
      x = W <= g.vw ? ox : clamp(x, ox - mx, ox + mx);
      y = H <= g.vh ? oy : clamp(y, oy - my, oy + my);
    };

    // Cambia la escala manteniendo quieto el punto (px, py) de la pantalla
    const zoomEn = (nueva, px, py) => {
      const g = geometria();
      nueva = clamp(nueva, MIN, MAX);
      const dx = (px - g.cx - x) / s, dy = (py - g.cy - y) / s;   // punto en coordenadas de la imagen
      x = px - g.cx - dx * nueva;
      y = py - g.cy - dy * nueva;
      s = nueva;
      if (s <= MIN + 0.001) { s = 1; x = 0; y = 0; } else limita(g);
      aplica();
    };

    const reset = () => { s = 1; x = 0; y = 0; aplica(); };

    const onWheel = (e) => {
      if (e.target.closest && e.target.closest('.lb-nav, .lb-top')) return;
      e.preventDefault();
      // ctrlKey es el pellizco del trackpad: llega con saltos pequeños y necesita más ganancia
      const k = e.ctrlKey ? 0.012 : 0.0018;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomEn(s * Math.exp(-dy * k), e.clientX, e.clientY);
    };

    const onDown = (e) => {
      if (e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya liberado */ }
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 1) {
        inicio = { x: e.clientX, y: e.clientY, t: Date.now(), movido: false };
        arrastre = { px: e.clientX, py: e.clientY, x, y };
      } else if (punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        arrastre = null;
        if (inicio) { inicio.movido = true; inicio.multi = true; }
      }
    };

    const onMove = (e) => {
      if (!punteros.has(e.pointerId)) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 8) inicio.movido = true;
      if (punteros.size >= 2 && pinch) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // Escala por la separación de los dedos y arrastre por el movimiento del punto medio
        zoomEn(pinch.s * d / pinch.d, mx, my);
        if (s > 1) {
          // La geometría se toma ANTES de mover: se deduce del rectángulo que se ve ahora, que
          // todavía corresponde al desplazamiento anterior
          const g = geometria();
          x += mx - pinch.mx; y += my - pinch.my;
          limita(g); aplica();
        }
        pinch.mx = mx; pinch.my = my;
      } else if (punteros.size === 1 && arrastre && s > 1) {
        const g = geometria();
        x = arrastre.x + (e.clientX - arrastre.px);
        y = arrastre.y + (e.clientY - arrastre.py);
        limita(g);
        aplica();
      }
    };

    const onUp = (e) => {
      if (!punteros.has(e.pointerId)) return;
      const eraUno = punteros.size === 1;
      punteros.delete(e.pointerId);
      try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }
      if (punteros.size < 2) pinch = null;
      if (punteros.size === 1) {            // al levantar un dedo del pellizco, el otro sigue arrastrando
        const [r] = [...punteros.values()];
        arrastre = { px: r.x, py: r.y, x, y };
      } else if (punteros.size === 0) arrastre = null;
      if (!eraUno || e.type === 'pointercancel' || !inicio) { if (!punteros.size) inicio = null; return; }

      const tap = !inicio.movido && Date.now() - inicio.t < 350;
      const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y;
      const t = inicio; inicio = null;
      if (!tap) suprimido = Date.now();     // el clic que sigue a un arrastre no debe cerrar el visor
      // Deslizar para cambiar de foto, solo sin zoom, con un dedo y un gesto claramente horizontal
      if (!tap && !t.multi && s === 1 && opts.onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        opts.onSwipe(dx < 0 ? 1 : -1);
        return;
      }
      if (!tap || e.target.closest('button, a')) return;
      // Doble toque / doble clic: alterna entre ajustada y ampliada en el punto tocado
      const ahora = Date.now();
      if (ahora - ultimoToque.t < 320 && Math.hypot(t.x - ultimoToque.x, t.y - ultimoToque.y) < 30) {
        ultimoToque = { t: 0, x: 0, y: 0 };
        if (s > 1) reset(); else zoomEn(DOBLE, t.x, t.y);
      } else {
        ultimoToque = { t: ahora, x: t.x, y: t.y };
      }
    };

    // Safari de escritorio y iOS antiguos: evita que el pellizco amplíe toda la página
    const noGesto = (e) => e.preventDefault();
    const onResize = () => { if (s > 1) { limita(geometria()); aplica(); } };
    // Con el puntero capturado, el clic posterior a un arrastre llega al escenario aunque se
    // soltara sobre la foto: se descarta para que no cierre el visor por accidente
    const onClicCaptura = (e) => {
      if (Date.now() - suprimido < 400) { e.stopImmediatePropagation(); e.preventDefault(); }
    };

    stage.addEventListener('click', onClicCaptura, true);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('gesturestart', noGesto);
    stage.addEventListener('gesturechange', noGesto);
    window.addEventListener('resize', onResize);

    return {
      reset,
      zoomed: () => s > 1.001,
      get scale() { return s; },
      destroy() {
        if (!vivo) return; vivo = false;
        stage.removeEventListener('click', onClicCaptura, true);
        stage.removeEventListener('wheel', onWheel);
        stage.removeEventListener('pointerdown', onDown);
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerup', onUp);
        stage.removeEventListener('pointercancel', onUp);
        stage.removeEventListener('gesturestart', noGesto);
        stage.removeEventListener('gesturechange', noGesto);
        window.removeEventListener('resize', onResize);
        stage.style.touchAction = antes;
        img.style.transform = '';
        img.classList.remove('kz-img', 'is-zoomed');
      },
    };
  }

  /* ---------- Visor sencillo (fotos de Prompts) ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  function ico(id) {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ico');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
  }
  function mk(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  let abierto = null;

  function lightbox({ items, index = 0, title = '' } = {}) {
    if (!items || !items.length) return null;
    if (abierto) abierto.close();
    let cur = clamp(index, 0, items.length - 1);
    let zoom = null;

    const root = mk('div', 'lightbox kz-lb');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title || 'Visor de imágenes');

    const top = mk('div', 'lb-top');
    const tit = mk('div', 'lb-title'); const nombre = mk('b', null, title); const cuenta = mk('span');
    tit.append(nombre, cuenta);
    const tools = mk('div', 'lb-tools');
    const cerrar = mk('button', 'icon-btn cerrar'); cerrar.type = 'button';
    cerrar.title = 'Cerrar (Esc)'; cerrar.setAttribute('aria-label', 'Cerrar'); cerrar.appendChild(ico('i-x'));
    tools.appendChild(cerrar); top.append(tit, tools);

    const stage = mk('div', 'lb-stage');
    const media = mk('div', 'lb-media');
    const multi = items.length > 1;
    const prev = mk('button', 'lb-nav prev'); prev.type = 'button'; prev.setAttribute('aria-label', 'Anterior'); prev.appendChild(ico('i-left'));
    const next = mk('button', 'lb-nav next'); next.type = 'button'; next.setAttribute('aria-label', 'Siguiente'); next.appendChild(ico('i-right'));
    prev.hidden = next.hidden = !multi;
    stage.append(prev, media, next);
    root.append(top, stage);

    const pinta = () => {
      if (zoom) { zoom.destroy(); zoom = null; }
      media.textContent = '';
      const it = items[cur];
      const img = mk('img'); img.alt = it.caption || title || ''; img.src = it.src;
      media.appendChild(img);
      zoom = attach(stage, img, { onSwipe: (d) => ir(d) });
      cuenta.textContent = [multi ? `${cur + 1} de ${items.length}` : '', it.caption || ''].filter(Boolean).join(' · ');
    };
    const ir = (d) => { if (!multi) return; cur = (cur + d + items.length) % items.length; pinta(); };

    const tecla = (e) => {
      if (e.key === 'Escape') cierra();
      else if (e.key === 'ArrowLeft') ir(-1);
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === '+' || e.key === '=') zoomTecla(1.4);
      else if (e.key === '-' || e.key === '_') zoomTecla(1 / 1.4);
      else if (e.key === '0') { if (zoom) zoom.reset(); }
      else return;
      // El visor va por encima de la ficha: sus teclas no deben llegar a ella (cerraría o cambiaría de prompt)
      e.preventDefault(); e.stopImmediatePropagation();
    };
    // Zoom con el teclado: simula un paso de rueda en el centro del escenario
    const zoomTecla = (factor) => {
      const r = stage.getBoundingClientRect();
      stage.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -Math.log(factor) / 0.0018, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        bubbles: true, cancelable: true,
      }));
    };

    const cierra = () => {
      if (!root.isConnected) return;
      window.removeEventListener('keydown', tecla, true);
      if (zoom) { zoom.destroy(); zoom = null; }
      root.remove();
      if (abierto === api) abierto = null;
      if (previo && previo.isConnected) { try { previo.focus({ preventScroll: true }); } catch (_) { /* sin foco */ } }
    };
    const api = { close: cierra };

    cerrar.addEventListener('click', cierra);
    prev.addEventListener('click', () => ir(-1));
    next.addEventListener('click', () => ir(1));
    // Tocar el fondo (fuera de la imagen) cierra, como en el visor de la galería
    // (se mira qué hay bajo el dedo, no e.target: con el puntero capturado el objetivo es siempre el escenario)
    stage.addEventListener('click', (e) => { if (document.elementFromPoint(e.clientX, e.clientY) === stage) cierra(); });

    const previo = document.activeElement;
    window.addEventListener('keydown', tecla, true);
    document.body.appendChild(root);
    pinta();
    cerrar.focus({ preventScroll: true });
    abierto = api;
    return api;
  }

  window.KZoom = { attach, lightbox };
})();
