/* Mission Control service worker — offline shell cache + notification clicks.
   Scope is the repo path ("./"). Only same-origin GETs are cached; live API
   calls (thespacedevs, NOAA, open-meteo, wikipedia, YouTube, Flickr, unpkg)
   pass straight through so data is always fresh. Bump CACHE to invalidate. */
const CACHE = 'mc-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})            // a missing asset must not abort activation
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // never touch cross-origin (APIs, CDNs)

  if (req.mode === 'navigate') {
    // network-first for the page so updates land, fall back to cached shell offline
    e.respondWith(
      fetch(req)
        .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }
  // cache-first for static shell assets
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

// Web Push from the companion worker (push-worker/). The page mirrors the
// ★ watchlist into IndexedDB (SWs can't read localStorage); pushes for
// unwatched launches are dropped here as defense-in-depth — the worker
// already server-filters using the watch list sent with the subscription.
function idbGetWatch() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('mc2', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onsuccess = () => {
        try {
          const get = open.result.transaction('kv').objectStore('kv').get('watch');
          get.onsuccess = () => resolve(Array.isArray(get.result) ? get.result : null);
          get.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
      open.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
const MILESTONE_LABEL = { 0: '🚀 Liftoff', 10: 'T-10 min', 60: 'T-1 hour', 1440: 'T-24 hours' };
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* opaque payload */ }
  e.waitUntil((async () => {
    const watch = await idbGetWatch();
    if (Array.isArray(watch) && d.launchId && !watch.includes(d.launchId)) return;
    const label = MILESTONE_LABEL[d.milestone] || 'Launch alert';
    await self.registration.showNotification(`${label} — ${d.name || 'Launch'}`, {
      body: d.provider ? `${d.provider} · launch alert` : 'Mission Control launch alert',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: `mc-push-${d.launchId || 'x'}-${d.milestone ?? ''}`,
      data: { url: './#launch=' + encodeURIComponent(d.launchId || '') },
    });
  })());
});

// focus an existing window (or open one) when a launch notification is tapped
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      for (const c of cl) { if ('focus' in c) { c.postMessage({ type: 'notif-open', url: target }); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
