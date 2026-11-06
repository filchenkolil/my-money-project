import { test, eq, ok } from './harness.js';
import { overview, compare, categoryView, categoryDetail } from '../js/analytics.js';
import { compactRub, formatPct } from '../js/money.js';

const e = (id, date, amount, categoryId, subcategoryId = null) => ({ id, date, amount, categoryId, subcategoryId, isRegular: false, note: '', createdAt: +id.slice(1) });
const D = [e('a1', '2026-09-03', 100000, 'prod'), e('a2', '2026-09-20', 50000, 'pet', 'pet.1'), e('a3', '2026-10-02', 300000, 'prod'), e('a4', '2026-10-05', 100000, 'pet', 'pet.1'),
  e('a5', '2026-10-06', 100000, 'pet'), e('a6', '2026-10-09', 100000, 'gifts'), e('a7', '2026-11-01', 80000, 'prod')];

test('обзор: итог, изменение к прошлому месяцу, категории по убыванию с долей и изменением', () => {
  const o = overview(D, '2026-10', '2026-11-05');
  eq([o.total, o.prevTotal, o.hasPrev, o.delta], [600000, 150000, true, { diff: 450000, pct: 300 }]);
  eq(o.items.map((i) => [i.categoryId, i.amount, i.share]), [['prod', 300000, 50], ['pet', 200000, 33.3], ['gifts', 100000, 16.7]]);
  eq(o.items[0].delta, { diff: 200000, pct: 200 });
  eq(o.items[2].delta.pct, null, 'у категории не было расходов в прошлом месяце');
  eq(o.progress.complete, true);
});

test('обзор: идущий месяц, месяц без расходов и первый месяц данных', () => {
  const cur = overview(D, '2026-11', '2026-11-05');
  eq([cur.progress.complete, cur.progress.day, cur.progress.days], [false, 5, 30]);
  const empty = overview(D, '2026-08', '2026-11-05');
  eq([empty.total, empty.items.length, empty.hasPrev], [0, 0, false]);
  const first = overview(D, '2026-09', '2026-11-05');
  eq([first.hasPrev, first.delta.pct], [false, null]);
});

test('месяц к месяцу: столбцы по месяцам и таблица с самыми заметными изменениями сверху', () => {
  const c = compare(D, ['2026-09', '2026-10', '2026-11'], '2026-10');
  eq(c.months.map((m) => m.total), [150000, 600000, 80000]);
  eq(c.rows[0].categoryId, 'prod'); eq(c.rows[0].diff, 200000);
  ok(c.rows.every((r) => r.cur > 0 || r.prev > 0));
  eq(c.rows.find((r) => r.categoryId === 'gifts'), { categoryId: 'gifts', cur: 100000, prev: 0, diff: 100000 });
});

test('категория во времени: значения, доли от всех расходов, изменение, среднее, минимум, максимум', () => {
  const keys = ['2026-09', '2026-10', '2026-11'];
  const v = categoryView(D, keys, '2026-10', { categoryId: 'prod' });
  eq(v.values, [100000, 300000, 80000]); eq(v.shares, [66.7, 50, 100]);
  eq([v.cur, v.prev, v.delta, v.hasPrev], [300000, 100000, { diff: 200000, pct: 200 }, true]);
  eq(v.stats, { total: 480000, avg: 160000, min: 80000, max: 300000 });
  const sub = categoryView(D, keys, '2026-10', { categoryId: 'pet', subcategoryId: 'pet.1' });
  eq(sub.values, [50000, 100000, 0]);
  eq(categoryView(D, keys, '2026-10', { categoryId: 'inv' }).stats, { total: 0, avg: 0, min: 0, max: 0 });
  eq(categoryView(D, keys, '2026-09', { categoryId: 'prod' }).hasPrev, false);
});

test('детализация категории: подкатегории по убыванию, «без подкатегории», список новые сверху', () => {
  const d = categoryDetail(D, '2026-10', 'pet', (id) => ({ 'pet.1': 'Корм' }[id]));
  eq(d.total, 200000);
  eq(d.subs.map((s) => [s.name, s.amount]), [['Корм', 100000], ['Без подкатегории', 100000]].sort((a, b) => b[1] - a[1]));
  eq(d.list.map((x) => x.id), ['a5', 'a4']);
  eq(categoryDetail(D, '2026-10', 'prod', () => '').subs, [], 'без подкатегорий разбивка не нужна');
});

test('короткие суммы и проценты', () => {
  eq([95000, 7530000, 12345000, 100000, 250000000].map(compactRub), ['950', '75,3к', '123,5к', '1к', '2,5м']);
  eq([formatPct(12.3), formatPct(12), formatPct(0)], ['12,3%', '12%', '0%']);
});
