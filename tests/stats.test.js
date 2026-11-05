import { test, eq, ok } from './harness.js';
import * as S from '../js/stats.js';

// Выдуманные данные. Реальных записей в тестах нет.
const e = (date, amount, categoryId, subcategoryId = null, isRegular = false) => ({ id: date + amount + categoryId, date, amount, categoryId, subcategoryId, isRegular, note: '' });
const DATA = [
  e('2026-09-03', 100000, 'prod'), e('2026-09-20', 50000, 'prod'), e('2026-09-21', 300000, 'edu', null, true),
  e('2026-10-02', 120000, 'prod'), e('2026-10-05', 300000, 'edu', null, true), e('2026-10-06', 99900, 'subs', 'subs.1', true), e('2026-10-30', 200000, 'gifts'),
  e('2026-11-01', 10000, 'prod'),
];

test('итоги по месяцам и по категориям', () => {
  eq(S.monthTotals(DATA), { '2026-09': 450000, '2026-10': 719900, '2026-11': 10000 });
  eq(S.monthTotal(DATA, '2026-10'), 719900);
  eq(S.monthTotal(DATA, '2026-08'), 0);
  eq(S.categoryTotals(DATA, '2026-09'), { prod: 150000, edu: 300000 });
});

test('изменение к прошлому месяцу, в том числе когда сравнивать не с чем', () => {
  eq(S.delta(719900, 450000), { diff: 269900, pct: 60 });
  eq(S.delta(100, 300), { diff: -200, pct: -66.7 });
  eq(S.delta(500, 0), { diff: 500, pct: null });
  eq(S.delta(0, 0), { diff: 0, pct: null });
});

test('доли: округление и нулевой итог', () => {
  eq(S.share(1, 3), 33.3);
  eq(S.share(2, 3), 66.7);
  eq(S.share(5, 0), 0);
});

test('категория во времени: ряд по месяцам, среднее, минимум и максимум', () => {
  const ks = ['2026-09', '2026-10', '2026-11'];
  const prod = S.series(DATA, ks, { categoryId: 'prod' });
  eq(prod, [150000, 120000, 10000]);
  eq(S.summary(prod), { total: 280000, avg: 93333, min: 10000, max: 150000 });
  eq(S.series(DATA, ks, { categoryId: 'subs', subcategoryId: 'subs.1' }), [0, 99900, 0]);
  eq(S.series(DATA, ks, { categoryId: 'inv' }), [0, 0, 0]);
  eq(S.summary([0, 0, 0]), { total: 0, avg: 0, min: 0, max: 0 });
  eq(S.summary([]), { total: 0, avg: 0, min: 0, max: 0 });
});

test('регулярные: доля в расходах месяца и по категориям', () => {
  eq(S.regularShare(DATA, '2026-10'), { regular: 399900, total: 719900, pct: 55.5 });
  eq(S.regularShare(DATA, '2026-09'), { regular: 300000, total: 450000, pct: 66.7 });
  eq(S.regularShare(DATA, '2026-08'), { regular: 0, total: 0, pct: 0 });
  eq(S.regularByCategory(DATA, '2026-10'), { edu: 300000, subs: 99900 });
});

test('разбивка категории по подкатегориям (пустая подкатегория = без подкатегории)', () => {
  const l = [e('2026-10-01', 100, 'pet', 'pet.1'), e('2026-10-02', 200, 'pet', 'pet.1'), e('2026-10-03', 50, 'pet')];
  eq(S.subTotals(l, '2026-10', 'pet'), { 'pet.1': 300, '': 50 });
});

test('самые заметные изменения между месяцами', () => {
  const r = S.topChanges(S.categoryTotals(DATA, '2026-10'), S.categoryTotals(DATA, '2026-09'));
  eq(r[0].categoryId, 'gifts'); eq(r[0].diff, 200000);
  eq(r.find((x) => x.categoryId === 'edu').diff, 0);
  eq(r.length, 4);
});

test('итог за день', () => {
  eq(S.dayTotal(DATA, '2026-10-05'), { count: 1, total: 300000 });
  eq(S.dayTotal(DATA, '2026-10-07'), { count: 0, total: 0 });
});

test('частые категории: по числу расходов за 60 дней, затем по последнему использованию', () => {
  const ids = ['prod', 'trans', 'pet', 'gifts', 'rest'];
  const l = [e('2026-11-01', 1, 'gifts'), e('2026-10-30', 1, 'gifts'), e('2026-11-02', 1, 'rest'), e('2026-10-20', 1, 'trans'), e('2026-10-21', 1, 'trans'),
    e('2026-01-05', 1, 'pet'), e('2026-01-06', 1, 'pet'), e('2026-01-07', 1, 'pet')]; // давно: в расчёт не входит
  eq(S.frequentCategories(l, ids, '2026-11-05'), ['gifts', 'trans', 'rest', 'prod', 'pet']);
  eq(S.frequentCategories([], ids, '2026-11-05'), ['prod', 'trans', 'pet', 'gifts', 'rest']);                // нет истории: порядок по умолчанию
  eq(S.frequentCategories([e('2026-11-07', 1, 'rest')], ids, '2026-11-05'), ['prod', 'trans', 'pet', 'gifts', 'rest']); // расходы «из будущего» не считаются
});
