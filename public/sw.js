// Offline support. The page itself loads network-first, so a new deploy shows up on the next visit and the cached
// copy is only the offline fallback; everything else is stale-while-revalidate. The build stamps the cache name
// (see vite.config.js), so each deploy gets a fresh cache and the previous one is deleted.
const CACHE = 'holeshot-__BUILD__';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
const NET_TIMEOUT = 3000; // on a crawling connection, open the cached game instead of waiting

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // live scores and share pages are never cached; music streams with range requests, which Safari can't play from here
  if (url.origin === location.origin && /^\/(api|c|music)\//.test(url.pathname)) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  const cacheable = url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!cacheable) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

// The game's own page is cached as './' whatever its query (?challenge=…); other pages (/about, /privacy) under
// their own address, so visiting them never replaces the game in the offline cache.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const path = new URL(req.url).pathname, key = /^\/(index\.html)?$/.test(path) ? './' : path;
  const net = fetch(req).then(res => { if (res.ok && !res.redirected) cache.put(key, res.clone()); return res; });
  const hit = await cache.match(key) || (key === './' ? null : await cache.match('./'));
  if (!hit) return net;
  return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), NET_TIMEOUT))]);
}
