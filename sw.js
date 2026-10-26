const CACHE = 'gastos-v5';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/utils.js',
  'js/state.js',
  'js/api.js',
  'js/data.js',
  'js/ui.js',
  'js/form.js',
  'js/registrar.js',
  'js/movimientos.js',
  'js/edicion.js',
  'js/resumen.js',
  'js/tarjetas.js',
  'js/ajustes.js',
  'js/main.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Solo cachea los archivos de la app (mismo origen). Las llamadas al script de Google nunca pasan por aquí.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
