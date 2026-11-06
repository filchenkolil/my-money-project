/* Данные для дашбордов аналитики. Чистые функции над списком расходов: страницы здесь нет, поэтому всё проверяется тестами. */
import { addMonths, monthProgress } from './dates.js';
import { monthTotal, categoryTotals, subTotals, delta, share, series, summary, topChanges } from './stats.js';

/** Обзор месяца: итог, изменение к прошлому месяцу, категории по убыванию с долей и изменением. */
export function overview(expenses, key, today) {
  const pk = addMonths(key, -1), total = monthTotal(expenses, key), prevTotal = monthTotal(expenses, pk);
  const cur = categoryTotals(expenses, key), prev = categoryTotals(expenses, pk);
  const items = Object.entries(cur).filter(([, v]) => v > 0)
    .map(([categoryId, amount]) => ({ categoryId, amount, share: share(amount, total), prev: prev[categoryId] ?? 0, delta: delta(amount, prev[categoryId] ?? 0) }))
    .sort((a, b) => b.amount - a.amount);
  return { key, total, prevKey: pk, prevTotal, hasPrev: prevTotal > 0, delta: delta(total, prevTotal), progress: monthProgress(today, key), items };
}

/** «Месяц к месяцу»: итоги по месяцам для столбцов и таблица категорий с разницей, самые заметные изменения сверху. */
export function compare(expenses, keys, key) {
  const pk = addMonths(key, -1), total = monthTotal(expenses, key), prevTotal = monthTotal(expenses, pk);
  const rows = topChanges(categoryTotals(expenses, key), categoryTotals(expenses, pk)).filter((r) => r.cur > 0 || r.prev > 0);
  return { total, prevKey: pk, prevTotal, hasPrev: prevTotal > 0, delta: delta(total, prevTotal), months: keys.map((k) => ({ key: k, total: monthTotal(expenses, k) })), rows };
}

/**
 * «Категория во времени»: значения выбранной категории (или подкатегории) по месяцам, доля от всех расходов месяца,
 * изменение к прошлому месяцу и сводка (среднее, минимум, максимум, всего).
 */
export function categoryView(expenses, keys, key, { categoryId, subcategoryId } = {}) {
  const sel = subcategoryId ? { categoryId, subcategoryId } : { categoryId };
  const values = series(expenses, keys, sel), totals = keys.map((k) => monthTotal(expenses, k));
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
