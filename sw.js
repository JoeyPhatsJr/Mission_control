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
