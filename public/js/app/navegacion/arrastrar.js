'use strict';
/* app/navegacion/arrastrar.js: parte de navegacion.js (antes un solo archivo). Script global: comparte el ámbito con el resto de app/. */
/* ---------------------------------------------------------------
   Arrastrar elementos sobre una carpeta para moverlos
--------------------------------------------------------------- */
let arrastre = [];   // rutas que se están arrastrando

function haceArrastrable(node, item) {
  node.draggable = true;
  node.addEventListener('dragstart', e => {
    // Si el elemento arrastrado está marcado, se arrastra la selección entera
    arrastre = state.selection.has(item.rel) ? [...state.selection] : [item.rel];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', arrastre.join('\n'));
    e.dataTransfer.setData('application/x-kcc-rutas', JSON.stringify(arrastre));   // para soltar en otra sección (transferir.js)
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => {
    node.classList.remove('dragging');
    arrastre = [];
    document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
  });
}

function haceSoltable(node, destino) {
  node.addEventListener('dragover', e => {
    if (!arrastre.length) return;                       // arrastre externo: lo maneja la ventana
    if (arrastre.includes(destino)) return;             // una carpeta no cae dentro de sí misma
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    node.classList.add('drop-target');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', e => {
    node.classList.remove('drop-target');
    if (!arrastre.length) return;
    e.preventDefault();
    e.stopPropagation();
    moverA(arrastre, destino);
    arrastre = [];
  });
}

async function moverA(rutas, destino) {
  try {
    const res = await post(BASE + '/api/batch', { op: 'move', paths: rutas, dest: destino });
    const data = await res.json();
    reportBatch(data, 'elemento movido', 'elementos movidos');
    exitSelectMode();
    refresh();
  } catch { showToast('Error de conexión'); }
}
