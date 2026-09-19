// PowerOn service worker: offline caching of the app shell.
// Price/weather API calls are NOT intercepted here; the app caches the last
// fetched prices in localStorage itself.
//
// Bump CACHE_VERSION whenever app files change, so clients pick up the update.
// @req PWA-02 PWA-03

const CACHE_VERSION = 'poweron-v8';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/api.js',
  './js/bands.js',
  './js/app.js',
  './js/appliances.js',
  './js/chart.js',
  './js/dashboard.js',
  './js/day-view.js',
  './js/forecast.js',
  './js/format.js',
  './js/history-view.js',
  './js/holidays.js',
  './js/install.js',
  './js/outlook-view.js',
  './js/prices.js',
  './js/settings-view.js',
  './js/settings.js',
  './js/stats.js',
  './js/storage.js',
  './js/tariffs.js',
  './js/time.js',
  './js/ui.js',
  './js/usage.js',
  './js/usage-view.js',
  './js/weather.js',
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
  if (request.headers.has('Authorization')) return; // private requests must never enter the shell cache

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let API calls pass through untouched

  // Network first for our own files, revalidated with the server (so updates arrive
  // promptly despite HTTP caching), cache as fallback when offline.
  // Navigation requests cannot be cloned with options, so rebuild them from the URL.
  const networkRequest =
    request.mode === 'navigate'
      ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : new Request(request, { cache: 'no-cache' });
  event.respondWith(
    fetch(networkRequest)
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
