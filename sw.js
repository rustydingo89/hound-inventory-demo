/* Inventory Hound demo - offline cache. Everything the demo needs is in this folder; nothing is fetched from anywhere else. */
const CACHE = 'hound-demo-b2720ac8a1';
const FILES = ["./", "./app.css", "./app.js", "./apple-touch-icon.png", "./brand/apple-touch-icon.png", "./brand/dingo-mark.svg", "./brand/favicon.ico", "./brand/favicon.svg", "./brand/icon-192.png", "./brand/icon-512.png", "./brand/icon-mac-1024.png", "./brand/icon-maskable-512.png", "./brand/wordmark-light.svg", "./brand/wordmark.svg", "./data.js", "./demo-api.js", "./demo.css", "./favicon.ico", "./icon.svg", "./index.html", "./manifest.webmanifest", "./orders.js", "./settings.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hound-demo-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request).catch(() => caches.match('./index.html'))));
});
