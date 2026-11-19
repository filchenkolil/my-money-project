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

test('поиск категории по тексту: название, подкатегория, начало слова, неоднозначность', async () => {
  const { findCategoryChoice, categoryChoices } = await import('../js/categories.js');
  const cats = [{ id: 'a', name: 'Питомец', parentId: null, order: 0 }, { id: 'a1', name: 'Корм', parentId: 'a', order: 0 }, { id: 'b', name: 'Продукты', parentId: null, order: 1 }, { id: 'c', name: 'Подарки', parentId: null, order: 2 }, { id: 'c1', name: 'Корм для души', parentId: 'c', order: 0 }];
  eq(categoryChoices(cats).map((c) => c.label), ['Питомец', 'Питомец › Корм', 'Продукты', 'Подарки', 'Подарки › Корм для души']);
  eq(findCategoryChoice(cats, 'питомец'), 'c:a'); eq(findCategoryChoice(cats, ' ПРОДУКТЫ '), 'c:b');
  eq(findCategoryChoice(cats, 'Питомец › Корм'), 's:a:a1'); eq(findCategoryChoice(cats, 'питомец > корм'), 's:a:a1');
  eq(findCategoryChoice(cats, 'прод'), 'c:b', 'единственное совпадение по началу'); eq(findCategoryChoice(cats, 'души'), 's:c:c1', 'совпадение внутри названия');
  eq(findCategoryChoice(cats, 'п'), null, 'несколько вариантов: не угадываем');
  eq(findCategoryChoice(cats, 'корм'), 's:a:a1', 'точное название подкатегории важнее частичного');
  eq(findCategoryChoice(cats, 'нет'), null); eq(findCategoryChoice(cats, ''), null);
});

test('история с поездками: строки в рублях, фильтр скрывает поездки, лента вперёд на 12 месяцев', async () => {
  const { selectMonthWithTrips, monthStripKeys, NO_FILTERS } = await import('../js/history.js');
  const trips = [{ id: 't', name: 'Турция', start: '2027-01-10', end: '2027-01-15', currency: 'TRY', rateE4: 23500 }];
  const tripExpenses = [{ id: 'x1', tripId: 't', date: '2026-11-18', amount: 100000, isRub: true, categoryId: 'tc.tkt', createdAt: 5 }, { id: 'x2', tripId: 't', date: '2027-01-11', amount: 10000, isRub: false, categoryId: 'tc.fod', createdAt: 6 }];
  const exp = [{ id: 'e1', date: '2026-11-18', amount: 5000, categoryId: 'prod', subcategoryId: null, isRegular: false, createdAt: 9 }];
  const nov = selectMonthWithTrips(exp, { trips, tripExpenses }, '2026-11');
  eq(nov.map((e) => e.id), ['e1', 'x1']); eq(nov[1].amount, 100000); eq(nov[1].trip.name, 'Турция');
  eq(selectMonthWithTrips(exp, { trips, tripExpenses }, '2027-01').map((e) => e.amount), [23500], '100 TRY по курсу 2,35');
  eq(selectMonthWithTrips(exp, { trips, tripExpenses }, '2026-11', { ...NO_FILTERS, regularOnly: true }), []);
  eq(selectMonthWithTrips(exp, { trips, tripExpenses }, '2026-11', { ...NO_FILTERS, categoryId: 'prod' }).map((e) => e.id), ['e1']);
  const ks = monthStripKeys([], '2026-11-19', 12); eq([ks[0], ks.at(-1), ks.length], ['2026-11', '2027-11', 13]);
  eq(monthStripKeys([], '2026-11-19').length, 1, 'без ahead лента как раньше');
});

test('аналитика поездок: по категориям, по дням одной поездки, по поездкам', async () => {
  const { tripsAnalysis } = await import('../js/analytics.js');
  const trips = [{ id: 't', name: 'Турция', start: '2027-01-10', end: '2027-01-12', currency: 'TRY', rateE4: 20000 }, { id: 'm', name: 'Москва', start: '2027-02-01', end: '2027-02-02', currency: 'RUB', rateE4: 10000 }];
  const tripExpenses = [
    { id: '1', tripId: 't', date: '2026-11-18', amount: 3000000, isRub: true, categoryId: 'tc.tkt' }, { id: '2', tripId: 't', date: '2027-01-10', amount: 10000, isRub: false, categoryId: 'tc.fod' },
    { id: '3', tripId: 't', date: '2027-01-11', amount: 5000, isRub: false, categoryId: 'tc.fod' }, { id: '4', tripId: 'm', date: '2027-02-01', amount: 200000, isRub: false, categoryId: 'tc.trn' }];
  const all = tripsAnalysis({ trips, tripExpenses });
  eq([all.total, all.count, all.days, all.before], [3000000 + 20000 + 10000 + 200000, 4, 5, 3000000]);
  eq(all.items.map((i) => i.id), ['tc.tkt', 'tc.trn', 'tc.fod']); eq(all.items[0].share, Math.round((3000000 / 3230000) * 1000) / 10);
  eq(all.perDay, Math.round(3230000 / 5)); eq(all.avg, Math.round(3230000 / 4));
  const one = tripsAnalysis({ trips, tripExpenses }, { tripId: 't', by: 'time' });
  eq(one.single, true); eq(one.items.map((i) => i.id), ['2026-11-18', '2027-01-10', '2027-01-11', '2027-01-12']); eq(one.items.map((i) => i.amount), [3000000, 20000, 10000, 0]);
  const byTrip = tripsAnalysis({ trips, tripExpenses }, { by: 'time' });
  eq(byTrip.items.map((i) => [i.label, i.amount]), [['Турция', 3030000], ['Москва', 200000]]);
  eq(tripsAnalysis({ trips, tripExpenses: [] }).total, 0);
});
