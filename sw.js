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

const CACHE_VERSION = 'greenbar-shell-v32';

// Scope-relative ('./') so this works for both root deploys and sub-path
// deploys (e.g. GitHub project Pages at /Greenbar/).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './js/state.js',
  './js/import-friction.js',
  './js/theme.js',
  './js/core.js',
  './js/render.js',
  './js/features.js',
  './js/security.js',
  './js/backup.js',
  './js/manual-tx.js',
  './js/anomaly.js',
  './js/recurring.js',
  './js/pdf-import.js',
  './js/forecast.js',
  './js/suggest-budget.js',
  './js/insights.js',
  './js/goals.js',
  './js/demo.js',
  './js/cleanup.js',
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

// Web Share Target: the OS POSTs the shared file(s) to the manifest's
// share_target action ('share-target'). Stash them in the 'gb-share' cache and
// redirect to ?shared=N; the app (import-friction.js) reconstructs the files and
// runs them through the normal import. Stays on-device — nothing is uploaded.
async function handleShareTarget(request){
  try{
    const form = await request.formData();
    const files = form.getAll('statements').filter((f) => f && typeof f.name === 'string');
    const cache = await caches.open('gb-share');
    await cache.put('gb-shared-meta', new Response(JSON.stringify(files.map((f) => f.name))));
    await Promise.all(files.map((f, i) =>
      cache.put('gb-shared-' + i, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }))));
    return Response.redirect('./?shared=' + files.length, 303);
  }catch(_){
    return Response.redirect('./?shared=0', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Share Target POST (declared in manifest.json) — intercept before the
  // GET-only guard below.
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(request));
    return;
  }
  if (request.method !== 'GET') return; // never touch other non-GET
  if (url.origin !== self.location.origin) return; // ignore cross-origin (there are none)

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
