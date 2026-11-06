/* Этап 8: служебный скрипт, список файлов для работы без интернета, версия. Запускается последним: ставит скрипт и убирает его за собой. */
import { test, eq, ok } from './harness.js';
import { openApp, waitFor, sleep } from './helpers.js';
import { VERSION } from '../js/version.js';

const swText = async () => (await fetch('/sw.js', { cache: 'no-store' })).text();
const listed = (t) => [...t.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);

test('служебный скрипт: версия совпадает с версией приложения, все перечисленные файлы существуют', async () => {
  const t = await swText();
  eq(/const VERSION = '([\d.]+)'/.exec(t)[1], /^[\d.]+/.exec(VERSION)[0]);
  const files = listed(t);
  ok(files.length >= 30, 'файлов в списке: ' + files.length);
  for (const f of ['beta/index.html', 'js/app.js', 'js/screens/analytics.js', 'css/app.css', 'fonts/manrope-cyrillic.woff2', 'icons/icon-192.png']) ok(files.includes(f), 'нет в списке: ' + f);
  for (const f of files) { const r = await fetch('/' + f, { cache: 'no-store' }); ok(r.ok, f + ' → ' + r.status); }
});

test('манифест: установка с экрана «Домой», иконки на месте', async () => {
  const m = await (await fetch('/beta/manifest.webmanifest')).json();
  eq([m.display, m.orientation, m.lang], ['standalone', 'portrait', 'ru']);
  eq(m.scope, './'); eq(m.start_url, './');
  for (const i of m.icons) ok((await fetch(new URL(i.src, location.origin + '/beta/'))).ok, i.src);
  ok((await fetch('/icons/icon-180.png')).ok, 'значок для iPhone');
});

test('работа без интернета: после установки скрипта все файлы лежат в памяти приложения', async () => {
  const a = await openApp({ route: '?sw=1' });
  try {
    const nav = a.win.navigator;
    await waitFor(() => nav.serviceWorker, 'поддержка');
    const reg = await Promise.race([nav.serviceWorker.ready, sleep(8000).then(() => null)]);
    ok(reg, 'служебный скрипт установился');
    const name = /const VERSION = '([\d.]+)'/.exec(await swText())[1];
    await waitFor(async () => true, '');
    let keys = []; const t0 = Date.now();
    while (Date.now() - t0 < 8000) { keys = await a.win.caches.keys(); if (keys.includes('mymoney-' + name)) break; await sleep(100); }
    ok(keys.includes('mymoney-' + name), 'кэш версии: ' + keys.join(','));
    const cache = await a.win.caches.open('mymoney-' + name);
    const cached = (await cache.keys()).map((r) => new URL(r.url).pathname);
    for (const f of listed(await swText())) ok(cached.some((p) => p.endsWith('/' + f)), 'не сохранён: ' + f);
    // файл отдаётся из памяти приложения, а не из сети
    const hit = await cache.match('/js/app.js'); ok(hit && (await hit.text()).includes('registerServiceWorker'));
  } finally {
    try { for (const r of await a.win.navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await a.win.caches.keys()) await a.win.caches.delete(k); } catch { /* уже убрано */ }
    a.close();
  }
});
