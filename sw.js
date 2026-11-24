const CACHE = 'biathlon-eps-v22';
const ASSETS = ['./', './index.html', './style.css', './app.js', './metrics.js',
  './excel.js', './transfers.js', './sessions.js', './vendor/pako_inflate.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png', './modele-classe.xlsx'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('biathlon-eps-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    try {
      return await fetch(event.request);
    } catch (error) {
      const match = await cache.match(event.request);
      if (match) return match;
      if (event.request.mode === 'navigate') return cache.match('./');
      throw error;
    }
  }));
});
