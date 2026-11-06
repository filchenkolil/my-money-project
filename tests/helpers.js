/* Общие помощники сквозных тестов: открыть настоящее приложение во фрейме и работать с ним как пользователь. */
import { openDb, deleteDb } from '../js/db.js';
import { MIGRATIONS } from '../js/migrations.js';
import { createStore } from '../js/store.js';

export const DB = 'mymoney-beta'; // тестовый канал приложения (адрес /beta/) использует эту базу
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, what, ms = 4000) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('не дождались: ' + what); await sleep(30); }
}
export async function withStore(fn) {
  const db = await openDb(DB, MIGRATIONS); const store = createStore(db);
  try { return await fn(store); } finally { db.close(); }
}
export async function openApp({ seed, height = 844, route = '' } = {}) {
  await deleteDb(DB);
  await withStore(async (s) => { await s.seedDefaultsIfEmpty(); if (seed) await seed(s); });
  const frame = document.createElement('iframe');
  frame.style.cssText = `width:390px;height:${height}px;border:1px solid #999;position:fixed;left:-2000px;top:0`;
  frame.src = '/beta/index.html' + route;
  document.body.append(frame);
  const win = frame.contentWindow;
  await new Promise((r) => frame.addEventListener('load', r, { once: true }));
  const doc = frame.contentDocument;
  await waitFor(() => doc.querySelector('.tabs button'), 'нижняя панель');
  const q = (s) => doc.querySelector(s), qa = (s) => [...doc.querySelectorAll(s)];
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const input = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); return el; };
  const change = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); return el; };
  const typeAmount = (v) => input(q('#amt'), v);
  const tile = (name) => qa('.tile:not(.more)').find((t) => t.textContent.trim() === name);
  const go = async (hash, what) => { win.location.hash = hash; await waitFor(what, 'экран ' + hash); };
  const h1 = () => q('h1')?.textContent;
  return { win, doc, q, qa, click, input, change, typeAmount, tile, go, h1, close: () => frame.remove() };
}
export const iso = (d) => d.toLocaleDateString('sv');
export const today = () => iso(new Date());
export const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return iso(d); };
