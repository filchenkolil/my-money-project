import { test, eq, ok } from './harness.js';
import { openDb, deleteDb } from '../js/db.js';
import { MIGRATIONS, SCHEMA_VERSION } from '../js/migrations.js';
import { createStore } from '../js/store.js';
import { buildBackup, parseBackup, planRestore, buildCsv, csvFileName, jsonFileName } from '../js/backup.js';
import { monthTotals, categoryTotals } from '../js/stats.js';

let n = 0;
async function withStore(fn) {
  const name = 'mymoney-test-bk-' + Date.now() + '-' + n++;
  const db = await openDb(name, MIGRATIONS), store = createStore(db);
  try { await store.seedDefaultsIfEmpty(); return await fn(store); } finally { db.close(); await deleteDb(name); }
}
const add = (s, date, amount, categoryId, extra = {}) => s.addExpense({ date, amount, categoryId, ...extra });

test('имена файлов', () => {
  eq(csvFileName('2026-10'), 'mymoney-2026-10.csv');
  eq(csvFileName(null), 'mymoney-all.csv');
  eq(jsonFileName('2026-11-05'), 'mymoney-backup-2026-11-05.json');
});

test('JSON: экспорт → сброс → восстановление даёт те же итоги', () => withStore(async (s) => {
  await add(s, '2026-09-03', 100050, 'prod', { note: 'овощи' });
  await add(s, '2026-10-05', 300000, 'edu', { isRegular: true });
  await add(s, '2026-10-06', 99900, 'subs', { subcategoryId: 'subs.1', isRegular: true, note: 'Claude' });
  const before = await s.exportAll();
  const file = buildBackup(before, new Date('2026-11-05T10:00:00Z'));
  const parsed = parseBackup(file);
  ok(parsed.ok, 'файл читается');
  await s.resetAll();
  const plan = planRestore(await s.categories(), parsed.data);
  await s.applyRestore(plan);
  const after = await s.exportAll();
  eq(monthTotals(after.expenses), monthTotals(before.expenses));
  eq(after.expenses.length, 3);
  const sub = after.expenses.find((x) => x.note === 'Claude');
  eq(after.categories.find((c) => c.id === sub.subcategoryId).name, 'Claude');
  eq(after.expenses.find((x) => x.note === 'овощи').amount, 100050);
  eq(after.expenses.filter((x) => x.isRegular).length, 2);
}));

test('JSON: в файле версия схемы, дата выгрузки и признак приложения', () => withStore(async (s) => {
  const raw = JSON.parse(buildBackup(await s.exportAll(), new Date('2026-11-05T10:00:00Z')));
  eq([raw.app, raw.schema, raw.exportedAt], ['mymoney', SCHEMA_VERSION, '2026-11-05T10:00:00.000Z']);
}));

test('восстановление добавляет к существующим данным, дубли сохраняются', () => withStore(async (s) => {
  await add(s, '2026-10-05', 300000, 'edu');
  const file = buildBackup(await s.exportAll());
  const p1 = planRestore(await s.categories(), parseBackup(file).data);
  eq(p1.categories.length, 0, 'все категории совпали по названию');
  await s.applyRestore(p1);
  const p2 = planRestore(await s.categories(), parseBackup(file).data);
  await s.applyRestore(p2);
  eq((await s.allExpenses()).length, 3); // 1 исходный + 2 повторных
  eq(categoryTotals(await s.allExpenses(), '2026-10'), { edu: 900000 });
}));

test('восстановление: категории сопоставляются по названию, отсутствующие создаются', () => withStore(async (s) => {
  const backup = parseBackup(JSON.stringify({ app: 'mymoney', schema: 1, categories: [
    { id: 'x1', name: ' ПРОДУКТЫ ', icon: 'cart', hue: 1, order: 0, parentId: null },
    { id: 'x2', name: 'Книги', icon: 'book', hue: 77, order: 1, parentId: null },
    { id: 'x3', name: 'Научные', icon: null, hue: null, order: 0, parentId: 'x2' },
    { id: 'x4', name: 'Корм', icon: null, hue: null, order: 0, parentId: 'x5' },
    { id: 'x5', name: 'питомец', icon: 'paw', hue: 2, order: 2, parentId: null },
  ], expenses: [
    { amount: 100, date: '2026-10-01', categoryId: 'x1' }, { amount: 200, date: '2026-10-02', categoryId: 'x2', subcategoryId: 'x3' }, { amount: 300, date: '2026-10-03', categoryId: 'x5', subcategoryId: 'x4' },
  ] })).data;
  const plan = planRestore(await s.categories(), backup);
  eq(plan.createdCategories, 1);
  await s.applyRestore(plan);
  const cats = await s.categories(), books = cats.find((c) => c.name === 'Книги');
  eq([books.hue, books.icon, books.order], [77, 'book', 15]);
  eq(cats.filter((c) => c.name.toLowerCase() === 'продукты').length, 1);
  const exps = await s.allExpenses();
  eq(exps.find((e) => e.amount === 100).categoryId, 'prod');
  eq(exps.find((e) => e.amount === 300).subcategoryId, 'pet.1'); // «Корм» совпал с существующей подкатегорией
  eq(cats.find((c) => c.id === exps.find((e) => e.amount === 200).subcategoryId).parentId, books.id);
}));

test('неверные и повреждённые файлы отклоняются с понятной причиной', () => {
  eq(parseBackup('это не json').reason, 'not_json');
  eq(parseBackup('{"a":1}').reason, 'not_mymoney');
  eq(parseBackup('{"app":"other","schema":1,"categories":[],"expenses":[]}').reason, 'not_mymoney');
  eq(parseBackup(`{"app":"mymoney","schema":${SCHEMA_VERSION + 1},"categories":[],"expenses":[]}`).reason, 'newer_version');
  const cat = '{"id":"a","name":"А","parentId":null,"order":0}';
  eq(parseBackup(`{"app":"mymoney","schema":1,"categories":[${cat}],"expenses":[{"amount":-5,"date":"2026-01-01","categoryId":"a"}]}`).reason, 'corrupt');
  eq(parseBackup(`{"app":"mymoney","schema":1,"categories":[${cat}],"expenses":[{"amount":5,"date":"2026-13-01","categoryId":"a"}]}`).reason, 'corrupt');
  eq(parseBackup(`{"app":"mymoney","schema":1,"categories":[${cat}],"expenses":[{"amount":5,"date":"2026-01-01","categoryId":"zzz"}]}`).reason, 'corrupt');
  eq(parseBackup(`{"app":"mymoney","schema":1,"categories":[{"id":"b","name":"Б","parentId":"нет"}],"expenses":[]}`).reason, 'corrupt');
  ok(parseBackup(`{"app":"mymoney","schema":1,"categories":[${cat}],"expenses":[]}`).ok);
});

test('при неверном файле данные не меняются', () => withStore(async (s) => {
  await add(s, '2026-10-05', 300000, 'edu');
  const r = parseBackup('мусор');
  ok(!r.ok);
  eq((await s.allExpenses()).length, 1);
}));

test('CSV: заголовок, разделитель «;», запятая в сумме, кавычки, BOM', () => withStore(async (s) => {
  await add(s, '2026-10-06', 99950, 'subs', { subcategoryId: 'subs.1', isRegular: true, note: 'Claude; "pro"' });
  await add(s, '2026-10-02', 150000, 'prod');
  await add(s, '2026-11-02', 100, 'prod');
  const { categories, expenses } = await s.exportAll();
  const csv = buildCsv(expenses, categories, '2026-10');
  ok(csv.startsWith('﻿Дата;Категория;Подкатегория;Сумма;Комментарий;Регулярный\r\n'));
  const lines = csv.trim().split('\r\n');
  eq(lines.length, 3);
  eq(lines[1], '2026-10-02;Продукты;;1500;;нет');
  eq(lines[2], '2026-10-06;Подписки;Claude;999,50;"Claude; ""pro""";да');
  eq(buildCsv(expenses, categories).trim().split('\r\n').length, 4); // без периода: весь список
}));

test('CSV: комментарий, похожий на формулу, не выполняется в Excel', () => withStore(async (s) => {
  await add(s, '2026-10-02', 100, 'prod', { note: '=1+1' });
  await add(s, '2026-10-03', 100, 'prod', { note: '@SUM(A1)' });
  const { categories, expenses } = await s.exportAll();
  const csv = buildCsv(expenses, categories);
  ok(csv.includes(";'=1+1;") && csv.includes(";'@SUM(A1);"));
}));
