// オフラインで動かすため、アプリのファイルを端末に保存しておく。
// アプリを更新したら VERSION を上げる（上げないと iPhone に新しい版が届かない）。js/main.js の VERSION もそろえる。
const VERSION = 'v3';
const CACHE = `stock-cho-${VERSION}`;
const SDK_CACHE = 'stock-cho-sdk'; // Firebase の部品（版を固定しているので、版をまたいで使い回す）
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png',
  'js/main.js', 'js/data.js', 'js/logic.js', 'js/template.js', 'js/config.js', 'js/receipt.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('stock-cho-v') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
  } else if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    // 初回に取ってきたものを保存し、2 回目からは保存分を使う
    e.respondWith(caches.open(SDK_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
  }
  // Firestore やログインの通信は、そのまま通す（Firebase 自身がオフラインを扱う）
});
