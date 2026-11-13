/* Поездки (v2): логика, хранилище, миграция 1 → 2, файл резервной копии. Данные выдуманные. */
import { test, eq, ok, rejects } from './harness.js';
import { openDb, deleteDb } from '../js/db.js';
import { MIGRATIONS, SCHEMA_VERSION } from '../js/migrations.js';
import { createStore } from '../js/store.js';
import * as T from '../js/trips.js';
import { buildBackup, parseBackup, planRestore, planTripRestore, buildTripsCsv, tripsCsvFileName } from '../js/backup.js';
import { monthTotal } from '../js/stats.js';
import { formatRub } from '../js/money.js';
import { buildDefaultCategories } from '../js/seed.js';

/* ---------- логика ---------- */
test('курс: ввод с запятой и точкой, до четырёх знаков, ошибки', () => {
  eq([T.parseRate('2,35'), T.parseRate('2.3500'), T.parseRate(' 90 '), T.parseRate('0,0001'), T.parseRate('1 000,5')].map((r) => r.rateE4), [23500, 23500, 900000, 1, 10005000]);
  eq(['', 'abc', '2,', '2,12345', '-1', '1e3'].map((v) => T.parseRate(v).reason), ['format', 'format', 'format', 'format', 'format', 'format']);
  eq([T.parseRate('0').reason, T.parseRate('0,0000').reason, T.parseRate('10000,0001').reason, T.parseRate('99999999999').reason], ['zero', 'zero', 'too_big', 'too_big']);
  eq([T.formatRate(23500), T.formatRate(23550), T.formatRate(10000), T.formatRateFull(23500), T.formatRateFull(1)], ['2,35', '2,36', '1,00', '2,3500', '0,0001']);
});

test('пересчёт: округление до копейки, большие суммы без потери точности, рубли не меняются', () => {
  eq(T.toRub(100000, 23500), 235000);        // 1000,00 × 2,35
  eq(T.toRub(333, 23456), 781);              // 3,33 × 2,3456 = 7,8108 → 7,81
  eq([T.toRub(1, 4999), T.toRub(1, 5000)], [0, 1]); // 0,4999 → 0, 0,5 → 1
  eq(T.toRub(1000000000, 99999999), 9999999900000, 'самая большая сумма на очень большой курс без потери точности');
  eq(T.toRub(1, 10000), 1);
  eq(T.expenseRub({ amount: 500, isRub: true }, { currency: 'TRY', rateE4: 23500 }), 500);
  eq(T.expenseRub({ amount: 100, isRub: false }, { currency: 'TRY', rateE4: 23500 }), 235);
  eq(T.expenseRub({ amount: 100, isRub: false }, { currency: 'RUB', rateE4: 10000 }), 100, 'поездка в рублях: пересчёта нет');
});

const TRIP = { id: 't1', name: 'Турция', start: '2026-12-06', end: '2026-12-10', currency: 'TRY', rateE4: 23500 };
const TE = (id, tripId, categoryId, amount, date, isRub = false, note = '') => ({ id, tripId, categoryId, amount, date, isRub, note, createdAt: +id.slice(1) });
const EXPS = [TE('e1', 't1', 'tc.tkt', 2840000, '2026-11-20', true, 'билеты'), TE('e2', 't1', 'tc.sty', 950000, '2026-12-06'), TE('e3', 't1', 'tc.res', 125000, '2026-12-06'), TE('e4', 't1', 'tc.res', 80000, '2026-12-09'), TE('e9', 't2', 'tc.tkt', 100000, '2026-12-18', true)];

test('сводка поездки: полная стоимость с тратами до начала, в валюте и рублях, по категориям и месяцам', () => {
  const s = T.tripSummary(TRIP, EXPS);
  eq(s.count, 4);
  eq(s.totalRub, 2840000 + T.toRub(950000, 23500) + T.toRub(125000, 23500) + T.toRub(80000, 23500));
  eq([s.localSum, s.rubSum], [950000 + 125000 + 80000, 2840000]);
  eq(s.beforeStartRub, 2840000);
  eq([s.days, s.perDay], [5, Math.round(s.totalRub / 5)]);
  eq(s.byCategory[0].categoryId, 'tc.tkt'); eq(s.byCategory.map((c) => c.categoryId), ['tc.tkt', 'tc.sty', 'tc.res']);
  eq(s.byCategory.find((c) => c.categoryId === 'tc.res').amount, T.toRub(125000, 23500) + T.toRub(80000, 23500));
  eq(s.byMonth.map((m) => m.key), ['2026-11', '2026-12']); eq(s.byMonth[0].amount, 2840000);
  eq(T.tripSummary({ ...TRIP, id: 'нет' }, EXPS).totalRub, 0);
});

test('месяцы: расходы поездки строго по своей дате, поездка отдельным сегментом', () => {
  const trips = [TRIP, { id: 't2', name: 'Москва', start: '2026-12-18', end: '2026-12-20', currency: 'RUB', rateE4: 10000 }];
  eq(T.tripMonthTotals(trips, EXPS)['2026-11'], 2840000);
  eq(T.tripMonthTotals(trips, EXPS)['2026-12'], T.toRub(950000 + 125000 + 80000, 23500) + 100000);
  const seg = T.monthTripSegments(trips, EXPS, '2026-12');
  eq(seg.map((x) => x.name), ['Турция', 'Москва']); eq(seg[1].amount, 100000);
  eq(T.monthTripSegments(trips, EXPS, '2026-11').map((x) => x.name), ['Турция']);
  eq(T.monthTripSegments(trips, EXPS, '2026-10'), []);
});

test('смена курса: стоимость до и после, рублёвые траты не меняются', () => {
  const p = T.previewRateChange(TRIP, EXPS, 30000);
  eq(p.before, 2840000 + T.toRub(950000, 23500) + T.toRub(125000, 23500) + T.toRub(80000, 23500));
  eq(p.after, 2840000 + T.toRub(950000, 30000) + T.toRub(125000, 30000) + T.toRub(80000, 30000));
  eq(T.previewRateChange(TRIP, EXPS, 23500).before, T.previewRateChange(TRIP, EXPS, 23500).after);
});

test('проверка поездки: название, даты, валюта, курс; для рубля курс не нужен', () => {
  const ok1 = T.checkTrip({ name: ' Стамбул ', start: '2027-02-12', end: '2027-02-16', currency: 'try', rate: '2,3500' });
  eq([ok1.ok, ok1.trip], [true, { name: 'Стамбул', start: '2027-02-12', end: '2027-02-16', currency: 'TRY', rateE4: 23500 }]);
  eq(T.checkTrip({ name: 'Москва', start: '2027-02-12', end: '2027-02-12', currency: 'RUB', rate: '' }).trip.rateE4, 10000);
  const bad = (o) => T.checkTrip({ name: 'А', start: '2027-02-12', end: '2027-02-16', currency: 'TRY', rate: '2', ...o }, [{ id: 'x', name: 'А', start: '2027-02-12', end: '2027-02-16' }]);
  eq([bad({ name: '' }).field, bad({ name: 'Б'.repeat(31) }).field, bad({ name: 'А' }).field, bad({ name: 'Б', end: '2027-02-11' }).field, bad({ name: 'Б', start: '' }).field, bad({ name: 'Б', currency: 'ТУР' }).field, bad({ name: 'Б', rate: '0' }).field],
    ['name', 'name', 'name', 'dates', 'dates', 'currency', 'rate']);
  eq(bad({ name: 'А' }).message, 'Такая поездка с этими датами уже есть.');
  ok(bad({ name: 'А', start: '2027-03-01', end: '2027-03-02' }).ok, 'то же название с другими датами допустимо');
});

test('перенос при удалении поездки: в другую поездку или в обычные расходы в рублях', () => {
  const t2 = { id: 't2', name: 'Москва', start: '2026-12-18', end: '2026-12-20', currency: 'RUB', rateE4: 10000 };
  const t3 = { id: 't3', name: 'Анкара', start: '2027-01-10', end: '2027-01-12', currency: 'TRY', rateE4: 25000 };
  const local = EXPS[1], rubE = EXPS[0];
  const toReg = T.moveTripExpense(local, TRIP, { categoryId: 'rest', subcategoryId: null });
  eq([toReg.kind, toReg.record.amount, toReg.record.categoryId, toReg.record.isRegular], ['regular', T.toRub(950000, 23500), 'rest', false]);
  eq(T.moveTripExpense(rubE, TRIP, { categoryId: 'trans', subcategoryId: null }).record.amount, 2840000);
  const same = T.moveTripExpense(local, TRIP, { tripId: 't3' }, t3);
  eq([same.kind, same.record.tripId, same.record.amount, same.record.isRub], ['trip', 't3', 950000, false], 'та же валюта: остаётся в валюте');
  const diff = T.moveTripExpense(local, TRIP, { tripId: 't2' }, t2);
  eq([diff.record.amount, diff.record.isRub], [T.toRub(950000, 23500), true], 'другая валюта: фиксируется в рублях по прежнему курсу');
  const opts = T.tripTransferOptions([TRIP, t2, t3], 't1', [{ value: 'rest|', label: 'Рестораны' }]);
  eq(opts.map((o) => o.value), ['t:t3', 't:t2', 'c:rest|']);
  eq([T.parseTripTarget('t:t3'), T.parseTripTarget('c:rest|'), T.parseTripTarget('c:pet|pet.1'), T.parseTripTarget('')], [{ tripId: 't3' }, { categoryId: 'rest', subcategoryId: null }, { categoryId: 'pet', subcategoryId: 'pet.1' }, null]);
});

/* ---------- хранилище ---------- */
let n = 0;
async function withStore(fn) {
  const name = 'mymoney-test-trip-' + Date.now() + '-' + n++;
  const db = await openDb(name, MIGRATIONS), store = createStore(db);
  try { await store.seedDefaultsIfEmpty(); return await fn(store); } finally { db.close(); await deleteDb(name); }
}
const trip = (extra = {}) => ({ name: 'Турция', start: '2026-12-06', end: '2026-12-10', currency: 'TRY', rate: '2,35', ...extra });

test('миграция 1 → 2: данные версии 1 целы, появляются поездки и 9 категорий поездок', async () => {
  const name = 'mymoney-test-mig2-' + Date.now();
  let db = await openDb(name, MIGRATIONS.slice(0, 1)); // база, какой она была в версии 1: хранилища поездок ещё нет
  const e = { id: 'old-1', amount: 150000, date: '2026-10-05', categoryId: 'prod', subcategoryId: null, note: 'до обновления', isRegular: true, createdAt: 1 };
  const tx = db.transaction(['categories', 'expenses'], 'readwrite');
  buildDefaultCategories().forEach((c) => tx.objectStore('categories').put(c));
  tx.objectStore('expenses').put(e);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  db = await openDb(name, MIGRATIONS); // обновление до текущей схемы
  const s = createStore(db);
  const kept = await s.getExpense(e.id);
  eq([kept.note, kept.amount, kept.isRegular], ['до обновления', 150000, true]);
  eq((await s.categories()).length, buildDefaultCategories().length, 'обычные категории на месте');
  eq((await s.tripCategories()).map((c) => c.name), ['Экскурсии', 'Связь', 'Транспорт', 'Сувениры', 'Рестораны', 'Продукты', 'Проживание', 'Билеты', 'Прочее']);
  eq(await s.trips(), []); eq(await s.tripExpenses(), []);
  eq(SCHEMA_VERSION, 2);
  db.close(); await deleteDb(name);
});

test('поездка: создать, найти, изменить название, валюту и курс; даты менять нельзя', () => withStore(async (s) => {
  const t = await s.addTrip(trip());
  eq([t.currency, t.rateE4, t.start], ['TRY', 23500, '2026-12-06']);
  await rejects(() => s.addTrip(trip()), 'bad_trip');
  const u = await s.updateTrip(t.id, { name: 'Анталья', rate: '2,50' });
  eq([u.name, u.rateE4, u.end], ['Анталья', 25000, '2026-12-10']);
  await rejects(() => s.updateTrip(t.id, { start: '2026-12-01' }), 'dates_locked');
  await rejects(() => s.updateTrip(t.id, { rate: 'abc' }), 'bad_trip');
  eq((await s.trips())[0].name, 'Анталья');
  await rejects(() => s.updateTrip('нет', { name: 'X' }), 'not_found');
}));

test('расход поездки: проверки, пересчёт хранится в курсе поездки, смена курса пересчитывает всё', () => withStore(async (s) => {
  const t = await s.addTrip(trip());
  const e = await s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 125000, date: '2026-12-06', note: ' ужин ' });
  eq([e.note, e.isRub, e.amount], ['ужин', false, 125000]);
  await rejects(() => s.addTripExpense({ tripId: 'нет', categoryId: 'tc.res', amount: 1, date: '2026-12-06' }), 'bad_trip_expense');
  await rejects(() => s.addTripExpense({ tripId: t.id, categoryId: 'нет', amount: 1, date: '2026-12-06' }), 'bad_trip_expense');
  await rejects(() => s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 0, date: '2026-12-06' }), 'bad_trip_expense');
  await rejects(() => s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 5, date: '2026-13-06' }), 'bad_trip_expense');
  const before = T.tripSummary(t, await s.tripExpenses()).totalRub;
  const t2 = await s.updateTrip(t.id, { rate: '3' });
  eq(T.tripSummary(t2, await s.tripExpenses()).totalRub, T.toRub(125000, 30000));
  ok(before !== T.tripSummary(t2, await s.tripExpenses()).totalRub);
  await s.updateTripExpense(e.id, { amount: 200000, isRub: true });
  eq(T.tripSummary(t2, await s.tripExpenses()).totalRub, 200000, 'рублёвая трата курсом не пересчитывается');
  await s.deleteTripExpense(e.id); eq((await s.tripExpenses()).length, 0);
}));

test('расходы поездок не попадают в обычные итоги и аналитику v1', () => withStore(async (s) => {
  const t = await s.addTrip(trip());
  await s.addExpense({ amount: 10000, date: '2026-12-06', categoryId: 'prod' });
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 125000, date: '2026-12-06' });
  eq(monthTotal(await s.allExpenses(), '2026-12'), 10000);
}));

test('удаление поездки: без переноса отказ и ничего не меняется; перенос в обычные расходы и в другую поездку атомарен', () => withStore(async (s) => {
  const a = await s.addTrip(trip()), b = await s.addTrip(trip({ name: 'Грузия', currency: 'GEL', rate: '30' }));
  const e1 = await s.addTripExpense({ tripId: a.id, categoryId: 'tc.res', amount: 125000, date: '2026-12-06', note: 'ужин' });
  const e2 = await s.addTripExpense({ tripId: a.id, categoryId: 'tc.tkt', amount: 500000, isRub: true, date: '2026-11-20' });
  await rejects(() => s.deleteTrip(a.id), 'transfer_missing');
  await rejects(() => s.deleteTrip(a.id, { transfers: { [e1.id]: { tripId: b.id } } }), 'transfer_missing');
  await rejects(() => s.deleteTrip(a.id, { allTo: { tripId: a.id } }), 'transfer_bad_target');
  await rejects(() => s.deleteTrip(a.id, { allTo: { categoryId: 'нет', subcategoryId: null } }), 'transfer_bad_target');
  eq([(await s.trips()).length, (await s.tripExpenses()).length, (await s.allExpenses()).length], [2, 2, 0], 'после отказов ничего не изменилось');
  const r = await s.deleteTrip(a.id, { transfers: { [e1.id]: { categoryId: 'rest', subcategoryId: null } }, allTo: { tripId: b.id } });
  eq(r.moved, 2);
  eq((await s.trips()).map((t) => t.name), ['Грузия']);
  const reg = await s.allExpenses(); eq([reg.length, reg[0].categoryId, reg[0].amount, reg[0].note], [1, 'rest', T.toRub(125000, 23500), 'ужин']);
  const te = await s.tripExpenses(); eq([te.length, te[0].tripId, te[0].amount, te[0].isRub], [1, b.id, 500000, true]);
}));

test('категории поездок: добавить, переименовать, порядок, удалить с переносом, последнюю нельзя', () => withStore(async (s) => {
  const c = await s.addTripCategory({ name: 'Страховка', icon: 'heart', hue: 80 });
  await rejects(() => s.addTripCategory({ name: 'страховка' }), 'name_taken');
  await s.updateTripCategory(c.id, { name: 'Медицина', hue: 110 });
  eq((await s.tripCategories()).slice(-1)[0].name, 'Медицина');
  const ids = (await s.tripCategories()).map((x) => x.id);
  await s.reorderTripCategories([ids[ids.length - 1], ...ids.slice(0, -1)]);
  eq((await s.tripCategories())[0].name, 'Медицина');
  await rejects(() => s.reorderTripCategories(ids.slice(1)), 'bad_order');
  const t = await s.addTrip(trip());
  const e = await s.addTripExpense({ tripId: t.id, categoryId: c.id, amount: 1000, date: '2026-12-06' });
  await rejects(() => s.deleteTripCategory(c.id), 'transfer_missing');
  await rejects(() => s.deleteTripCategory(c.id, { allTo: c.id }), 'transfer_bad_target');
  await s.deleteTripCategory(c.id, { allTo: 'tc.oth' });
  eq((await s.tripExpenses()).find((x) => x.id === e.id).categoryId, 'tc.oth');
  for (const x of (await s.tripCategories()).filter((c) => c.id !== 'tc.oth')) await s.deleteTripCategory(x.id, { allTo: 'tc.oth' });
  eq((await s.tripCategories()).map((x) => x.id), ['tc.oth']);
  await rejects(() => s.deleteTripCategory('tc.oth', { allTo: 'tc.oth' }), 'last_category');
}));

test('смена вида расхода: обычный ↔ расход поездки одной операцией, при ошибке ничего не меняется', () => withStore(async (s) => {
  const t = await s.addTrip(trip());
  const reg = await s.addExpense({ amount: 12345, date: '2026-12-07', categoryId: 'rest', note: 'ужин' });
  const rec = { id: reg.id, tripId: t.id, categoryId: 'tc.res', amount: 12345, isRub: true, date: '2026-12-07', note: 'ужин', createdAt: reg.createdAt };
  await rejects(() => s.convertExpense({ kind: 'regular', id: reg.id }, { kind: 'trip', record: { ...rec, categoryId: 'нет' } }), 'bad_trip_expense');
  eq([(await s.allExpenses()).length, (await s.tripExpenses()).length], [1, 0]);
  await s.convertExpense({ kind: 'regular', id: reg.id }, { kind: 'trip', record: rec });
  eq([(await s.allExpenses()).length, (await s.tripExpenses()).length], [0, 1]);
  await s.convertExpense({ kind: 'trip', id: reg.id }, { kind: 'regular', record: { id: reg.id, amount: 12345, date: '2026-12-07', categoryId: 'rest', subcategoryId: null, note: 'ужин', isRegular: false, createdAt: 1 } });
  eq([(await s.allExpenses()).length, (await s.tripExpenses()).length], [1, 0]);
  await rejects(() => s.convertExpense({ kind: 'trip', id: 'нет' }, { kind: 'regular', record: {} }), 'not_found');
}));

test('сброс: поездки удаляются, набор категорий поездок возвращается', () => withStore(async (s) => {
  const t = await s.addTrip(trip()); await s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 100, date: '2026-12-06' });
  await s.resetAll(); await s.seedDefaultsIfEmpty();
  eq([(await s.trips()).length, (await s.tripExpenses()).length, (await s.tripCategories()).length, (await s.categories()).length > 0], [0, 0, 9, true]);
}));

/* ---------- резервная копия ---------- */
test('резервная копия схемы 2: экспорт → сброс → восстановление возвращает поездки и расходы с теми же итогами', () => withStore(async (s) => {
  const t = await s.addTrip(trip());
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.tkt', amount: 2840000, isRub: true, date: '2026-11-20', note: 'билеты' });
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 125000, date: '2026-12-06' });
  await s.addExpense({ amount: 10000, date: '2026-12-01', categoryId: 'prod' });
  const before = await s.exportAll(), totalBefore = T.tripSummary(t, before.tripExpenses).totalRub;
  const file = buildBackup(before, new Date('2026-12-11T10:00:00Z'));
  eq(JSON.parse(file).schema, 2);
  const parsed = parseBackup(file); ok(parsed.ok, parsed.reason);
  await s.resetAll(); await s.seedDefaultsIfEmpty();
  const plan = { ...planRestore(await s.categories(), parsed.data), ...planTripRestore({ trips: await s.trips(), tripCategories: await s.tripCategories() }, parsed.data) };
  eq(plan.tripCategories.length, 0, 'категории поездок совпали по названию');
  await s.applyRestore(plan);
  const [trips, te] = [await s.trips(), await s.tripExpenses()];
  eq([trips.length, te.length, (await s.allExpenses()).length], [1, 2, 1]);
  eq([trips[0].name, trips[0].rateE4, trips[0].currency], ['Турция', 23500, 'TRY']);
  eq(T.tripSummary(trips[0], te).totalRub, totalBefore);
  eq(te.find((x) => x.note === 'билеты').categoryId, 'tc.tkt');
  // повторное восстановление: поездка та же (по названию и датам), расходы добавляются как дубли
  const again = { ...planRestore(await s.categories(), parsed.data), ...planTripRestore({ trips: await s.trips(), tripCategories: await s.tripCategories() }, parsed.data) };
  eq(again.trips.length, 0); await s.applyRestore(again);
  eq([(await s.trips()).length, (await s.tripExpenses()).length], [1, 4]);
}));

test('файл версии 1 (без поездок) по-прежнему открывается; повреждённый блок поездок отклоняется', () => {
  const cat = '{"id":"a","name":"А","parentId":null,"order":0}';
  const v1 = parseBackup(`{"app":"mymoney","schema":1,"categories":[${cat}],"expenses":[]}`);
  ok(v1.ok); eq([v1.data.trips, v1.data.tripExpenses, v1.data.tripCategories], [[], [], []]);
  const withTrips = (trips, exps, cats = '[{"id":"c1","name":"Еда"}]') => `{"app":"mymoney","schema":2,"categories":[${cat}],"expenses":[],"tripCategories":${cats},"trips":${trips},"tripExpenses":${exps}}`;
  const goodTrip = '{"id":"t","name":"Т","start":"2026-12-06","end":"2026-12-10","currency":"TRY","rateE4":23500}';
  ok(parseBackup(withTrips(`[${goodTrip}]`, '[{"amount":100,"date":"2026-12-06","tripId":"t","categoryId":"c1"}]')).ok);
  eq([
    parseBackup(withTrips('[{"id":"t","name":"Т","start":"2026-12-10","end":"2026-12-06","currency":"TRY","rateE4":23500}]', '[]')).reason,
    parseBackup(withTrips('[{"id":"t","name":"Т","start":"2026-12-06","end":"2026-12-10","currency":"try","rateE4":23500}]', '[]')).reason,
    parseBackup(withTrips('[{"id":"t","name":"Т","start":"2026-12-06","end":"2026-12-10","currency":"TRY","rateE4":0}]', '[]')).reason,
    parseBackup(withTrips(`[${goodTrip}]`, '[{"amount":-1,"date":"2026-12-06","tripId":"t","categoryId":"c1"}]')).reason,
    parseBackup(withTrips(`[${goodTrip}]`, '[{"amount":1,"date":"2026-12-06","tripId":"нет","categoryId":"c1"}]')).reason,
    parseBackup(withTrips(`[${goodTrip}]`, '[{"amount":1,"date":"2026-12-06","tripId":"t","categoryId":"нет"}]')).reason,
    parseBackup(withTrips('"не список"', '[]')).reason,
  ], ['corrupt', 'corrupt', 'corrupt', 'corrupt', 'corrupt', 'corrupt', 'corrupt']);
});

test('CSV поездок: валюта, сумма в рублях, комментарий; период и пустой результат', () => {
  const trips = [TRIP], cats = [{ id: 'tc.tkt', name: 'Билеты' }, { id: 'tc.res', name: 'Рестораны' }];
  const csv = buildTripsCsv(trips, cats, EXPS.slice(0, 3));
  const lines = csv.trim().split('\r\n');
  ok(csv.startsWith('﻿Дата;Поездка;Категория;Сумма;Валюта;Сумма в рублях;Комментарий'));
  eq(lines[1], '2026-11-20;Турция;Билеты;28400;RUB;28400;билеты');
  eq(lines[2], '2026-12-06;Турция;;9500;TRY;22325;');
  eq(buildTripsCsv(trips, cats, EXPS.slice(0, 3), '2026-12').trim().split('\r\n').length, 3);
  eq(buildTripsCsv(trips, cats, EXPS.slice(0, 3), '2026-01').trim().split('\r\n').length, 1);
  eq([tripsCsvFileName('2026-12'), tripsCsvFileName(null)], ['mymoney-trips-2026-12.csv', 'mymoney-trips-all.csv']);
});

/* ---------- форма расхода поездки ---------- */
test('форма расхода поездки: порядок проверок и результат в копейках, рубли и валюта', () => {
  const trips = [TRIP, { id: 't2', name: 'Москва', start: '2026-12-18', end: '2026-12-20', currency: 'RUB', rateE4: 10000 }];
  const f = { amount: '1 250,50', date: '2026-12-06', note: ' ужин ' };
  eq(T.checkTripForm(f, { tripId: null, categoryId: null, rub: false }, trips).field, 'trip');
  eq(T.checkTripForm(f, { tripId: 't1', categoryId: null, rub: false }, trips).field, 'category');
  eq(T.checkTripForm({ ...f, amount: '15оо' }, { tripId: 't1', categoryId: 'tc.res', rub: false }, trips).message, T.TRIP_FORM_ERRORS.format);
  eq(T.checkTripForm({ ...f, amount: '0' }, { tripId: 't1', categoryId: 'tc.res', rub: false }, trips).message, T.TRIP_FORM_ERRORS.zero);
  eq(T.checkTripForm(f, { tripId: 't1', categoryId: 'tc.res', rub: false }, trips).expense, { tripId: 't1', categoryId: 'tc.res', amount: 125050, isRub: false, date: '2026-12-06', note: 'ужин' });
  eq(T.checkTripForm(f, { tripId: 't1', categoryId: 'tc.res', rub: true }, trips).expense.isRub, true);
  eq(T.checkTripForm(f, { tripId: 't2', categoryId: 'tc.res', rub: false }, trips).expense.isRub, true, 'поездка в рублях: сумма всегда рублёвая');
});

test('поездка по умолчанию: по дате расхода, затем последняя использованная, затем самая свежая', () => {
  const a = { id: 'a', start: '2026-12-06', end: '2026-12-10' }, b = { id: 'b', start: '2026-12-08', end: '2026-12-12' }, c = { id: 'c', start: '2027-02-01', end: '2027-02-05' };
  eq([T.defaultTripId([a, b, c], '2026-12-09'), T.defaultTripId([a, b, c], '2026-12-07'), T.defaultTripId([a, b, c], '2026-11-20', 'a'), T.defaultTripId([a, b, c], '2026-11-20'), T.defaultTripId([], '2026-11-20')], ['b', 'a', 'a', 'c', null]);
  eq(T.defaultTripId([a, b, c], '2026-11-20', 'нет'), 'c', 'последняя использованная удалена: берём самую свежую');
});

test('строка пересчёта под суммой', () => {
  eq(T.conversionText(TRIP, '100', false), '≈ ' + formatRub(23500) + ' по курсу 2,35 ₽ за 1 TRY');
  eq(T.conversionText(TRIP, '', false), 'Сумма в TRY, в аналитике пересчитается в рубли по курсу поездки (2,35).');
  eq(T.conversionText(TRIP, 'abc', false).startsWith('Сумма в TRY'), true);
  eq(T.conversionText(TRIP, '100', true), 'Сумма в рублях, пересчёт не нужен.');
  eq(T.conversionText({ ...TRIP, currency: 'RUB' }, '100', false), 'Сумма в рублях, пересчёт не нужен.');
  eq(T.conversionText(null, '1', false), '');
});

test('расход поездки: «было → стало»', () => {
  const trips = { t1: TRIP, t2: { id: 't2', name: 'Грузия', currency: 'GEL', rateE4: 300000 } };
  const n = { trip: (id) => trips[id].name, cat: (id) => ({ 'tc.res': 'Рестораны', 'tc.oth': 'Прочее' }[id]), tripOf: (id) => trips[id] };
  const old = { tripId: 't1', categoryId: 'tc.res', amount: 125000, isRub: false, date: '2026-12-06', note: 'ужин' };
  eq(T.diffTripExpense(old, { ...old }, n), []);
  eq(T.diffTripExpense(old, { ...old, amount: 130000, note: '', date: '2026-12-07', categoryId: 'tc.oth' }, n).map((d) => [d.label, d.from, d.to]), [
    ['Категория поездки', 'Рестораны', 'Прочее'], ['Сумма', '1 250 TRY', '1 300 TRY'], ['Комментарий', 'ужин', 'нет'], ['Дата', '6 декабря', '7 декабря']]);
  eq(T.diffTripExpense(old, { ...old, isRub: true }, n).map((d) => [d.label, d.from, d.to]), [['Сумма', '1 250 TRY', formatRub(125000)]]);
  eq(T.diffTripExpense(old, { ...old, tripId: 't2' }, n).map((d) => d.label), ['Поездка', 'Сумма']);
});

/* ---------- аналитика с поездками ---------- */
import { overview, compare, tripsDashboard, monthTotalWithTrips, categoryView } from '../js/analytics.js';
test('обзор месяца с поездками: поездка отдельным сегментом, итог = обычные + поездка по датам', () => {
  const trips = [TRIP], exps = EXPS.slice(0, 4);
  const reg = [{ id: 'r1', date: '2026-12-01', amount: 100000, categoryId: 'prod', subcategoryId: null }, { id: 'r2', date: '2026-11-05', amount: 50000, categoryId: 'prod', subcategoryId: null }];
  const dec = overview(reg, '2026-12', '2027-01-05', { trips, tripExpenses: exps });
  const tripDec = T.toRub(950000, 23500) + T.toRub(125000, 23500) + T.toRub(80000, 23500);
  eq(dec.total, 100000 + tripDec);
  eq(dec.items.map((i) => i.type), ['trip', 'prod' === 'x' ? 'x' : 'category']);
  eq([dec.items[0].name, dec.items[0].amount], ['Турция', tripDec]);
  const nov = overview(reg, '2026-11', '2027-01-05', { trips, tripExpenses: exps });
  eq(nov.total, 50000 + 2840000, 'билеты, купленные в ноябре, попадают в ноябрь');
  eq(nov.items[0].type, 'trip');
  eq(dec.prevTotal, nov.total); eq(dec.hasPrev, true);
  eq(overview(reg, '2026-12', '2027-01-05').total, 100000, 'без поездок прежний результат');
});

test('«Месяц к месяцу» с поездками: строка «Поездки», столбцы включают поездки; дашборд «Поездки»', () => {
  const trips = [TRIP, { id: 't2', name: 'Москва', start: '2026-12-18', end: '2026-12-20', currency: 'RUB', rateE4: 10000 }], exps = EXPS;
  const reg = [{ id: 'r1', date: '2026-12-01', amount: 100000, categoryId: 'prod', subcategoryId: null }];
  const c = compare(reg, ['2026-11', '2026-12'], '2026-12', { trips, tripExpenses: exps });
  const row = c.rows.find((r) => r.categoryId === '__trips');
  eq([row.prev, row.cur], [2840000, T.toRub(1155000, 23500) + 100000]);
  eq(c.months.map((m) => m.total), [2840000, 100000 + row.cur]);
  eq(c.rows.map((r) => r.categoryId), ['prod', '__trips'], 'строки по убыванию модуля разницы');
  eq(row.diff, row.cur - row.prev);
  eq(monthTotalWithTrips(reg, '2026-12', { trips, tripExpenses: exps }), 100000 + row.cur);
  const d = tripsDashboard({ trips, tripExpenses: exps });
  eq(d.map((x) => x.trip.name), ['Москва', 'Турция']); eq([d[1].count, d[0].totalRub], [4, 100000]);
  eq(categoryView(reg, ['2026-11', '2026-12'], '2026-12', { categoryId: 'prod' }, { trips, tripExpenses: exps }).shares[1], Math.round(100000 / (100000 + row.cur) * 1000) / 10, 'доля категории считается от итога с поездками');
});
