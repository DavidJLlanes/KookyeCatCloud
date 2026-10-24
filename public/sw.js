// El servidor sustituye el marcador de la línea siguiente por el identificador de versión al servir este archivo (ver /sw.js en server.js)
const BUILD = '__BUILD__';
const CACHE = 'kookyecatcloud-shell-' + BUILD;
// El prefijo (subcarpeta del dominio) sale del ámbito con el que se registró el worker
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, '');
const SHELL = ['/', '/app.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/css/modules.css', '/css/notes.css', '/css/shopping.css', '/js/kit.js', '/js/zoom.js', '/js/calendar.js',
  '/js/ics.js', '/js/calendar-extra.js', '/js/prompts.js', '/js/prompts-extra.js', '/js/prompts-pro.js', '/js/vinculos.js', '/js/clip.js', '/js/contacts.js', '/js/fotos.js', '/js/notes.js', '/js/notes-extra.js', '/js/shopping.js', '/js/filecal.js', '/js/versions.js', '/js/vault.js', '/js/shares.js', '/js/passkeys.js', '/js/updates.js', '/js/omni.js'].map(p => BASE + p);
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
  if (['/api/', '/ical/', '/dav/', '/s/', '/u/'].some(p => url.pathname.startsWith(BASE + p))) return;

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
