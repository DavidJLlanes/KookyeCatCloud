'use strict';
/* Pagos · documentos adjuntos al pago (póliza, recibo…): subir PDF o imagen, abrir y quitar. */
(function () {
  if (!window.K || !K.pagos) return;
  const P = K.pagos;
  const MAX = 15 * 1024 * 1024;
  const tam = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const url = (p, a, descargar) => `${BASE}/api/pagos/${p.id}/adjuntos/${a.id}${descargar ? '?descargar=1' : ''}`;

  // Sección del formulario de un pago ya guardado. `alCambiar` se llama tras subir o quitar un documento.
  P.seccionAdjuntos = (p, alCambiar) => {
    const caja = el('div', 'pg-adj ancho'); const lista = el('div', 'pg-adj-lista');
    const pinta = () => {
      lista.textContent = '';
      (p.adjuntos || []).forEach(a => {
        const f = el('div', 'pg-adj-fila');
        const ab = el('a', 'pg-adj-nombre', (a.tipo === 'application/pdf' ? '📄 ' : '🖼️ ') + a.nombre); ab.href = url(p, a); ab.target = '_blank'; ab.rel = 'noopener';
        const x = el('button', 'icon-btn'); x.type = 'button'; x.title = 'Quitar documento'; x.setAttribute('aria-label', `Quitar ${a.nombre}`); x.appendChild(icon('i-trash'));
        x.addEventListener('click', async () => {
          if (!await K.confirm(`Se quitará «${a.nombre}». Se guarda 30 días por si te arrepientes.`, { ok: 'Quitar', danger: true })) return;
          try { await K.del(`/api/pagos/${p.id}/adjuntos/${a.id}`); p.adjuntos = p.adjuntos.filter(y => y.id !== a.id); pinta(); if (alCambiar) alCambiar(); } catch (e) { K.fail(e); }
        });
        f.append(ab, el('small', 'k-faint', tam(a.tam)), x); lista.appendChild(f);
      });
      if (!(p.adjuntos || []).length) lista.appendChild(el('p', 'k-faint', 'Sin documentos. Puedes adjuntar la póliza o el recibo (PDF o imagen, hasta 15 MB).'));
    };
    const entrada = el('input'); entrada.type = 'file'; entrada.accept = 'application/pdf,image/png,image/jpeg,image/webp'; entrada.multiple = true; entrada.hidden = true;
    const sube = el('button', 'btn sm'); sube.type = 'button'; sube.append(icon('i-upload'), el('span', null, 'Adjuntar póliza o documento'));
    sube.addEventListener('click', () => entrada.click());
    entrada.addEventListener('change', async () => {
      sube.disabled = true;
      for (const f of [...entrada.files]) {
        if (f.size > MAX) { K.toast(`«${f.name}» pesa más de 15 MB`); continue; }
        try {
          const res = await api(`${BASE}/api/pagos/${p.id}/adjuntos`, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(f.name) }, body: f });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { K.toast(d.error || 'No se pudo adjuntar'); continue; }
          p.adjuntos = [...(p.adjuntos || []), d.adjunto]; pinta(); if (alCambiar) alCambiar();
        } catch (e) { K.fail(e); }
      }
      entrada.value = ''; sube.disabled = false;
    });
    caja.append(el('h4', null, 'Documentos'), lista, sube, entrada); pinta(); return caja;
  };
})();
