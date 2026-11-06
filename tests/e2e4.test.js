/* Сквозные проверки этапа 4: календарь на ±2 месяца, история, правка, удаление. */
import { test, eq, ok } from './harness.js';
import { openDb, deleteDb } from '../js/db.js';
import { MIGRATIONS } from '../js/migrations.js';
import { createStore } from '../js/store.js';

const DB = 'mymoney-beta';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 4000) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('не дождались: ' + what); await sleep(30); }
}
async function withStore(fn) {
  const db = await openDb(DB, MIGRATIONS); const store = createStore(db);
  try { return await fn(store); } finally { db.close(); }
}
async function openApp({ seed, height = 844, route = '' } = {}) {
  await deleteDb(DB);
  if (seed) await withStore(async (s) => { await s.seedDefaultsIfEmpty(); await seed(s); });
  const frame = document.createElement('iframe');
  frame.style.cssText = `width:390px;height:${height}px;border:1px solid #999;position:fixed;left:-2000px;top:0`;
  frame.src = '/beta/index.html' + route;
  document.body.append(frame);
  const win = frame.contentWindow;
  await new Promise((r) => frame.addEventListener('load', r, { once: true }));
  const doc = frame.contentDocument;
  await waitFor(() => doc.querySelector('.tabs button'), 'нижняя панель');
  const q = (s) => doc.querySelector(s), qa = (s) => [...doc.querySelectorAll(s)];
  const typeAmount = (v) => { const a = q('#amt'); a.value = v; a.dispatchEvent(new win.Event('input', { bubbles: true })); return a; };
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const tile = (name) => qa('.tile:not(.more)').find((t) => t.textContent.trim() === name);
  return { win, doc, q, qa, typeAmount, click, tile, close: () => frame.remove() };
}
const iso = (d) => d.toLocaleDateString('sv');
const today = () => iso(new Date());
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return iso(d); };

test('календарь: полоса на 2 месяца назад и вперёд, открыта текущая неделя, выбор будущей и прошлой даты', async () => {
  const a = await openApp();
  try {
    const vs = a.qa('.wk button').map((b) => b.dataset.v);
    eq(vs.length % 7, 0); ok(vs.length >= 17 * 7, 'полоса на ±2 месяца');
    ok(vs.includes(monthsAgo(-2)) && vs.includes(monthsAgo(2)), 'краевые даты есть');
    ok(vs[0] > monthsAgo(-3) && vs[vs.length - 1] < monthsAgo(3), 'дальше диапазона дат нет');
    const strip = a.q('#wk');
    ok(strip.scrollLeft > 0, 'открыта текущая неделя, а не начало полосы');
    const sr = strip.getBoundingClientRect(), tr = a.q('[data-today]').getBoundingClientRect();
    ok(tr.left >= sr.left - 1 && tr.right <= sr.right + 1, 'сегодня в видимой части');
    const future = monthsAgo(2);
    a.click(a.qa('.wk button').find((b) => b.dataset.v === future)); await sleep(80);
    eq(a.q('.wk [aria-pressed="true"]').dataset.v, future);
    eq(a.q('#date').value, future);
    ok(a.q('#date').min && a.q('#date').max, 'календарь телефона тоже ограничен по диапазону');
    a.click(a.tile('Продукты')); a.typeAmount('100'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show'), 'сохранено');
    eq((await withStore((s) => s.allExpenses()))[0].date, future);
    const past = monthsAgo(-2);
    a.click(a.qa('.wk button').find((b) => b.dataset.v === past)); await sleep(80);
    eq(a.q('#date').value, past);
  } finally { a.close(); }
});

const seedMonth = async (s) => {
  const d = today(), m = d.slice(0, 7);
  await s.addExpense({ amount: 100000, date: d, categoryId: 'prod', note: 'овощи' });
  await s.addExpense({ amount: 250000, date: d, categoryId: 'pet', subcategoryId: 'pet.1', isRegular: true });
  await s.addExpense({ amount: 30000, date: m + '-01', categoryId: 'trans' });
};

test('история: сумма месяца, дни с итогом, метка «рег.», нажатие открывает правку', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    ok(a.q('.total').textContent.includes('3 800'));
    eq(a.qa('.rec').length, 3);
    ok(a.qa('.day').some((d) => d.textContent.includes('3 500')));
    eq(a.qa('.badge').length, 1);
    ok(a.q('.mchip[aria-current]'), 'выбран текущий месяц');
    a.click(a.qa('.rec')[0]);
    await waitFor(() => a.q('h1')?.textContent === 'Редактирование', 'правка');
  } finally { a.close(); }
});

test('история: фильтры по категории, подкатегории и «только регулярные», сброс, пустой результат', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    a.click(a.q('[data-act="opensheet"]')); await waitFor(() => a.q('#fcat'), 'фильтры');
    const set = (id, v) => { const el = a.q(id); el.value = v; el.dispatchEvent(new a.win.Event('change', { bubbles: true })); };
    set('#fcat', 'pet'); await sleep(50);
    eq(a.qa('.rec').length, 1);
    ok(!a.q('#fsub').disabled);
    set('#fsub', 'pet.2'); await sleep(50);
    ok(a.q('#hlist').textContent.includes('ничего не найдено'));
    a.click(a.q('[data-act="fltreset"]')); await sleep(50);
    eq(a.qa('.rec').length, 3);
    a.click(a.q('[data-act="fltreg"]')); await sleep(50);
    eq(a.qa('.rec').length, 1);
    a.click(a.q('[data-act="closesheet"]')); await sleep(50);
    ok(a.q('.hdr .ib.on'), 'кнопка фильтра подсвечена');
    ok(a.q('.card').textContent.includes('По фильтрам'));
  } finally { a.close(); }
});

test('история: пустое состояние и переход к добавлению', async () => {
  const a = await openApp({ route: '#/history' });
  try {
    await waitFor(() => a.q('.heroc'), 'пустое состояние');
    ok(a.q('.heroc').textContent.includes('Расходов пока нет'));
    a.click(a.q('.heroc [data-act="add"]'));
    await waitFor(() => a.q('#amt'), 'главная');
  } finally { a.close(); }
});

test('правка: «было → стало», применение, «Вернуться», без изменений карточка не открывается', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    a.click(a.qa('.rec').find((r) => r.textContent.includes('овощи')));
    await waitFor(() => a.q('h1')?.textContent === 'Редактирование', 'правка');
    eq(a.q('#amt').value, '1 000'); eq(a.q('#note').value, 'овощи');
    eq(a.q('#save').textContent, 'Сохранить изменения');
    eq(a.q('.tile[aria-pressed="true"] .nm').textContent, 'Продукты');
    a.click(a.q('#save')); await sleep(80);
    ok(!a.q('.sheet'), 'без изменений карточка не нужна'); ok(a.q('.toast').textContent.includes('Изменений нет'));
    a.typeAmount('1 200,50'); a.click(a.q('[data-act="reg"]')); a.click(a.q('#save'));
    await waitFor(() => a.q('.sheet'), 'карточка');
    const t = a.q('.diff').textContent;
    ok(t.includes('Сумма') && t.includes('1 000') && t.includes('1 200,50') && t.includes('Регулярный'), t);
    a.click(a.q('[data-act="unreview"]')); await sleep(50);
    ok(!a.q('.sheet')); eq(a.q('#amt').value, '1 200,50', 'правки остались в форме');
    eq((await withStore((s) => s.allExpenses())).filter((e) => e.amount === 100000).length, 1, 'пока ничего не записано');
    a.click(a.q('#save')); await waitFor(() => a.q('.sheet'), 'карточка');
    a.click(a.q('[data-act="confirm"]'));
    await waitFor(() => a.q('h1')?.textContent === 'История', 'возврат в историю');
    const rows = await withStore((s) => s.allExpenses());
    eq(rows.filter((e) => e.amount === 120050 && e.isRegular).length, 1);
    eq(rows.length, 3);
    ok(a.q('.toast').textContent.includes('Изменения сохранены'));
  } finally { a.close(); }
});

test('правка: смена категории сбрасывает подкатегорию, дату можно перенести в другой месяц', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    a.click(a.qa('.rec').find((r) => r.textContent.includes('Питомец')));
    await waitFor(() => a.q('h1')?.textContent === 'Редактирование', 'правка');
    const old = monthsAgo(-1);
    a.click(a.tile('Транспорт')); await sleep(30);
    a.click(a.qa('.wk button').find((b) => b.dataset.v === old)); await sleep(30);
    a.click(a.q('#save')); await waitFor(() => a.q('.sheet'), 'карточка');
    const t = a.q('.diff').textContent;
    ok(t.includes('Категория') && t.includes('Подкатегория') && t.includes('Дата'), t);
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.q('h1')?.textContent === 'История', 'история');
    const r = (await withStore((s) => s.allExpenses())).find((e) => e.amount === 250000);
    eq([r.categoryId, r.subcategoryId, r.date], ['trans', null, old]);
  } finally { a.close(); }
});

test('удаление: подтверждение, отказ ничего не удаляет', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    a.click(a.qa('.rec')[0]); await waitFor(() => a.q('[data-act="del"]'), 'правка');
    a.click(a.q('[data-act="del"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    ok(a.q('.sheet').textContent.includes('будет удалена'));
    a.click(a.q('[data-act="unreview"]')); await sleep(50);
    eq((await withStore((s) => s.allExpenses())).length, 3);
    a.click(a.q('[data-act="del"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.q('h1')?.textContent === 'История', 'история');
    eq((await withStore((s) => s.allExpenses())).length, 2);
    eq(a.qa('.rec').length, 2);
  } finally { a.close(); }
});

test('правка: устаревший адрес возвращает в историю', async () => {
  const a = await openApp({ seed: seedMonth, route: '#/edit/нет-такой' });
  try { await waitFor(() => a.q('h1')?.textContent === 'История', 'история'); } finally { a.close(); }
});
