/* Экспорт (CSV для чтения, JSON для восстановления) и план восстановления. */

import { SCHEMA_VERSION } from './migrations.js';
import { isValidDate } from './dates.js';
import { MAX_KOPECKS } from './money.js';
import { uid } from './store.js';

export const APP_ID = 'mymoney';

/* ---------- имена файлов ---------- */
export const csvFileName = (monthKey) => `mymoney-${monthKey ?? 'all'}.csv`;
export const jsonFileName = (todayISO) => `mymoney-backup-${todayISO}.json`;

/* ---------- JSON ---------- */
export function buildBackup({ categories, expenses, meta = [] }, now = new Date()) {
  return JSON.stringify({ app: APP_ID, schema: SCHEMA_VERSION, exportedAt: now.toISOString(), categories, expenses, settings: meta }, null, 2);
}

/** Проверка и очистка файла восстановления. Возвращает { ok: true, data } или { ok: false, reason }. */
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'not_json' }; }
  if (!raw || raw.app !== APP_ID || !Array.isArray(raw.categories) || !Array.isArray(raw.expenses)) return { ok: false, reason: 'not_mymoney' };
  if (!Number.isInteger(raw.schema) || raw.schema < 1) return { ok: false, reason: 'not_mymoney' };
  if (raw.schema > SCHEMA_VERSION) return { ok: false, reason: 'newer_version' };
  const ids = new Set();
  const categories = [];
  for (const c of raw.categories) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name.trim()) return { ok: false, reason: 'corrupt' };
    ids.add(c.id);
    categories.push({ id: c.id, name: c.name.trim(), icon: c.icon ?? null, hue: Number.isFinite(c.hue) ? c.hue : null, order: Number.isFinite(c.order) ? c.order : 0, parentId: c.parentId ?? null });
  }
  if (categories.some((c) => c.parentId !== null && !ids.has(c.parentId))) return { ok: false, reason: 'corrupt' };
  const expenses = [];
  for (const e of raw.expenses) {
    if (!e || !Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX_KOPECKS || !isValidDate(e.date) || !ids.has(e.categoryId)) return { ok: false, reason: 'corrupt' };
    if (e.subcategoryId != null && !ids.has(e.subcategoryId)) return { ok: false, reason: 'corrupt' };
    expenses.push({ amount: e.amount, date: e.date, categoryId: e.categoryId, subcategoryId: e.subcategoryId ?? null, note: String(e.note ?? ''), isRegular: !!e.isRegular, createdAt: Number.isFinite(e.createdAt) ? e.createdAt : Date.now() });
  }
  return { ok: true, data: { categories, expenses } };
}

export const RESTORE_ERRORS = {
  not_json: 'Файл не подошёл. Это не файл MyMoney или он повреждён. Данные в приложении не изменены.',
  not_mymoney: 'Файл не подошёл. Это не файл MyMoney. Данные в приложении не изменены. Выберите файл JSON, который вы сохраняли через «Экспорт».',
  corrupt: 'Файл повреждён: часть записей не читается. Данные в приложении не изменены. Попробуйте более раннюю резервную копию.',
  newer_version: 'Файл сохранён более новой версией приложения. Обновите приложение и повторите. Данные не изменены.',
};

/**
 * План восстановления: что добавить к существующим данным.
 * Категории сопоставляются по названию в пределах уровня (без учёта регистра): совпавшие используются, остальные создаются.
 * Расходы добавляются все с новыми id, поэтому повторное восстановление создаёт дубли (так задумано).
 */
export function planRestore(existingCategories, backup) {
  const idMap = new Map(), newCats = [];
  const top = existingCategories.filter((c) => c.parentId === null);
  let nextTop = top.length ? Math.max(...top.map((c) => c.order)) + 1 : 0;
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  for (const c of backup.categories.filter((x) => x.parentId === null).sort((a, b) => a.order - b.order)) {
    const found = top.find((t) => same(t.name, c.name)) ?? newCats.find((t) => t.parentId === null && same(t.name, c.name));
    if (found) { idMap.set(c.id, found.id); continue; }
    const rec = { id: uid(), name: c.name, icon: c.icon, hue: c.hue, order: nextTop++, parentId: null };
    newCats.push(rec); idMap.set(c.id, rec.id);
  }
  for (const c of backup.categories.filter((x) => x.parentId !== null).sort((a, b) => a.order - b.order)) {
    const parent = idMap.get(c.parentId);
    const siblings = [...existingCategories, ...newCats].filter((x) => x.parentId === parent);
    const found = siblings.find((s) => same(s.name, c.name));
    if (found) { idMap.set(c.id, found.id); continue; }
    const rec = { id: uid(), name: c.name, icon: null, hue: null, order: siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0, parentId: parent };
    newCats.push(rec); idMap.set(c.id, rec.id);
  }
  const expenses = backup.expenses.map((e) => ({ id: uid(), amount: e.amount, date: e.date, categoryId: idMap.get(e.categoryId), subcategoryId: e.subcategoryId ? idMap.get(e.subcategoryId) : null, note: e.note, isRegular: e.isRegular, createdAt: e.createdAt }));
  return { categories: newCats, expenses, createdCategories: newCats.filter((c) => c.parentId === null).length };
}

/* ---------- CSV ---------- */
const plain = (k) => String(Math.floor(k / 100)) + (k % 100 ? ',' + String(k % 100).padStart(2, '0') : '');

/** Поле CSV: кавычки и разделитель экранируются, а текст, похожий на формулу, получает апостроф (защита от формул в Excel). */
function field(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV для Excel: разделитель «;», запятая в сумме, BOM, чтобы кириллица открылась правильно. */
export function buildCsv(expenses, categories, monthKey = null) {
  const name = new Map(categories.map((c) => [c.id, c.name]));
  const rows = expenses.filter((e) => !monthKey || e.date.startsWith(monthKey)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const lines = ['Дата;Категория;Подкатегория;Сумма;Комментарий;Регулярный'];
  for (const e of rows) lines.push([e.date, name.get(e.categoryId) ?? '', e.subcategoryId ? name.get(e.subcategoryId) ?? '' : '', plain(e.amount), e.note, e.isRegular ? 'да' : 'нет'].map(field).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
