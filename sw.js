// ════ Greenbar — service worker (offline-first app shell) ════
// Precaches the entire self-contained app shell so Greenbar runs as a
// standalone, installable PWA with no network connection. Consistent with the
// privacy model: only static app assets are cached — never user data (that
// lives in localStorage and is never fetched). There are no cross-origin
// requests to intercept.
//
// DEPLOY NOTE: bump CACHE_VERSION whenever any shell asset changes. On the next
// load the new worker installs the fresh shell, activate() deletes old caches,
// and clients.claim() takes control.

const CACHE_VERSION = 'greenbar-shell-v9';

// Scope-relative ('./') so this works for both root deploys and sub-path
// deploys (e.g. GitHub project Pages at /Greenbar/).
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './js/state.js',
  './js/core.js',
  './js/render.js',
  './js/features.js',
  './js/security.js',
  './js/backup.js',
  './js/manual-tx.js',
  './js/anomaly.js',
  './js/recurring.js',
  './js/forecast.js',
  './js/suggest-budget.js',
  './js/insights.js',
  './js/tour.js',
  './js/boot.js'
];

// Install: precache the shell, then activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop any caches from previous versions, then take control of
// already-open pages so the new worker is in charge without a manual reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs; navigations fall back to the cached shell
// so the app opens offline. Versioning (CACHE_VERSION) is the invalidation
// mechanism, so cache-first never serves permanently-stale assets.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Only store complete, same-origin ('basic') 200s.
  if (response && response.status === 200 && response.type === 'basic') {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigate(request) {
  // Offline-first app shell: serve the cached index.html when present.
  const shell = await caches.match('./index.html');
  if (shell) return shell;
  try {
    return await fetch(request);
  } catch (_) {
    // Last resort if even the network shell is unreachable and uncached.
    return caches.match('./');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // never touch non-GET
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ignore cross-origin (there are none)

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
