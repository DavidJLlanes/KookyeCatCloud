'use strict';
/* contacts/importar.js: parte del módulo (se carga con el resto de contacts/ en index.html). Comparte el espacio K._contacts. */
(function () {
  const C = (K._contacts = K._contacts || {});
  const load = (...a) => C.load(...a);

  /* ---------- Importar ---------- */
  function pideImportar() {
    const inp = el('input'); inp.type = 'file'; inp.accept = '.vcf,.vcard,text/vcard,text/x-vcard,text/directory'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; inp.remove();
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { K.toast('El archivo supera los 8 MB'); return; }
      try {
        const res = await api(BASE + '/api/contacts/import', { method: 'POST', headers: { 'Content-Type': 'text/vcard; charset=utf-8' }, body: await file.text() });
        let data = null; try { data = await res.json(); } catch { /* sin cuerpo */ }
        if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
        const partes = [`${data.creados} importado${data.creados === 1 ? '' : 's'}`];
        if (data.duplicados) partes.push(`${data.duplicados} ya existían`);
        if (data.invalidos) partes.push(`${data.invalidos} sin datos`);
        K.toast(partes.join(' · '));
        await K.loadLabels(true).catch(() => {}); K.bus.emit('labels');
        await load();
      } catch (e) { K.fail(e); }
    }, { once: true });
    inp.addEventListener('cancel', () => inp.remove(), { once: true });
    inp.click();
  }


  Object.assign(C, { pideImportar });
})();
