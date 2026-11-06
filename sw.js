/* Служебный скрипт: приложение открывается без интернета, новая версия ставится только после нажатия «Обновить».
   Список файлов и номер версии между маркерами обновляет tools/sw-sync.sh (запускать перед каждой публикацией). */
/* VERSION-START */ const VERSION = '0.8.0'; /* VERSION-END */
const CACHE = 'mymoney-' + VERSION;
const FILES = [
  /* FILES-START */
  'beta/index.html',
  'beta/manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'fonts/manrope-cyrillic.woff2',
  'fonts/manrope-latin.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'index.html',
  'js/analytics.js',
  'js/app.js',
  'js/backup.js',
  'js/categories.js',
  'js/dates.js',
  'js/db.js',
  'js/form.js',
  'js/history.js',
  'js/migrations.js',
  'js/money.js',
  'js/pwa.js',
  'js/router.js',
  'js/screens/analytics.js',
  'js/screens/backup.js',
  'js/screens/categories.js',
  'js/screens/expense-form.js',
  'js/screens/history.js',
  'js/screens/settings.js',
  'js/seed.js',
  'js/state.js',
  'js/stats.js',
  'js/store.js',
  'js/ui/datestrip.js',
  'js/ui/dom.js',
  'js/ui/files.js',
  'js/ui/icons.js',
  'js/ui/monthstrip.js',
  'js/version.js',
  /* FILES-END */
];

self.addEventListener('install', (e) => {
  // skipWaiting не вызываем: старая версия работает, пока пользователь сам не согласится обновиться
  // cache: 'reload' — берём файлы с сервера, а не из старого кэша браузера, чтобы версия не получилась «склеенной»
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(new URL(f, self.registration.scope).href, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mymoney-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // адрес приложения без имени файла (/beta/ или /beta/?x) отдаём как index.html
    const hit = await cache.match(req, { ignoreSearch: true }) || (url.pathname.endsWith('/') ? await cache.match(url.pathname + 'index.html') : null);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('Нет сети, а этого файла нет в памяти приложения.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
