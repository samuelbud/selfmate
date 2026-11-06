// Keeps the SelfMate start page available offline and shows the evening notification.
// Your data is never cached here: it lives in your Google Sheet and is loaded fresh inside the app.
const CACHE = 'selfmate-shell-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'badge-96.png',
               'sky-1.png', 'sky-2.png', 'sky-3.png', 'sky-4.png', 'sky-5.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'selfmate-link').map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;               // the app itself always comes straight from Google
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// ---------- evening notification ----------
// The push from SelfMate is empty; the words come from your own SelfMate (tonight's line from your Lines tab).
// Tonight's line from the saved list (the app refreshes it each time it opens), counted the same way as in the app.
const savedLine = async () => {
  const r = await (await caches.open('selfmate-link')).match('lines');
  if (!r) return '';
  const { lines, offset } = await r.json(), now = new Date();
  return lines.length ? lines[(Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5) + offset) % lines.length] : '';
};
const appLink = () => caches.open('selfmate-link').then(c => c.match('link')).then(r => (r ? r.text() : '')).catch(() => '');
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = null;
  try { const link = await appLink(); if (link) n = await (await fetch(link + '&push=line')).json(); } catch (err) { /* offline: plain words */ }
  if (!n || !n.body) { const line = await savedLine().catch(() => ''); if (line) n = Object.assign({}, n, { body: line }); }
  const day = Math.floor(Date.now() / 864e5);
  return self.registration.showNotification((n && n.title) || '🌙 How was your day?', {
    body: (n && n.body) || 'Twenty seconds to rate your mood and energy.',
    icon: 'icon-192.png', badge: 'badge-96.png', image: 'sky-' + (day % 5 + 1) + '.png',
    tag: 'selfmate-evening', renotify: true,
    actions: [{ action: 'rate', title: '🌙 Rate my day' }, { action: 'later', title: '⏰ In 1 hour' }],
  });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    if (e.action === 'later') { const link = await appLink(); if (link) await fetch(link + '&push=snooze').catch(() => null); return; }
    const url = new URL('./#mood', self.registration.scope).href;
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => x.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ selfmate: 'open-mood' }); return w.focus(); }
    return clients.openWindow(url);
  })());
});
