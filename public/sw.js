// El servidor sustituye el marcador de la línea siguiente por el identificador de versión al servir este archivo (ver /sw.js en server.js)
const BUILD = '__BUILD__';
const CACHE = 'kookyecatcloud-shell-' + BUILD;
// El prefijo (subcarpeta del dominio) sale del ámbito con el que se registró el worker
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, '');
const SHELL = ['/', '/js/app/base.js', '/js/app/markdown.js', '/js/app/tema.js', '/js/app/sesion.js', '/js/app/navegacion/lista.js', '/js/app/navegacion/agrupacion.js', '/js/app/navegacion/arrastrar.js', '/js/app/navegacion/menu-contextual.js', '/js/app/navegacion/filas.js', '/js/app/navegacion/busqueda-seleccion.js', '/js/app/navegacion/mover.js', '/js/app/visores/foto.js', '/js/app/visores/documentos.js', '/js/app/visores/hojas.js', '/js/app/visores/texto.js', '/js/app/visores/mapa.js', '/js/app/visores/detalles.js', '/js/app/papelera-subida.js', '/js/app/notas.js', '/js/app/zip-enlaces.js', '/js/app/notas-papelera.js', '/js/app/espacio-admin.js', '/js/app/colecciones.js', '/js/app/admin-herramientas.js', '/js/app/cuenta.js', '/js/app/inicio.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/icon-512.webp', '/apple-touch-icon.png', '/favicon.ico', '/og-image.jpg',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/css/modules.css', '/css/calendar.css', '/css/prompts.css', '/css/sistema.css', '/css/contacts.css', '/css/complementos.css', '/css/notes.css', '/css/shopping.css', '/css/games.css', '/css/bases.css', '/css/bases-vistas.css', '/css/sonidos.css', '/css/push.css', '/css/perfil.css', '/css/pagos.css', '/css/marcadores.css', '/css/recordatorios.css', '/css/notes-imagenes.css', '/css/codigo.css', '/vendor/highlightjs/highlight.min.js', '/css/game.css', '/vendor/gameicons/gameicons.svg', '/js/tema-inicial.js', '/js/textsize.js', '/js/viewport-fix.js', '/js/kit.js', '/js/guardar.js', '/css/guardar.css', '/js/valores-clave.js', '/js/valores.js', '/js/valores-pantalla.js', '/js/copias.js', '/css/copias.css', '/css/valores.css', '/js/zoom.js', '/js/calendar/estado.js', '/js/calendar/datos.js', '/js/calendar/estructura.js', '/js/calendar/lateral.js', '/js/calendar/mes.js', '/js/calendar/semana.js', '/js/calendar/agenda.js', '/js/calendar/evento.js', '/js/calendar/avisos.js', '/js/calendar/registro.js',
  '/js/docexport.js', '/js/ics.js', '/js/calendar-extra.js', '/js/prompts/estado.js', '/js/prompts/datos.js', '/js/prompts/estructura.js', '/js/prompts/lateral.js', '/js/prompts/gestion.js', '/js/prompts/filtros.js', '/js/prompts/tarjetas.js', '/js/prompts/seleccion.js', '/js/prompts/copiar.js', '/js/prompts/ficha.js', '/js/prompts/editor.js', '/js/prompts/importar.js', '/js/prompts/registro.js', '/js/prompts-extra.js', '/js/prompts-pro.js', '/js/game.js', '/js/tetris/estado.js', '/js/tetris/sonido.js', '/js/tetris/motor.js', '/js/tetris/dibujo.js', '/js/tetris/interfaz.js', '/js/tetris/entrada.js', '/js/tetris/pantallas.js', '/js/arcade/estado.js', '/js/arcade/sonido.js', '/js/arcade/marco.js', '/js/arcade/g2048.js', '/js/arcade/breakout.js', '/js/clip.js', '/js/contacts/estado.js', '/js/contacts/datos.js', '/js/contacts/vista.js', '/js/contacts/ficha.js', '/js/contacts/editor.js', '/js/contacts/importar.js', '/js/contacts/registro.js', '/js/fotos.js', '/js/notes/inline.js', '/js/notes/parser.js', '/js/notes/bloques.js', '/js/notes/tablas.js', '/js/notes/visor.js', '/js/notes/modelo.js', '/js/notes/seleccion.js', '/js/notes/eventos.js', '/js/notes/slash.js', '/js/notes/menciones.js', '/js/notes/barra.js', '/js/notes/montaje.js', '/js/notes/propiedades.js', '/js/notes/registro.js', '/js/notes-extra.js', '/js/notes-imagenes/optimiza.js', '/js/notes-imagenes/subida.js', '/js/notes-imagenes/insertar.js', '/js/notes-imagenes/selector.js', '/js/notes-imagenes/boton.js', '/js/shopping.js', '/js/games/estado.js', '/js/games/vista.js', '/js/games/anadir.js', '/js/games/ficha.js', '/js/games/estadisticas.js', '/js/games/tarjetas.js', '/js/games/registro.js', '/js/bases/estado.js', '/js/bases/datos.js', '/js/bases/consulta.js', '/js/bases/selectores.js', '/js/bases/celdas.js', '/js/bases/tabla.js', '/js/bases/kanban.js', '/js/bases/calendario.js', '/js/bases/galeria.js', '/js/bases/lineatiempo.js', '/js/bases/fila.js', '/js/bases/columnas.js', '/js/bases/vista.js', '/js/bases/lista.js', '/js/bases/base.js', '/js/bases/index.js', '/js/pagos/datos.js', '/js/pagos/lista.js', '/js/pagos/formulario.js', '/js/pagos/index.js', '/js/marcadores/datos.js', '/js/marcadores/tarjeta.js', '/js/marcadores/listado.js', '/js/marcadores/formulario.js', '/js/marcadores/index.js', '/js/recordatorios/datos.js', '/js/recordatorios/avisos.js', '/js/recordatorios/formulario.js', '/js/recordatorios/fila.js', '/js/recordatorios/lista.js', '/js/recordatorios/vinculado.js', '/js/recordatorios/index.js', '/js/codigo/estado.js', '/js/codigo/lista.js', '/js/codigo/proyecto.js', '/js/codigo/archivos.js', '/js/codigo/panel.js', '/js/codigo/subidas.js', '/js/codigo/versiones.js', '/js/codigo/vistaweb.js', '/js/codigo/registro.js', '/js/transferir.js', '/js/perfil.js', '/js/perfil-recorte.js', '/js/sonidos/paquetes.js', '/js/sonidos/motor.js', '/js/sonidos/enlaces.js', '/js/sonidos/ajustes.js', '/js/push/datos.js', '/js/push/ajustes.js', '/js/push/index.js', '/js/exportar.js', '/js/filecal.js', '/js/versions.js', '/js/vault.js', '/js/shares.js', '/js/passkeys.js', '/js/updates.js', '/js/omni.js'].map(p => BASE + p);
// La página pública de los enlaces no se cachea: /u/<id> siempre debe consultar al servidor

self.addEventListener('install', e => {
  // cache: 'reload' obliga a pedir lo último al servidor, no a la caché HTTP del navegador
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Rutas dinámicas que nunca se cachean: API, feed iCal, WebDAV y páginas públicas de enlaces
  if (['/api/', '/ical/', '/dav/', '/s/', '/u/', '/audio/'].some(p => url.pathname.startsWith(BASE + p))) return;

  // La página principal va primero a la red (con 2,5 s de margen) y cae a la caché sin conexión:
  // así una versión nueva se ve al abrir y no se enseña un instante la anterior.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      new Promise((resolve) => {
        const t = setTimeout(() => caches.match(e.request).then(c => c && resolve(c)), 2500);
        fetch(e.request).then(res => {
          clearTimeout(t);
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
          resolve(res);
        }).catch(() => { clearTimeout(t); caches.match(e.request).then(c => c ? resolve(c) : caches.match(BASE + '/').then(r => resolve(r || Response.error()))); });
      })
    );
    return;
  }
  // Stale-while-revalidate: responde al instante desde caché y actualiza por detrás,
  // guardando lo nuevo para que la app siga abriendo sin red.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------- Avisos push (lib/push): llegan con la app cerrada ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'KookyeCatCloud', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(String(d.titulo || 'KookyeCatCloud').slice(0, 80), {
    body: String(d.cuerpo || '').slice(0, 300),
    icon: BASE + '/icons/icon-192.png',
    tag: d.etiqueta || 'kcc',            // un aviso nuevo de la misma sección sustituye al anterior
    renotify: true,
    data: { vista: /^[a-z]{2,20}$/.test(String(d.vista)) ? d.vista : '' },
  }));
});

// Al pulsar: se enfoca la app si ya está abierta (y se le dice qué sección abrir) o se abre una ventana nueva
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const vista = (e.notification.data && e.notification.data.vista) || '';
  const url = BASE + '/' + (vista ? '?ver=' + vista : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    const abierta = lista.find(c => new URL(c.url).origin === self.location.origin);
    if (abierta) { abierta.postMessage({ tipo: 'abrir-vista', vista }); return abierta.focus(); }
    return self.clients.openWindow(url);
  }));
});
