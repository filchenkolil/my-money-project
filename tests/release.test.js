/* Проверки выпуска: основной адрес открывает приложение, у него своя база, манифест и список файлов для офлайна целые. */
import { test, eq, ok } from './harness.js';
import { waitFor } from './helpers.js';
import { deleteDb } from '../js/db.js';

test('выпуск: все файлы из списка офлайн-кэша существуют, версия в sw.js совпадает', async () => {
  const sw = await (await fetch('/sw.js', { cache: 'no-store' })).text();
  const files = [...sw.slice(sw.indexOf('FILES-START'), sw.indexOf('FILES-END')).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  ok(files.length > 40, 'файлов в списке: ' + files.length);
  ok(files.includes('index.html') && files.includes('manifest.webmanifest') && files.includes('beta/index.html'));
  for (const f of files) { const r = await fetch('/' + f, { cache: 'no-store' }); ok(r.ok, 'нет файла ' + f); }
  const ver = (await (await fetch('/js/version.js')).text()).match(/VERSION = '(\d+\.\d+\.\d+)/)[1];
  ok(sw.includes(`const VERSION = '${ver}'`), 'номер версии в sw.js: ' + ver);
});

test('выпуск: манифест основного адреса и значки', async () => {
  const m = await (await fetch('/manifest.webmanifest')).json();
  eq(m.name, 'MyMoney'); eq(m.display, 'standalone'); eq(m.start_url, './'); eq(m.scope, './');
  for (const i of m.icons) { const r = await fetch('/' + i.src); ok(r.ok && r.headers.get('content-type').includes('image/png'), i.src); }
  const html = await (await fetch('/index.html')).text();
  ok(!html.includes('../') && html.includes('rel="manifest" href="manifest.webmanifest"') && html.includes('apple-touch-icon') && html.includes('js/app.js'));
});

test('выпуск: основной адрес открывает приложение с отдельной базой «mymoney»', async () => {
  await deleteDb('mymoney');
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-2000px;width:390px;height:800px'; frame.src = '/index.html#/settings'; document.body.append(frame);
  try {
    await new Promise((r) => frame.addEventListener('load', r, { once: true }));
    const d = frame.contentDocument;
    await waitFor(() => d.querySelector('.kv'), 'настройки основной версии');
    ok(d.querySelector('.kv').textContent.includes('основной'), d.querySelector('.kv').textContent);
    ok(d.querySelector('.tabs button'), 'нижняя панель'); ok(!d.body.textContent.includes('в разработке'), 'вместо заглушки приложение');
    const names = (await indexedDB.databases()).map((x) => x.name);
    ok(names.includes('mymoney'), 'база основной версии: ' + names);
  } finally { frame.remove(); await deleteDb('mymoney'); }
});
