'use strict';
/* Bases · lista de bases, crear una nueva e importar un JSON. */
(function () {
  if (!window.K || !K.bases) return;
  const B = K.bases, S = B.S;
  const vacioIcono = () => { const d = el('div', 'bs-empty-i'); d.appendChild(icon('i-table')); return d; };

  B.pintaLista = (page) => {
    const head = el('header', 'bs-head'); const t = el('div'); t.append(el('h1', null, 'Bases'), el('p', 'k-muted', 'Tus propias bases de datos: tabla, tablero, calendario, galería y línea de tiempo'));
    const acc = el('div', 'bs-actions');
    acc.append(B.btn('Importar', 'i-upload', importar), B.btn('Nueva base', 'i-plus', B.nueva, 'btn primary')); head.append(t, acc); page.appendChild(head);
    if (!S.lista.length) {
      const e = el('div', 'bs-empty'); e.append(vacioIcono(), el('h2', null, 'Aún no tienes bases'), el('p', 'k-muted', 'Empieza con una plantilla (proyectos, libros, gastos…) o crea una a tu gusto.'), B.btn('Crear la primera', 'i-plus', B.nueva, 'btn primary')); page.appendChild(e); return;
    }
    const grid = el('div', 'bs-cards');
    S.lista.forEach(b => {
      const c = el('article', 'bs-card'); c.tabIndex = 0; c.setAttribute('role', 'button');
      c.append(el('div', 'bs-card-i', b.icono), el('strong', null, b.nombre), el('small', 'k-muted', `${b.filas} fila${b.filas === 1 ? '' : 's'} · ${b.columnas} columnas`));
      const go = () => B.abre(b.id); c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      grid.appendChild(c);
    });
    page.appendChild(grid);
  };

  B.nueva = () => {
    const w = el('div', 'bs-form'); let plantilla = 'proyectos';
    const nom = el('input'); nom.placeholder = 'Nombre de la base'; nom.maxLength = 80;
    const ico = el('input'); ico.placeholder = '🗂️'; ico.maxLength = 4; ico.className = 'bs-emoji';
    const fila = el('div', 'bs-row2'); fila.append(B.campo('Nombre', nom), B.campo('Icono (emoji)', ico));
    const grid = el('div', 'bs-plantillas');
    const marca = () => [...grid.children].forEach(c => c.classList.toggle('on', c.dataset.id === plantilla));
    S.plantillas.forEach(p => { const c = el('button', 'bs-plantilla'); c.type = 'button'; c.dataset.id = p.id; c.append(el('span', 'bs-plantilla-i', p.icono), el('b', null, p.nombre), el('small', 'k-muted', p.desc)); c.addEventListener('click', () => { plantilla = p.id; marca(); }); grid.appendChild(c); });
    marca(); w.append(fila, el('span', 'bs-lbl', 'Plantilla'), grid);
    K.modal({ title: 'Nueva base', content: w, cls: 'wide', actions: [{ label: 'Cancelar' }, { label: 'Crear', primary: true, onClick: async () => {
      try { const b = await K.post('/api/bases', { nombre: nom.value, icono: ico.value, plantilla }); S.destinos = new Map(); S.base = b; S.vista = b.views[0].id; S.mes = null; S.dia = ''; B.pinta(); B.logros(); return true; } catch (e) { K.fail(e); return false; }
    } }] });
  };

  function importar() {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => { const f = inp.files[0]; if (!f) return; try { const b = await K.post('/api/bases/import', JSON.parse(await f.text())); S.destinos = new Map(); S.base = b; S.vista = b.views[0].id; B.pinta(); B.logros(); K.toast('Base importada'); } catch (e) { K.fail(e); } });
    inp.click();
  }
})();
