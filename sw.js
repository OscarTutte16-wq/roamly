/* Roamly service worker: app shell precache + offline vector map (OpenFreeMap) */
const SHELL = 'roamly-shell-v13', TILES = 'roamly-tiles', RUNTIME = 'roamly-tiles-runtime';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css', 'vendor/maplibre/leaflet-maplibre-gl.js', 'shell.css', 'data/lang.js', 'vendor/inter/inter-latin-wght-normal.woff2', 'vendor/inter/inter-latin-ext-wght-normal.woff2',
  'features/shell.js', 'features/auth.js', 'features/share.js', 'features/home.js', 'features/profile.js', 'features/learn.js', 'features/journal.js', 'features/routes.js', 'features/lessons.js', 'features/reminders.js', 'features/visited.js', 'features.css', 'data/countries.geojson'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('roamly-shell') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
let runtimeCount = 0;
async function trimRuntime() { const c = await caches.open(RUNTIME); const ks = await c.keys(); if (ks.length > 3000) for (const k of ks.slice(0, ks.length - 2500)) await c.delete(k); }
async function putRuntime(key, res) { const c = await caches.open(RUNTIME); await c.put(key, res); if (++runtimeCount % 200 === 0) trimRuntime(); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = req.url;
  if (url.startsWith('https://tiles.openfreemap.org/')) {
    const fresh = /\/styles\/|\/planet$/.test(url); // style + tilejson: network first (they point to the weekly tile version)
    e.respondWith((async () => {
      if (!fresh) { const hit = await caches.match(url); if (hit) return hit; }
      try { const res = await fetch(url, {mode: 'cors'}); if (res.ok) putRuntime(url, res.clone()); return res; }
      catch { const hit = await caches.match(url); return hit || new Response('', {status: 504}); }
    })());
    return;
  }
  const u = new URL(url);
  if (u.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put('./', cp)); return r; }).catch(() => caches.match('./').then(r => r || caches.match('index.html')))); return; }
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => { const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(SHELL).then(c => c.put(req, cp)); } return r; }).catch(() => hit); return hit || net; }));
  }
});

/* Reminders: open the app when a notification is tapped */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); return c ? c.focus() : self.clients.openWindow(e.notification.data?.url || './'); }));
});
/* Periodic background sync (installed PWAs on Chromium): show reminders that came due while Roamly was closed */
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'roamly-reminders') return;
  e.waitUntil((async () => {
    const c = await caches.open('roamly-meta'), r = await c.match('reminders.json'); if (!r) return;
    const due = await r.json(), sr = await c.match('shown.json'), shown = sr ? await sr.json() : [], now = Date.now();
    for (const x of due) if (x.at <= now && !shown.includes(x.id)) { await self.registration.showNotification(x.title, {body: x.body, tag: x.id, icon: 'icons/icon-192.png', data: {url: './#trips'}}); shown.push(x.id); }
    await c.put('shown.json', new Response(JSON.stringify(shown.slice(-200))));
  })());
});
