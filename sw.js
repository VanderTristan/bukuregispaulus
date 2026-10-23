// Menyimpan berkas aplikasi agar bisa dibuka cepat, bahkan tanpa internet. Data tetap diambil dari Google Sheets.
const CACHE = 'rira-sheets-v3';
const SHELL = ['./', 'index.html', 'assets/app.css', 'assets/app.js', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-180.png', 'assets/logo.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
