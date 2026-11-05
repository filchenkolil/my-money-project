/* Подсчёты для аналитики. Работают с обычными массивами расходов (суммы в копейках) и не знают про хранилище. */

import { addDays, monthKey } from './dates.js';
import { DEFAULT_FREQUENT_ORDER } from './seed.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const inMonth = (expenses, key) => expenses.filter((e) => monthKey(e.date) === key);

/** { 'ГГГГ-ММ': копейки } по всем месяцам, где есть расходы. */
export function monthTotals(expenses) {
  const out = {};
  for (const e of expenses) { const k = monthKey(e.date); out[k] = (out[k] ?? 0) + e.amount; }
  return out;
}

export const monthTotal = (expenses, key) => sum(inMonth(expenses, key).map((e) => e.amount));

/** { categoryId: копейки } за месяц. */
export function categoryTotals(expenses, key) {
  const out = {};
  for (const e of inMonth(expenses, key)) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount;
  return out;
}

/** Разбивка категории по подкатегориям за месяц: { subId | '': копейки }, '' = без подкатегории. */
export function subTotals(expenses, key, categoryId) {
  const out = {};
  for (const e of inMonth(expenses, key)) if (e.categoryId === categoryId) { const k = e.subcategoryId ?? ''; out[k] = (out[k] ?? 0) + e.amount; }
  return out;
}

/** Изменение к предыдущему месяцу. pct = null, если сравнивать не с чем (в прошлом месяце ноль). */
export function delta(cur, prev) {
  const diff = cur - prev;
  return { diff, pct: prev > 0 ? Math.round((diff / prev) * 1000) / 10 : null };
}

/** Доля в процентах с одним знаком; при нулевом итоге 0. */
export const share = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** Значения категории или подкатегории по списку месяцев. */
export function series(expenses, keys, { categoryId, subcategoryId } = {}) {
  return keys.map((k) => sum(inMonth(expenses, k).filter((e) => e.categoryId === categoryId && (subcategoryId === undefined || (e.subcategoryId ?? null) === subcategoryId)).map((e) => e.amount)));
}

/** Среднее по всем месяцам списка, минимум по месяцам с расходами, максимум, всего. */
export function summary(values) {
  const nz = values.filter((v) => v > 0);
  return { total: sum(values), avg: values.length ? Math.round(sum(values) / values.length) : 0, min: nz.length ? Math.min(...nz) : 0, max: values.length ? Math.max(...values) : 0 };
}

/** Доля регулярных расходов в расходах месяца. */
export function regularShare(expenses, key) {
  const l = inMonth(expenses, key), total = sum(l.map((e) => e.amount)), regular = sum(l.filter((e) => e.isRegular).map((e) => e.amount));
  return { regular, total, pct: share(regular, total) };
}

/** Регулярные расходы месяца по категориям: { categoryId: копейки }. */
export function regularByCategory(expenses, key) {
  const out = {};
  for (const e of inMonth(expenses, key)) if (e.isRegular) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount;
  return out;
}

/** Самые заметные изменения между двумя месяцами по категориям. */
export function topChanges(curTotals, prevTotals) {
  const ids = new Set([...Object.keys(curTotals), ...Object.keys(prevTotals)]);
  return [...ids].map((id) => ({ categoryId: id, cur: curTotals[id] ?? 0, prev: prevTotals[id] ?? 0, diff: (curTotals[id] ?? 0) - (prevTotals[id] ?? 0) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** Итог и число расходов за день. */
export function dayTotal(expenses, iso) {
  const l = expenses.filter((e) => e.date === iso);
  return { count: l.length, total: sum(l.map((e) => e.amount)) };
}

/**
 * Порядок категорий на главном экране: по числу расходов за последние `days` дней, при равенстве по последнему
 * использованию. Не использованные идут в порядке по умолчанию.
 */
export function frequentCategories(expenses, categoryIds, today, days = 60) {
  const from = addDays(today, -days), stat = {};
  for (const e of expenses) {
    if (e.date < from || e.date > today) continue;
    const s = (stat[e.categoryId] ??= { n: 0, last: '' });
    s.n++; if (e.date > s.last) s.last = e.date;
  }
  const rank = (id) => { const i = DEFAULT_FREQUENT_ORDER.indexOf(id); return i < 0 ? 999 : i; };
  return [...categoryIds].sort((a, b) => (stat[b]?.n ?? 0) - (stat[a]?.n ?? 0) || (stat[b]?.last ?? '').localeCompare(stat[a]?.last ?? '') || rank(a) - rank(b));
}
