/* История: отбор и группировка расходов. Без обращения к странице, поэтому проверяется тестами. */
import { monthKey, monthRange, addMonths } from './dates.js';
import { expenseRub } from './trips.js';

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

/** Лента месяцев: от самого раннего месяца с данными (или текущего) до самого позднего (или текущего, либо через ahead месяцев вперёд), без пропусков. */
export function monthStripKeys(expenses, today, ahead = 0) {
  const cur = monthKey(today);
  let lo = cur, hi = ahead ? addMonths(cur, ahead) : cur;
  for (const e of expenses) { const k = monthKey(e.date); if (k < lo) lo = k; if (k > hi) hi = k; }
  return monthRange(lo, hi);
}

/**
 * Расходы месяца для списка «Истории» вместе с расходами поездок (в рублях). У строки поездки есть поле trip и исходная запись orig.
 * Пока включён любой фильтр, расходы поездок не показываются: у них свои категории.
 */
export function selectMonthWithTrips(expenses, tripData, key, f = NO_FILTERS) {
  const plain = selectMonth(expenses, key, f);
  if (filtersActive(f)) return plain;
  const byId = new Map(tripData.trips.map((t) => [t.id, t]));
  const trips = tripData.tripExpenses.filter((e) => monthKey(e.date) === key && byId.has(e.tripId))
    .map((e) => ({ ...e, amount: expenseRub(e, byId.get(e.tripId)), trip: byId.get(e.tripId), orig: e }));
  return [...plain, ...trips].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
}
