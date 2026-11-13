/* Хранилище: категории, расходы, настройки. Каждая операция, меняющая несколько записей, идёт одной транзакцией:
   либо применяется целиком, либо не меняется ничего. */

import { request, done } from './db.js';
import { MAX_KOPECKS } from './money.js';
import { isValidDate, monthBounds } from './dates.js';
import { buildDefaultCategories, buildDefaultTripCategories, DEFAULT_ICON } from './seed.js';
import { checkTrip, checkTripExpense, moveTripExpense, formatRateFull } from './trips.js';

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
      return run(['categories', 'tripCategories', 'meta'], 'readwrite', async (s) => {
        // категории поездок: после «Сброса данных» набор возвращается, даже если обычные категории не пусты
        if ((await request(s('tripCategories').count())) === 0) buildDefaultTripCategories().forEach((c) => s('tripCategories').put(c));
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

    /* ---------- поездки (v2) ---------- */
    async trips() { return (await run(['trips'], 'readonly', (s) => all(s('trips')))).sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : a.name.localeCompare(b.name))); },

    async addTrip(input) {
      return run(['trips'], 'readwrite', async (s) => {
        const existing = await all(s('trips')), r = checkTrip(input, existing);
        if (!r.ok) throw new StoreError('bad_trip', r.message);
        const rec = { id: uid(), ...r.trip, createdAt: Date.now() };
        s('trips').put(rec);
        return rec;
      });
    },

    /** Название, валюта и курс меняются, даты после создания нет. */
    async updateTrip(id, patch) {
      if ('start' in patch || 'end' in patch) throw new StoreError('dates_locked', 'Даты поездки после создания изменить нельзя.');
      return run(['trips'], 'readwrite', async (s) => {
        const existing = await all(s('trips')), cur = existing.find((t) => t.id === id);
        if (!cur) throw new StoreError('not_found', 'Поездка не найдена.');
        const rateText = patch.rate !== undefined ? patch.rate : formatRateFull(patch.rateE4 ?? cur.rateE4);
        const r = checkTrip({ name: patch.name ?? cur.name, start: cur.start, end: cur.end, currency: patch.currency ?? cur.currency, rate: rateText }, existing, id);
        if (!r.ok) throw new StoreError('bad_trip', r.message);
        const next = { ...cur, ...r.trip };
        s('trips').put(next);
        return next;
      });
    },

    async tripExpenses() { return run(['tripExpenses'], 'readonly', (s) => all(s('tripExpenses'))); },

    async addTripExpense({ tripId, categoryId, amount, isRub = false, date, note = '' }) {
      return run(['trips', 'tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        const trips = await all(s('trips')), cats = await all(s('tripCategories'));
        const rec = { id: uid(), tripId, categoryId, amount, isRub: !!isRub, date, note: clean(note), createdAt: Date.now() };
        const err = checkTripExpense(rec, trips, cats);
        if (err) throw new StoreError('bad_trip_expense', err);
        s('tripExpenses').put(rec);
        return rec;
      });
    },

    async updateTripExpense(id, patch) {
      return run(['trips', 'tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        const cur = await request(s('tripExpenses').get(id));
        if (!cur) throw new StoreError('not_found', 'Расход не найден.');
        const next = { ...cur, ...patch, id }; next.note = clean(next.note); next.isRub = !!next.isRub;
        const err = checkTripExpense(next, await all(s('trips')), await all(s('tripCategories')));
        if (err) throw new StoreError('bad_trip_expense', err);
        s('tripExpenses').put(next);
        return next;
      });
    },

    async deleteTripExpense(id) { return run(['tripExpenses'], 'readwrite', async (s) => { s('tripExpenses').delete(id); }); },

    /**
     * Меняет вид расхода одной операцией: обычный → расход поездки или расход поездки → обычный.
     * from: { kind: 'regular' | 'trip', id }, to: { kind, record } (готовая запись, проверяется как при добавлении).
     */
    async convertExpense(from, to) {
      return run(['categories', 'expenses', 'trips', 'tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        const src = from.kind === 'trip' ? 'tripExpenses' : 'expenses';
        if (!(await request(s(src).get(from.id)))) throw new StoreError('not_found', 'Расход не найден.');
        if (to.kind === 'trip') {
          const err = checkTripExpense(to.record, await all(s('trips')), await all(s('tripCategories')));
          if (err) throw new StoreError('bad_trip_expense', err);
          s('tripExpenses').put(to.record);
        } else { checkExpense(to.record, await all(s('categories'))); s('expenses').put(to.record); }
        s(src).delete(from.id);
        return to.record;
      });
    },

    /**
     * Удаление поездки: каждый её расход нужно перенести (в другую поездку или в обычные категории).
     * transfers: { [id расхода]: { tripId } | { categoryId, subcategoryId } }, allTo — то же «для всех сразу».
     */
    async deleteTrip(id, { transfers = {}, allTo = null } = {}) {
      return run(['categories', 'expenses', 'trips', 'tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        const trips = await all(s('trips')), trip = trips.find((t) => t.id === id);
        if (!trip) throw new StoreError('not_found', 'Поездка не найдена.');
        const own = await request(s('tripExpenses').index('tripId').getAll(id));
        const cats = await all(s('categories')), tcats = await all(s('tripCategories'));
        for (const e of own) {
          const t = transfers[e.id] ?? allTo;
          if (!t) throw new StoreError('transfer_missing', 'Для каждого расхода нужно выбрать, куда его перенести.');
          if (t.tripId && (t.tripId === id || !trips.some((x) => x.id === t.tripId))) throw new StoreError('transfer_bad_target', 'Нельзя переносить в удаляемую поездку.');
          if (!t.tripId) checkTarget(t, cats, null);
          const moved = moveTripExpense(e, trip, t, t.tripId ? trips.find((x) => x.id === t.tripId) : null);
          if (moved.kind === 'trip') { const err = checkTripExpense(moved.record, trips, tcats); if (err) throw new StoreError('bad_trip_expense', err); s('tripExpenses').put(moved.record); }
          else { checkExpense(moved.record, cats); s('tripExpenses').delete(e.id); s('expenses').put(moved.record); }
        }
        s('trips').delete(id);
        return { moved: own.length };
      });
    },

    /* ---------- категории поездок ---------- */
    async tripCategories() { return (await run(['tripCategories'], 'readonly', (s) => all(s('tripCategories')))).sort(byOrder); },

    async addTripCategory({ name, icon = DEFAULT_ICON, hue }) {
      return run(['tripCategories'], 'readwrite', async (s) => {
        const cats = await all(s('tripCategories'));
        const rec = { id: uid(), name: checkName(name, cats), icon, hue: Number.isFinite(hue) ? hue : 200, order: cats.length ? Math.max(...cats.map((c) => c.order)) + 1 : 0 };
        s('tripCategories').put(rec);
        return rec;
      });
    },

    async updateTripCategory(id, patch) {
      return run(['tripCategories'], 'readwrite', async (s) => {
        const cats = await all(s('tripCategories')), cur = cats.find((c) => c.id === id);
        if (!cur) throw new StoreError('not_found', 'Категория поездки не найдена.');
        const next = { ...cur };
        if (patch.name !== undefined) next.name = checkName(patch.name, cats, id);
        if (patch.icon !== undefined) next.icon = patch.icon;
        if (patch.hue !== undefined) next.hue = patch.hue;
        s('tripCategories').put(next);
        return next;
      });
    },

    async reorderTripCategories(orderedIds) {
      return run(['tripCategories'], 'readwrite', async (s) => {
        const cats = await all(s('tripCategories'));
        if (cats.length !== orderedIds.length || !cats.every((c) => orderedIds.includes(c.id))) throw new StoreError('bad_order', 'Список порядка не совпадает с категориями.');
        orderedIds.forEach((id, i) => s('tripCategories').put({ ...cats.find((c) => c.id === id), order: i }));
      });
    },

    /** Удаление категории поездки: расходы переносятся в другие категории поездок (по одному или все сразу). */
    async deleteTripCategory(id, { transfers = {}, allTo = null } = {}) {
      return run(['tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        const cats = await all(s('tripCategories'));
        if (!cats.some((c) => c.id === id)) throw new StoreError('not_found', 'Категория поездки не найдена.');
        if (cats.length <= 1) throw new StoreError('last_category', 'Нельзя удалить последнюю категорию.');
        const own = await request(s('tripExpenses').index('categoryId').getAll(id));
        const moves = own.map((e) => {
          const t = transfers[e.id] ?? allTo;
          if (!t) throw new StoreError('transfer_missing', 'Для каждого расхода нужно выбрать, куда его перенести.');
          if (t === id || !cats.some((c) => c.id === t)) throw new StoreError('transfer_bad_target', 'Нельзя переносить в удаляемую категорию.');
          return { ...e, categoryId: t };
        });
        moves.forEach((e) => s('tripExpenses').put(e));
        s('tripCategories').delete(id);
        return { moved: moves.length };
      });
    },

    /* ---------- выгрузка, восстановление, сброс ---------- */
    async exportAll() {
      return run(['categories', 'expenses', 'trips', 'tripExpenses', 'tripCategories', 'meta'], 'readonly', async (s) => ({
        categories: (await all(s('categories'))).sort(byOrder), expenses: await all(s('expenses')), meta: await all(s('meta')),
        trips: await all(s('trips')), tripExpenses: await all(s('tripExpenses')), tripCategories: (await all(s('tripCategories'))).sort(byOrder),
      }));
    },

    /** Добавляет готовые записи (после планирования восстановления) одной транзакцией. */
    async applyRestore({ categories = [], expenses = [], trips = [], tripCategories = [], tripExpenses = [] }) {
      return run(['categories', 'expenses', 'trips', 'tripCategories', 'tripExpenses'], 'readwrite', async (s) => {
        categories.forEach((c) => s('categories').put(c));
        expenses.forEach((e) => s('expenses').put(e));
        trips.forEach((t) => s('trips').put(t));
        tripCategories.forEach((c) => s('tripCategories').put(c));
        tripExpenses.forEach((e) => s('tripExpenses').put(e));
        return { categories: categories.length, expenses: expenses.length, trips: trips.length, tripExpenses: tripExpenses.length };
      });
    },

    async resetAll() {
      return run(['categories', 'expenses', 'trips', 'tripExpenses', 'tripCategories', 'meta'], 'readwrite', async (s) => { for (const n of ['categories', 'expenses', 'trips', 'tripExpenses', 'tripCategories', 'meta']) s(n).clear(); });
    },
  };
  return api;
}
