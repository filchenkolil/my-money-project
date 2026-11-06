/* Сквозные проверки этапа 7: экспорт, восстановление, сброс. */
import { test, eq, ok } from './harness.js';
import { openApp, withStore, waitFor, sleep, today, monthsAgo } from './helpers.js';
import { parseBackup } from '../js/backup.js';

const seed = async (s) => {
  await s.addExpense({ amount: 150050, date: today(), categoryId: 'pet', subcategoryId: 'pet.1', note: 'корм', isRegular: true });
  await s.addExpense({ amount: 30000, date: monthsAgo(-1), categoryId: 'prod' });
};
/** Подменяем окно «Поделиться»: запоминаем, что приложение хотело сохранить. */
function hookFiles(a, result = 'shared') {
  const saved = [];
  a.win.__mymoneyFiles = { save: async (name, text, mime) => { saved.push({ name, text, mime }); return result; }, read: (f) => f.text() };
  return saved;
}
function pickFile(a, text, name = 'file.json') {
  const dt = new a.win.DataTransfer(); dt.items.add(new a.win.File([text], name, { type: 'application/json' }));
  const input = a.q('#file'); input.files = dt.files; input.dispatchEvent(new a.win.Event('change', { bubbles: true }));
}

test('экспорт JSON: файл читается обратно, имя с датой, запоминается дата экспорта, напоминание уходит', async () => {
  const a = await openApp({ seed, route: '#/backup' });
  try {
    await waitFor(() => a.q('#period'), 'экран');
    const saved = hookFiles(a);
    ok(a.q('.pad').textContent.includes('Экспорт ещё не делался'));
    a.click(a.q('[data-act="json"]')); await waitFor(() => saved.length, 'файл');
    ok(/^mymoney-backup-\d{4}-\d{2}-\d{2}\.json$/.test(saved[0].name), saved[0].name);
    const r = parseBackup(saved[0].text); ok(r.ok);
    eq(r.data.expenses.length, 2); eq(r.data.expenses.find((e) => e.note === 'корм').amount, 150050);
    await waitFor(() => a.q('.pad').textContent.includes('Последний экспорт'), 'дата экспорта');
    eq(await withStore((s) => s.getMeta('lastExportDate')), today());
  } finally { a.close(); }
});

test('экспорт CSV: за месяц и за весь период, отмена окна «Поделиться» не считается экспортом', async () => {
  const a = await openApp({ seed, route: '#/backup' });
  try {
    await waitFor(() => a.q('#period'), 'экран');
    const saved = hookFiles(a);
    eq(a.qa('#period option').length, 3, 'весь период и два месяца');
    a.click(a.q('[data-act="csv"]')); await waitFor(() => saved.length === 1, 'csv');
    eq(saved[0].name, 'mymoney-all.csv'); eq(saved[0].text.trim().split('\r\n').length, 3);
    ok(saved[0].text.startsWith('﻿Дата;Категория'), 'BOM и заголовок для Excel');
    a.change(a.q('#period'), today().slice(0, 7)); await sleep(50);
    a.click(a.q('[data-act="csv"]')); await waitFor(() => saved.length === 2, 'csv месяца');
    eq(saved[1].name, `mymoney-${today().slice(0, 7)}.csv`); eq(saved[1].text.trim().split('\r\n').length, 2);
    ok(saved[1].text.includes('1500,50') || saved[1].text.includes('1 500,50') || saved[1].text.includes(';1500,50;'), saved[1].text);
    // отмена
    await withStore((s) => s.setMeta('lastExportDate', null));
    const a2 = hookFiles(a, 'cancelled'); a.click(a.q('[data-act="csv"]')); await sleep(150);
    eq(a2.length, 1);
    eq(await withStore((s) => s.getMeta('lastExportDate')), null, 'отменённое сохранение не отмечено как экспорт');
  } finally { a.close(); }
});

test('восстановление: проверка файла, подтверждение, добавление к существующим, дубли сохраняются', async () => {
  const src = await openApp({ seed, route: '#/backup' });
  let json;
  try { const s = hookFiles(src); await waitFor(() => src.q('#period'), 'экран'); src.click(src.q('[data-act="json"]')); await waitFor(() => s.length, 'файл'); json = s[0].text; } finally { src.close(); }
  const a = await openApp({ seed, route: '#/backup' });
  try {
    await waitFor(() => a.q('#file'), 'экран');
    ok(a.q('.notice').textContent.includes('уже есть данные'));
    const catsBefore = (await withStore((s) => s.categories())).length;
    pickFile(a, json); await waitFor(() => a.q('.sheet'), 'подтверждение');
    ok(a.q('.sheet').textContent.includes('2 расхода') && a.q('.sheet').textContent.includes('дубли'), a.q('.sheet').textContent);
    a.click(a.q('[data-act="cancel"]')); await sleep(60);
    eq((await withStore((s) => s.allExpenses())).length, 2, 'отмена ничего не добавила');
    pickFile(a, json); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="restore"]')); await waitFor(() => a.q('.toast.show') && a.q('.toast').textContent.includes('Добавлено'), 'готово');
    const rows = await withStore((s) => s.allExpenses());
    eq(rows.length, 4); eq(rows.filter((e) => e.amount === 150050 && e.note === 'корм' && e.isRegular).length, 2);
    eq((await withStore((s) => s.categories())).length, catsBefore, 'категории совпали по названию, новых не появилось');
  } finally { a.close(); }
});

test('восстановление: неверный и повреждённый файл отклоняются, данные не меняются', async () => {
  const a = await openApp({ seed, route: '#/backup' });
  try {
    await waitFor(() => a.q('#file'), 'экран');
    pickFile(a, 'это не json'); await waitFor(() => a.q('.err'), 'ошибка');
    ok(a.q('.err').textContent.includes('Файл не подошёл'));
    pickFile(a, JSON.stringify({ app: 'other', categories: [], expenses: [] })); await sleep(120);
    ok(a.q('.err').textContent.includes('не файл MyMoney'));
    pickFile(a, JSON.stringify({ app: 'mymoney', schema: 1, categories: [{ id: 'a', name: 'А', parentId: null, order: 0 }], expenses: [{ amount: -5, date: '2026-01-01', categoryId: 'a' }] })); await sleep(120);
    ok(a.q('.err').textContent.includes('повреждён'));
    ok(!a.q('.sheet'));
    eq((await withStore((s) => s.allExpenses())).length, 2);
  } finally { a.close(); }
});

test('восстановление в пустое приложение: категории из файла создаются, итоги сходятся', async () => {
  const json = JSON.stringify({ app: 'mymoney', schema: 1, categories: [{ id: 'x1', name: 'Книги', icon: 'book', hue: 77, order: 0, parentId: null }, { id: 'x2', name: 'Научные', icon: null, hue: null, order: 0, parentId: 'x1' }],
    expenses: [{ amount: 12300, date: '2026-10-05', categoryId: 'x1', subcategoryId: 'x2', note: 'учебник', isRegular: false }, { amount: 700, date: '2026-10-06', categoryId: 'x1' }] });
  const a = await openApp({ route: '#/backup' });
  try {
    await waitFor(() => a.q('#file'), 'экран');
    ok(!a.q('.notice'), 'предупреждения о существующих данных нет');
    pickFile(a, json); await waitFor(() => a.q('.sheet'), 'подтверждение');
    ok(a.q('.sheet').textContent.includes('новых категорий: 1'));
    a.click(a.q('[data-act="restore"]')); await waitFor(() => a.q('.toast.show'), 'готово');
    const [cats, rows] = await withStore(async (s) => [await s.categories(), await s.allExpenses()]);
    const books = cats.find((c) => c.name === 'Книги');
    eq([books.icon, books.hue], ['book', 77]);
    eq(rows.reduce((s, e) => s + e.amount, 0), 13000);
    eq(cats.find((c) => c.id === rows.find((e) => e.note === 'учебник').subcategoryId).name, 'Научные');
  } finally { a.close(); }
});

test('сброс: два шага, отказ ничего не удаляет, после сброса стартовые категории и главный экран', async () => {
  const a = await openApp({ seed, route: '#/reset' });
  try {
    await waitFor(() => a.q('[data-act="ask"]'), 'экран');
    a.click(a.q('[data-act="ask"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="cancel"]')); await sleep(60);
    eq((await withStore((s) => s.allExpenses())).length, 2);
    a.click(a.q('[data-act="ask"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.q('#amt'), 'главный экран');
    eq((await withStore((s) => s.allExpenses())).length, 0);
    eq((await withStore((s) => s.categories())).filter((c) => c.parentId === null).length, 15);
    eq(a.qa('.tile:not(.more)').length, 7);
  } finally { a.close(); }
});

test('настройки: переходы к экспорту и сбросу', async () => {
  const a = await openApp({ route: '#/settings' });
  try {
    await waitFor(() => a.q('.setrow'), 'настройки');
    a.click(a.qa('.setrow')[1]); await waitFor(() => a.h1() === 'Экспорт и восстановление', 'экспорт');
    a.click(a.q('[data-act="back"]')); await waitFor(() => a.h1() === 'Настройки', 'назад');
    a.click(a.qa('.setrow')[2]); await waitFor(() => a.h1() === 'Сброс данных', 'сброс');
  } finally { a.close(); }
});
