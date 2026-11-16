import { test, eq, ok } from './harness.js';
import { normalizeTheme, effectiveTheme, getTheme, setTheme, applyTheme, THEMES } from '../js/theme.js';
import { openApp, waitFor, sleep } from './helpers.js';

test('тема: допустимые значения, остальное считается «как в системе»', () => {
  eq(THEMES.map((t) => t[0]), ['system', 'light', 'dark']);
  eq(['light', 'dark', 'system', 'x', '', null, undefined].map(normalizeTheme), ['light', 'dark', 'system', 'system', 'system', 'system', 'system']);
  eq([effectiveTheme('system', true), effectiveTheme('system', false), effectiveTheme('dark', false), effectiveTheme('light', true)], ['dark', 'light', 'dark', 'light']);
});

test('тема: выбор запоминается и ставится на страницу; «как в системе» убирает закрепление', () => {
  try {
    setTheme('dark'); eq(getTheme(), 'dark'); eq(document.documentElement.dataset.theme, 'dark');
    setTheme('light'); eq(document.documentElement.dataset.theme, 'light');
    setTheme('system'); eq(getTheme(), 'system'); ok(!('theme' in document.documentElement.dataset));
    applyTheme('мусор'); ok(!('theme' in document.documentElement.dataset));
  } finally { setTheme('system'); }
});

const css = (a, name) => a.win.getComputedStyle(a.doc.documentElement).getPropertyValue(name).trim().toLowerCase();

test('настройки: переключатель темы меняет цвета сразу, выбор переживает перезапуск', async () => {
  const a = await openApp({ route: '#/settings' });
  try {
    await waitFor(() => a.q('.seg'), 'настройки');
    eq(a.qa('.seg button').map((b) => b.textContent), ['Как в системе', 'Светлая', 'Тёмная']);
    eq(a.q('.seg [aria-pressed="true"]').textContent, 'Как в системе');
    a.click(a.qa('.seg button')[2]); await sleep(80);
    eq(a.doc.documentElement.dataset.theme, 'dark');
    eq(css(a, '--surface'), '#181818'); eq(a.win.getComputedStyle(a.q('#app')).backgroundColor, 'rgb(24, 24, 24)');
    eq(a.q('.seg [aria-pressed="true"]').textContent, 'Тёмная');
    a.click(a.qa('.seg button')[1]); await sleep(80);
    eq(css(a, '--surface'), '#ffffff'); eq(a.doc.documentElement.dataset.theme, 'light');
    a.click(a.qa('.seg button')[2]); await sleep(50);
    // регрессия: после выбора темы строки настроек должны открываться (у <html> появился data-theme)
    for (const [row, title] of [[1, 'Категории'], [2, 'Экспорт и восстановление']]) {
      a.click(a.qa('.setrow')[row]); await waitFor(() => a.h1() === title, 'раздел «' + title + '»');
      a.click(a.q('[data-act="back"]')); await waitFor(() => a.q('.seg'), 'назад в настройки');
    }
  } finally { a.close(); }
  // перезапуск: тема стоит до отрисовки (встроенный скрипт в <head>), без вспышки светлой темы
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-2000px;width:390px;height:700px'; frame.src = '/beta/index.html#/settings'; document.body.append(frame);
  try {
    await new Promise((r) => frame.addEventListener('load', r, { once: true }));
    eq(frame.contentDocument.documentElement.dataset.theme, 'dark');
    await waitFor(() => frame.contentDocument.querySelector('.seg'), 'настройки после перезапуска');
    eq(frame.contentDocument.querySelector('.seg [aria-pressed="true"]').textContent, 'Тёмная');
    eq(frame.contentWindow.getComputedStyle(frame.contentDocument.documentElement).getPropertyValue('--surface').trim().toLowerCase(), '#181818');
  } finally { frame.remove(); try { localStorage.removeItem('mymoney.theme'); } catch { /* нечего чистить */ } }
});

test('тёмная тема: основные цвета заданы отдельно от светлой, текст читается (контраст не ниже 4,5:1)', async () => {
  const a = await openApp();
  try {
    const lum = (hex) => { const n = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
    const pairs = [['--ink', '--surface'], ['--ink', '--surface2'], ['--muted', '--surface'], ['--muted', '--surface2'], ['--accent-ink', '--accent'], ['--on-lime', '--lime'], ['--bad', '--bad-soft'], ['--warn', '--warn-soft'], ['--banner-ink', '--banner-bg'], ['--up', '--surface'], ['--down', '--surface'], ['--hero-ink', '--hero-a'], ['--hero-btn-ink', '--hero-btn']];
    const names = ['--surface', '--surface2', '--ink', '--muted', '--accent', '--bad', '--warn', '--up', '--down', '--banner-bg', '--bar-soft', '--hero-a'];
    const low = [], same = [], light = {};
    for (const m of ['light', 'dark']) {
      a.doc.documentElement.dataset.theme = m;
      const v = {}; for (const n of new Set([...pairs.flat(), ...names])) v[n] = css(a, n);
      if (m === 'light') Object.assign(light, v);
      for (const [x, y] of pairs) { const r = ratio(v[x], v[y]); if (r < 4.5) low.push(`${m}: ${x} на ${y} = ${r.toFixed(2)}`); }
      if (m === 'dark') for (const n of names) if (v[n] === light[n]) same.push(n);
    }
    eq(low, []); eq(same, [], 'в тёмной теме эти цвета не заданы');
  } finally { a.close(); }
});

test('тёмная тема на каждом экране: нет светлых «пятен» с белым фоном', async () => {
  const a = await openApp({ seed: async (s) => { await s.addExpense({ amount: 12300, date: new Date().toLocaleDateString('sv'), categoryId: 'prod', note: 'проверка' }); } });
  try {
    a.doc.documentElement.dataset.theme = 'dark';
    const bad = [];
    const lightBg = (rgb) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(rgb); return !!m && (m[4] === undefined || +m[4] > 0.5) && (+m[1] + +m[2] + +m[3]) / 3 > 200; };
    const skip = '.dot, .wk button[aria-pressed="true"], .chip[aria-pressed="true"], .dchip[aria-current], .mchip[aria-current], .mcol, .updatebar, .toast, svg, .icb, .pal, .seg button[aria-pressed="true"], .tabs .ic, .tabs .fab, .badge, .heroc';
    for (const r of ['#/add', '#/history', '#/analytics', '#/analytics/compare', '#/analytics/category', '#/settings', '#/categories', '#/backup', '#/reset']) {
      a.win.location.hash = r; await sleep(250);
      for (const el of a.qa('#app *')) {
        if (el.closest(skip)) continue;
        const bg = a.win.getComputedStyle(el).backgroundColor;
        if (lightBg(bg) && el.getBoundingClientRect().width > 20) { bad.push(`${r}: ${el.tagName}.${el.className} фон ${bg}`); break; }
      }
    }
    eq(bad, []);
  } finally { a.close(); }
});
