const CACHE = 'biathlon-eps-v34';
const ASSETS = ['./', './index.html', './style.css?v=34', './nation-flags-hd-1.webp', './nation-flags-hd-2.webp', './nation-flags-hd-3.webp', './nation-flags-hd-4.webp', './app.js?v=34', './metrics.js',
  './excel.js', './transfers.js?v=34', './sessions.js?v=34', './vendor/pako_inflate.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png', './modele-classe.xlsx'];

self.addEventListener('install', event => {
  const assets = ASSETS.map(path => new Request(new URL(path, self.registration.scope), {cache:'reload'}));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('biathlon-eps-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    try {
      return await fetch(event.request, {cache:'no-cache'});
    } catch (error) {
      const match = await cache.match(event.request);
      if (match) return match;
      if (event.request.mode === 'navigate') return cache.match('./');
      throw error;
    }
  }));
});
