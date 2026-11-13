/* Данные для дашбордов аналитики. Чистые функции над списком расходов: страницы здесь нет, поэтому всё проверяется тестами.
   Поездки (v2) подмешиваются через tripData = { trips, tripExpenses }: месяц считает расходы поездки строго по их датам. */
import { addMonths, monthProgress } from './dates.js';
import { monthTotal, categoryTotals, subTotals, delta, share, series, summary, topChanges } from './stats.js';
import { monthTripSegments, tripMonthTotals, tripSummary } from './trips.js';

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

/** Дашборд «Поездки»: сводка по каждой поездке (стоимость, в день, структура по категориям), свежие сверху. */
export function tripsDashboard(tripData) {
  return [...tripData.trips].sort((a, b) => (a.start < b.start ? 1 : -1)).map((trip) => ({ trip, ...tripSummary(trip, tripData.tripExpenses) }));
}
