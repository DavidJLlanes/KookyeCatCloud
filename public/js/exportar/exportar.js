'use strict';
/* Exportar JSON: un botón en la barra superior exporta los datos de la sección abierta (cada módulo es su propio JSON);
   en Cuenta hay una lista con todas las secciones y en Administración un ZIP con todos los JSON de la app. */
(function () {
  const SECCION = { notes: 'notas', prompts: 'prompts', contacts: 'contactos', calendar: 'calendario', colecciones: 'etiquetas', shopping: 'compra', games: 'juegos', bases: 'bases', documentos: 'documentos', pagos: 'pagos', marcadores: 'marcadores', recordatorios: 'recordatorios', codigo: 'codigo', logros: 'logros', tetris: 'logros', g2048: 'logros', breakout: 'logros', clip: 'portapapeles', files: 'archivos' };
  const NOMBRES = { notas: 'Notas', sincronizados: 'Bloques sincronizados', prompts: 'Prompts', contactos: 'Contactos', calendario: 'Calendario', etiquetas: 'Etiquetas', valores: 'Valores reutilizables', juegos: 'Juegos', bases: 'Bases', documentos: 'Documentos', pagos: 'Pagos', marcadores: 'Marcadores web', recordatorios: 'Recordatorios', perfil: 'Perfil', avisos: 'Avisos push (preferencias)', codigo: 'Código', logros: 'Logros y progreso', portapapeles: 'Portapapeles', archivos: 'Favoritos y álbumes', compra: 'Compra (compartida)' };
  async function baja(url, nombre) {
    await K.guardarUrl(url, { nombre: '', respaldo: nombre });
  }
  window.KccExport = { seccion: (id) => baja('/api/export/' + id, `kookyecatcloud-${id}.json`), todo: () => baja('/api/admin/export-all', 'kookyecatcloud-json.zip') };

  let actual = 'files';
  function monta() {
    const acciones = document.querySelector('.top-actions'); if (!acciones || document.getElementById('btn-export')) return;
    const b = document.createElement('button'); b.className = 'icon-btn'; b.id = 'btn-export'; b.type = 'button'; b.hidden = true;
    b.innerHTML = '<svg class="ico"><use href="#i-download"/></svg>';
    b.addEventListener('click', () => { const s = SECCION[actual]; if (s) KccExport.seccion(s); });
    acciones.insertBefore(b, document.getElementById('btn-logout'));
    const orig = window.switchTab;
    if (typeof orig === 'function') window.switchTab = function (t) { const r = orig.apply(this, arguments); actualiza(t); return r; };
    actualiza(actual);
    montaCuenta(); montaAdmin();
  }
  function actualiza(t) {
    actual = t;
    const b = document.getElementById('btn-export'); if (!b) return; const s = SECCION[t];
    b.hidden = !s; if (s) { b.title = `Exportar JSON: ${NOMBRES[s]}`; b.setAttribute('aria-label', b.title); }
  }
  function tarjeta(titulo, sub) {
    const c = document.createElement('section'); c.className = 'card';
    const h = document.createElement('h3'); h.textContent = titulo; const p = document.createElement('p'); p.className = 'card-sub'; p.textContent = sub; c.append(h, p); return c;
  }
  function montaCuenta() {
    const v = document.querySelector('#view-cuenta .cards'); if (!v || document.getElementById('exp-cuenta')) return;
    const c = tarjeta('Mis datos (JSON)', 'Descarga los datos de cada sección en un archivo JSON. No incluye los archivos subidos.'); c.id = 'exp-cuenta';
    const g = document.createElement('div'); g.className = 'exp-grid';
    Object.entries(NOMBRES).forEach(([id, n]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = '⤓ ' + n; b.addEventListener('click', () => KccExport.seccion(id)); g.appendChild(b); });
    c.appendChild(g); v.insertBefore(c, v.children[2] || null);
  }
  function montaAdmin() {
    const v = document.querySelector('#view-admin .cards'); if (!v || document.getElementById('exp-admin')) return;
    const c = tarjeta('Exportar todos los JSON', 'ZIP comprimido con los JSON de todos los usuarios y los compartidos (notas, prompts, bases, código, logros…). No incluye contraseñas, secretos, sesiones ni passkeys ni los archivos subidos.'); c.id = 'exp-admin';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = '⤓ Descargar ZIP con todos los JSON'; b.addEventListener('click', () => KccExport.todo()); c.appendChild(b);
    v.insertBefore(c, v.children[1] || null);
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(monta, 0));
})();
