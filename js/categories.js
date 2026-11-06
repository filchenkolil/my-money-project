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
