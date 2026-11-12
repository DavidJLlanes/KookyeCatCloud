'use strict';
/* Foco y teclado de diálogos y menús (guías modern-web-guidance «dialog» y «menu»). Los diálogos son capas propias (K.modal),
   no <dialog>, así que lo que el navegador daría gratis se hace aquí: nombre accesible, foco inicial seguro, Tab que no se
   escapa a la página de detrás, foco de vuelta a quien abrió el diálogo y, en los menús, roles y flechas.
   Esc, clic fuera y «cambios sin guardar» ya los resuelve K.modal en kit.js. */
(function () {
  if (!window.K) return;
  let n = 0;
  const FOCABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const focables = (raiz) => [...raiz.querySelectorAll(FOCABLE)].filter(visible);
  const CAMPOS = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),textarea,select';
  const puntero = () => { try { return matchMedia('(pointer:fine)').matches; } catch { return true; } };

  /** Hace accesible un K.modal ya añadido a la página. Devuelve { cierra() } para devolver el foco al cerrarlo. */
  K.modalAccesible = (modal, overlay, { title, danger } = {}) => {
    // Nombre y descripción
    const t = modal.querySelector(':scope > h3');
    if (t) { t.id = t.id || 'md-t' + (++n); modal.setAttribute('aria-labelledby', t.id); }
    else if (title) modal.setAttribute('aria-label', title);
    const s = modal.querySelector(':scope > p.sub');
    if (s) { s.id = s.id || 'md-s' + (++n); modal.setAttribute('aria-describedby', s.id); }

    // Foco inicial: lo marcado con autofocus; con ratón, el primer campo; si solo hay botones (una confirmación), el botón seguro
    // (Cancelar en lo destructivo, el principal en lo demás); en el resto el propio diálogo, que lee el título y deja el Tab dentro.
    // En táctil no se enfoca ningún campo: abriría el teclado y taparía el formulario.
    const previo = document.activeElement;
    modal.tabIndex = -1;
    const marcado = modal.querySelector('[autofocus]');
    const campo = puntero() ? modal.querySelector(CAMPOS) : null;
    const botones = [...modal.querySelectorAll(':scope > .modal-actions .btn')];
    const confirmacion = !modal.querySelector(':scope > .modal-body') && botones.length > 0 && botones.length <= 2;
    const destino = marcado || campo || (confirmacion ? (danger ? botones[0] : (botones.find((b) => b.classList.contains('primary')) || botones[0])) : null) || modal;
    try { destino.focus({ preventScroll: true }); } catch { /* no enfocable */ }

    // Tab no sale del diálogo (solo mientras el foco está dentro: un menú o selector flotante sigue funcionando)
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = focables(modal);
      if (!f.length) { e.preventDefault(); modal.focus(); return; }
      const primero = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === modal)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });

    return {
      cierra() {
        const dentro = overlay.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement;
        if (dentro && previo && previo !== document.body && previo.isConnected && typeof previo.focus === 'function') {
          try { previo.focus({ preventScroll: true }); } catch { /* ya no se puede enfocar */ }
        }
      },
    };
  };

  /** Menú accesible: role=menu / menuitem, flechas, Inicio/Fin, Tab cierra y el foco vuelve a quien lo abrió. */
  K.menuAccesible = (caja, { items = '.item, button', cierra, vuelveA } = {}) => {
    caja.setAttribute('role', 'menu');
    const lista = () => [...caja.querySelectorAll(items)].filter((b) => visible(b) && !b.disabled);
    for (const b of caja.querySelectorAll(items)) { b.setAttribute('role', 'menuitem'); b.tabIndex = -1; }
    if (caja._teclasMenu) caja.removeEventListener('keydown', caja._teclasMenu);   // el menú contextual se reutiliza: un solo manejador
    caja._teclasMenu = (e) => {
      const l = lista(); if (!l.length) return;
      const i = l.indexOf(document.activeElement);
      let j = -1;
      if (e.key === 'ArrowDown') j = (i + 1) % l.length;
      else if (e.key === 'ArrowUp') j = (i <= 0 ? l.length : i) - 1;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = l.length - 1;
      else if (e.key === 'Tab') { if (cierra) cierra(); return; }
      else return;
      e.preventDefault(); e.stopPropagation();
      l[j].focus({ preventScroll: true });
    };
    caja.addEventListener('keydown', caja._teclasMenu);
    const primero = lista()[0];
    if (primero) primero.focus({ preventScroll: true });
    return { devuelveFoco() { if (vuelveA && vuelveA.isConnected && typeof vuelveA.focus === 'function') vuelveA.focus({ preventScroll: true }); } };
  };
})();
