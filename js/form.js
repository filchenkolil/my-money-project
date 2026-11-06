/* Логика формы нового расхода без привязки к странице: её можно проверять тестами. */
import { parseAmount, AMOUNT_ERRORS, toInputString, formatRub } from './money.js';
import { dayShort } from './dates.js';

export const FORM_ERRORS = { category: 'Выберите категорию.', ...AMOUNT_ERRORS };
export const TILES_SHOWN = 7;

export function newForm(date) {
  return { date, amount: '', categoryId: null, subcategoryId: null, note: '', showNote: false, isRegular: false, expanded: false, error: null };
}

/** «1 расход», «2 расхода», «5 расходов». */
export function expenseWord(n) {
  const m10 = n % 10, m100 = n % 100;
  return n + ' ' + (m10 === 1 && m100 !== 11 ? 'расход' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'расхода' : 'расходов');
}

/**
 * Какие категории показать плитками. Свёрнуто: семь самых частых; выбранная, если её там нет,
 * занимает последнее место, чтобы выбор всегда был виден. `hidden` идёт на кнопку «Ещё N».
 */
export function tileList(orderedIds, selectedId, expanded, shown = TILES_SHOWN) {
  if (expanded) return { ids: orderedIds, hidden: 0 };
  let ids = orderedIds.slice(0, shown);
  if (selectedId && orderedIds.includes(selectedId) && !ids.includes(selectedId)) ids = [...ids.slice(0, shown - 1), selectedId];
  return { ids, hidden: orderedIds.length - ids.length };
}

/** Проверка формы перед сохранением. Категорию проверяем первой, как в макете. */
export function checkForm(f) {
  if (!f.categoryId) return { ok: false, field: 'category', message: FORM_ERRORS.category };
  const a = parseAmount(f.amount);
  if (!a.ok) return { ok: false, field: 'amount', message: FORM_ERRORS[a.reason] };
  return { ok: true, expense: { amount: a.kopecks, date: f.date, categoryId: f.categoryId, subcategoryId: f.subcategoryId || null, note: f.note.trim(), isRegular: !!f.isRegular } };
}

/** После сохранения остаётся только дата: ввод пачкой, несколько расходов за один день. */
export const afterSave = (f) => newForm(f.date);

/** Форма для правки существующего расхода. */
export function expenseToForm(e) {
  return { ...newForm(e.date), amount: toInputString(e.amount), categoryId: e.categoryId, subcategoryId: e.subcategoryId ?? null, note: e.note ?? '', showNote: !!e.note, isRegular: !!e.isRegular };
}

/**
 * Что изменится при сохранении правки: список { label, from, to } для карточки «было → стало».
 * Названия категорий и подкатегорий подставляет `names(id)`.
 */
export function diffExpense(old, next, names) {
  const out = [], none = 'нет';
  if (old.categoryId !== next.categoryId) out.push({ label: 'Категория', from: names(old.categoryId), to: names(next.categoryId) });
  if ((old.subcategoryId ?? null) !== (next.subcategoryId ?? null)) out.push({ label: 'Подкатегория', from: old.subcategoryId ? names(old.subcategoryId) : none, to: next.subcategoryId ? names(next.subcategoryId) : none });
  if (old.amount !== next.amount) out.push({ label: 'Сумма', from: formatRub(old.amount), to: formatRub(next.amount) });
  if ((old.note ?? '') !== next.note) out.push({ label: 'Комментарий', from: old.note || none, to: next.note || none });
  if (old.date !== next.date) out.push({ label: 'Дата', from: dayShort(old.date), to: dayShort(next.date) });
  if (!!old.isRegular !== next.isRegular) out.push({ label: 'Регулярный', from: old.isRegular ? 'да' : none, to: next.isRegular ? 'да' : none });
  return out;
}
