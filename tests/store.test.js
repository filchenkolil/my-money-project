import { test, eq, ok, rejects } from './harness.js';
import { openDb, deleteDb, dbNameFor, request } from '../js/db.js';
import { MIGRATIONS } from '../js/migrations.js';
import { createStore, MAX_NOTE } from '../js/store.js';
import { buildDefaultCategories } from '../js/seed.js';

let n = 0;
/** Свежая база под каждый тест, после теста удаляется. */
async function withStore(fn, migrations = MIGRATIONS) {
  const name = 'mymoney-test-' + Date.now() + '-' + n++;
  const db = await openDb(name, migrations), store = createStore(db);
  try { await store.seedDefaultsIfEmpty(); return await fn(store, db, name); } finally { db.close(); await deleteDb(name); }
}
const base = { amount: 150000, date: '2026-11-05', categoryId: 'prod' };

test('канал: тестовая версия использует другую базу', () => {
  eq(dbNameFor('/my-money-project/'), 'mymoney');
  eq(dbNameFor('/my-money-project/index.html'), 'mymoney');
  eq(dbNameFor('/my-money-project/beta/'), 'mymoney-beta');
  eq(dbNameFor('/my-money-project/beta'), 'mymoney-beta');
  eq(dbNameFor('/my-money-project/betamax/'), 'mymoney');
});

test('стартовые категории создаются один раз', () => withStore(async (s) => {
  const cats = await s.categories();
  eq(cats.filter((c) => c.parentId === null).length, 15);
  eq(cats.filter((c) => c.parentId === 'subs').map((c) => c.name), ['Claude', 'Яндекс', 'Иви', 'Карьерный клуб', 'iCloud']);
  eq(await s.seedDefaultsIfEmpty(), false);
  eq((await s.categories()).length, buildDefaultCategories().length);
}));

test('расход: добавить, прочитать, изменить, удалить', () => withStore(async (s) => {
  const a = await s.addExpense({ ...base, note: '  чай  ', isRegular: 1 });
  eq(a.note, 'чай'); eq(a.isRegular, true);
  eq((await s.getExpense(a.id)).amount, 150000);
  const b = await s.updateExpense(a.id, { amount: 99900, note: 'кофе' });
  eq([b.amount, b.note, b.date], [99900, 'кофе', '2026-11-05']);
  await s.deleteExpense(a.id);
  eq(await s.getExpense(a.id), undefined);
  eq((await s.allExpenses()).length, 0);
}));

test('расход: проверки данных', () => withStore(async (s) => {
  await rejects(() => s.addExpense({ ...base, amount: 0 }), 'bad_amount');
  await rejects(() => s.addExpense({ ...base, amount: -5 }), 'bad_amount');
  await rejects(() => s.addExpense({ ...base, amount: 1.5 }), 'bad_amount');
  await rejects(() => s.addExpense({ ...base, date: '2026-02-30' }), 'bad_date');
  await rejects(() => s.addExpense({ ...base, categoryId: 'нет' }), 'no_category');
  await rejects(() => s.addExpense({ ...base, categoryId: 'pet', subcategoryId: 'subs.1' }), 'bad_subcategory');
  await rejects(() => s.addExpense({ ...base, note: 'я'.repeat(MAX_NOTE + 1) }), 'note_too_long');
  eq((await s.allExpenses()).length, 0);
}));

test('смена категории при правке сбрасывает подкатегорию', () => withStore(async (s) => {
  const a = await s.addExpense({ amount: 100, date: '2026-11-05', categoryId: 'pet', subcategoryId: 'pet.1' });
  const b = await s.updateExpense(a.id, { categoryId: 'prod' });
  eq(b.subcategoryId, null);
}));

test('расходы месяца: границы месяца и года', () => withStore(async (s) => {
  for (const d of ['2026-10-31', '2026-11-01', '2026-11-30', '2026-12-01', '2027-01-01']) await s.addExpense({ ...base, date: d });
  eq((await s.expensesOfMonth('2026-11')).map((x) => x.date).sort(), ['2026-11-01', '2026-11-30']);
  eq((await s.expensesOfMonth('2026-12')).map((x) => x.date), ['2026-12-01']);
  eq((await s.expensesOfMonth('2027-01')).length, 1);
  eq((await s.expensesOfMonth('2026-08')).length, 0);
}));

test('категории: названия уникальны на своём уровне, ограничения длины', () => withStore(async (s) => {
  await rejects(() => s.addCategory({ name: ' продукты ', hue: 1 }), 'name_taken');
  await rejects(() => s.addCategory({ name: '', hue: 1 }), 'name_empty');
  await rejects(() => s.addCategory({ name: 'я'.repeat(31), hue: 1 }), 'name_too_long');
  const c = await s.addCategory({ name: 'Книги', hue: 35, icon: 'book' });
  eq(c.order, 15);
  await rejects(() => s.addSubcategory('pet', 'корм'), 'name_taken');
  const sub = await s.addSubcategory('prod', 'Овощи'); // то же имя на другом уровне и в другой категории допустимо
  await s.addSubcategory('trans', 'Овощи');
  eq(sub.parentId, 'prod');
  await rejects(() => s.updateCategory(c.id, { name: 'Подарки' }), 'name_taken');
  eq((await s.updateCategory(c.id, { name: 'Книги и учёба', hue: 80 })).hue, 80);
}));

test('порядок категорий', () => withStore(async (s) => {
  const top = (await s.categories()).filter((c) => c.parentId === null).map((c) => c.id);
  await s.reorder(null, [...top].reverse());
  eq((await s.categories()).filter((c) => c.parentId === null).map((c) => c.id), [...top].reverse());
  await rejects(() => s.reorder(null, top.slice(1)), 'bad_order');
}));

test('удаление категории: перенос по одному, всё в одну, откат если расход остался без цели', () => withStore(async (s) => {
  const a = await s.addExpense({ ...base, categoryId: 'gifts' }), b = await s.addExpense({ ...base, categoryId: 'gifts', amount: 200 });
  await rejects(() => s.deleteCategory('gifts', { transfers: { [a.id]: { categoryId: 'fun' } } }), 'transfer_missing');
  ok((await s.categories()).some((c) => c.id === 'gifts'), 'категория не должна удалиться');
  eq((await s.getExpense(a.id)).categoryId, 'gifts');
  await rejects(() => s.deleteCategory('gifts', { allTo: { categoryId: 'gifts' } }), 'transfer_bad_target');
  await rejects(() => s.deleteCategory('gifts', { allTo: { categoryId: 'prod', subcategoryId: 'subs.1' } }), 'transfer_bad_target');
  const r = await s.deleteCategory('gifts', { transfers: { [a.id]: { categoryId: 'fun' } }, allTo: { categoryId: 'rest' } });
  eq(r.moved, 2);
  eq([(await s.getExpense(a.id)).categoryId, (await s.getExpense(b.id)).categoryId], ['fun', 'rest']);
  ok(!(await s.categories()).some((c) => c.id === 'gifts'));
}));

test('удаление категории удаляет её подкатегории, пустую категорию можно удалить без переноса', () => withStore(async (s) => {
  await s.deleteCategory('subs');
  eq((await s.categories()).filter((c) => c.id === 'subs' || c.parentId === 'subs').length, 0);
}));

test('нельзя удалить последнюю категорию', () => withStore(async (s) => {
  const ids = (await s.categories()).filter((c) => c.parentId === null).map((c) => c.id);
  for (const id of ids.slice(1)) await s.deleteCategory(id);
  await rejects(() => s.deleteCategory(ids[0]), 'last_category');
}));

test('удаление подкатегории: в другую подкатегорию, в «без подкатегории», в другую категорию', () => withStore(async (s) => {
  const a = await s.addExpense({ ...base, categoryId: 'pet', subcategoryId: 'pet.1' }), b = await s.addExpense({ ...base, categoryId: 'pet', subcategoryId: 'pet.1' }), c = await s.addExpense({ ...base, categoryId: 'pet', subcategoryId: 'pet.1' });
  await rejects(() => s.deleteSubcategory('pet.1', { transfers: { [a.id]: { categoryId: 'pet', subcategoryId: 'pet.2' } } }), 'transfer_missing');
  await rejects(() => s.deleteSubcategory('pet.1', { allTo: { categoryId: 'pet', subcategoryId: 'pet.1' } }), 'transfer_bad_target');
  await s.deleteSubcategory('pet.1', { transfers: { [a.id]: { categoryId: 'pet', subcategoryId: 'pet.2' }, [b.id]: { categoryId: 'pet', subcategoryId: null } }, allTo: { categoryId: 'health' } });
  eq([(await s.getExpense(a.id)).subcategoryId, (await s.getExpense(b.id)).subcategoryId, (await s.getExpense(c.id)).categoryId], ['pet.2', null, 'health']);
  ok(!(await s.categories()).some((x) => x.id === 'pet.1'));
}));

test('настройки: хранение и значение по умолчанию', () => withStore(async (s) => {
  eq(await s.getMeta('lastExport', 'нет'), 'нет');
  await s.setMeta('lastExport', '2026-10-31');
  eq(await s.getMeta('lastExport'), '2026-10-31');
}));

test('сброс данных очищает всё', () => withStore(async (s) => {
  await s.addExpense(base); await s.setMeta('x', 1);
  await s.resetAll();
  eq([(await s.categories()).length, (await s.allExpenses()).length, await s.getMeta('x')], [0, 0, null]);
}));

test('миграция: данные версии 1 сохраняются при переходе на версию 2', async () => {
  const name = 'mymoney-test-mig-' + Date.now();
  const v2 = (db, tx) => { tx.objectStore('expenses').createIndex('isRegular', 'isRegular'); }; // пример будущей миграции
  let db = await openDb(name, MIGRATIONS);
  let s = createStore(db);
  await s.seedDefaultsIfEmpty();
  const a = await s.addExpense({ ...base, note: 'до обновления', isRegular: true });
  db.close();
  db = await openDb(name, [...MIGRATIONS, v2]);
  s = createStore(db);
  const kept = await s.getExpense(a.id);
  eq([kept.note, kept.amount, kept.isRegular], ['до обновления', 150000, true]);
  eq((await s.categories()).length, buildDefaultCategories().length);
  ok(db.transaction('expenses').objectStore('expenses').indexNames.contains('isRegular'), 'индекс новой версии создан');
  db.close(); await deleteDb(name);
});

test('большой объём: 5000 расходов читаются быстро', () => withStore(async (s) => {
  const t0 = performance.now();
  const cats = ['prod', 'trans', 'pet', 'rest', 'home'];
  const records = Array.from({ length: 5000 }, (_, i) => ({ id: 'e' + i, amount: 100 + i, date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, categoryId: cats[i % 5], subcategoryId: null, note: '', isRegular: false, createdAt: i }));
  await s.applyRestore({ expenses: records });
  const tWrite = performance.now() - t0, t1 = performance.now();
  eq((await s.allExpenses()).length, 5000);
  const month = await s.expensesOfMonth('2026-03');
  ok(month.length > 300, 'месяц прочитан');
  const tRead = performance.now() - t1;
  ok(tWrite < 3000 && tRead < 1000, `запись ${Math.round(tWrite)} мс, чтение ${Math.round(tRead)} мс`);
}));
