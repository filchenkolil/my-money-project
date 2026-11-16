/* «Обсуждение AI»: текстовая сводка статистики для вставки в чат с Claude. Чистая функция, без страницы и хранилища.
   Уровни состава: totals — только итоги; notes — итоги и расходы с комментариями; all — все расходы построчно. */
import { formatRub, formatPct } from './money.js';
import { monthLabel, rangeLabel } from './dates.js';
import { monthTotals, categoryTotals, subTotals, share } from './stats.js';
import { tripMonthTotals, tripSummary } from './trips.js';

export const SUMMARY_LEVELS = [['totals', 'Итоги'], ['notes', 'С комментариями'], ['all', 'Все расходы']];
export const normalizeLevel = (v) => (SUMMARY_LEVELS.some((l) => l[0] === v) ? v : 'totals');

const money = (k) => formatRub(k).replace(/\s/g, ' ');
const INTRO = 'Ты мой финансовый помощник. Ниже сводка моих личных расходов из приложения для учёта (суммы в рублях). Прочитай её, коротко скажи, что заметил (главные статьи, динамику, регулярные платежи, поездки), и задай мне один уточняющий вопрос. Дальше я буду задавать вопросы по этим данным.';

/** Текст сводки. data = { categories, expenses, trips, tripExpenses, tripCategories }. */
export function buildSummary(data, level = 'totals', today = '') {
  const lv = normalizeLevel(level), { categories, expenses, trips, tripExpenses, tripCategories = [] } = data;
  const name = (id) => categories.find((c) => c.id === id)?.name ?? 'Без названия';
  const out = [INTRO, '', `Сводка на ${today || 'сегодня'}. Режим: ${SUMMARY_LEVELS.find((l) => l[0] === lv)[1].toLowerCase()}.`];
  if (!expenses.length && !tripExpenses.length) return out.concat(['', 'Расходов пока нет.']).join('\n');
  const tripTot = tripMonthTotals(trips, tripExpenses), plain = monthTotals(expenses);
  const keys = [...new Set([...Object.keys(plain), ...Object.keys(tripTot)])].sort();
  out.push('', `Период: ${monthLabel(keys[0])} — ${monthLabel(keys.at(-1))}. Расходов: ${expenses.length}.`);
  out.push('', '## Итоги по месяцам (с поездками)');
  for (const k of keys) out.push(`- ${monthLabel(k)}: ${money((plain[k] ?? 0) + (tripTot[k] ?? 0))}${tripTot[k] ? ` (из них поездки ${money(tripTot[k])})` : ''}`);
  out.push('', '## Категории по месяцам (без поездок)');
  for (const k of keys) {
    const ct = categoryTotals(expenses, k), ids = Object.keys(ct).sort((a, b) => ct[b] - ct[a]); if (!ids.length) continue;
    out.push(`### ${monthLabel(k)}`);
    for (const id of ids) {
      const subs = subTotals(expenses, k, id), parts = Object.entries(subs).filter(([s]) => s).sort((a, b) => b[1] - a[1]).map(([s, v]) => `${name(s)} ${money(v)}`);
      out.push(`- ${name(id)}: ${money(ct[id])} (${formatPct(share(ct[id], plain[k]))})${parts.length ? '; ' + parts.join(', ') : ''}`);
    }
  }
  out.push('', '## Регулярные расходы');
  let any = false;
  for (const k of keys) {
    const reg = expenses.filter((e) => e.isRegular && e.date.slice(0, 7) === k); if (!reg.length) continue; any = true;
    const sum = reg.reduce((s, e) => s + e.amount, 0), all = (plain[k] ?? 0) + (tripTot[k] ?? 0);
    out.push(`- ${monthLabel(k)}: ${money(sum)}, ${formatPct(share(sum, all))} расходов месяца: ` + reg.map((e) => `${name(e.categoryId)}${e.subcategoryId ? ' › ' + name(e.subcategoryId) : ''} ${money(e.amount)}`).join(', '));
  }
  if (!any) out.push('- Регулярных расходов не отмечено.');
  if (trips.length) {
    out.push('', '## Поездки (полная стоимость в рублях, с тратами до начала)');
    const tc = (id) => tripCategories.find((c) => c.id === id)?.name ?? '';
    for (const t of [...trips].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      const s = tripSummary(t, tripExpenses);
      out.push(`- ${t.name}, ${rangeLabel(t.start, t.end)}, ${t.currency}: ${money(s.totalRub)}, ${s.days} дн., ${s.count ? money(s.perDay) + ' в день' : 'расходов нет'}` + (s.byCategory.length ? '; ' + s.byCategory.map((c) => `${tc(c.categoryId)} ${money(c.amount)}`).join(', ') : ''));
    }
  }
  if (lv !== 'totals') {
    const list = [...expenses].filter((e) => lv === 'all' || e.note).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    out.push('', lv === 'all' ? '## Все расходы (дата, категория, сумма, комментарий, регулярный)' : '## Расходы с комментариями');
    for (const e of list) out.push(`- ${e.date} | ${name(e.categoryId)}${e.subcategoryId ? ' › ' + name(e.subcategoryId) : ''} | ${money(e.amount)}${e.note ? ' | ' + e.note : ''}${lv === 'all' && e.isRegular ? ' | регулярный' : ''}`);
  }
  return out.join('\n');
}
