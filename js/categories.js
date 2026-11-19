/* Управление категориями: варианты переноса при удалении, порядок, цвет. Без обращения к странице. */
import { PALETTE } from './seed.js';

/** Цель переноса в виде строки для выпадающего списка: «категория|подкатегория» (подкатегория может быть пустой). */
export const targetValue = (categoryId, subcategoryId = null) => `${categoryId}|${subcategoryId ?? ''}`;
export function parseTarget(value) {
  if (!value) return null;
  const [categoryId, sub] = value.split('|');
  return categoryId ? { categoryId, subcategoryId: sub || null } : null;
}

export const subsOf = (cats, id) => cats.filter((c) => c.parentId === id).sort((a, b) => a.order - b.order);
export const topsOf = (cats) => cats.filter((c) => c.parentId === null).sort((a, b) => a.order - b.order);

/**
 * Куда можно перенести расходы удаляемой категории или подкатегории.
 * Для подкатегории сначала идут «соседи», затем «без подкатегории», затем другие категории.
 */
export function transferOptions(cats, removed) {
  const out = [], ownTop = removed.parentId ?? removed.id;
  if (removed.parentId !== null) {
    const parent = cats.find((c) => c.id === removed.parentId);
    subsOf(cats, parent.id).filter((s) => s.id !== removed.id).forEach((s) => out.push({ value: targetValue(parent.id, s.id), label: `${parent.name} › ${s.name}` }));
    out.push({ value: targetValue(parent.id), label: `${parent.name} (без подкатегории)` });
  }
  topsOf(cats).filter((c) => c.id !== ownTop).forEach((c) => {
    out.push({ value: targetValue(c.id), label: c.name });
    subsOf(cats, c.id).forEach((s) => out.push({ value: targetValue(c.id, s.id), label: `${c.name} › ${s.name}` }));
  });
  return out;
}

/** Выбор цели для каждого расхода. Готово, когда у всех расходов есть цель (своя или «для всех»). */
export function transferPlan(expenses, perExpense = {}, allValue = '') {
  const transfers = {};
  for (const e of expenses) { const t = parseTarget(perExpense[e.id]); if (t) transfers[e.id] = t; }
  const allTo = parseTarget(allValue);
  const ready = expenses.every((e) => transfers[e.id] || allTo);
  return { transfers, allTo, ready };
}

/** Сдвиг элемента списка на одно место: dir = -1 вверх, +1 вниз. На краях список не меняется. */
export function moveId(ids, id, dir) {
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const out = [...ids]; [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Первый цвет палитры, который ещё не занят верхними категориями. */
export function nextHue(cats) {
  const tops = topsOf(cats), used = new Set(tops.map((c) => c.hue));
  return PALETTE.find((h) => !used.has(h)) ?? PALETTE[tops.length % PALETTE.length];
}

/** Изменения категории для карточки «было → стало». */
export function diffCategory(old, next) {
  const out = [];
  if (old.name !== next.name) out.push({ label: 'Название', from: old.name, to: next.name });
  if (old.hue !== next.hue) out.push({ label: 'Цвет', from: 'прежний', to: 'новый' });
  if (old.icon !== next.icon) out.push({ label: 'Значок', from: 'прежний', to: 'новый' });
  return out;
}

/** Расходы категории (со всеми подкатегориями) или одной подкатегории. */
export const expensesIn = (expenses, category) => (category.parentId === null
  ? expenses.filter((e) => e.categoryId === category.id)
  : expenses.filter((e) => e.subcategoryId === category.id));

/** Варианты для выбора категории или подкатегории: [{ value: 'c:id' | 's:id:подкатегория', label: 'Питомец' | 'Питомец › Корм' }]. */
export function categoryChoices(categories) {
  return topsOf(categories).flatMap((c) => [{ value: `c:${c.id}`, label: c.name }, ...subsOf(categories, c.id).map((s) => ({ value: `s:${c.id}:${s.id}`, label: `${c.name} › ${s.name}` }))]);
}

/**
 * Поиск категории по тексту, который ввёл пользователь: точное название, затем единственное совпадение по началу и по вхождению.
 * Возвращает value из categoryChoices или null, если такой категории нет или совпадений несколько.
 */
export function findCategoryChoice(categories, text) {
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s*(›|>|\/|-)\s*/g, ' › ').replace(/\s+/g, ' ').trim();
  const q = norm(text); if (!q) return null;
  const all = categoryChoices(categories).map((c) => ({ ...c, n: norm(c.label), own: norm(c.label.split(' › ').at(-1)) }));
  for (const test of [(c) => c.n === q, (c) => c.own === q, (c) => c.own.startsWith(q), (c) => c.n.includes(q)]) { const m = all.filter(test); if (m.length === 1) return m[0].value; if (m.length > 1) return null; }
  return null;
}
