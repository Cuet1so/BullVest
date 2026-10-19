// Only public offline assets are cached. Account data and mutations always use the network.
const CACHE = 'bullvest-offline-v1';
const OFFLINE = '/offline.html';
const PUBLIC_ASSETS = [OFFLINE, '/pwa/icon-192.png', '/pwa/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('bullvest-offline-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match(OFFLINE)));
  } else if (PUBLIC_ASSETS.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)));
  }
});
