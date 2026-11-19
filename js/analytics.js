/* Данные для дашбордов аналитики. Чистые функции над списком расходов: страницы здесь нет, поэтому всё проверяется тестами.
   Поездки (v2) подмешиваются через tripData = { trips, tripExpenses }: месяц считает расходы поездки строго по их датам. */
import { addMonths, monthProgress, daysBetween } from './dates.js';
import { monthTotal, categoryTotals, subTotals, delta, share, series, summary, topChanges } from './stats.js';
import { monthTripSegments, tripMonthTotals, tripSummary, expenseRub } from './trips.js';

const NO_TRIPS = { trips: [], tripExpenses: [] };
const tripTotal = (tripData, key) => tripMonthTotals(tripData.trips, tripData.tripExpenses)[key] ?? 0;

/** Итог месяца вместе с поездками. */
export const monthTotalWithTrips = (expenses, key, tripData = NO_TRIPS) => monthTotal(expenses, key) + tripTotal(tripData, key);

/** Обзор месяца: итог, изменение к прошлому месяцу, категории и сегменты поездок по убыванию с долей и изменением. */
export function overview(expenses, key, today, tripData = NO_TRIPS) {
  const pk = addMonths(key, -1), total = monthTotalWithTrips(expenses, key, tripData), prevTotal = monthTotalWithTrips(expenses, pk, tripData);
  const cur = categoryTotals(expenses, key), prev = categoryTotals(expenses, pk);
  const cats = Object.entries(cur).filter(([, v]) => v > 0)
    .map(([categoryId, amount]) => ({ type: 'category', categoryId, amount, share: share(amount, total), prev: prev[categoryId] ?? 0, delta: delta(amount, prev[categoryId] ?? 0) }));
  const trips = monthTripSegments(tripData.trips, tripData.tripExpenses, key).map((s) => ({ type: 'trip', tripId: s.tripId, name: s.name, amount: s.amount, share: share(s.amount, total) }));
  const items = [...cats, ...trips].sort((a, b) => b.amount - a.amount);
  return { key, total, prevKey: pk, prevTotal, hasPrev: prevTotal > 0, delta: delta(total, prevTotal), progress: monthProgress(today, key), items };
}

/** «Месяц к месяцу»: итоги по месяцам для столбцов и таблица категорий с разницей, самые заметные изменения сверху. Поездки одной строкой. */
export function compare(expenses, keys, key, tripData = NO_TRIPS) {
  const pk = addMonths(key, -1), total = monthTotalWithTrips(expenses, key, tripData), prevTotal = monthTotalWithTrips(expenses, pk, tripData);
  const rows = topChanges(categoryTotals(expenses, key), categoryTotals(expenses, pk)).filter((r) => r.cur > 0 || r.prev > 0);
  const tc = tripTotal(tripData, key), tp = tripTotal(tripData, pk);
  if (tc > 0 || tp > 0) { rows.push({ categoryId: '__trips', cur: tc, prev: tp, diff: tc - tp }); rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)); }
  return { total, prevKey: pk, prevTotal, hasPrev: prevTotal > 0, delta: delta(total, prevTotal), months: keys.map((k) => ({ key: k, total: monthTotalWithTrips(expenses, k, tripData) })), rows };
}

/**
 * «Категория во времени»: значения выбранной категории (или подкатегории) по месяцам, доля от всех расходов месяца,
 * изменение к прошлому месяцу и сводка (среднее, минимум, максимум, всего).
 */
export function categoryView(expenses, keys, key, { categoryId, subcategoryId } = {}, tripData = NO_TRIPS) {
  const sel = subcategoryId ? { categoryId, subcategoryId } : { categoryId };
  const values = series(expenses, keys, sel), totals = keys.map((k) => monthTotalWithTrips(expenses, k, tripData));
  const i = keys.indexOf(key), cur = i >= 0 ? values[i] : 0, prev = i > 0 ? values[i - 1] : 0;
  return { keys, values, shares: values.map((v, j) => share(v, totals[j])), cur, prev, delta: delta(cur, prev), hasPrev: prev > 0, stats: summary(values) };
}

/** Детализация категории за месяц: подкатегории (с «без подкатегории») по убыванию и расходы по дням. */
export function categoryDetail(expenses, key, categoryId, subName) {
  const list = expenses.filter((e) => e.categoryId === categoryId && e.date.slice(0, 7) === key)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  const total = list.reduce((s, e) => s + e.amount, 0), subs = subTotals(expenses, key, categoryId);
  const parts = Object.entries(subs).map(([id, amount]) => ({ id, name: id ? subName(id) : 'Без подкатегории', amount })).sort((a, b) => b.amount - a.amount);
  return { total, subs: parts.length > 1 || (parts.length === 1 && parts[0].id) ? parts : [], list };
}

const regOf = (expenses, key) => expenses.filter((e) => e.isRegular && e.date.slice(0, 7) === key);
const sumOf = (l) => l.reduce((s, e) => s + e.amount, 0);

/**
 * «Регулярные»: сумма регулярных расходов месяца и изменение к прошлому, доля регулярных в расходах месяца (с поездками)
 * по каждому месяцу, категории регулярных с рядом по месяцам и подкатегориями (выбранный и прошлый месяц).
 */
export function regularView(expenses, keys, key, tripData = NO_TRIPS) {
  const pk = addMonths(key, -1), cur = sumOf(regOf(expenses, key)), prev = sumOf(regOf(expenses, pk));
  const months = keys.map((k) => { const regular = sumOf(regOf(expenses, k)), total = monthTotalWithTrips(expenses, k, tripData); return { key: k, regular, total, pct: share(regular, total) }; });
  const ids = [...new Set([...regOf(expenses, key), ...regOf(expenses, pk)].map((e) => e.categoryId))];
  const cats = ids.map((categoryId) => {
    const sub = (k) => { const out = {}; for (const e of regOf(expenses, k)) if (e.categoryId === categoryId) { const s = e.subcategoryId ?? ''; out[s] = (out[s] ?? 0) + e.amount; } return out; };
    const sc = sub(key), sp = sub(pk), sids = [...new Set([...Object.keys(sc), ...Object.keys(sp)])];
    const c = sumOf(regOf(expenses, key).filter((e) => e.categoryId === categoryId)), p = sumOf(regOf(expenses, pk).filter((e) => e.categoryId === categoryId));
    return { categoryId, cur: c, prev: p, delta: delta(c, p), values: keys.map((k) => sumOf(regOf(expenses, k).filter((e) => e.categoryId === categoryId))),
      subs: sids.map((id) => ({ id, cur: sc[id] ?? 0, prev: sp[id] ?? 0 })).sort((a, b) => b.cur - a.cur || b.prev - a.prev) };
  }).sort((a, b) => b.cur - a.cur || b.prev - a.prev);
  const m = months.find((x) => x.key === key) ?? { regular: 0, total: 0, pct: 0 };
  return { cur, prev, hasPrev: prev > 0, prevKey: pk, delta: delta(cur, prev), months, pct: m.pct, total: m.total, cats };
}

/** Все траты по датам (рубли): обычные расходы и расходы поездок. */
function dated(expenses, tripData) {
  const byId = new Map(tripData.trips.map((t) => [t.id, t]));
  return [...expenses.map((e) => ({ date: e.date, amount: e.amount })), ...tripData.tripExpenses.filter((e) => byId.has(e.tripId)).map((e) => ({ date: e.date, amount: expenseRub(e, byId.get(e.tripId)) }))];
}

/**
 * «Темп месяца»: накопленная сумма по дням выбранного месяца и прошлого. Идущий месяц считается до сегодняшнего дня,
 * прошлый показывается целиком; projection — сумма к концу месяца при текущем темпе (только для идущего месяца).
 */
export function paceView(expenses, key, today, tripData = NO_TRIPS) {
  const all = dated(expenses, tripData), pk = addMonths(key, -1), pr = monthProgress(today, key);
  const days = pr.days, cutoff = pr.future ? 0 : pr.complete ? days : pr.day;
  const line = (k, n) => { const per = new Array(n).fill(0); for (const e of all) if (e.date.slice(0, 7) === k) { const d = Number(e.date.slice(8, 10)); if (d <= n) per[d - 1] += e.amount; } let s = 0; return per.map((v) => (s += v)); };
  const cur = line(key, days).slice(0, cutoff), prevDays = monthProgress(today, pk).days, prev = line(pk, prevDays);
  const total = cur.at(-1) ?? 0, prevAtSame = cutoff > 0 ? (prev[Math.min(cutoff, prevDays) - 1] ?? 0) : 0;
  const running = !pr.complete && !pr.future && cutoff > 0;
  return { key, prevKey: pk, days, prevDays, day: cutoff, running, cur, prev, total, prevTotal: prev.at(-1) ?? 0, prevAtSame, delta: delta(total, prevAtSame),
    projection: running ? Math.round((total / cutoff) * days) : null, perDay: cutoff > 0 ? Math.round(total / cutoff) : 0 };
}

/** Дашборд «Поездки»: сводка по каждой поездке (стоимость, в день, структура по категориям), свежие сверху. */
export function tripsDashboard(tripData) {
  return [...tripData.trips].sort((a, b) => (a.start < b.start ? 1 : -1)).map((trip) => ({ trip, ...tripSummary(trip, tripData.tripExpenses) }));
}

/**
 * Дашборд «Поездки» с фильтрами. tripId — одна поездка или 'all'; by — 'cat' (по категориям поездки) или 'time'
 * (для одной поездки по дням, для всех по поездкам). Суммы в рублях, расходы до начала поездки входят.
 * items: [{ id, label?, amount, share }], для 'time' по порядку дат или начала поездок.
 */
export function tripsAnalysis(tripData, { tripId = 'all', by = 'cat' } = {}) {
  const trips = tripData.trips.filter((t) => tripId === 'all' || t.id === tripId).sort((a, b) => (a.start < b.start ? -1 : 1));
  const ids = new Set(trips.map((t) => t.id)), byId = new Map(trips.map((t) => [t.id, t]));
  const exps = tripData.tripExpenses.filter((e) => ids.has(e.tripId)).map((e) => ({ ...e, rub: expenseRub(e, byId.get(e.tripId)) }));
  const total = exps.reduce((s, e) => s + e.rub, 0), count = exps.length;
  const days = trips.reduce((s, t) => s + daysBetween(t.start, t.end).length, 0);
  const before = exps.filter((e) => e.date < byId.get(e.tripId).start).reduce((s, e) => s + e.rub, 0);
  const group = (keyOf) => { const m = new Map(); for (const e of exps) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + e.rub); return m; };
  let items;
  if (by === 'time' && trips.length === 1) {
    const t = trips[0], m = group((e) => e.date), dates = [...new Set([...daysBetween(t.start, t.end), ...m.keys()])].sort();
    items = dates.map((d) => ({ id: d, amount: m.get(d) ?? 0 }));
  } else if (by === 'time') {
    const m = group((e) => e.tripId);
    items = trips.map((t) => ({ id: t.id, label: t.name, amount: m.get(t.id) ?? 0 }));
  } else {
    items = [...group((e) => e.categoryId)].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
  }
  items = items.map((i) => ({ ...i, share: share(i.amount, total) }));
  return { trips, total, count, days, before, perDay: days ? Math.round(total / days) : 0, avg: count ? Math.round(total / count) : 0, items, single: trips.length === 1 };
}
