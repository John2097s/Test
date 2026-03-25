/**
 * NEXUS Service Worker — Offline Support & Caching
 * Cache-Version erhöhen wenn Dateien geändert werden.
 */

const CACHE = 'nexus-v5';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/animations.css',
  './js/config.js',
  './js/state.js',
  './js/engine.js',
  './js/cards.js',
  './js/achievements.js',
  './js/cosmetics.js',
  './js/skilltree.js',
  './js/render.js',
  './js/profile.js',
  './js/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Syne:wght@300;400;500;600&display=swap'
];

// Install: Cache alle Assets
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache core assets; ignore font failures (network-only fallback)
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => null))
      );
    })
  );
});

// Activate: Alte Caches löschen
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first für App-Assets, Network-first für Fonts
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nur GET requests cachen
  if (e.request.method !== 'GET') return;

  // Google Fonts: network-first
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.google')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // App-Assets: cache-first mit network-fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Nur 200-Responses cachen
        if (resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => {
        // Offline-Fallback: index.html
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
