'use strict';
/* Importar · paso 1: elegir el origen y subir el archivo (también arrastrando). */
(function () {
  if (!window.K || !K.importar) return;
  const I = K.importar, S = I.S;

  async function sube(file, fuente, root) {
    if (!file || S.ocupado) return;
    S.ocupado = true; S.error = ''; I.pinta(root);
    try {
      const a = await I.analiza(file, fuente);
      S.analisis = a; S.fuente = a.fuente; S.paso = 'revisar'; S.notas = a.notas > 0;
      S.ajustes = a.tablasDetalle.map(t => I.ajusteInicial(t));
      await I.cargaCarpetas().catch(() => { S.carpetas = []; });
    } catch (e) { S.error = (e && e.message) || 'No se pudo leer el archivo'; }
    S.ocupado = false; I.pinta(root);
  }

  I.pintaElegir = (root) => {
    const page = el('div', 'im-page');
    const cab = el('div', 'im-head'); cab.append(el('h1', null, 'Importar'), el('p', 'k-faint', 'Trae tus notas y tablas desde otras apps. Primero verás lo que se ha encontrado; nada se guarda hasta que lo confirmes.'));
    page.appendChild(cab);
    if (S.error) page.appendChild(el('div', 'im-error', S.error));
    const rej = el('div', 'im-fuentes');
    for (const f of I.FUENTES) {
      const c = el('div', 'im-fuente'); c.setAttribute('data-f', f.id);
      const t = el('div', 'im-fuente-t'); t.append(icon(f.icono), el('strong', null, f.nombre));
      const inp = el('input'); inp.type = 'file'; inp.accept = f.acepta; inp.hidden = true;
      inp.addEventListener('change', () => { const file = inp.files[0]; inp.value = ''; sube(file, f.id, root); });
      const b = el('button', 'btn primary sm', S.ocupado ? 'Leyendo…' : 'Elegir archivo'); b.type = 'button'; b.disabled = S.ocupado;
      b.addEventListener('click', () => inp.click());
      c.append(t, el('p', 'k-faint', f.pasos), b, inp);
      rej.appendChild(c);
    }
    page.appendChild(rej);
    const zona = el('div', 'im-zona', 'o suelta aquí cualquier archivo (.zip, .enex, .docx, .csv, .md, .html, .txt)');
    ['dragenter', 'dragover'].forEach(n => zona.addEventListener(n, (e) => { e.preventDefault(); zona.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(n => zona.addEventListener(n, (e) => { e.preventDefault(); zona.classList.remove('on'); }));
    zona.addEventListener('drop', (e) => sube(e.dataTransfer && e.dataTransfer.files[0], '', root));
    page.appendChild(zona);
    page.appendChild(el('p', 'k-faint im-nota', 'Las copias de KookyeCatCloud no se importan aquí: las bases (JSON) y los contactos (vCard) tienen su propio botón «Importar» dentro de su sección.'));
    root.appendChild(page);
  };
})();
