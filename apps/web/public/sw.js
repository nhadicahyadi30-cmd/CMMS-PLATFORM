/* Service worker MaintHub.
   - Cangkang aplikasi (JS/CSS/ikon) di-cache supaya cepat dibuka dan bisa dipasang di HP.
   - Data (/api, /auth) TIDAK pernah di-cache: selalu langsung ke server agar tidak menampilkan data basi atau bocor antar-pengguna.
   - Saat offline, halaman menampilkan offline.html. */
const V = 'mh-v1';
const SHELL = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) return;   // data: langsung ke jaringan
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
    return;
  }
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/icons/')) {   // berkas bernama-hash: aman di-cache
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); } return res; })));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/work-orders';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(link); return c.focus(); } }
    return self.clients.openWindow(link);
  }));
});
