/* Хранилище: категории, расходы, настройки. Каждая операция, меняющая несколько записей, идёт одной транзакцией:
   либо применяется целиком, либо не меняется ничего. */

import { request, done } from './db.js';
import { MAX_KOPECKS } from './money.js';
import { isValidDate, monthBounds } from './dates.js';
import { buildDefaultCategories, DEFAULT_ICON } from './seed.js';

export const MAX_NOTE = 200;
export const MAX_NAME = 30;

export class StoreError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const clean = (s) => String(s ?? '').trim();
const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
const byOrder = (a, b) => a.order - b.order;

export function createStore(db) {
  /** Выполняет fn внутри одной транзакции; при любой ошибке отменяет её целиком. */
  async function run(storeNames, mode, fn) {
    const tx = db.transaction(storeNames, mode);
    const finished = done(tx);
    finished.catch(() => {});
    try {
      const result = await fn((n) => tx.objectStore(n));
      await finished;
      return result;
    } catch (e) {
      try { tx.abort(); } catch { /* транзакция уже завершена */ }
      throw e;
    }
  }

  const all = (store) => request(store.getAll());

  /* ---------- проверки ---------- */
  function checkName(name, siblings, selfId) {
    const n = clean(name);
    if (!n) throw new StoreError('name_empty', 'Введите название.');
    if (n.length > MAX_NAME) throw new StoreError('name_too_long', `Название не длиннее ${MAX_NAME} знаков.`);
    if (siblings.some((c) => c.id !== selfId && sameName(c.name, n))) throw new StoreError('name_taken', 'Такое название уже есть.');
    return n;
  }

  function checkExpense(e, cats) {
    if (!Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX_KOPECKS) throw new StoreError('bad_amount', 'Некорректная сумма.');
    if (!isValidDate(e.date)) throw new StoreError('bad_date', 'Некорректная дата.');
    const cat = cats.find((c) => c.id === e.categoryId && c.parentId === null);
    if (!cat) throw new StoreError('no_category', 'Выберите категорию.');
    if (e.subcategoryId != null && !cats.some((c) => c.id === e.subcategoryId && c.parentId === cat.id)) throw new StoreError('bad_subcategory', 'Подкатегория не относится к выбранной категории.');
    if (clean(e.note).length > MAX_NOTE) throw new StoreError('note_too_long', `Комментарий не длиннее ${MAX_NOTE} знаков.`);
  }

  function checkTarget(target, cats, forbiddenCategoryId) {
    if (!target) throw new StoreError('transfer_missing', 'Для каждого расхода нужно выбрать, куда его перенести.');
    const cat = cats.find((c) => c.id === target.categoryId && c.parentId === null);
    if (!cat || cat.id === forbiddenCategoryId) throw new StoreError('transfer_bad_target', 'Нельзя переносить в удаляемую категорию.');
    if (target.subcategoryId != null && !cats.some((c) => c.id === target.subcategoryId && c.parentId === cat.id)) throw new StoreError('transfer_bad_target', 'Подкатегория не относится к выбранной категории.');
  }

  const api = {
    /* ---------- категории ---------- */
    async categories() { return (await run(['categories'], 'readonly', (s) => all(s('categories')))).sort(byOrder); },

    async seedDefaultsIfEmpty() {
      return run(['categories', 'meta'], 'readwrite', async (s) => {
        if ((await request(s('categories').count())) > 0) return false;
        buildDefaultCategories().forEach((c) => s('categories').put(c));
        return true;
      });
    },

    async addCategory({ name, icon = DEFAULT_ICON, hue }) {
      return run(['categories'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), top = cats.filter((c) => c.parentId === null);
        const rec = { id: uid(), name: checkName(name, top), icon, hue, order: top.length ? Math.max(...top.map((c) => c.order)) + 1 : 0, parentId: null };
        s('categories').put(rec);
        return rec;
      });
    },

    async addSubcategory(parentId, name) {
      return run(['categories'], 'readwrite', async (s) => {
        const cats = await all(s('categories'));
        if (!cats.some((c) => c.id === parentId && c.parentId === null)) throw new StoreError('not_found', 'Категория не найдена.');
        const subs = cats.filter((c) => c.parentId === parentId);
        const rec = { id: uid(), name: checkName(name, subs), icon: null, hue: null, order: subs.length ? Math.max(...subs.map((c) => c.order)) + 1 : 0, parentId };
        s('categories').put(rec);
        return rec;
      });
    },

    /** Изменить название, значок или цвет категории (или название подкатегории). */
    async updateCategory(id, patch) {
      return run(['categories'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), cur = cats.find((c) => c.id === id);
        if (!cur) throw new StoreError('not_found', 'Категория не найдена.');
        const next = { ...cur };
        if (patch.name !== undefined) next.name = checkName(patch.name, cats.filter((c) => c.parentId === cur.parentId), id);
        if (cur.parentId === null) { if (patch.icon !== undefined) next.icon = patch.icon; if (patch.hue !== undefined) next.hue = patch.hue; }
        s('categories').put(next);
        return next;
      });
    },

    /** Новый порядок на одном уровне: orderedIds — id в нужной последовательности. */
    async reorder(parentId, orderedIds) {
      return run(['categories'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), level = cats.filter((c) => c.parentId === parentId);
        if (level.length !== orderedIds.length || !level.every((c) => orderedIds.includes(c.id))) throw new StoreError('bad_order', 'Список порядка не совпадает с категориями.');
        orderedIds.forEach((id, i) => s('categories').put({ ...level.find((c) => c.id === id), order: i }));
      });
    },

    /**
     * Удаление категории с переносом её расходов.
     * transfers: { [expenseId]: { categoryId, subcategoryId } }, allTo: такая же цель «для всех сразу».
     * Если хоть один расход остался без цели, ничего не меняется.
     */
    async deleteCategory(id, { transfers = {}, allTo = null } = {}) {
      return run(['categories', 'expenses'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), cat = cats.find((c) => c.id === id && c.parentId === null);
        if (!cat) throw new StoreError('not_found', 'Категория не найдена.');
        if (cats.filter((c) => c.parentId === null).length <= 1) throw new StoreError('last_category', 'Нельзя удалить последнюю категорию.');
        const exps = await request(s('expenses').index('categoryId').getAll(id));
        const moves = exps.map((e) => { const t = transfers[e.id] ?? allTo; checkTarget(t, cats, id); return { ...e, categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? null }; });
        moves.forEach((e) => s('expenses').put(e));
        cats.filter((c) => c.id === id || c.parentId === id).forEach((c) => s('categories').delete(c.id));
        return { moved: moves.length };
      });
    },

    /** Удаление подкатегории: её расходы переносятся в другую подкатегорию, в «без подкатегории» или в другую категорию. */
    async deleteSubcategory(id, { transfers = {}, allTo = null } = {}) {
      return run(['categories', 'expenses'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), sub = cats.find((c) => c.id === id && c.parentId !== null);
        if (!sub) throw new StoreError('not_found', 'Подкатегория не найдена.');
        const exps = (await request(s('expenses').index('categoryId').getAll(sub.parentId))).filter((e) => e.subcategoryId === id);
        const moves = exps.map((e) => {
          const t = transfers[e.id] ?? allTo;
          if (!t) throw new StoreError('transfer_missing', 'Для каждого расхода нужно выбрать, куда его перенести.');
          checkTarget(t, cats, null);
          if (t.subcategoryId === id) throw new StoreError('transfer_bad_target', 'Нельзя переносить в удаляемую подкатегорию.');
          return { ...e, categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? null };
        });
        moves.forEach((e) => s('expenses').put(e));
        s('categories').delete(id);
        return { moved: moves.length };
      });
    },

    /* ---------- расходы ---------- */
    async addExpense({ amount, date, categoryId, subcategoryId = null, note = '', isRegular = false }) {
      return run(['categories', 'expenses'], 'readwrite', async (s) => {
        const cats = await all(s('categories')), rec = { id: uid(), amount, date, categoryId, subcategoryId, note: clean(note), isRegular: !!isRegular, createdAt: Date.now() };
        checkExpense(rec, cats);
        s('expenses').put(rec);
        return rec;
      });
    },

    async updateExpense(id, patch) {
      return run(['categories', 'expenses'], 'readwrite', async (s) => {
        const cur = await request(s('expenses').get(id));
        if (!cur) throw new StoreError('not_found', 'Расход не найден.');
        const cats = await all(s('categories')), next = { ...cur, ...patch, id };
        if (patch.categoryId !== undefined && patch.subcategoryId === undefined) next.subcategoryId = null;
        next.note = clean(next.note); next.isRegular = !!next.isRegular;
        checkExpense(next, cats);
        s('expenses').put(next);
        return next;
      });
    },

    async deleteExpense(id) { return run(['expenses'], 'readwrite', async (s) => { s('expenses').delete(id); }); },

    async getExpense(id) { return run(['expenses'], 'readonly', (s) => request(s('expenses').get(id))); },
    async allExpenses() { return run(['expenses'], 'readonly', (s) => all(s('expenses'))); },
    /** Расходы месяца «ГГГГ-ММ». */
    async expensesOfMonth(key) {
      const [from, to] = monthBounds(key);
      return run(['expenses'], 'readonly', (s) => request(s('expenses').index('date').getAll(IDBKeyRange.bound(from, to, false, true))));
    },

    /* ---------- настройки ---------- */
    async getMeta(key, fallback = null) { const r = await run(['meta'], 'readonly', (s) => request(s('meta').get(key))); return r ? r.value : fallback; },
    async setMeta(key, value) { return run(['meta'], 'readwrite', async (s) => { s('meta').put({ key, value }); }); },

    /* ---------- выгрузка, восстановление, сброс ---------- */
    async exportAll() {
      return run(['categories', 'expenses', 'meta'], 'readonly', async (s) => ({ categories: (await all(s('categories'))).sort(byOrder), expenses: await all(s('expenses')), meta: await all(s('meta')) }));
    },

    /** Добавляет готовые записи (после планирования восстановления) одной транзакцией. */
    async applyRestore({ categories = [], expenses = [] }) {
      return run(['categories', 'expenses'], 'readwrite', async (s) => {
        categories.forEach((c) => s('categories').put(c));
        expenses.forEach((e) => s('expenses').put(e));
        return { categories: categories.length, expenses: expenses.length };
      });
    },

    async resetAll() {
      return run(['categories', 'expenses', 'meta'], 'readwrite', async (s) => { s('categories').clear(); s('expenses').clear(); s('meta').clear(); });
    },
  };
  return api;
}
