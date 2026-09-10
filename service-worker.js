// PowerOn service worker: offline caching of the app shell.
// Price/weather API calls are NOT intercepted here; the app caches the last
// fetched prices in localStorage itself.
//
// Bump CACHE_VERSION whenever app files change, so clients pick up the update.

const CACHE_VERSION = 'poweron-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/api.js',
  './js/appliances.js',
  './js/chart.js',
  './js/dashboard.js',
  './js/format.js',
  './js/prices.js',
  './js/settings.js',
  './js/settings-view.js',
  './js/storage.js',
  './js/time.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let API calls pass through untouched

  // Network first for our own files (so updates arrive promptly), cache as fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
