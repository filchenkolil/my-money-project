/* История: отбор и группировка расходов. Без обращения к странице, поэтому проверяется тестами. */
import { monthKey, monthRange } from './dates.js';

export const NO_FILTERS = Object.freeze({ categoryId: '', subcategoryId: '', regularOnly: false });
export const filtersActive = (f) => !!(f.categoryId || f.subcategoryId || f.regularOnly);

/** Расходы месяца с учётом фильтров: сначала новые дни, внутри дня по времени добавления. */
export function selectMonth(expenses, key, f = NO_FILTERS) {
  return expenses
    .filter((e) => monthKey(e.date) === key
      && (!f.categoryId || e.categoryId === f.categoryId)
      && (!f.subcategoryId || e.subcategoryId === f.subcategoryId)
      && (!f.regularOnly || e.isRegular))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
}

/** Список по дням: [{ date, total, items }] в порядке убывания дат. Ждёт уже отсортированный список. */
export function groupByDay(list) {
  const out = [];
  for (const e of list) {
    let g = out[out.length - 1];
    if (!g || g.date !== e.date) { g = { date: e.date, total: 0, items: [] }; out.push(g); }
    g.total += e.amount; g.items.push(e);
  }
  return out;
}

/** Лента месяцев: от самого раннего месяца с данными (или текущего) до самого позднего (или текущего), без пропусков. */
export function monthStripKeys(expenses, today) {
  const cur = monthKey(today);
  let lo = cur, hi = cur;
  for (const e of expenses) { const k = monthKey(e.date); if (k < lo) lo = k; if (k > hi) hi = k; }
  return monthRange(lo, hi);
}
